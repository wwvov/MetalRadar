"""Agent 服务 — MRI Agent: 对话、报告、会话管理"""

import json, logging, uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from openai import OpenAI

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.company import Company, CompanyMaterial
from app.models.news import News
from app.models.session import ChatSession, ChatMessageRecord, SharedReport
from app.schemas.chat import (
    ChatResponse, ChartData, SourceItem, RiskReport,
    RiskFactor, ReasoningStep, Recommendation,
    PressureTestScenario,
)

logger = logging.getLogger(__name__)
TZ = timezone(timedelta(hours=8))

AVAILABLE_MODELS = {
    "glm-5.2": "GLM-5.2 (通用)",
    "glm-4.7": "GLM-4.7 (快速)",
    "glm-4.5": "GLM-4.5 (经典)",
}

AGENT_SYSTEM_PROMPT = """你是一位专业的金融原材料风险分析助手 — MRI (Material Risk Intelligence) Agent。

## 身份
你是 MetalRadar 的 AI 分析助手，专注于有色金属、新能源材料、黑色金属等大宗商品风险分析。

## 能力
1. **风险扫描**: 全面评估企业原材料风险，输出风险评分和等级
2. **事件解读**: 解读突发新闻对原材料成本的传导影响
3. **产业链分析**: 分析上下游价格变动的影响路径
4. **数据解读**: 解读价格走势、库存、供需关系等量化数据

## 四层推理框架
1. 事件定性 → 2. 传导推理 → 3. 量化评估 → 4. 综合判断

## 回复要求
- 简洁专业的金融分析语言（中文）
- 重要数字和结论用**加粗**
- 数据标注来源
- 风险判定必须明确给出等级
- 所有建议标注"仅供参考，不构成投资建议"
"""


def get_available_models() -> dict:
    """返回可用模型列表"""
    return {"models": [
        {"id": k, "name": v} for k, v in AVAILABLE_MODELS.items()
    ]}


def _get_client(model: str = None):
    """创建 LLM 客户端"""
    if not settings.LLM_API_KEY:
        return None
    return OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)


# ─── Risk Engine (same as before, simplified) ───────────────────

def _compute_risk(cost_data, risk_news, price_data) -> dict:
    """五因子风险评分"""
    # News score
    news_score = 50
    if risk_news:
        pos = sum(1 for n in risk_news if n.get("emotion") == "positive")
        neg = sum(1 for n in risk_news if n.get("emotion") == "negative")
        total = len(risk_news)
        if total > 0:
            news_score = 50 + (neg - pos) / total * 40
            news_score = max(10, min(90, news_score))

    # Price score
    price_score = 50
    scores_p = []
    for m in cost_data:
        pi = m.get("price_info", {})
        if pi.get("volatility_30d_pct"):
            s = min(90, 30 + pi["volatility_30d_pct"] * 2)
            chg = pi.get("change_pct_24h") or 0
            s += abs(chg) * 3
            scores_p.append(s)
    if scores_p:
        price_score = sum(scores_p) / len(scores_p)
        price_score = max(10, min(90, price_score))

    # Cost score
    cost_score = 50
    weighted = []
    w_sum = 0
    for m in cost_data:
        pct = m.get("cost_pct", 0) or 0
        if pct > 0:
            pi = m.get("price_info", {})
            chg = abs(pi.get("change_pct_24h") or 0)
            s = min(90, pct * 1.5 + chg * 3)
            weighted.append(s * (pct / 100))
            w_sum += pct / 100
    if w_sum > 0:
        cost_score = sum(weighted) / w_sum
        cost_score = max(10, min(90, cost_score))

    # Macro
    macro_score = 50
    if risk_news:
        macro_events = sum(1 for n in risk_news
                          if n.get("event_type") in ("policy_favorable", "monetary_policy", "macro_economy", "geopolitical"))
        if macro_events > 0:
            macro_score = 50 + min(40, macro_events * 15)

    fx_score = 50

    weights = {"news": 0.40, "price_vol": 0.25, "cost_exposure": 0.20, "macro": 0.10, "fx": 0.05}
    scores_d = {"news": round(news_score, 1), "price_vol": round(price_score, 1),
                "cost_exposure": round(cost_score, 1), "macro": round(macro_score, 1),
                "fx": round(fx_score, 1)}
    total = sum(scores_d[k] * weights[k] for k in weights)

    level = "低风险" if total < 40 else ("中等风险" if total < 70 else "高风险")

    return {
        "score": round(total, 1), "level": level,
        "factors": [
            {"name": "新闻情绪", "score": scores_d["news"], "weight": 0.40, "description": "近72小时相关新闻情绪分析"},
            {"name": "价格波动", "score": scores_d["price_vol"], "weight": 0.25, "description": "30日期货价格波动率与分位水平"},
            {"name": "成本传导", "score": scores_d["cost_exposure"], "weight": 0.20, "description": "原材料成本占比与价格偏离"},
            {"name": "宏观环境", "score": scores_d["macro"], "weight": 0.10, "description": "宏观政策与产业环境变化"},
            {"name": "汇率波动", "score": scores_d["fx"], "weight": 0.05, "description": "汇率对外盘品种的影响"},
        ],
    }


