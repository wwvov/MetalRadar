"""LLM 服务 — 调用大模型生成公司画像"""

import json
import logging
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一位资深的中国金属/大宗商品行业分析师，专门研究A股上市公司的产业链位置和原材料敏感性。

你的任务是分析给定公司，生成结构化的JSON画像数据。请严格输出JSON，不要添加任何解释文字。

## JSON格式要求:
{
  "industry": "所属细分行业名称",
  "business_desc": "主营业务简述(80字内)",
  "position": "up/mid/down",
  "position_detail": "产业链细分环节(15字内)",
  "materials": [
    {
      "material_name": "品种中文名",
      "cost_pct": 数字或null,
      "direction": "negative/positive",
      "contract": "上期所合约代码"
    }
  ]
}

## 产业链位置判断标准:
- up(上游): 矿产资源开采、冶炼、基础化工原料 — 如:赣锋锂业、紫金矿业、北方稀土
- mid(中游): 材料加工、零部件制造、中间品生产 — 如:华友钴业(正极材料)、格林美(回收)
- down(下游): 终端产品制造、组装、应用 — 如:宁德时代(电池)、比亚迪(整车)

## 敏感品种识别指南:
根据公司主营业务推断其依赖或产出的关键金属/大宗商品品种:

### 锂电池产业链:
- 锂矿/盐湖提锂企业 → 碳酸锂/氢氧化锂 (contract: LC, direction: positive, 占营收60-90%)
- 三元正极材料(镍钴锰) → 镍(contract: NI, cost_pct:30-50%)、钴、锂
- 磷酸铁锂正极 → 锂(contract: LC, cost_pct:25-40%)、磷
- 电解液 → 锂(六氟磷酸锂, cost_pct:20-35%)
- 电池制造 → 锂(contract: LC, cost_pct:40-60%)、铜箔(contract: CU, cost_pct:8-15%)、铝(contract: AL, cost_pct:5-10%)
- 隔膜 → 无直接金属依赖

### 汽车制造(新能源汽车/传统):
- 整车(新能源) → 锂(电池, cost_pct:15-25%)、铜(线束, cost_pct:3-5%)、铝(轻量化, cost_pct:5-8%)、镍(不锈钢, cost_pct:2-4%)
- 整车(传统) → 螺纹钢/热卷(contract: RB/HC, cost_pct:10-20%)、铝(contract: AL, cost_pct:5-10%)、铜(contract: CU, cost_pct:2-4%)

### 有色金属/矿业:
- 铜矿/冶炼 → 铜(contract: CU, direction: positive, 占营收70-90%)
- 铝冶炼/加工 → 铝(contract: AL, direction: positive, 占营收60-80%)、氧化铝
- 铅锌矿 → 铅(contract: PB)、锌(contract: ZN)
- 镍矿/冶炼 → 镍(contract: NI)
- 锡矿 → 锡(contract: SN)
- 黄金矿 → 金(contract: AU)
- 白银 → 银(contract: AG)
- 稀土 → 稀土(无期货合约, contract留空)
- 钴 → 钴(无期货合约, contract留空)

### 钢铁产业链:
- 铁矿石采选 → 铁矿石(contract: I, direction: positive)
- 钢铁冶炼 → 铁矿石(contract: I, cost_pct:40-60%)、焦煤/焦炭(contract: JM/J, cost_pct:20-30%)
- 螺纹钢生产 → 铁矿石、废钢、焦炭
- 不锈钢 → 镍(contract: NI, cost_pct:8-15%)、铬、铁矿石

### 消费电子:
- 精密制造/连接器 → 铜(contract: CU, cost_pct:15-25%)、金(contract: AU, cost_pct:2-5%)
- 铝合金外壳 → 铝(contract: AL, cost_pct:20-30%)
- 线材/线缆 → 铜(contract: CU, cost_pct:40-60%)

## 上海期货交易所主力合约代码对照表:
- 铜: CU, 铝: AL, 锌: ZN, 铅: PB, 镍: NI, 锡: SN
- 黄金: AU, 白银: AG, 螺纹钢: RB, 热轧卷板: HC
- 不锈钢: SS, 铁矿石: I, 焦煤: JM, 焦炭: J
- 原油: SC, 沥青: BU, 天然橡胶: RU, 纸浆: SP
- 碳酸锂: LC (广州期货交易所)
- 工业硅: SI (广州期货交易所)

