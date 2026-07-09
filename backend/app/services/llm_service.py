"""LLM 服务 — 调用大模型生成公司画像"""

import json
import logging
import time
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


class PortraitGenerationError(Exception):
    """LLM 画像生成失败异常 — 区别于配置错误，表示运行时调用失败"""
    pass


class FinancialExtractionError(Exception):
    """LLM 财报数据提取失败异常 — 表示运行时调用失败"""
    pass


def _to_float_or_none(value) -> float | None:
    """安全地将 LLM 返回的值转换为 float，无法转换时返回 None"""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


FINANCIAL_SYSTEM_PROMPT = """你是一位资深的中国注册会计师和财务分析师，专门从A股上市公司年报/半年报中提取结构化财务数据。

你的任务是阅读财报文本，提取关键财务指标并输出JSON。请严格输出JSON，不要添加任何解释文字。

## JSON格式要求:
{
  "report_period": "报告期(如2024Q4或2024H1)",
  "revenue": 数字(元)或null,
  "cost": 数字(元)或null,
  "net_profit": 数字(元)或null,
  "gross_margin": 数字(%)或null,
  "direct_material_pct": 数字(%)或null,
  "direct_labor_pct": 数字(%)或null,
  "manufacturing_pct": 数字(%)或null,
  "raw_data": {}
}

## 数据提取指南:

### 报告期 (report_period)
- 优先查找"报告期"、"会计期间"、"截至...止"等字样
- 格式: YYYYQN (如2024Q4) 或 YYYYHN (如2024H1)

### 营业收入 (revenue) — 必填，通常最容易找到
- 查找合并利润表中的"营业收入"/"营业总收入"/"主营业务收入"
- **单位转换**: 将所有金额统一转换为**元**
  - 如报表单位为"万元": 数值 × 10,000
  - 如报表单位为"亿元": 数值 × 100,000,000
  - 如报表单位为"元": 保持原值

### 营业成本 (cost) — 必填
- **优先级**: 合并利润表中的"营业成本" > "主营业务成本" > "营业总成本"
- **重要**: "营业成本" ≠ "营业总成本"。营业总成本包含管理费用/销售费用/研发费用等，数值更大
- 优先查找利润表中紧跟在营业收入下方的"营业成本"或"主营业务成本"行
- 如果只找到"营业总成本"，请在raw_data中注明
- **单位转换同上**

### 净利润 (net_profit) — 必填
- 查找合并利润表中的"净利润"/"归属于母公司股东的净利润"
- 通常位于利润表底部
- 注意区分"归属于母公司股东的净利润"和"少数股东损益"，取合并净利润（含少数股东）
- **单位转换同上**

### 毛利率 (gross_margin)
- 优先使用报表中直接给出的毛利率(%)
- 若无直接数据: gross_margin = (revenue - cost) / revenue × 100
- 保留1位小数
- 如果revenue或cost为null则不计算

### 成本构成 (direct_material_pct / direct_labor_pct / manufacturing_pct)
- 查找"营业成本构成"、"成本分析表"、"主营业务成本构成"等章节
- 三大项通常为: 直接材料、直接人工、制造费用
- 每项取**占营业成本的比例**(百分比)
- 如报表未披露成本构成明细，全部填null（这在A股中非常常见）
- 注意这三个比例之和通常接近100%，但非强制

### raw_data
- 包含提取到但无法归入上述字段的额外信息
- 如: 前五大供应商集中度、研发费用、存货金额、营业总成本(如与营业成本不同)等
- 如无额外数据，填空对象 {}

## 重要原则:
1. 只提取明确出现在文本中的数据，不要编造
2. 不确定的字段填null，不要猜测
3. 合并报表 > 母公司报表
4. 金额统一为元
5. 优先取"归属于母公司所有者的净利润"作为net_profit
6. 输出纯JSON，不要用```json```包裹
"""

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
    *,
    timeout: float = 60,
    max_retries: int = 3,
) -> dict:
    """调用大模型生成公司画像

    Args:
        timeout: 单次 LLM 调用超时秒数（默认60秒，自动修复用15秒）
        max_retries: 最大重试次数（默认3次，自动修复用1次）

    Returns:
        dict with keys: industry, business_desc, position, position_detail, materials

    Raises:
        PortraitGenerationError: LLM 调用失败（API Key 已配置但运行时出错）
    """
    # 配置错误：API Key 未设置 — 返回占位画像（开发环境允许继续）
    if not settings.LLM_API_KEY:
        logger.warning("LLM_API_KEY 未配置，返回占位画像 — 请配置后重新生成")
        return _fallback_portrait(company_name, company_code)

    client = _get_openai_client()
    user_prompt = _build_user_prompt(company_name, company_code, industry_hint, report_text)

    logger.info(f"调用 LLM 生成画像: model={settings.LLM_MODEL}, "
                f"company={company_name}({company_code}), timeout={timeout}s, retries={max_retries}")

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"LLM 调用尝试 {attempt}/{max_retries}")

            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
                response_format={"type": "json_object"},  # 强制 JSON 输出
                timeout=timeout,
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

            # 验证画像质量：至少要有行业或品种
            materials_count = len(result.get("materials", []))
            if not result.get("industry") and materials_count == 0:
                raise ValueError("LLM 返回画像不完整：industry 和 materials 均为空")

            logger.info(
                f"LLM 画像生成成功: {company_name} ({company_code}), "
                f"行业={result.get('industry')}, "
                f"位置={result.get('position')}, "
                f"品种数={materials_count}"
            )
            return result

        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"尝试 {attempt}/{max_retries} JSON 解析失败: {e}")
        except Exception as e:
            last_error = e
            logger.warning(f"尝试 {attempt}/{max_retries} 失败: {type(e).__name__}: {e}")

        if attempt < max_retries:
            wait = 2 ** attempt  # 指数退避: 2s, 4s
            logger.info(f"等待 {wait}s 后重试...")
            time.sleep(wait)

    # 所有重试均失败
    raise PortraitGenerationError(
        f"LLM 画像生成失败（{max_retries} 次重试后仍失败）: "
        f"{type(last_error).__name__}: {last_error}"
    )