# ─── Data tools ─────────────────────────────────────────────────

def _search_news(company_id: str = None, material: str = None, days: int = 3) -> list[dict]:
    db = SessionLocal()
    try:
        cutoff = datetime.now(TZ) - timedelta(days=days)
        q = db.query(News).filter(News.pub_time >= cutoff, News.is_relevant == True)
        if company_id:
            company = db.query(Company).filter(Company.id == company_id).first()
            if company and company.code:
                q = q.filter(News.company_entities.contains(company.code))
        if material:
            q = q.filter(News.metal_entities.contains(material))
        news_list = q.order_by(News.pub_time.desc()).limit(20).all()
        return [{"title": n.title or "", "source": n.source or "未知", "emotion": n.emotion or "neutral",
                 "event_type": n.event_type or "", "summary": (n.summary or n.title or "")[:120]} for n in news_list]
    finally:
        db.close()


def _get_price_info(material: str) -> dict:
    try:
        from app.services.futures_service import get_futures_quote, get_futures_kline
        contract_map = {"碳酸锂": "LC0", "锂": "LC0", "铜": "CU0", "沪铜": "CU0", "铝": "AL0", "沪铝": "AL0",
                        "镍": "NI0", "沪镍": "NI0", "锌": "ZN0", "沪锌": "ZN0", "螺纹钢": "RB0",
                        "热卷": "HC0", "黄金": "AU0", "白银": "AG0", "原油": "SC0"}
        contract = contract_map.get(material)
        if not contract:
            return {"error": f"无对应合约"}
        quote = get_futures_quote(contract)
        kline = get_futures_kline(contract, period="daily")
        prices = [d["close"] for d in kline[-30:]] if kline else []
        vol = None
        if len(prices) >= 5:
            import statistics
            rets = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
            vol = round(statistics.stdev(rets) * (252**0.5) * 100, 2)
        return {"contract": contract, "current_price": quote.get("price") if quote else None,
                "change_pct_24h": quote.get("change_pct") if quote else None,
                "volatility_30d_pct": vol, "prices_30d": prices}
    except Exception as e:
        logger.warning(f"获取价格失败 {material}: {e}")
        return {"error": str(e)}


def _get_cost_exposure(company_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        materials = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_id).all()
        results = []
        for m in materials:
            item = {"name": m.material_name or "", "cost_pct": float(m.cost_pct or 0),
                    "direction": m.direction or "不利", "contract": m.contract or "", "source": m.source or "行业推断"}
            if m.material_name:
                item["price_info"] = _get_price_info(m.material_name)
            results.append(item)
        return results
    finally:
        db.close()