## 重要原则:
1. materials数组至少列出3个品种，最多8个，按成本占比从高到低排列
2. cost_pct基于行业经验估算，不确定时填null(不要编造精确数字)
3. direction: 制造业公司原材料涨价→negative; 矿业公司产品涨价→positive
4. contract尽量填写上述合约代码，不确定时填空字符串""
5. 不要输出虚无品种(如"其他原材料")，每个品种必须是具体的金属或大宗商品名称
6. 输出纯JSON，不要用```json```包裹
"""


def _get_openai_client() -> OpenAI:
    """获取 OpenAI 客户端"""
    return OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _build_user_prompt(
    company_name: str,
    company_code: str,
    industry_hint: str = "",
    report_text: str | None = None,
) -> str:
    """构建用户提示词"""
    parts = [
        f"请分析以下上市公司，生成其产业链画像:",
        f"",
        f"公司名称: {company_name}",
        f"股票代码: {company_code}",
    ]
    if industry_hint:
        parts.append(f"行业参考: {industry_hint}")
    if report_text:
        # 财报文本可能很长，截取前 3000 字
        truncated = report_text[:3000] if isinstance(report_text, str) else str(report_text)[:3000]
        parts.append(f"")
        parts.append(f"财报参考信息(节选):")
        parts.append(truncated)
    else:
        parts.append(f"")
        parts.append(f"(未提供财报，请基于行业经验进行推断)")

    return "\n".join(parts)


def _extract_json(text: str) -> str:
    """从 LLM 响应中提取 JSON 内容"""
    text = text.strip()
    # 移除 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.split("\n")
        # 去掉第一行(```json 或 ```)和最后一行(```)
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end]).strip()
    # 尝试找到 { 开始和 } 结束的位置
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1:
        text = text[start_idx:end_idx + 1]
    return text


def generate_company_portrait(
    company_name: str,
    company_code: str,
    industry_hint: str = "",
    report_text: str | None = None,
) -> dict:
    """调用大模型生成公司画像

    Returns:
        dict with keys: industry, business_desc, position, position_detail, materials
    """
    if not settings.LLM_API_KEY:
        logger.warning("LLM_API_KEY 未配置，使用默认占位画像")
        return _fallback_portrait(company_name, company_code)

    client = _get_openai_client()
    user_prompt = _build_user_prompt(company_name, company_code, industry_hint, report_text)

    logger.info(f"正在调用 LLM 生成画像: model={settings.LLM_MODEL}, company={company_name}({company_code})")

    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        raw_content = response.choices[0].message.content or ""
        logger.info(f"LLM 原始响应(前300字符): {raw_content[:300]}")

        # 提取并解析 JSON
        json_text = _extract_json(raw_content)
        logger.info(f"提取后JSON(前300字符): {json_text[:300]}")
        result = json.loads(json_text)

        # 验证必要字段
        if "materials" not in result:
            result["materials"] = []
        if "position" not in result:
            result["position"] = "mid"
        if "industry" not in result:
            result["industry"] = ""

        # 清理 materials 中的无效字段
        for m in result.get("materials", []):
            if not m.get("material_name"):
                m["material_name"] = "未知品种"
            if "cost_pct" not in m:
                m["cost_pct"] = None
            if "direction" not in m or m["direction"] not in ("negative", "positive"):
                m["direction"] = "negative"
            if "contract" not in m:
                m["contract"] = ""
            if "source" not in m:
                m["source"] = "inferred"

        logger.info(
            f"LLM 画像生成成功: {company_name} ({company_code}), "
            f"行业={result.get('industry')}, "
            f"位置={result.get('position')}, "
            f"品种数={len(result.get('materials', []))}"
        )
        return result

    except json.JSONDecodeError as e:
        logger.error(f"LLM 返回 JSON 解析失败: {e}")
        return _fallback_portrait(company_name, company_code)
    except Exception as e:
        logger.error(f"LLM 调用失败: {type(e).__name__}: {e}")
        return _fallback_portrait(company_name, company_code)


def _fallback_portrait(company_name: str, company_code: str) -> dict:
    """LLM 不可用时的兜底占位画像"""
    return {
        "industry": "",
        "business_desc": f"{company_name}（{company_code}）的AI画像尚未生成，请配置LLM_API_KEY后重新生成。",
        "position": "mid",
        "position_detail": "待AI分析",
        "materials": [],
    }