def _fallback_portrait(company_name: str, company_code: str) -> dict:
    """API Key 未配置时的占位画像 — 仅用于开发环境"""
    return {
        "industry": "",
        "business_desc": f"LLM_API_KEY 未配置，无法为 {company_name}（{company_code}）生成AI画像。请在 .env 中配置有效的 API Key 后点击「重新生成」。",
        "position": "mid",
        "position_detail": "待AI分析",
        "materials": [],
    }


CHAIN_ANALYSIS_SYSTEM_PROMPT = """你是一位资深的中国产业链分析师，专门研究A股上市公司的产业链全景定位。

你的任务是基于提供的公司信息，生成一份完整的产业链位置分析报告。请严格输出JSON，不要添加任何解释文字。

## JSON格式要求:
{
  "mermaid": "Mermaid graph LR 或 graph TB 代码，绘制产业链上下游结构。用不同颜色标注公司所在环节（该公司环节用#22c55e填充色）。节点用中文。",
  "segments": [
    {
      "level": "upstream/midstream/downstream/auxiliary",
      "label": "环节名称(如:上游矿产资源)",
      "details": [
        {
          "business": "具体业务名称",
          "description": "该业务在产业链中的价值定位及其对公司的重要性",
          "company_involved": true/false
        }
      ]
    }
  ],
  "summary": {
    "covered_segments": ["公司覆盖的产业链环节列表"],
    "core_segment": "最核心、最具话语权的主环节",
    "full_label": "最精准的产业链位置标签(如:上游资源+中游制造一体化/中游电池制造商/下游整车制造商/全产业链布局)",
    "analysis_text": "200字内的产业链位置综合解读"
  }
}

## 产业链层级定义:
- upstream(上游): 原材料/资源端 — 如矿产开采、基础化工原料、电子元器件、农产品等
- midstream(中游): 制造/加工/代工端 — 如冶炼、零部件生产、组装、软件研发等
- downstream(下游): 终端产品/服务端 — 如整车制造、消费电子、零售、SaaS服务等
- auxiliary(辅助): 流通/配套环节 — 如物流、渠道、售后、回收等

## 重要原则:
1. mermaid 代码使用 graph TB(自上而下)布局更清晰
2. 突出标注公司涉足的环节(用 style 语句着色)
3. segments 至少包含上游/中游/下游三层,按逻辑顺序排列
4. 每个环节列出2-5个具体业务
5. summary.covered_segments 精确列出公司实际覆盖的环节
6. summary.full_label 控制在15字以内，精准概括公司产业链定位
7. 输出纯JSON，不要用```json```包裹
"""


