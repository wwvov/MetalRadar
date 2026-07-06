"""Agent 服务 — MRI Agent 核心逻辑：风险分析、工具调度、报告生成"""

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from openai import OpenAI

from app.core.config import settings
from app.core.database import SessionLocal
from app.schemas.chat import (
    ChatResponse, ChartData, SourceItem, RiskReport,
    RiskFactor, ReasoningStep, Recommendation,
    PressureTestRequest, PressureTestScenario,
)
from app.models.company import Company, CompanyMaterial
from app.models.news import News

logger = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=8))

# ─── LLM Client ──────────────────────────────────────────────────────────────

def _get_llm_client() -> Optional[OpenAI]:
    if not settings.LLM_API_KEY:
        return None
    return OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)


# ─── Risk Scoring Engine ─────────────────────────────────────────────────────

def calculate_risk_score(
    news_score: float = 50,
    price_vol_score: float = 50,
    cost_exposure_score: float = 50,
    macro_score: float = 50,
    fx_score: float = 50,
) -> dict:
    """加权风险评分引擎

    权重公式（来自MRI Agent设计文档）:
    Risk Score = 新闻事件风险(40%) + 期货价格波动风险(25%) + 企业成本暴露风险(20%)
               + 宏观环境风险(10%) + 汇率波动风险(5%)
    """
    weights = {
        "news": 0.40,
        "price_vol": 0.25,
        "cost_exposure": 0.20,
        "macro": 0.10,
        "fx": 0.05,
    }
    scores = {
        "news": news_score,
        "price_vol": price_vol_score,
        "cost_exposure": cost_exposure_score,
        "macro": macro_score,
        "fx": fx_score,
    }
    total = sum(scores[k] * weights[k] for k in weights)

    if total < 40:
        level = "低风险"
    elif total < 70:
        level = "中等风险"
    else:
        level = "高风险"

    return {
        "score": round(total, 1),
        "level": level,
        "factors": [
            {
                "name": "新闻情绪",
                "score": scores["news"],
                "weight": weights["news"],
                "description": "基于近72小时相关新闻的情绪分析",
            },
            {
                "name": "价格波动",
                "score": scores["price_vol"],
                "weight": weights["price_vol"],
                "description": "基于30日期货价格波动率与分位水平",
            },
            {
                "name": "成本传导",
                "score": scores["cost_exposure"],
                "weight": weights["cost_exposure"],
                "description": "基于企业原材料成本占比与当前价格偏离",
            },
            {
                "name": "宏观环境",
                "score": scores["macro"],
                "weight": weights["macro"],
                "description": "基于近期宏观政策与产业环境变化",
            },
            {
                "name": "汇率波动",
                "score": scores["fx"],
                "weight": weights["fx"],
                "description": "基于人民币汇率对外盘定价品种的影响",
            },
        ],
    }


# ─── Tools (内部函数) ─────────────────────────────────────────────────────────

def _search_risk_news(company_id: str, material: str = None, days: int = 3) -> list[dict]:
    """从数据库查询与公司和品种相关的近期风险新闻"""
    db = SessionLocal()
    try:
        cutoff = datetime.now(TZ) - timedelta(days=days)
        query = db.query(News).filter(
            News.published_at >= cutoff,
            News.is_relevant == True,
        )

        company = db.query(Company).filter(Company.id == company_id).first()
        conditions = []
        if company:
            code = company.code or ""
            # 匹配公司实体的股票代码
            conditions.append(News.company_entities.contains(code))

        if material:
            conditions.append(News.metal_entities.contains(material))

        if conditions:
            from sqlalchemy import or_
            query = query.filter(or_(*conditions))

        news_list = query.order_by(News.published_at.desc()).limit(20).all()

        results = []
        for n in news_list:
            results.append({
                "title": n.title or "",
                "source": n.source or "未知来源",
                "published_at": n.published_at.isoformat() if n.published_at else "",
                "emotion": n.emotion or "neutral",
                "event_type": n.event_type or "",
                "metal_entities": json.loads(n.metal_entities) if n.metal_entities else [],
                "company_entities": json.loads(n.company_entities) if n.company_entities else [],
                "summary": (n.summary or n.title or "")[:120],
            })

        return results
    finally:
        db.close()


