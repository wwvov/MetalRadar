"""新闻智能分类服务 — 使用 LLM 对新闻进行批量分类"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.news import News
from app.services.news_service import ALL_METALS

logger = logging.getLogger(__name__)

TZ_BEIJING = timezone(timedelta(hours=8))

# 每次 LLM 调用最多处理多少条新闻
BATCH_SIZE = 15

# 事件类型定义
EVENT_TYPES = [
    "supply_disruption",   # 供应中断
    "price_surge",         # 价格暴涨
    "price_drop",          # 价格下跌
    "policy_favorable",    # 政策利好
    "monetary_policy",     # 货币政策
    "macro_economy",       # 宏观经济
    "industry_trend",      # 行业趋势
    "demand_change",       # 需求变化
    "inventory_change",    # 库存变动
    "geopolitical",        # 地缘政治
]

CLASSIFY_SYSTEM_PROMPT = """你是一位资深的中国金属/大宗商品行业新闻分析师。你的任务是对一批新闻进行结构化分类标注。

## 金属品种清单（识别标准）

有色: 铜, 铝, 铅, 锌, 镍, 锡
贵金属: 黄金, 白银, 铂, 钯
小金属/新能源: 锂(碳酸锂/氢氧化锂), 钴, 稀土, 钨, 钼, 锑, 锰, 硅(工业硅), 镁, 钛, 铟, 锗, 镓, 钒, 铌
黑色金属: 铁矿石, 螺纹钢, 热卷(热轧卷板), 线材, 冷轧, 不锈钢, 废钢
能源/煤炭: 焦煤, 焦炭, 动力煤, 原油, 沥青, 燃料油, 天然气
其他大宗: 橡胶, 纸浆, 玻璃, 纯碱

## 事件类型定义
- supply_disruption: 矿山停产/罢工/环保限产/运输中断/出口限制等供给端事件
- price_surge: 期货/现货价格大幅上涨(>2%)
- price_drop: 期货/现货价格大幅下跌(>2%)
- policy_favorable: 产业政策利好(降准降息/补贴/减产/收储/关税优惠)
- monetary_policy: 央行货币政策(利率/准备金/LPR/MLF/逆回购)
- macro_economy: 宏观经济数据/趋势(GDP/PMI/CPI/社融/进出口)
- industry_trend: 行业发展趋势/技术突破/公司财报/机构研报
- demand_change: 下游需求变化(排产/订单/开工率/消费)
- inventory_change: 库存数据(LME/SHFE/社会库存/保税区/港口)
- geopolitical: 地缘政治/贸易争端/制裁/战争/选举

## 分类规则
1. **is_relevant**: 新闻标题或摘要中必须**明确出现**上述清单中的具体金属/能源/大宗商品品种名称，才设为 true。
   以下类型一律设为 false（即使可能间接影响大宗商品）：
   - 宏观政策类：降准降息(未提及具体品种)、GDP/PMI/CPI/社融数据、美联储/欧央行决议
   - 地缘政治类：国际冲突/选举/贸易摩擦（未提及具体品种影响）
   - 股市类：A股大盘涨跌、个股推荐、财报（未涉及大宗商品业务）
   - 产业类：不涉及上述品种清单的行业新闻
2. **metal_entities**: 从新闻中提取涉及的金属品种名称（必须是上述清单中的品种，不要编造）。无则空数组。
   **关键约束**: 如果 metal_entities 为空数组，则 is_relevant 必须为 false，relevance_level 必须为 "gray"。
3. **company_entities**: 提取新闻中明确提到的A股上市公司股票代码（6位数字，如"601899"）。无则空数组。注意：只输出6位数字代码，不要输出公司名称。
4. **relevance_level**:
   - "red" = 同时涉及金属品种+具体公司（metal_entities 和 company_entities 都非空）
   - "yellow" = 仅涉及金属品种（metal_entities 非空，company_entities 为空）
   - "blue" = 仅涉及公司（metal_entities 为空，company_entities 非空）
   - "gray" = 不涉及任何金属品种和公司（metal_entities 和 company_entities 都为空）