def analyze_industry_chain(
    company_name: str,
    company_code: str,
    industry: str = "",
    business_desc: str = "",
    position: str = "",
    position_detail: str = "",
    materials: list[dict] | None = None,
    *,
    timeout: float = 45,
    max_retries: int = 2,
) -> dict:
    """调用大模型分析公司在产业链中的完整位置

    Args:
        company_name: 公司名称
        company_code: 股票代码
        industry: 所属行业
        business_desc: 主营业务描述
        position: 已有的产业链位置(up/mid/down)
        position_detail: 已有的细分环节描述
        materials: 敏感品种列表
        timeout: 单次 LLM 调用超时秒数
        max_retries: 最大重试次数

    Returns:
        dict with keys: mermaid, segments, summary

    Raises:
        PortraitGenerationError: LLM 调用失败
    """
    if not settings.LLM_API_KEY:
        logger.warning("LLM_API_KEY 未配置，跳过产业链分析")
        return _fallback_chain_analysis(company_name, position, position_detail)

    # 构建材料信息
    materials_text = ""
    if materials:
        mat_names = [m.get("material_name", "") for m in materials if m.get("material_name")]
        if mat_names:
            materials_text = f"敏感原材料/品种: {', '.join(mat_names)}"

    user_prompt = f"""请分析以下上市公司的产业链完整位置:

公司名称: {company_name}
股票代码: {company_code}
所属行业: {industry or '未知'}
产业链位置: {position or '未知'} ({position_detail or ''})
主营业务: {business_desc or '未知'}
{materials_text}

请生成该公司在产业链中的全景位置分析，包括:
1. Mermaid流程图(标注该公司涉足的环节)
2. 各环节业务说明
3. 产业链位置总结"""

    client = _get_openai_client()
    logger.info(f"调用 LLM 分析产业链: company={company_name}({company_code}), timeout={timeout}s")

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"产业链分析 LLM 调用尝试 {attempt}/{max_retries}")

            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": CHAIN_ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=3000,
                response_format={"type": "json_object"},
                timeout=timeout,
            )

            raw_content = response.choices[0].message.content or ""
            logger.info(f"产业链分析 LLM 原始响应(前300字符): {raw_content[:300]}")

            json_text = _extract_json(raw_content)
            result = json.loads(json_text)

            # 验证必要字段
            if "mermaid" not in result:
                result["mermaid"] = ""
            if "segments" not in result:
                result["segments"] = []
            if "summary" not in result:
                result["summary"] = {
                    "covered_segments": [],
                    "core_segment": position_detail or position or "未分析",
                    "full_label": position_detail or "",
                    "analysis_text": "",
                }

            logger.info(
                f"产业链分析成功: {company_name}, "
                f"标签={result['summary'].get('full_label', '')}, "
                f"环节数={len(result.get('segments', []))}"
            )
            return result

        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"产业链分析 尝试 {attempt}/{max_retries} JSON 解析失败: {e}")
        except Exception as e:
            last_error = e
            logger.warning(f"产业链分析 尝试 {attempt}/{max_retries} 失败: {type(e).__name__}: {e}")

        if attempt < max_retries:
            wait = 1  # 固定1秒退避，快速重试
            logger.info(f"等待 {wait}s 后重试...")
            time.sleep(wait)

    raise PortraitGenerationError(
        f"产业链分析失败（{max_retries} 次重试后仍失败）: "
        f"{type(last_error).__name__}: {last_error}"
    )