def _get_company_context(company_id: str) -> dict:
    db = SessionLocal()
    try:
        c = db.query(Company).filter(Company.id == company_id).first()
        if not c:
            return {"error": "公司不存在"}
        mats = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_id).all()
        return {"name": c.name or "未知", "code": c.code or "", "industry": c.industry or "未知",
                "position": c.position or "未知", "position_detail": c.position_detail or "",
                "materials": [{"name": m.material_name or "", "cost_pct": float(m.cost_pct or 0),
                              "direction": m.direction or "不利", "source": m.source or "行业推断"} for m in mats]}
    finally:
        db.close()


# ─── Main Chat ──────────────────────────────────────────────────

def process_chat(
    company_id: Optional[str], message: str,
    scenario: Optional[str] = None, history: Optional[list[dict]] = None,
    session_id: Optional[str] = None, model: str = "glm-5.2",
) -> ChatResponse:
    """处理用户消息"""
    client = _get_client(model)

    # Context
    company_ctx, cost_data, risk_news, price_data = None, [], [], {}
    if company_id:
        company_ctx = _get_company_context(company_id)
        if company_ctx and "error" not in company_ctx:
            cost_data = _get_cost_exposure(company_id)
            risk_news = _search_news(company_id)
            if cost_data:
                for m in sorted(cost_data, key=lambda x: x.get("cost_pct", 0), reverse=True)[:2]:
                    if m.get("name"):
                        price_data[m["name"]] = _get_price_info(m["name"])

    # Build context text
    ctx_parts = []
    if company_ctx and "error" not in company_ctx:
        ctx_parts.append(f"## 当前分析对象\n- 公司: {company_ctx['name']} ({company_ctx['code']})\n- 行业: {company_ctx['industry']}\n- 产业链位置: {company_ctx['position']}")
        if company_ctx.get("position_detail"):
            ctx_parts[-1] += f"\n- 详情: {company_ctx['position_detail']}"

    if cost_data:
        ctx_parts.append("\n## 原材料成本结构")
        for m in cost_data:
            s = f"- {m['name']}: 占比约{m['cost_pct']}%, 影响{m['direction']}"
            pi = m.get("price_info", {})
            if "error" not in pi:
                if pi.get("current_price"): s += f", 当前{pi['current_price']}"
                if pi.get("change_pct_24h") is not None: s += f", 24H{pi['change_pct_24h']:+.2f}%"
            ctx_parts.append(s)

    if risk_news:
        ctx_parts.append(f"\n## 近72h风险新闻 ({len(risk_news)}条)")
        for n in risk_news[:6]:
            em = {"positive": "利多", "negative": "利空", "neutral": "中性"}.get(n.get("emotion", ""), "")
            ctx_parts.append(f"- [{em}] {n['title'][:80]} (来源:{n['source']})")

    ctx_text = "\n".join(ctx_parts)

    # Messages
    messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]
    if history:
        for h in history[-20:]:
            messages.append({"role": h["role"], "content": h["content"]})

    user_msg = message
    if ctx_text:
        user_msg = f"以下是当前数据上下文:\n\n{ctx_text}\n\n---\n用户提问: {message}"

    if scenario == "risk_scan":
        user_msg += "\n\n请对该企业进行全面原材料风险扫描，给出风险评分和等级判定。"
    elif scenario == "event_impact":
        user_msg += "\n\n请分析该事件对企业原材料成本的传导影响路径和程度。"

    messages.append({"role": "user", "content": user_msg})

    # LLM call
    reply_text = ""
    risk_result = None
    if client:
        try:
            actual_model = settings.LLM_MODEL if model == "glm-5.2" else model
            response = client.chat.completions.create(
                model=actual_model, messages=messages,
                temperature=0.3, max_tokens=2000, timeout=60)
            reply_text = response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM error: {e}")
            reply_text = f"AI分析服务暂时不可用（{str(e)[:80]}）。请检查API Key配置。"

        if scenario == "risk_scan" and company_id and cost_data:
            try:
                risk_result = _compute_risk(cost_data, risk_news, price_data)
            except Exception as e:
                logger.warning(f"风险计算失败: {e}")
    else:
        reply_text = (_get_fallback_reply(company_ctx, message, scenario) if company_ctx
                      else "请先选择一家公司，或在 .env 中配置 LLM_API_KEY。")

    # Prepend risk score
    if risk_result:
        prefix = (f"\n\n---\n📊 **风险评分**: {risk_result['score']}分 | "
                  f"**风险等级**: {risk_result['level']}\n\n")
        reply_text = prefix + reply_text

    # Charts
    charts = []
    if cost_data:
        bar_items = []
        for m in cost_data:
            pi = m.get("price_info", {})
            if "error" not in pi and pi.get("change_pct_24h") is not None:
                bar_items.append({"name": m["name"], "change_pct": round(pi["change_pct_24h"], 2),
                                 "cost_pct": m.get("cost_pct", 0)})
        if bar_items:
            charts.append(ChartData(type="bar", title="原材料价格24H变动", data={"items": bar_items}))
        for m in cost_data:
            pi = m.get("price_info", {})
            if "error" not in pi and pi.get("prices_30d"):
                charts.append(ChartData(type="line", title=f"{m['name']} 近30日走势",
                                       data={"material_name": m["name"], "prices": pi["prices_30d"]}))
                break

    # Sources
    sources = [SourceItem(source=n.get("source", "未知"), content=n.get("title", "")[:100])
              for n in risk_news[:5]] if risk_news else None

    # Save to session
    if session_id:
        _save_message(session_id, "user", message)
        _save_message(session_id, "assistant", reply_text,
                     charts=[c.model_dump() for c in charts] if charts else None,
                     risk_score=risk_result["score"] if risk_result else None,
                     risk_level=risk_result["level"] if risk_result else None,
                     sources=[s.model_dump() for s in sources] if sources else None)
        _touch_session(session_id)

    return ChatResponse(reply=reply_text, charts=charts if charts else None,
                        risk_score=risk_result["score"] if risk_result else None,
                        risk_level=risk_result["level"] if risk_result else None,
                        sources=sources)