5. **emotion**: 对金属品种的影响方向
   - "positive" = 利多(供应减少/需求增加/政策利好/价格上涨)
   - "negative" = 利空(供应增加/需求减少/政策利空/价格下跌)
   - "neutral" = 中性(中性报告/无明确方向)
6. **event_type**: 选择一个最匹配的事件类型（从上述10个中选择），无匹配则用 "industry_trend"
7. **tags**: 2-5个中文关键词

## 输出格式
严格按JSON格式输出，所有新闻分类结果放在 "results" 数组中:
```json
{
  "results": [
    {
      "index": 0,
      "is_relevant": true,
      "metal_entities": ["铜", "黄金"],
      "company_entities": ["601899"],
      "relevance_level": "red",
      "emotion": "positive",
      "event_type": "price_surge",
      "tags": ["铜价", "LME", "库存新低"]
    }
  ]
}
```

## 重要规则
- 严格按照输入新闻的 index 顺序输出
- 每条新闻都要输出，不可遗漏
- 输出纯 JSON 对象（用 "results" 键包裹数组），不要用 ```json``` 包裹
- metal_entities 中的品种名称必须使用上述清单中的标准名称
- 不确定的字段用空数组/空字符串/neutral，不要编造
- **一致性校验**: metal_entities 和 company_entities 都为空时，is_relevant 必须为 false，relevance_level 必须为 "gray"，emotion 必须为 "neutral"
- **品种粒度**: 优先用最细粒度的品种名（如"碳酸锂"优于"锂"），但必须是清单中的标准名称
"""


def _get_openai_client() -> OpenAI:
    return OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _build_classify_user_prompt(news_batch: list[News]) -> str:
    """构建批量分类的用户提示"""
    lines = ["请对以下新闻进行结构化分类标注：", ""]
    for i, news in enumerate(news_batch):
        pub_time = ""
        if news.pub_time:
            pub_time = news.pub_time.strftime("%m-%d %H:%M")
        lines.append(f"[{i}] {pub_time} | {news.source}")
        lines.append(f"    标题: {news.title}")
        if news.summary:
            lines.append(f"    摘要: {news.summary[:200]}")
        lines.append("")
    return "\n".join(lines)


def _extract_json(text: str) -> str:
    """从 LLM 响应中提取 JSON"""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end]).strip()
    start_idx = text.find("[")
    end_idx = text.rfind("]")
    if start_idx != -1 and end_idx != -1:
        text = text[start_idx:end_idx + 1]
    return text


def classify_news_batch(
    db: Session,
    news_items: Optional[list[News]] = None,
    limit: int = 50,
) -> dict:
    """批量对新闻进行 LLM 分类

    Args:
        db: 数据库会话
        news_items: 要分类的新闻列表，若为 None 则自动取未分类的
        limit: 自动取未分类新闻时的最大数量

    Returns:
        {"classified": N, "batches": N, "errors": N}
    """
    if not settings.LLM_API_KEY:
        logger.warning("LLM_API_KEY 未配置，无法进行新闻分类")
        return {"classified": 0, "batches": 0, "errors": 0, "message": "LLM_API_KEY not configured"}

    if news_items is None:
        from app.services.news_fetcher import get_unclassified_news
        news_items = get_unclassified_news(db, limit=limit)

    if not news_items:
        logger.info("没有待分类的新闻")
        return {"classified": 0, "batches": 0, "errors": 0}

    client = _get_openai_client()
    total_classified = 0
    total_batches = 0
    total_errors = 0

    # 分批处理
    for batch_start in range(0, len(news_items), BATCH_SIZE):
        batch = news_items[batch_start:batch_start + BATCH_SIZE]
        total_batches += 1

        try:
            logger.info(f"LLM 分类批次 {total_batches}: {len(batch)} 条新闻")

            user_prompt = _build_classify_user_prompt(batch)

            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=3000,
                response_format={"type": "json_object"},
                timeout=90,
            )

            raw = response.choices[0].message.content or ""
            json_text = _extract_json(raw)

            # 处理可能的 JSON-object 包裹 (因为 response_format=json_object)
            parsed = json.loads(json_text)
            if isinstance(parsed, dict):
                # 可能被包在 {"results": [...]} 或直接 {"0": {...}}
                for key in ["results", "items", "news", "classifications"]:
                    if key in parsed:
                        parsed = parsed[key]
                        break
                else:
                    # 尝试按数字键取值
                    vals = list(parsed.values())
                    if vals and isinstance(vals[0], dict):
                        parsed = vals

            if not isinstance(parsed, list):
                logger.error(f"LLM 返回非预期格式: {type(parsed)}")
                total_errors += 1
                continue

            # 应用分类结果
            index_map = {item.get("index", -1): item for item in parsed if isinstance(item, dict)}
            batch_classified = 0

            for i, news in enumerate(batch):
                result = index_map.get(i)
                if not result:
                    # 尝试按顺序匹配
                    if i < len(parsed) and isinstance(parsed[i], dict):
                        result = parsed[i]
                    else:
                        logger.warning(f"新闻 [{i}] 无分类结果，跳过")
                        continue

                # 更新新闻记录
                news.is_relevant = bool(result.get("is_relevant", True))
                news.metal_entities = _clean_list(result.get("metal_entities", []))
                news.company_entities = _clean_list(result.get("company_entities", []))
                news.relevance_level = str(result.get("relevance_level", "gray"))
                news.emotion = str(result.get("emotion", "neutral"))
                news.event_type = str(result.get("event_type", ""))
                news.tags = _clean_list(result.get("tags", []))

                # 验证关键字段
                if news.relevance_level not in ("red", "yellow", "blue", "gray"):
                    news.relevance_level = "gray"
                if news.emotion not in ("positive", "negative", "neutral"):
                    news.emotion = "neutral"
                if news.event_type not in EVENT_TYPES:
                    # 尝试模糊匹配
                    news.event_type = _fuzzy_match_event_type(news.event_type)

                batch_classified += 1
                total_classified += 1

            db.commit()
            logger.info(f"批次 {total_batches} 完成: {batch_classified}/{len(batch)} 条分类成功")

        except json.JSONDecodeError as e:
            db.rollback()
            total_errors += 1
            logger.error(f"批次 {total_batches} JSON 解析失败: {e}")
            logger.error(f"原始响应(前500字符): {raw[:500]}")
        except Exception as e:
            db.rollback()
            total_errors += 1
            logger.error(f"批次 {total_batches} 分类失败: {type(e).__name__}: {e}")

        # 批次之间短暂冷却
        if batch_start + BATCH_SIZE < len(news_items):
            time.sleep(1)

    return {
        "classified": total_classified,
        "batches": total_batches,
        "errors": total_errors,
    }


def _clean_list(items: list) -> list[str]:
    """清理列表，去重去空"""
    seen = set()
    result = []
    for item in items:
        s = str(item).strip()
        if s and s not in seen:
            seen.add(s)
            result.append(s)
    return result


def _fuzzy_match_event_type(value: str) -> str:
    """模糊匹配事件类型"""
    if not value:
        return "industry_trend"
    value_lower = value.lower().strip()
    mapping = {
        "supply": "supply_disruption",
        "price_up": "price_surge",
        "price_": "price_drop",
        "policy": "policy_favorable",
        "monetary": "monetary_policy",
        "macro": "macro_economy",
        "industry": "industry_trend",
        "demand": "demand_change",
        "inventory": "inventory_change",
        "geopolitical": "geopolitical",
    }
    for key, event_type in mapping.items():
        if key in value_lower:
            return event_type
    return "industry_trend"