def _fallback_chain_analysis(company_name: str, position: str, position_detail: str) -> dict:
    """API Key 未配置时的占位分析"""
    pos_label = {"up": "上游", "mid": "中游", "down": "下游"}.get(position, "")
    return {
        "mermaid": "",
        "segments": [],
        "summary": {
            "covered_segments": [pos_label] if pos_label else [],
            "core_segment": position_detail or "待AI分析",
            "full_label": position_detail or "待AI分析",
            "analysis_text": "LLM_API_KEY 未配置，无法生成产业链分析。请在 .env 中配置有效的 API Key 后重试。",
        },
    }


def extract_financial_report(
    report_text: str,
    company_name: str,
    *,
    timeout: float = 60,
    max_retries: int = 2,
) -> dict:
    """调用大模型从财报文本中提取结构化财务数据

    Args:
        report_text: 从 PDF 提取的财报文本内容
        company_name: 公司名称（用于日志）
        timeout: 单次 LLM 调用超时秒数
        max_retries: 最大重试次数

    Returns:
        dict with keys: report_period, revenue, cost, gross_margin,
                        direct_material_pct, direct_labor_pct, manufacturing_pct, raw_data

    Raises:
        FinancialExtractionError: LLM 调用失败
    """
    if not settings.LLM_API_KEY:
        logger.warning("LLM_API_KEY 未配置，跳过财报数据提取")
        return {
            "report_period": None, "revenue": None, "cost": None,
            "gross_margin": None, "direct_material_pct": None,
            "direct_labor_pct": None, "manufacturing_pct": None, "raw_data": {},
        }

    # 截断文本到 6000 字符（财报文本可能很长，截断减少 token 消耗加速响应）
    truncated = report_text[:6000] if len(report_text) > 6000 else report_text

    user_prompt = (
        f"请从以下财报文本中提取结构化财务数据:\n\n"
        f"公司名称: {company_name}\n\n"
        f"=== 财报文本（节选） ===\n"
        f"{truncated}\n"
        f"=== 文本结束 ==="
    )

    client = _get_openai_client()
    logger.info(f"调用 LLM 提取财务数据: company={company_name}, timeout={timeout}s")

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"财务提取 LLM 调用尝试 {attempt}/{max_retries}")

            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": FINANCIAL_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=1500,
                response_format={"type": "json_object"},
                timeout=timeout,
            )

            raw_content = response.choices[0].message.content or ""
            logger.info(f"财务提取 LLM 原始响应(前300字符): {raw_content[:300]}")

            json_text = _extract_json(raw_content)
            result = json.loads(json_text)

            # 验证并清洗数据
            net_profit_val = _to_float_or_none(result.get("net_profit"))
            raw_data = result.get("raw_data") if isinstance(result.get("raw_data"), dict) else {}
            # 将 net_profit 同时存入 raw_data 以便后续读取
            if net_profit_val is not None:
                raw_data["net_profit"] = net_profit_val

            financial_data = {
                "report_period": str(result.get("report_period", "")).strip() or None,
                "revenue": _to_float_or_none(result.get("revenue")),
                "cost": _to_float_or_none(result.get("cost")),
                "gross_margin": _to_float_or_none(result.get("gross_margin")),
                "direct_material_pct": _to_float_or_none(result.get("direct_material_pct")),
                "direct_labor_pct": _to_float_or_none(result.get("direct_labor_pct")),
                "manufacturing_pct": _to_float_or_none(result.get("manufacturing_pct")),
                "raw_data": raw_data,
            }

            logger.info(
                f"财务数据提取成功: {company_name}, "
                f"report_period={financial_data['report_period']}, "
                f"revenue={financial_data['revenue']}, "
                f"cost={financial_data['cost']}, "
                f"net_profit={net_profit_val}, "
                f"gross_margin={financial_data['gross_margin']}%"
            )
            return financial_data

        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"财务提取尝试 {attempt}/{max_retries} JSON 解析失败: {e}")
        except Exception as e:
            last_error = e
            logger.warning(f"财务提取尝试 {attempt}/{max_retries} 失败: {type(e).__name__}: {e}")

        if attempt < max_retries:
            wait = 1  # 固定1秒退避，快速重试
            logger.info(f"等待 {wait}s 后重试...")
            time.sleep(wait)

    raise FinancialExtractionError(
        f"财报数据提取失败（{max_retries} 次重试后仍失败）: "
        f"{type(last_error).__name__}: {last_error}"
    )