def _get_material_price_info(material: str) -> dict:
    """获取品种的价格信息（从期货服务获取）"""
    try:
        from app.services.futures_service import get_futures_quote, get_futures_kline
        contract_map = {
            "碳酸锂": "LC0", "锂": "LC0",
            "铜": "CU0", "沪铜": "CU0",
            "铝": "AL0", "沪铝": "AL0",
            "镍": "NI0", "沪镍": "NI0",
            "锌": "ZN0", "沪锌": "ZN0",
            "螺纹钢": "RB0", "热卷": "HC0",
            "黄金": "AU0", "白银": "AG0",
            "原油": "SC0",
        }
        contract = contract_map.get(material)
        if not contract:
            return {"error": f"品种 {material} 无对应期货合约"}

        quote = get_futures_quote(contract)
        kline = get_futures_kline(contract, period="daily")
        prices = [d["close"] for d in kline[-30:]] if kline else []

        current_price = quote.get("price") if quote else None
        change_pct = quote.get("change_pct") if quote else None

        # 计算波动率
        if len(prices) >= 5:
            returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
            import statistics
            vol = statistics.stdev(returns) * (252 ** 0.5) * 100 if returns else None
        else:
            vol = None

        return {
            "contract": contract,
            "current_price": current_price,
            "change_pct_24h": change_pct,
            "volatility_30d_pct": round(vol, 2) if vol else None,
            "prices_30d": prices,
        }
    except Exception as e:
        logger.warning(f"获取 {material} 价格信息失败: {e}")
        return {"error": str(e)}


def _get_cost_exposure(company_id: str) -> list[dict]:
    """获取公司的成本暴露情况"""
    db = SessionLocal()
    try:
        materials = db.query(CompanyMaterial).filter(
            CompanyMaterial.company_id == company_id
        ).all()

        results = []
        for m in materials:
            item = {
                "name": m.name or "",
                "cost_pct": m.cost_pct or 0,
                "direction": m.direction or "不利",
                "contract": m.contract or "",
                "source": m.source or "行业推断",
            }
            # 获取当前价格信息
            if m.name:
                price_info = _get_material_price_info(m.name)
                item["price_info"] = price_info
            results.append(item)
        return results
    finally:
        db.close()


def _get_company_context(company_id: str) -> dict:
    """获取公司完整上下文（供LLM使用）"""
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return {"error": "公司不存在"}

        materials = db.query(CompanyMaterial).filter(
            CompanyMaterial.company_id == company_id
        ).all()

        return {
            "name": company.name or "未知",
            "code": company.code or "",
            "industry": company.industry or "未知",
            "position": company.position or "未知",
            "position_detail": company.position_detail or "",
            "materials": [
                {
                    "name": m.name or "",
                    "cost_pct": m.cost_pct or 0,
                    "direction": m.direction or "不利",
                    "source": m.source or "行业推断",
                }
                for m in materials
            ],
        }
    finally:
        db.close()


# ─── LLM Agent Prompt ────────────────────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """你是一位专业的金融原材料风险分析助手 — MRI (Material Risk Intelligence) Agent。

## 你的身份
你是 MetalRadar 平台的 AI 分析助手，专注于有色金属、新能源材料、黑色金属等大宗商品的价格风险分析，
帮助制造业企业和投资者评估原材料价格波动对企业经营的影响。

## 核心能力
1. **风险扫描**: 全面评估指定企业的原材料风险状况，输出风险评分和等级
2. **事件解读**: 解读突发新闻事件对企业原材料成本的传导影响
3. **产业链分析**: 基于产业链传导逻辑，分析上下游价格变动的影响路径
4. **数据解读**: 解读价格走势、库存变化、供需关系等量化数据

## 分析框架
你在分析时应遵循以下四层推理结构：
1. **事件定性** → 识别事件类型（供应中断/需求变化/政策调整/宏观波动）
2. **传导推理** → 追踪事件沿产业链（资源国→期货→加工→终端企业）的传导路径
3. **量化评估** → 评估企业成本暴露程度（原材料占比 × 价格变动幅度）
4. **综合判断** → 给出风险等级、关键风险点、建议措施

## 回复格式要求
1. 使用简洁专业的金融分析语言（中文）
2. 重要数字和结论用**加粗**强调
3. 数据引用标注来源（如：据上海金属网快讯）
4. 如果用户询问特定风险，必须给出明确的风险等级判定
5. 所有建议需标注为"仅供参考，不构成投资建议"