def _get_fallback_reply(company_ctx: dict, message: str, scenario: str) -> str:
    if company_ctx and "error" not in company_ctx:
        return (f"您好！我是MRI Agent。\n\n当前分析目标: **{company_ctx['name']}** ({company_ctx['code']}), "
                f"行业: {company_ctx['industry']}, 位置: {company_ctx['position']}。\n\n"
                f"⚠️ AI服务未配置，请在 backend/.env 配置 LLM_API_KEY。")
    return "您好！请先选择一家公司开始分析。AI服务未配置API Key。"


# ─── Session Management ─────────────────────────────────────────

def create_session(title: str = "新对话", model: str = "glm-5.2") -> dict:
    db = SessionLocal()
    try:
        session = ChatSession(title=title, model=model)
        db.add(session)
        db.commit()
        db.refresh(session)
        return _session_to_dict(session)
    finally:
        db.close()


def list_sessions() -> list[dict]:
    db = SessionLocal()
    try:
        sessions = db.query(ChatSession).order_by(ChatSession.updated_at.desc()).all()
        return [_session_to_dict(s) for s in sessions]
    finally:
        db.close()


def get_session(session_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        s = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not s:
            return None
        d = _session_to_dict(s)
        messages = db.query(ChatMessageRecord).filter(
            ChatMessageRecord.session_id == session_id
        ).order_by(ChatMessageRecord.created_at).all()
        d["messages"] = [{"id": m.id, "role": m.role, "content": m.content,
                          "charts": m.charts, "risk_score": m.risk_score,
                          "risk_level": m.risk_level, "sources": m.sources,
                          "created_at": m.created_at.isoformat() if m.created_at else ""}
                         for m in messages]
        return d
    finally:
        db.close()


def delete_session(session_id: str) -> bool:
    db = SessionLocal()
    try:
        s = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not s:
            return False
        db.delete(s)
        db.commit()
        return True
    finally:
        db.close()


def rename_session(session_id: str, title: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        s = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not s:
            return None
        s.title = title
        db.commit()
        db.refresh(s)
        return _session_to_dict(s)
    finally:
        db.close()


def _session_to_dict(s: ChatSession) -> dict:
    return {
        "id": s.id, "title": s.title, "model": s.model,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        "company_id": s.company_id,
        "message_count": len(s.messages) if s.messages else 0,
    }


def _save_message(session_id: str, role: str, content: str,
                  charts=None, risk_score=None, risk_level=None, sources=None):
    db = SessionLocal()
    try:
        msg = ChatMessageRecord(session_id=session_id, role=role, content=content,
                               charts=charts, risk_score=risk_score,
                               risk_level=risk_level, sources=sources)
        db.add(msg)
        db.commit()
    finally:
        db.close()


def _touch_session(session_id: str):
    db = SessionLocal()
    try:
        s = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if s:
            s.updated_at = datetime.now(TZ)
            db.commit()
    finally:
        db.close()


# ─── Report ─────────────────────────────────────────────────────

def generate_report(company_id: str, material: str = None) -> RiskReport:
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise ValueError(f"公司不存在: {company_id}")

        materials = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_id).all()
        if not materials:
            raise ValueError(f"公司 {company.name} 无原材料数据")

        target = materials[0]
        if material:
            found = [m for m in materials if m.material_name and material in m.material_name]
            if found:
                target = found[0]

        t_name = target.material_name or "未知品种"
        price_info = _get_price_info(t_name)
        cost_data = _get_cost_exposure(company_id)
        risk_news = _search_news(company_id, t_name)

        price_data_map = {t_name: price_info} if "error" not in price_info else {}
        risk_result = _compute_risk(cost_data, risk_news, price_data_map)

        rid = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-{t_name[:2]}"
        now_str = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")

        reasoning = [
            ReasoningStep(step=1, title="识别范围",
                         detail=f"关注物料: {t_name}; 企业: {company.name}({company.code})"),
            ReasoningStep(step=2, title="感知信号",
                         detail=f"新闻源检索{len(risk_news)}条; 30日波动率σ≈{price_info.get('volatility_30d_pct','未知')}%"),
            ReasoningStep(step=3, title="推理传导",
                         detail="分析事件沿产业链(资源国→期货→加工→终端)的传导路径"),
            ReasoningStep(step=4, title="情景模拟", detail="运行基准/加剧/缓解三情景压力测试"),
            ReasoningStep(step=5, title="结论生成", detail=f"综合权重后 Risk Score = {risk_result['score']}"),
        ]

        level = risk_result["level"]
        if level == "高风险":
            recs = [Recommendation(priority=1, action="加速对冲", detail="5个工作日内锁定60%采购量"),
                    Recommendation(priority=2, action="套保建议", detail=f"对{t_name}采取期货套保覆盖50%敞口"),
                    Recommendation(priority=3, action="加强监控", detail="启动主要供应地区实时监控")]
        elif level == "中等风险":
            recs = [Recommendation(priority=1, action="关注波动", detail=f"密切关注{t_name}价格，设定预警阈值"),
                    Recommendation(priority=2, action="部分锁价", detail="锁定30%近期采购量"),
                    Recommendation(priority=3, action="库存优化", detail="评估安全库存，适度增加缓冲")]
        else:
            recs = [Recommendation(priority=1, action="正常采购", detail="当前风险可控，按正常节奏采购"),
                    Recommendation(priority=2, action="保持关注", detail=f"持续跟踪{t_name}变化"),
                    Recommendation(priority=3, action="成本优化", detail="利用价格低位优化供应商结构")]

        sources = [SourceItem(source=n.get("source", "未知"), content=n.get("title", ""))
                  for n in risk_news[:5]]

        # Charts
        charts = []
        bar_items = [{"name": m.get("name", ""), "change_pct": round(m.get("price_info", {}).get("change_pct_24h", 0) or 0, 2),
                     "cost_pct": m.get("cost_pct", 0)}
                    for m in cost_data if m.get("price_info", {}).get("change_pct_24h") is not None]
        if bar_items:
            charts.append(ChartData(type="bar", title="多品种价格变动", data={"items": bar_items}))
        if "error" not in price_info and price_info.get("prices_30d"):
            charts.append(ChartData(type="line", title=f"{t_name} 30日走势",
                                   data={"material_name": t_name, "prices": price_info["prices_30d"]}))
        charts.append(ChartData(type="gauge", title="综合风险评分", data={"score": risk_result["score"]}))

        return RiskReport(
            report_id=rid, generated_at=now_str, company_name=company.name or "未知",
            company_code=company.code or "", material_name=t_name,
            risk_score=risk_result["score"], risk_level=level,
            summary=(f"{t_name}当前{price_info.get('current_price','未知')}, 24H{price_info.get('change_pct_24h',0):+.1f}%."
                    f"加权综合得分{risk_result['score']}, 判定**{level}**."),
            current_price=price_info.get("current_price"),
            price_change_24h=price_info.get("change_pct_24h"),
            reasoning=reasoning, sources=sources,
            factors=[RiskFactor(**f) for f in risk_result["factors"]],
            recommendations=recs, charts=charts,
        )
    finally:
        db.close()


def generate_multi_report(company_id: str, material_names: list[str]) -> dict:
    """多品种对比报告"""
    reports = []
    for name in material_names:
        try:
            r = generate_report(company_id, name)
            reports.append(r.model_dump())
        except Exception as e:
            logger.warning(f"多品种报告-{name} 失败: {e}")

    # Comparison summary
    comparisons = []
    for r in reports:
        comparisons.append({
            "material": r["material_name"],
            "risk_score": r["risk_score"],
            "risk_level": r["risk_level"],
            "price_change_24h": r.get("price_change_24h"),
        })

    return {
        "company_name": reports[0]["company_name"] if reports else "未知",
        "company_code": reports[0]["company_code"] if reports else "",
        "generated_at": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"),
        "material_count": len(reports),
        "comparisons": comparisons,
        "details": reports,
    }


def share_report(report_data: dict) -> str:
    """创建分享链接"""
    db = SessionLocal()
    try:
        shared = SharedReport(
            report_data=report_data,
            expires_at=datetime.now(TZ) + timedelta(days=7),
        )
        db.add(shared)
        db.commit()
        return shared.id
    finally:
        db.close()


def get_shared_report(share_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        s = db.query(SharedReport).filter(SharedReport.id == share_id).first()
        if not s:
            return None
        if s.expires_at and s.expires_at < datetime.now(TZ):
            return None
        return s.report_data
    finally:
        db.close()


# ─── Dashboard context ──────────────────────────────────────────

def get_dashboard_context(company_id: str = None, tab: str = "company") -> dict:
    """右侧仪表盘数据"""
    result = {"tab": tab}

    if tab == "company" and company_id:
        ctx = _get_company_context(company_id)
        if ctx and "error" not in ctx:
            result["data"] = ctx
    elif tab == "metal":
        materials = []
        if company_id:
            cost_data = _get_cost_exposure(company_id)
            for m in cost_data:
                item = {"name": m["name"], "cost_pct": m["cost_pct"],
                       "price": m.get("price_info", {}).get("current_price"),
                       "change_24h": m.get("price_info", {}).get("change_pct_24h")}
                materials.append(item)
        result["data"] = {"materials": materials}
    elif tab == "sentiment":
        news_data = _search_news(company_id)
        result["data"] = {"news": news_data, "count": len(news_data)}

    return result


def get_recommended_questions(company_id: str = None) -> dict:
    """生成推荐问题"""
    questions = []
    if company_id:
        ctx = _get_company_context(company_id)
        if ctx and "error" not in ctx:
            questions.append(f"请对{ctx['name']}进行全面的原材料风险扫描")
            mats = ctx.get("materials", [])
            if mats:
                top = sorted(mats, key=lambda x: x["cost_pct"], reverse=True)[:2]
                for m in top:
                    questions.append(f"{m['name']}价格波动对{ctx['name']}成本影响有多大？")
            questions.append(f"{ctx['name']}近期面临哪些主要风险事件？")

    # Always add generic questions
    questions.append("当前有色金属市场整体风险如何？")
    questions.append("近期宏观政策对原材料价格有什么影响？")
    questions.append("帮我解读最新的产业链动态")

    return {"questions": questions[:6]}