## 限制
- 不要编造你没有看到的数据，明确指出不确定的地方
- 不要给出具体的投资买卖建议
- 如果信息不足，明确说明需要补充哪些信息
"""


# ─── Main Chat Processing ────────────────────────────────────────────────────

def process_chat(
    company_id: Optional[str],
    message: str,
    scenario: Optional[str] = None,
    history: Optional[list[dict]] = None,
) -> ChatResponse:
    """处理用户消息，返回Agent响应

    流程：
    1. 获取公司上下文（如有）
    2. 获取相关新闻
    3. 如有物料相关，获取成本数据和价格信息
    4. 调用LLM生成回复
    5. 评估是否需要生成图表
    """
    client = _get_llm_client()

    # 收集上下文数据
    company_ctx = None
    cost_data = []
    risk_news = []
    price_data = {}

    if company_id:
        company_ctx = _get_company_context(company_id)
        if company_ctx and "error" not in company_ctx:
            cost_data = _get_cost_exposure(company_id)
            risk_news = _search_risk_news(company_id)

            # 获取最重要的品种价格
            if cost_data:
                top_material = sorted(cost_data, key=lambda x: x.get("cost_pct", 0), reverse=True)
                for m in top_material[:2]:
                    if m.get("name"):
                        info = _get_material_price_info(m["name"])
                        price_data[m["name"]] = info

    # 构建上下文文本
    context_parts = []

    if company_ctx and "error" not in company_ctx:
        context_parts.append(f"## 当前分析对象")
        context_parts.append(f"- 公司: {company_ctx['name']} ({company_ctx['code']})")
        context_parts.append(f"- 行业: {company_ctx['industry']}")
        context_parts.append(f"- 产业链位置: {company_ctx['position']}")
        if company_ctx.get("position_detail"):
            context_parts.append(f"- 位置详情: {company_ctx['position_detail']}")

    if cost_data:
        context_parts.append(f"\n## 原材料成本结构")
        for m in cost_data:
            ctx_str = f"- {m['name']}: 成本占比约{m['cost_pct']}%, 影响方向{m['direction']}"
            if m.get("price_info") and "error" not in m["price_info"]:
                pi = m["price_info"]
                if pi.get("current_price"):
                    ctx_str += f", 当前价{pi['current_price']}"
                if pi.get("change_pct_24h") is not None:
                    ctx_str += f", 24H涨跌{pi['change_pct_24h']:+.2f}%"
                if pi.get("volatility_30d_pct"):
                    ctx_str += f", 30日波动率{pi['volatility_30d_pct']}%"
            ctx_str += f" (数据来源: {m.get('source', '行业推断')})"
            context_parts.append(ctx_str)

    if risk_news:
        context_parts.append(f"\n## 近72小时相关风险新闻 ({len(risk_news)}条)")
        for n in risk_news[:8]:
            emotion_tag = {"positive": "利多", "negative": "利空", "neutral": "中性"}.get(n.get("emotion", ""), "")
            context_parts.append(f"- [{emotion_tag}] {n['title'][:80]} (来源: {n['source']})")

    context_text = "\n".join(context_parts)

    # 构建消息列表
    messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]

    # 历史消息（最多保留10轮 = 20条）
    if history:
        for h in history[-20:]:
            messages.append(h)

    # 当前消息
    if context_text:
        user_message = f"以下是当前可用的数据上下文:\n\n{context_text}\n\n---\n用户提问: {message}"
    else:
        user_message = message

    # 场景引导
    if scenario == "risk_scan":
        user_message += "\n\n请对该企业进行全面原材料风险扫描，给出风险评分和等级判定。"
    elif scenario == "event_impact":
        user_message += "\n\n请分析该事件对企业原材料成本的传导影响路径和程度。"

    messages.append({"role": "user", "content": user_message})

    # 调用LLM
    reply_text = ""
    risk_result = None
    sources = []

    if client:
        try:
            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                temperature=0.3,
                max_tokens=2000,
                timeout=60,
            )
            reply_text = response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM调用失败: {e}")
            reply_text = f"抱歉，AI分析服务暂时不可用（{str(e)[:100]}）。请稍后重试。"

        # 对风险扫描场景，计算风险评分
        if scenario == "risk_scan" and company_id and cost_data:
            try:
                risk_result = _compute_risk_from_context(cost_data, risk_news, price_data)
            except Exception as e:
                logger.warning(f"风险评分计算失败: {e}")
    else:
        reply_text = _get_fallback_reply(company_ctx, message, scenario)

    # 合并风险评分到回复
    if risk_result:
        score_text = (
            f"\n\n---\n📊 **风险评分**: {risk_result['score']}分 | "
            f"**风险等级**: {risk_result['level']}\n\n"
        )
        factor_lines = []
        for f in risk_result.get("factors", []):
            factor_lines.append(f"- {f['name']} ({f['weight']*100:.0f}%): {f['score']}分")
        reply_text = score_text + "\n".join(factor_lines) + "\n\n" + reply_text

    # 构建响应
    charts = _build_charts(company_id, cost_data, price_data) if cost_data else None

    # 构建来源列表
    if risk_news:
        for n in risk_news[:5]:
            sources.append(SourceItem(
                source=n.get("source", "未知来源"),
                content=n.get("title", "")[:100],
            ))

    return ChatResponse(
        reply=reply_text,
        charts=charts,
        risk_score=risk_result["score"] if risk_result else None,
        risk_level=risk_result["level"] if risk_result else None,
        sources=sources if sources else None,
    )


def _compute_risk_from_context(
    cost_data: list[dict],
    risk_news: list[dict],
    price_data: dict,
) -> dict:
    """从上下文中计算风险评分"""
    # 新闻情绪评分
    news_score = 50
    if risk_news:
        positive = sum(1 for n in risk_news if n.get("emotion") == "positive")
        negative = sum(1 for n in risk_news if n.get("emotion") == "negative")
        total = len(risk_news)
        if total > 0:
            # 偏利空 → 高分
            news_score = 50 + (negative - positive) / total * 40
            news_score = max(10, min(90, news_score))

    # 价格波动评分
    price_score = 50
    if price_data:
        scores = []
        for name, info in price_data.items():
            if info.get("volatility_30d_pct"):
                # 波动率越高风险越大
                vol = info["volatility_30d_pct"]
                s = min(90, 30 + vol * 2)
                if info.get("change_pct_24h") is not None:
                    chg = info["change_pct_24h"]
                    # 对成本占比大的品种，价格上涨=高风险
                    for m in cost_data:
                        if m["name"] == name and m.get("direction") == "不利":
                            s += abs(chg) * 3
                scores.append(s)
        if scores:
            price_score = sum(scores) / len(scores)
            price_score = max(10, min(90, price_score))

    # 成本暴露评分
    cost_score = 50
    if cost_data:
        weighted_scores = []
        for m in cost_data:
            pct = m.get("cost_pct", 0)
            if pct > 0:
                pi = m.get("price_info", {})
                if pi.get("change_pct_24h") is not None:
                    chg = abs(pi["change_pct_24h"])
                    # 高占比 + 高波动 → 高风险
                    s = min(90, pct * 1.5 + chg * 3)
                    weighted_scores.append(s * (pct / 100))
        if weighted_scores:
            cost_score = sum(weighted_scores) / sum(
                m.get("cost_pct", 0) / 100 for m in cost_data if m.get("cost_pct", 0) > 0
            )
            cost_score = max(10, min(90, cost_score))

    # 宏观评分（基于新闻事件的宏观性质判断）
    macro_score = 50
    if risk_news:
        macro_events = sum(1 for n in risk_news
                          if n.get("event_type") in ("policy_favorable", "monetary_policy",
                                                     "macro_economy", "geopolitical"))
        if macro_events > 0:
            macro_score = 50 + min(40, macro_events * 15)

    # 汇率评分（默认中性）
    fx_score = 50

    return calculate_risk_score(
        news_score=round(news_score, 1),
        price_vol_score=round(price_score, 1),
        cost_exposure_score=round(cost_score, 1),
        macro_score=round(macro_score, 1),
        fx_score=round(fx_score, 1),
    )


def _build_charts(company_id: str, cost_data: list[dict], price_data: dict) -> list[ChartData]:
    """构建内嵌图表"""
    charts = []

    # 1. 多品种价格对比柱状图
    bar_items = []
    for m in cost_data:
        name = m.get("name", "")
        pi = m.get("price_info", {})
        if pi.get("change_pct_24h") is not None:
            bar_items.append({
                "name": name,
                "change_pct": round(pi["change_pct_24h"], 2),
                "cost_pct": m.get("cost_pct", 0),
            })

    if bar_items:
        charts.append(ChartData(
            type="bar",
            title="原材料价格24H变动",
            data={"items": bar_items},
        ))

    # 2. 价格走势折线图（取第一个有数据的品种）
    for m in cost_data:
        pi = m.get("price_info", {})
        if pi.get("prices_30d"):
            charts.append(ChartData(
                type="line",
                title=f"{m['name']} · 近30日价格走势",
                data={
                    "material_name": m["name"],
                    "prices": pi["prices_30d"],
                },
            ))
            break

    return charts if charts else None


def _get_fallback_reply(company_ctx: dict, message: str, scenario: str) -> str:
    """LLM不可用时的兜底回复"""
    if company_ctx and "error" not in company_ctx:
        return (
            f"您好！我是MRI Agent，MetalRadar平台的原材料风险分析助手。\n\n"
            f"当前查看的公司是**{company_ctx['name']}**（{company_ctx['code']}），"
            f"行业: {company_ctx['industry']}，产业链位置: {company_ctx['position']}。\n\n"
            f"⚠️ AI分析服务尚未配置API Key，无法进行深度分析。"
            f"请在 `backend/.env` 中配置 `LLM_API_KEY` 后重启服务。\n\n"
            f"您可以：\n"
            f"- 在「我的关注」页面查看公司产业链画像\n"
            f"- 在「公司详情」页面查看财务指标和成本压力仪表\n"
            f"- 配置API Key后使用完整AI分析功能"
        )
    return (
        "您好！我是MRI Agent，原材料风险分析助手。\n\n"
        "请先在「公司详情」页面选择一家公司，我可以帮您分析该公司的原材料风险状况。\n\n"
        "目前AI分析服务尚未配置API Key，部分功能受限。"
    )


# ─── Report Generation ────────────────────────────────────────────────────────

def generate_report(
    company_id: str,
    material: Optional[str] = None,
) -> RiskReport:
    """生成MRI风险分析报告"""
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise ValueError(f"公司不存在: {company_id}")

        materials = db.query(CompanyMaterial).filter(
            CompanyMaterial.company_id == company_id
        ).all()

        # 确定分析品种
        if material:
            target_materials = [m for m in materials if m.name and material in m.name]
        else:
            target_materials = sorted(materials, key=lambda m: m.cost_pct or 0, reverse=True)

        if not target_materials:
            raise ValueError(f"公司 {company.name} 无原材料数据")

        target = target_materials[0]
        target_name = target.name or "未知品种"

        # 获取价格数据
        price_info = _get_material_price_info(target_name)
        cost_data = _get_cost_exposure(company_id)
        risk_news = _search_risk_news(company_id, target_name)

        # 计算风险评分
        price_data_map = {target_name: price_info} if "error" not in price_info else {}
        risk_result = _compute_risk_from_context(cost_data, risk_news, price_data_map)

        # 生成报告ID
        report_id = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-{target_name[:2]}"

        # 构建推理步骤
        reasoning = [
            ReasoningStep(step=1, title="识别范围",
                         detail=f"关注物料: {target_name}; "
                                f"企业: {company.name}({company.code}); "
                                f"成本占比约{target.cost_pct or '未知'}%."),
            ReasoningStep(step=2, title="感知信号",
                         detail=f"新闻源检索相关事件{len(risk_news)}条; "
                                f"30日价格波动率σ≈{price_info.get('volatility_30d_pct', '未知')}%."),
            ReasoningStep(step=3, title="推理传导",
                         detail="分析事件沿产业链(资源国→期货→加工→终端企业)的传导路径."),
            ReasoningStep(step=4, title="情景模拟",
                         detail="运行基准/加剧/缓解三情景压力测试."),
            ReasoningStep(step=5, title="结论生成",
                         detail=f"综合权重后 Risk Score = {risk_result['score']}."),
        ]

        # 构建建议
        recommendations = []
        if risk_result["level"] == "高风险":
            recommendations = [
                Recommendation(priority=1, action="加速对冲",
                               detail=f"建议5个工作日内锁定60%采购量，剩余40%观望"),
                Recommendation(priority=2, action="套保建议",
                               detail=f"建议对{target_name}采取期货套保策略，覆盖50%敞口"),
                Recommendation(priority=3, action="加强监控",
                               detail=f"启动{target_name}主要供应地区的实时监控"),
            ]
        elif risk_result["level"] == "中等风险":
            recommendations = [
                Recommendation(priority=1, action="关注波动",
                               detail=f"建议密切关注{target_name}价格走势，设定预警阈值"),
                Recommendation(priority=2, action="部分锁价",
                               detail="建议锁定30%近期采购量的价格"),
                Recommendation(priority=3, action="库存优化",
                               detail="评估安全库存水平，适度增加缓冲库存"),
            ]
        else:
            recommendations = [
                Recommendation(priority=1, action="正常采购",
                               detail="当前风险可控，按正常节奏采购"),
                Recommendation(priority=2, action="保持关注",
                               detail=f"持续跟踪{target_name}价格变化和行业动态"),
                Recommendation(priority=3, action="成本优化",
                               detail="利用价格低位窗口，优化供应商结构"),
            ]

        # 来源
        sources = []
        for n in risk_news[:5]:
            sources.append(SourceItem(
                source=n.get("source", "未知"),
                content=n.get("title", ""),
            ))

        # 图表
        charts = _build_charts(company_id, cost_data, price_data_map)

        return RiskReport(
            report_id=report_id,
            generated_at=datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"),
            company_name=company.name or "未知",
            company_code=company.code or "",
            material_name=target_name,
            risk_score=risk_result["score"],
            risk_level=risk_result["level"],
            summary=f"{target_name}当前价格{price_info.get('current_price', '未知')}, "
                    f"24H涨跌{price_info.get('change_pct_24h', 0):+.1f}%。"
                    f"基于新闻情绪、价格波动、成本传导、宏观、汇率的加权综合得分"
                    f"为{risk_result['score']}，判定**{risk_result['level']}**。",
            current_price=price_info.get("current_price"),
            price_change_24h=price_info.get("change_pct_24h"),
            reasoning=reasoning,
            sources=sources,
            factors=[RiskFactor(**f) for f in risk_result.get("factors", [])],
            recommendations=recommendations,
            charts=charts,
        )
    finally:
        db.close()


# ─── Pressure Test ────────────────────────────────────────────────────────────

def run_pressure_test(req: PressureTestRequest) -> list[PressureTestScenario]:
    """运行压力测试沙盒"""
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == req.company_id).first()
        if not company:
            raise ValueError("公司不存在")

        # 获取最近期财报的收入成本数据
        from app.services.company_service import get_aggregated_financials
        financials = get_aggregated_financials(req.company_id)
        baseline_revenue = financials.get("revenue") if financials else None
        baseline_cost = financials.get("cost") if financials else None

        if not baseline_cost:
            # 无财务数据时使用合理估计
            baseline_cost = 1e10
            baseline_revenue = 1.2e10

        materials = db.query(CompanyMaterial).filter(
            CompanyMaterial.company_id == req.company_id
        ).all()
        total_material_pct = sum(m.cost_pct or 0 for m in materials)

        results = []
        for sc in req.scenarios:
            # 计算原材料成本变动
            material_cost_change = sc.price_change_pct / 100 * (total_material_pct / 100)
            fx_impact = sc.fx_change_pct / 100 * 0.3  # 汇率对进口原料影响约30%
            total_impact = material_cost_change + fx_impact

            estimated_cost = baseline_cost * (1 + total_impact)
            if baseline_revenue and baseline_revenue > 0:
                estimated_gross_margin = (baseline_revenue - estimated_cost) / baseline_revenue * 100
                baseline_margin = (baseline_revenue - baseline_cost) / baseline_revenue * 100
                margin_change = estimated_gross_margin - baseline_margin
            else:
                estimated_gross_margin = 20.0
                baseline_margin = 20.0
                margin_change = 0

            # 情景风险评分
            scenario_risk = 40 + abs(sc.price_change_pct) * 2 + abs(sc.fx_change_pct) * 1.5
            scenario_risk = min(95, scenario_risk)

            results.append(PressureTestScenario(
                name=sc.name,
                price_change_pct=sc.price_change_pct,
                fx_change_pct=sc.fx_change_pct,
                estimated_cost=round(estimated_cost, 2),
                estimated_gross_margin=round(estimated_gross_margin, 2),
                margin_change_pp=round(margin_change, 2),
                risk_score=round(scenario_risk, 1),
            ))

        return results
    finally:
        db.close()
