"""Agent 服务 — MRI Agent: 对话、报告、会话管理"""

import json, logging, uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timedelta, timezone
from typing import Optional
from openai import OpenAI

from sqlalchemy import or_

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


def _run_with_timeout(fn, timeout_secs: float, default=None):
    """在超时时间内执行函数，超时返回 default"""
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(fn)
        return future.result(timeout=timeout_secs)
    except FuturesTimeoutError:
        logger.warning(f"Function timeout after {timeout_secs}s")
        return default
    except Exception as e:
        logger.warning(f"Function error: {e}")
        return default
    finally:
        executor.shutdown(wait=False)


AVAILABLE_MODELS = {
    "deepseek-v4-flash": "DeepSeek-V4 Flash (推荐)",
    "deepseek-v4-pro": "DeepSeek-V4 Pro (推理增强)",
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
            comp = db.query(Company).filter(Company.id == company_id).first()
            if comp and comp.id:
                q = q.filter(News.company_entities.contains(comp.id))
        if material:
            q = q.filter(News.metal_entities.contains(material))
        news_list = q.order_by(News.pub_time.desc()).limit(20).all()
        return [{"title": n.title or "", "source": n.source or "未知", "emotion": n.emotion or "neutral",
                 "event_type": n.event_type or "", "summary": (n.summary or n.title or "")[:120]} for n in news_list]
    finally:
        db.close()


def _search_news_by_keywords(keyword: str, days: int = 3) -> list[dict]:
    """按关键词搜索新闻（用于金属品种搜索）"""
    db = SessionLocal()
    try:
        cutoff = datetime.now(TZ) - timedelta(days=days)
        q = db.query(News).filter(
            News.pub_time >= cutoff,
            News.is_relevant == True,
        ).filter(
            (News.metal_entities.contains(keyword)) |
            (News.title.contains(keyword)) |
            (News.summary.contains(keyword))
        )
        news_list = q.order_by(News.pub_time.desc()).limit(20).all()
        return [{"title": n.title or "", "source": n.source or "未知", "emotion": n.emotion or "neutral",
                 "event_type": n.event_type or "", "summary": (n.summary or n.title or "")[:120],
                 "raw_url": n.raw_url or ""} for n in news_list]
    finally:
        db.close()


def _get_price_info(material: str) -> dict:
    try:
        from app.services.futures_service import get_futures_quote, get_futures_history
        quote = _run_with_timeout(lambda: get_futures_quote(material), 3.0)
        history = _run_with_timeout(lambda: get_futures_history(material, days=30), 3.0)
        prices = [d["close"] for d in history] if history else []
        vol = None
        if len(prices) >= 5:
            import statistics
            rets = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
            vol = round(statistics.stdev(rets) * (252**0.5) * 100, 2)
        return {
            "contract": quote.get("contract") if quote else "",
            "current_price": quote.get("price") if quote else None,
            "change_pct_24h": quote.get("change_pct") if quote else None,
            "volatility_30d_pct": vol,
            "prices_30d": prices,
        }
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
            # 价格信息通过独立接口异步获取，避免阻塞对话
            item["price_info"] = {"pending": True}
            results.append(item)
        return results
    finally:
        db.close()


def _get_company_context(company_id: str) -> dict:
    db = SessionLocal()
    try:
        comp = db.query(Company).filter(Company.id == company_id).first()
        if not comp:
            return {"error": "公司不存在"}
        mats = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_id).all()
        return {"name": comp.name or "未知", "code": comp.id or "", "industry": comp.industry or "未知",
                "position": comp.position or "未知", "position_detail": comp.position_detail or "",
                "materials": [{"name": m.material_name or "", "cost_pct": float(m.cost_pct or 0),
                              "direction": m.direction or "不利", "source": m.source or "行业推断"} for m in mats]}
    finally:
        db.close()


# ─── Main Chat ──────────────────────────────────────────────────

def process_chat(
    company_id: Optional[str], message: str,
    scenario: Optional[str] = None, history: Optional[list[dict]] = None,
    session_id: Optional[str] = None, model: str = "deepseek-v4-flash",
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

    # LLM call with hard timeout
    reply_text = ""
    risk_result = None
    if client:
        def _call_llm():
            return client.chat.completions.create(
                model=model, messages=messages,
                temperature=0.3, max_tokens=2000, timeout=20,
            )

        executor = ThreadPoolExecutor(max_workers=1)
        try:
            future = executor.submit(_call_llm)
            response = future.result(timeout=25)
            reply_text = response.choices[0].message.content or ""
        except FuturesTimeoutError:
            logger.error("LLM call hard timeout")
            reply_text = "AI分析服务响应超时（25秒）。请检查网络或API配置。"
        except Exception as e:
            logger.error(f"LLM error: {e}")
            err_msg = str(e)
            reply_text = f"AI分析服务暂时不可用：{err_msg[:150]}。请检查API Key配置。"
        finally:
            executor.shutdown(wait=False)

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

def create_session(title: str = "新对话", model: str = "deepseek-v4-flash") -> dict:
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

def generate_report(company_id: str = None, material: str = None, conversation_context: str = None, company_ids: list[str] = None, material_names: list[str] = None) -> RiskReport:
    """生成专业投研风险分析报告（支持单公司/多公司/纯金属）"""
    # 纯金属模式
    if material_names and not company_id and not company_ids:
        related_companies = _find_companies_by_materials(material_names)
        if not related_companies:
            return _generate_metal_only_report(material_names, conversation_context)
        company_ids = [c["id"] for c in related_companies[:5]]
        return _generate_metal_focused_report(company_ids, material_names, conversation_context)

    # 多公司模式
    if company_ids:
        if len(company_ids) == 1 and not material_names:
            return _generate_single_report(company_ids[0], material, conversation_context)
        if material_names:
            return _generate_metal_focused_report(company_ids, material_names, conversation_context)
        return _generate_company_focused_report(company_ids, material, conversation_context)

    # 单公司兼容模式
    if company_id:
        return _generate_single_report(company_id, material, conversation_context)

    raise ValueError("至少需要一个公司ID或金属品种")


def _generate_single_report(company_id: str, material: str = None, conversation_context: str = None) -> RiskReport:
    """单公司报告生成"""
    db = SessionLocal()
    try:
        comp = db.query(Company).filter(Company.id == company_id).first()
        if not comp:
            raise ValueError(f"公司不存在: {company_id}")

        materials = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_id).all()
        if not materials:
            raise ValueError(f"公司 {comp.name} 无原材料数据")

        target = materials[0]
        if material:
            found = [m for m in materials if m.material_name and material in m.material_name]
            if found:
                target = found[0]

        t_name = target.material_name or "未知品种"
        cost_data = _get_cost_exposure(company_id)
        risk_news = _search_news(company_id, t_name)
        price_info = _run_with_timeout(lambda: _get_price_info(t_name), 5.0, {"error": "timeout"})
        price_data_map = {t_name: price_info} if "error" not in price_info else {}
        risk_result = _compute_risk(cost_data, risk_news, price_data_map)

        rid = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-{t_name[:2]}"
        now_str = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
        current_price = price_info.get("current_price") if "error" not in price_info else None
        change_24h = price_info.get("change_pct_24h") if "error" not in price_info else None
        volatility = price_info.get("volatility_30d_pct") if "error" not in price_info else None
        prices_30d = price_info.get("prices_30d", []) if "error" not in price_info else []
        company_profile = _build_company_profile(comp, materials)

        cost_structure = [
            {"name": m.material_name or "未知", "cost_pct": float(m.cost_pct or 0),
             "cost_pct_valid": m.cost_pct is not None and float(m.cost_pct or 0) > 0,
             "direction": m.direction or "不利", "base_price": float(m.base_price) if m.base_price else None,
             "current_price": price_data_map.get(m.material_name or "", {}).get("current_price")}
            for m in materials
        ]
        risk_events = _build_risk_events(risk_news)
        scenarios = _build_scenarios(target.cost_pct or 0, current_price, target.base_price)

        summary_text = _build_report_summary(
            comp.name, t_name, target.cost_pct or 0,
            current_price, change_24h, volatility,
            risk_result["score"], risk_result["level"],
            len(risk_news), conversation_context
        )

        factor_summary_parts = []
        for f in risk_result["factors"]:
            factor_summary_parts.append(f"{f['name']}（权重{f['weight']:.0%}，得分{f['score']:.0f}）：{f['description']}")
        reasoning = [
            ReasoningStep(step=1, title="价格面",
                         detail=f"{t_name}最新价{current_price or '--'}，24H变动{change_24h:+.2f}%，近30日波动率{volatility or '--'}%。{'价格处于高波动区间' if volatility and volatility > 30 else '价格波动中等' if volatility and volatility > 15 else '价格相对平稳'}。"),
            ReasoningStep(step=2, title="舆情面",
                         detail=f"近72h采集相关新闻{len(risk_news)}条，识别风险事件{len(risk_events)}项。市场关注度{'高，信息冲击风险显著' if len(risk_news) > 10 else '中等，保持跟踪即可' if len(risk_news) > 0 else '较低，主要看基本面'}。"),
            ReasoningStep(step=3, title="成本传导",
                         detail=f"{t_name}在{comp.name}原材料成本中占比约{target.cost_pct or 0}%。产业链位置为{'上游' if comp.position == 'up' else '中游' if comp.position == 'mid' else '下游' if comp.position == 'down' else '未知'}，价格传导方向为{target.direction or '不利'}。"),
            ReasoningStep(step=4, title="综合判定",
                         detail=f"综合五因子加权得分{risk_result['score']:.1f}分，风险等级：{risk_result['level']}。因子详情：{'；'.join(factor_summary_parts[:3])}。"),
        ]
        recs = _build_recommendations(risk_result["level"], t_name, target.cost_pct or 0, change_24h)
        sources = [SourceItem(source=n.get("source", "未知"), content=n.get("title", "")) for n in risk_news[:5]]

        charts = []
        bar_items = [{"name": m.get("name", ""), "change_pct": round(m.get("price_info", {}).get("change_pct_24h", 0) or 0, 2),
                     "cost_pct": m.get("cost_pct", 0)}
                    for m in cost_data if m.get("price_info", {}).get("change_pct_24h") is not None]
        if bar_items:
            charts.append(ChartData(type="bar", title="主要原材料价格24H变动", data={"items": bar_items}))
        if prices_30d:
            charts.append(ChartData(type="line", title=f"{t_name} 近30日价格走势", data={"material_name": t_name, "prices": prices_30d}))
        factor_items = [{"name": f["name"], "score": round(f["score"] * f["weight"], 1)} for f in risk_result["factors"]]
        charts.append(ChartData(type="pie", title="风险因子贡献分布", data={"items": factor_items}))

        conversation_insights = None
        if conversation_context:
            conversation_insights = _summarize_conversation_context(conversation_context, comp.name, t_name)

        return RiskReport(
            report_id=rid, generated_at=now_str, company_name=comp.name or "未知",
            company_code=comp.id or "", material_name=t_name,
            company_names=[comp.name or "未知"],
            company_profiles=[{"name": comp.name, "code": comp.id, "profile": company_profile}],
            risk_score=risk_result["score"], risk_level=risk_result["level"],
            summary=summary_text, current_price=current_price, price_change_24h=change_24h,
            company_profile=company_profile, cost_structure=cost_structure,
            risk_events=risk_events, reasoning=reasoning, sources=sources,
            factors=[RiskFactor(**f) for f in risk_result["factors"]],
            scenarios=scenarios, recommendations=recs, charts=charts,
            conversation_insights=conversation_insights,
        )
    finally:
        db.close()


def _generate_company_focused_report(company_ids: list[str], material: str = None, conversation_context: str = None) -> RiskReport:
    """以公司为核心的多公司对比报告"""
    db = SessionLocal()
    try:
        company_data = []
        all_risk_events = []
        all_news = []
        all_cost_structures = []
        all_profiles = []

        # 全局金属价格缓存，避免重复拉取行情
        price_cache: dict[str, dict] = {}

        for cid in company_ids[:5]:
            comp = db.query(Company).filter(Company.id == cid).first()
            if not comp:
                continue
            mats = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == cid).all()
            if not mats:
                continue

            target = mats[0]
            if material:
                found = [m for m in mats if m.material_name and material in m.material_name]
                if found:
                    target = found[0]

            t_name = target.material_name or "未知品种"
            cost_data = _get_cost_exposure(cid)
            risk_news = _search_news(cid, t_name)

            # 为目标核心金属拉取行情
            price_info = _run_with_timeout(lambda: _get_price_info(t_name), 5.0, {"error": "timeout"})
            price_data_map = {t_name: price_info} if "error" not in price_info else {}
            risk_result = _compute_risk(cost_data, risk_news, price_data_map)

            # 为该公司的每种原材料补齐当前价格（带缓存）
            cost_structure = []
            for m in mats:
                m_name = m.material_name or "未知"
                cost_pct_val = float(m.cost_pct or 0)
                has_cost_pct = m.cost_pct is not None and cost_pct_val > 0

                if m_name not in price_cache:
                    p_info = _run_with_timeout(lambda: _get_price_info(m_name), 3.0, {"error": "timeout"})
                    price_cache[m_name] = p_info
                else:
                    p_info = price_cache[m_name]

                cost_structure.append({
                    "name": m_name,
                    "cost_pct": cost_pct_val if has_cost_pct else 0,
                    "cost_pct_valid": has_cost_pct,
                    "direction": m.direction or "不利",
                    "company": comp.name,
                    "company_code": comp.id,
                    "current_price": p_info.get("current_price") if "error" not in p_info else None,
                    "base_price": float(m.base_price) if m.base_price else None,
                })
            all_cost_structures.extend(cost_structure)
            profile = _build_company_profile(comp, mats)
            all_profiles.append({"name": comp.name or "未知", "code": comp.id, "profile": profile})

            company_data.append({
                "comp": comp, "t_name": t_name, "cost_data": cost_data,
                "risk_news": risk_news, "risk_result": risk_result,
                "price_info": price_info, "target": target,
            })
            all_risk_events.extend(_build_risk_events(risk_news))
            all_news.extend(risk_news)

        if not company_data:
            raise ValueError("所选公司无有效原材料数据")

        primary = max(company_data, key=lambda d: d["risk_result"]["score"])
        primary_comp = primary["comp"]
        primary_t_name = primary["t_name"]
        primary_risk = primary["risk_result"]
        price_info = primary["price_info"]
        current_price = price_info.get("current_price") if "error" not in price_info else None
        change_24h = price_info.get("change_pct_24h") if "error" not in price_info else None

        max_score = primary_risk["score"]
        avg_score = sum(d["risk_result"]["score"] for d in company_data) / len(company_data)
        combined_score = round(max_score * 0.6 + avg_score * 0.4, 1)
        combined_level = "高风险" if combined_score >= 70 else "中等风险" if combined_score >= 40 else "低风险"

        rid = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-MULTI"
        now_str = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
        all_names = [d["comp"].name for d in company_data]
        name_str = "、".join(all_names[:3]) + (" 等" if len(all_names) > 3 else "")

        company_risk_lines = [f"{d['comp'].name}（{d['risk_result']['score']:.0f}分/{d['risk_result']['level']}，核心物料：{d['t_name']}）" for d in company_data]
        summary_text = (
            f"本次分析覆盖{len(company_data)}家公司：{'；'.join(company_risk_lines)}。"
            f"联合风险评分{combined_score:.1f}分，综合风险等级：{combined_level}。"
            f"风险最高的企业为{primary_comp.name}（{primary_risk['score']:.0f}分），主要风险来源于{primary_t_name}价格波动。"
            f"共监测到{len(all_risk_events)}项风险事件，涉及{len(set(e.get('source','') for e in all_risk_events if e.get('source')))}个来源。"
        )
        if conversation_context:
            summary_text += f"\n\n对话洞察阶段关注要点涵盖{len(company_data)}家企业的原材料风险、行业趋势及政策影响。"

        risk_segments = [f"{d['comp'].name[:4]}（{d['risk_result']['score']:.0f}分）" for d in company_data]
        reasoning = [
            ReasoningStep(step=1, title="覆盖范围",
                         detail=f"本次分析覆盖{'、'.join(all_names[:4])}共{len(company_data)}家企业，关联行业：{'、'.join(set(d['comp'].industry or '未知' for d in company_data))}。"),
            ReasoningStep(step=2, title="风险排序",
                         detail=f"各公司风险评分：{'；'.join(risk_segments)}。风险最高的是{primary_comp.name}（{primary_t_name}成本占比{float(primary['target'].cost_pct or 0)}%），价格波动传导风险显著。"),
            ReasoningStep(step=3, title="舆情与事件",
                         detail=f"聚合{len(all_news)}条新闻，识别{len(all_risk_events)}项风险事件。"),
            ReasoningStep(step=4, title="综合判定",
                         detail=f"联合风险评分{combined_score:.1f}分（最高{max_score:.0f}×0.6 + 平均{avg_score:.0f}×0.4），风险等级：{combined_level}。建议重点关注{primary_comp.name}的{primary_t_name}成本风险。"),
        ]
        factors = primary_risk["factors"]
        recs = _build_recommendations(combined_level, primary_t_name, float(primary["target"].cost_pct or 0), change_24h)
        sources = [SourceItem(source=n.get("source", "未知"), content=n.get("title", "")) for n in all_news[:8]]

        seen_titles = set()
        deduped_events = []
        for e in all_risk_events:
            title = e.get("title", "")
            if title and title[:30] not in seen_titles:
                seen_titles.add(title[:30])
                deduped_events.append(e)

        conversation_insights = None
        if conversation_context:
            conversation_insights = _summarize_conversation_context(conversation_context, name_str, primary_t_name)

        charts = [ChartData(type="score_bar", title="各公司风险评分对比",
                           data={"items": [{"name": d["comp"].name, "score": d["risk_result"]["score"]} for d in company_data]})]

        return RiskReport(
            report_id=rid, generated_at=now_str, company_name=name_str, company_code=primary_comp.id or "",
            material_name=primary_t_name, company_names=all_names, company_profiles=all_profiles,
            risk_score=combined_score, risk_level=combined_level, summary=summary_text,
            current_price=current_price, price_change_24h=change_24h,
            company_profile=None, cost_structure=all_cost_structures[:8],
            risk_events=deduped_events[:10], reasoning=reasoning, sources=sources,
            factors=[RiskFactor(**f) for f in factors], scenarios=None, recommendations=recs,
            charts=charts, conversation_insights=conversation_insights,
        )
    finally:
        db.close()


def _generate_metal_focused_report(company_ids: list[str], material_names: list[str], conversation_context: str = None) -> RiskReport:
    """以金属为核心的多公司/金属分析报告：每个金属的行情+每个公司对该金属的暴露"""
    db = SessionLocal()
    try:
        # 获取每个金属的行情
        metal_quotes = []
        metal_price_data = {}
        for m_name in material_names[:4]:
            price_info = _run_with_timeout(lambda: _get_price_info(m_name), 5.0, {"error": "timeout"})
            if "error" not in price_info:
                metal_quotes.append({
                    "name": m_name, "contract": price_info.get("contract", ""),
                    "price": price_info.get("current_price"), "change_pct_24h": price_info.get("change_pct_24h"),
                    "volatility_30d_pct": price_info.get("volatility_30d_pct"),
                })
                metal_price_data[m_name] = price_info
            else:
                metal_quotes.append({"name": m_name, "contract": "", "price": None, "change_pct_24h": None, "volatility_30d_pct": None})

        # 按金属分析关联公司：只评估公司对所选金属的暴露
        company_data = []
        all_risk_events = []
        all_news = []
        all_profiles = []
        metal_exposures = []

        for cid in company_ids[:5]:
            comp = db.query(Company).filter(Company.id == cid).first()
            if not comp:
                continue
            mats = db.query(CompanyMaterial).filter(CompanyMaterial.company_id == cid).all()
            if not mats:
                continue

            profile = _build_company_profile(comp, mats)
            all_profiles.append({"name": comp.name or "未知", "code": comp.id, "profile": profile})

            for m_name in material_names[:4]:
                # 查找公司对该金属的暴露
                matched = [m for m in mats if m.material_name and m_name in m.material_name]
                if not matched:
                    continue
                for m in matched:
                    cost_pct = float(m.cost_pct or 0)
                    cost_data = [{"name": m_name, "cost_pct": cost_pct, "direction": m.direction or "不利"}]
                    risk_news = _search_news_by_keywords(m_name)[:10]
                    price_info = metal_price_data.get(m_name, {"error": "timeout"})
                    price_data_map = {m_name: price_info} if "error" not in price_info else {}
                    risk_result = _compute_risk(cost_data, risk_news, price_data_map)

                    company_data.append({
                        "comp": comp, "t_name": m_name, "risk_news": risk_news,
                        "risk_result": risk_result, "cost_pct": cost_pct,
                    })
                    all_risk_events.extend(_build_risk_events(risk_news))
                    all_news.extend(risk_news)

                    metal_exposures.append({
                        "metal": m_name, "company": comp.name, "company_code": comp.id,
                        "cost_pct": cost_pct, "direction": m.direction or "不利",
                    })

        if not company_data:
            return _generate_metal_only_report(material_names, conversation_context)

        # 聚合风险：每个金属下公司的平均分，再取金属间最高
        metal_scores = {}
        for d in company_data:
            metal_scores.setdefault(d["t_name"], []).append(d["risk_result"]["score"])
        metal_avg_scores = {m: sum(scores)/len(scores) for m, scores in metal_scores.items()}
        max_metal_score = max(metal_avg_scores.values())
        avg_metal_score = sum(metal_avg_scores.values()) / len(metal_avg_scores)
        combined_score = round(max_metal_score * 0.6 + avg_metal_score * 0.4, 1)
        combined_level = "高风险" if combined_score >= 70 else "中等风险" if combined_score >= 40 else "低风险"

        # 主金属取风险最高的那个
        primary_metal = max(metal_avg_scores, key=metal_avg_scores.get)
        primary_price_info = metal_price_data.get(primary_metal, {"error": "timeout"})
        current_price = primary_price_info.get("current_price") if "error" not in primary_price_info else None
        change_24h = primary_price_info.get("change_pct_24h") if "error" not in primary_price_info else None

        rid = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-METAL"
        now_str = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
        all_names = list(dict.fromkeys(d["comp"].name for d in company_data))
        name_str = "、".join(all_names[:3]) + (" 等" if len(all_names) > 3 else "")

        quote_lines = [f"{q['name']}：{q['price'] if q['price'] is not None else '--'}（{q['change_pct_24h']:+.2f}%）" for q in metal_quotes if q['price'] is not None]
        summary_text = (
            f"聚焦金属：{'、'.join(material_names[:4])}。"
            f"行情快照：{'；'.join(quote_lines)}。"
            f"本次分析覆盖{len(all_names)}家关联企业：{name_str}。"
            f"联合风险评分{combined_score:.1f}分，综合风险等级：{combined_level}。"
            f"风险最高的金属为{primary_metal}（平均{max_metal_score:.0f}分）。"
            f"共监测到{len(all_risk_events)}项风险事件。"
        )
        if conversation_context:
            summary_text += "\n\n对话阶段关注要点已融入金属价格趋势与企业成本暴露分析。"

        exposure_lines = [f"{e['metal']}→{e['company']}（成本占比{e['cost_pct']}%）" for e in metal_exposures[:5]]
        reasoning = [
            ReasoningStep(step=1, title="金属行情",
                         detail=f"分析金属：{'、'.join(material_names[:4])}。{'；'.join(quote_lines[:3]) if quote_lines else '暂无有效报价'}。"),
            ReasoningStep(step=2, title="关联企业",
                         detail=f"覆盖{len(all_names)}家企业：{name_str}。重点暴露关系：{'；'.join(exposure_lines)}。"),
            ReasoningStep(step=3, title="风险排序",
                         detail=f"各金属平均风险分：{'；'.join(f'{m}（{s:.0f}分）' for m, s in metal_avg_scores.items())}。风险最高的金属为{primary_metal}。"),
            ReasoningStep(step=4, title="综合判定",
                         detail=f"联合风险评分{combined_score:.1f}分（最高金属平均分{max_metal_score:.0f}×0.6 + 金属平均{avg_metal_score:.0f}×0.4），风险等级：{combined_level}。建议关注{primary_metal}的价格波动及其对关联企业的成本传导。"),
        ]

        primary_company = next(d for d in company_data if d["t_name"] == primary_metal)
        factors = primary_company["risk_result"]["factors"]
        recs = _build_recommendations(combined_level, primary_metal, primary_company["cost_pct"], change_24h)
        sources = [SourceItem(source=n.get("source", "未知"), content=n.get("title", "")) for n in all_news[:8]]

        seen_titles = set()
        deduped_events = []
        for e in all_risk_events:
            title = e.get("title", "")
            if title and title[:30] not in seen_titles:
                seen_titles.add(title[:30])
                deduped_events.append(e)

        conversation_insights = None
        if conversation_context:
            conversation_insights = _summarize_conversation_context(conversation_context, name_str, primary_metal)

        # 图表：每个金属的近30日价格走势 + 金属行情对比 + 公司风险对比
        charts = []
        for m_name in material_names[:4]:
            p_info = metal_price_data.get(m_name, {})
            if p_info and "error" not in p_info and p_info.get("prices_30d"):
                charts.append(ChartData(type="line", title=f"{m_name} 近30日价格走势",
                                       data={"material_name": m_name, "prices": p_info["prices_30d"]}))
        charts.append(ChartData(type="bar", title="金属价格24H变动对比",
                               data={"items": [{"name": q["name"], "change_pct": q["change_pct_24h"] or 0} for q in metal_quotes]}))
        charts.append(ChartData(type="score_bar", title="各公司风险评分对比",
                               data={"items": [{"name": d["comp"].name, "score": d["risk_result"]["score"]} for d in company_data]}))

        return RiskReport(
            report_id=rid, generated_at=now_str, company_name=name_str, company_code="MULTI",
            material_name=primary_metal, material_names=list(material_names[:4]),
            metal_quotes=metal_quotes, metal_exposures=metal_exposures,
            company_names=all_names, company_profiles=all_profiles,
            risk_score=combined_score, risk_level=combined_level, summary=summary_text,
            current_price=current_price, price_change_24h=change_24h,
            company_profile=None, cost_structure=None,
            risk_events=deduped_events[:10], reasoning=reasoning, sources=sources,
            factors=[RiskFactor(**f) for f in factors], scenarios=None, recommendations=recs,
            charts=charts, conversation_insights=conversation_insights,
        )
    finally:
        db.close()


def _generate_metal_only_report(material_names: list[str], conversation_context: str = None) -> RiskReport:
    """纯金属报告：没有关联公司时使用"""
    rid = f"RPT-{datetime.now(TZ).strftime('%Y%m%d')}-METAL"
    now_str = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
    name_str = "、".join(material_names[:4])

    metal_quotes = []
    metal_price_data = {}
    for m_name in material_names[:4]:
        price_info = _run_with_timeout(lambda: _get_price_info(m_name), 5.0, {"error": "timeout"})
        if "error" not in price_info:
            metal_quotes.append({
                "name": m_name, "contract": price_info.get("contract", ""),
                "price": price_info.get("current_price"), "change_pct_24h": price_info.get("change_pct_24h"),
                "volatility_30d_pct": price_info.get("volatility_30d_pct"),
            })
            metal_price_data[m_name] = price_info
        else:
            metal_quotes.append({"name": m_name, "contract": "", "price": None, "change_pct_24h": None, "volatility_30d_pct": None})

    quote_lines = [f"{q['name']}：{q['price'] if q['price'] is not None else '--'}（{q['change_pct_24h']:+.2f}%）" for q in metal_quotes if q['price'] is not None]
    summary_text = (
        f"聚焦金属：{name_str}。行情快照：{'；'.join(quote_lines) if quote_lines else '暂无有效报价'}。"
        f"本报告为纯金属分析，未关联到有成本结构数据的公司，建议在右侧面板补充选择相关企业以获得更完整的成本传导分析。"
    )

    charts = []
    for m_name in material_names[:4]:
        p_info = metal_price_data.get(m_name, {})
        if p_info and "error" not in p_info and p_info.get("prices_30d"):
            charts.append(ChartData(type="line", title=f"{m_name} 近30日价格走势",
                                   data={"material_name": m_name, "prices": p_info["prices_30d"]}))
    charts.append(ChartData(type="bar", title="金属价格24H变动对比",
                           data={"items": [{"name": q["name"], "change_pct": q["change_pct_24h"] or 0} for q in metal_quotes]}))

    reasoning = [
        ReasoningStep(step=1, title="品种范围", detail=f"分析金属品种：{name_str}。"),
        ReasoningStep(step=2, title="价格行情", detail=f"当前行情：{'；'.join(quote_lines[:3]) if quote_lines else '暂无有效报价数据'}。"),
        ReasoningStep(step=3, title="关联企业", detail="当前数据库中未找到与所选金属关联的公司成本结构数据。建议补充公司数据以获得更完整的产业链分析。"),
        ReasoningStep(step=4, title="综合建议", detail="纯金属模式下，建议结合具体企业原材料成本结构进行针对性分析，或在右侧面板选公司后重新生成报告。"),
    ]

    return RiskReport(
        report_id=rid, generated_at=now_str, company_name=f"金属聚焦：{name_str}", company_code="METAL",
        material_name=name_str, material_names=list(material_names[:4]),
        metal_quotes=metal_quotes, metal_exposures=[],
        company_names=[], company_profiles=None,
        risk_score=50.0, risk_level="中等风险", summary=summary_text,
        current_price=metal_quotes[0]["price"] if metal_quotes else None,
        price_change_24h=metal_quotes[0]["change_pct_24h"] if metal_quotes else None,
        company_profile=None, cost_structure=[],
        risk_events=[], reasoning=reasoning, sources=[],
        factors=[], scenarios=None,
        recommendations=[
            Recommendation(priority=1, action="关注行情趋势", detail=f"密切跟踪{'、'.join(material_names[:3])}期货价格及库存数据变动。"),
            Recommendation(priority=2, action="补充企业信息", detail="在右侧面板选择相关企业，生成更全面的成本传导与风险分析报告。"),
            Recommendation(priority=3, action="建立监控体系", detail="设置价格预警线，关注宏观政策、供需关系变化对所选品种的影响。"),
        ],
        charts=charts, conversation_insights=None,
    )


def _build_company_profile(comp: Company, materials: list) -> str:
    """构建公司概况文字"""
    mat_names = [m.material_name for m in materials if m.material_name]
    mat_text = "、".join(mat_names[:5]) if mat_names else "暂无"
    position_text = {"up": "上游（资源/采选）", "mid": "中游（冶炼/加工）", "down": "下游（制造/终端）"}.get(comp.position, comp.position or "未分类")
    parts = [
        f"{comp.name}（{comp.id}）属于{comp.industry or '未知'}行业，产业链位置为{position_text}。",
    ]
    if comp.position_detail:
        parts.append(f"细分定位：{comp.position_detail}。")
    parts.append(f"主要敏感原材料包括：{mat_text}。")
    if comp.business_desc:
        parts.append(f"业务概述：{comp.business_desc[:150]}。")
    return "".join(parts)


def _build_risk_events(news: list[dict]) -> list[dict]:
    """从新闻中构建风险事件列表"""
    events = []
    for n in news[:8]:
        evt = {
            "title": n.get("title", ""),
            "source": n.get("source", "未知"),
            "emotion": n.get("emotion", "neutral"),
            "event_type": n.get("event_type") or "未分类",
            "summary": n.get("summary", "")[:200],
            "raw_url": n.get("raw_url", ""),
        }
        events.append(evt)
    return events


def _build_scenarios(cost_pct: float, current_price: Optional[float], base_price: Optional[float]) -> list[PressureTestScenario]:
    """构建压力测试情景"""
    scenarios = []
    cost_pct_float = float(cost_pct) if cost_pct else 0.0
    for name, price_change in [("温和上涨", 5), ("中度上涨", 15), ("大幅上涨", 30)]:
        margin_change = -cost_pct_float * price_change / 100
        scenarios.append(PressureTestScenario(
            name=name, price_change_pct=price_change, fx_change_pct=0.0,
            estimated_cost=0.0, estimated_gross_margin=max(0, 30 + margin_change),
            margin_change_pp=margin_change, risk_score=min(100, 40 + abs(margin_change) * 2)
        ))
    return scenarios


def _build_recommendations(level: str, material_name: str, cost_pct: float, change_24h: Optional[float]) -> list[Recommendation]:
    """基于风险等级构建建议"""
    cost_pct_float = float(cost_pct) if cost_pct else 0.0
    if level == "高风险":
        return [
            Recommendation(priority=1, action="优先锁定成本", detail=f"{material_name}风险高企，建议在5个交易日内锁定未来60%采购量，优先覆盖高成本占比订单。"),
            Recommendation(priority=2, action="启动套期保值", detail=f"通过期货/期权对{cost_pct_float:.0f}%成本敞口进行50%以上对冲，降低单边价格波动冲击。"),
            Recommendation(priority=3, action="供应链监控", detail="建立主要矿山、冶炼厂、港口库存实时监控，关注罢工、政策、环保等突发供应风险。"),
        ]
    elif level == "中等风险":
        return [
            Recommendation(priority=1, action="动态跟踪", detail=f"设定{material_name}价格预警线（如7日涨跌幅超10%），密切跟踪库存与基差变化。"),
            Recommendation(priority=2, action="分批锁价", detail="对近月确定性订单分批锁定30%-50%用量，保留向上/向下灵活空间。"),
            Recommendation(priority=3, action="替代评估", detail="评估长单与现货配比，必要时引入替代品或二级供应商分散风险。"),
        ]
    else:
        return [
            Recommendation(priority=1, action="维持正常采购", detail="当前风险可控，按常规节奏采购，避免过度对冲造成不必要成本。"),
            Recommendation(priority=2, action="优化长单结构", detail=f"利用{material_name}价格低位窗口，适度增加长单比例或优化供应商账期。"),
            Recommendation(priority=3, action="建立预警机制", detail="配置价格波动预警，关注宏观政策与行业供需边际变化。"),
        ]


def _build_report_summary(company_name: str, material_name: str, cost_pct: float, current_price: Optional[float], change_24h: Optional[float], volatility: Optional[float], score: float, level: str, news_count: int, conversation_context: str = None) -> str:
    """构建报告摘要"""
    parts = [
        f"{material_name}在{company_name}原材料成本中占比约{cost_pct}%，是成本波动的重要来源。",
        f"综合五因子评分模型，当前风险得分为{score:.1f}分，风险等级判定为{level}。",
    ]
    if current_price is not None:
        parts.append(f"{material_name}最新价格为{current_price:,.2f}，24小时变动{change_24h:+.2f}%（{'上涨' if change_24h and change_24h >= 0 else '下跌'}）。")
    if volatility:
        parts.append(f"近30日年化波动率约为{volatility:.2f}%，价格近期{'处于高波动区间，需重点关注成本敞口' if volatility > 30 else '波动中等，保持监控即可' if volatility > 15 else '相对平稳'}。")
    parts.append(f"近72小时共采集到相关新闻{news_count}条。")
    if news_count == 0:
        parts.append("近期相关新闻较少，风险主要来自基本面变化。")
    parts.append(f"核心判断：{material_name}存在{'阶段性波动风险，但未达到系统性冲击水平' if level != '高风险' else '较高波动风险，需尽快采取对冲或锁价措施'}。建议{'保持监控，适时调整采购节奏' if level != '高风险' else '尽快启动套期保值并收紧供应商管理'}。")
    if conversation_context:
        cleaned = conversation_context.replace("**", "").replace("#", "").replace("\n", " ")
        if len(cleaned) > 120:
            cleaned = cleaned[:120] + "..."
        parts.append(f"\n\n对话阶段关注要点：{cleaned}")
    return "".join(parts)


def _summarize_conversation_context(context: str, company_name: str, material_name: str) -> str:
    """使用 LLM 提炼对话中的关键洞察，而非简单截取原文"""
    if not context:
        return ""
    cleaned = context.strip()
    if len(cleaned) < 40:
        return cleaned.replace("**", "").replace("##", "")

    prompt = f"""你是一位专业投研分析师。以下是与用户关于{company_name}的{material_name}风险分析的对话记录。请从中提炼出3-5条关键洞察，每条30字以内。只输出洞察要点，不要编号，每条一行。

对话内容：
{cleaned[:2000]}

关键洞察："""

    try:
        client = _get_client()
        if client:
            resp = client.chat.completions.create(
                model="deepseek-v4-flash",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3, max_tokens=400,
                timeout=10.0,
            )
            result = resp.choices[0].message.content.strip()
            if result:
                return result
    except Exception as e:
        logger.warning(f"LLM 对话洞察提炼失败: {e}")

    cleaned = context.replace("**", "").replace("##", "").replace("\\n", " ")
    if len(cleaned) > 200:
        cleaned = cleaned[:200] + "..."
    return f"讨论焦点：{cleaned}"


def _find_companies_by_materials(material_names: list[str]) -> list[dict]:
    """根据金属品种名称模糊查找关联的公司（例如 "铜" 可匹配 "电解铜"、"铜精矿"）"""
    if not material_names:
        return []
    db = SessionLocal()
    try:
        # 模糊匹配：对每个名称做 LIKE 查询
        conditions = [CompanyMaterial.material_name.like(f'%{name}%') for name in material_names]
        material_ids = db.query(CompanyMaterial.company_id).filter(
            or_(*conditions)
        ).distinct().all()
        cids = [row[0] for row in material_ids]
        if not cids:
            return []
        comps = db.query(Company).filter(Company.id.in_(cids)).limit(6).all()
        result = []
        for c in comps:
            c_mats = db.query(CompanyMaterial).filter(
                CompanyMaterial.company_id == c.id
            ).filter(or_(*conditions)).all()
            matched_mats = [m.material_name for m in c_mats if m.material_name]
            result.append({
                "id": c.id, "name": c.name or "未知",
                "code": c.id or "", "industry": c.industry or "未知",
                "matched_materials": matched_mats,
                "max_cost_pct": float(max((m.cost_pct or 0) for m in c_mats)) if c_mats else 0,
            })
        result.sort(key=lambda x: x["max_cost_pct"], reverse=True)
        return result
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


def generate_pdf_report(report: RiskReport) -> bytes:
    """将 RiskReport 导出为 PDF 字节流"""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm,
                           leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CTitle', parent=styles['Title'], fontSize=18, spaceAfter=4*mm)
    h2_style = ParagraphStyle('CH2', parent=styles['Heading2'], fontSize=13, spaceBefore=5*mm, spaceAfter=3*mm)
    body_style = ParagraphStyle('CBody', parent=styles['Normal'], fontSize=10, leading=16, spaceAfter=3*mm)

    story = []
    # 标题
    story.append(Paragraph(f"MRI 风险分析报告", title_style))
    story.append(Paragraph(f"报告编号: {report.report_id}<br/>生成时间: {report.generated_at}", body_style))
    story.append(Spacer(1, 5*mm))

    # 摘要
    story.append(Paragraph("一、报告摘要", h2_style))
    story.append(Paragraph(f"分析品种: {report.material_name}<br/>风险评分: {report.risk_score}分 &nbsp; 风险等级: {report.risk_level}", body_style))
    story.append(Paragraph(report.summary.replace('\n', '<br/>'), body_style))

    # 行情快照
    if report.metal_quotes:
        story.append(Paragraph("二、金属行情快照", h2_style))
        q_data = [['品种', '合约', '最新价', '24H变动']]
        for q in report.metal_quotes:
            q_data.append([q.get('name', ''), q.get('contract', '-'),
                          f"{q.get('price'):,}" if q.get('price') else '-',
                          f"{q.get('change_pct_24h'):+.2f}%" if q.get('change_pct_24h') is not None else '-'])
        tbl = Table(q_data, colWidths=[60, 80, 80, 80])
        tbl.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 0.5, HexColor('#ccc')),
                                 ('BACKGROUND', (0,0), (-1,0), HexColor('#166534')),
                                 ('TEXTCOLOR', (0,0), (-1,0), HexColor('#ffffff')),
                                 ('FONTSIZE', (0,0), (-1,-1), 9)]))
        story.append(tbl)

    # 风险因子
    story.append(Paragraph("三、风险评分因子", h2_style))
    f_data = [['因子', '权重', '得分', '描述']]
    for f in report.factors:
        f_data.append([f.name, f'{f.weight:.0%}', f'{f.score:.1f}', f.description])
    tbl2 = Table(f_data, colWidths=[80, 50, 50, 200])
    tbl2.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 0.5, HexColor('#ccc')),
                              ('BACKGROUND', (0,0), (-1,0), HexColor('#166534')),
                              ('TEXTCOLOR', (0,0), (-1,0), HexColor('#ffffff')),
                              ('FONTSIZE', (0,0), (-1,-1), 9)]))
    story.append(tbl2)

    # 推理步骤
    story.append(Paragraph("四、推理过程", h2_style))
    for step in report.reasoning:
        story.append(Paragraph(f"<b>步骤{step.step}: {step.title}</b><br/>{step.detail}", body_style))

    # 建议
    if report.recommendations:
        story.append(Paragraph("五、操作建议", h2_style))
        for rec in report.recommendations:
            story.append(Paragraph(f"<b>● {rec.action}</b>（优先级 {rec.priority}）<br/>{rec.detail}", body_style))

    # 风险提示
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("<i>以上分析基于模型计算，仅供内部参考，不构成投资建议。</i>", body_style))

    doc.build(story)
    return buf.getvalue()


# ─── Dashboard context ──────────────────────────────────────────

def get_dashboard_context(company_id: str = None, tab: str = "company", message: str = None, company_ids: list[str] = None, materials: list[str] = None) -> dict:
    """右侧仪表盘数据（支持多公司、多金属）"""
    result = {"tab": tab}
    ids = company_ids or ([company_id] if company_id else [])

    if tab == "company":
        companies = []
        for cid in ids[:5]:
            ctx = _get_company_context(cid)
            if ctx and "error" not in ctx:
                companies.append(ctx)
        result["data"] = {"companies": companies}

    elif tab == "metal":
        quotes = []
        related_companies = []
        related_news = []

        # 确定要分析的金属列表
        target_materials = []
        if materials:
            target_materials = materials[:6]
        else:
            # 从所选公司的成本结构聚合金属品种
            for cid in ids[:5]:
                for m in _get_cost_exposure(cid):
                    if m.get("name") and m["name"] not in target_materials:
                        target_materials.append(m["name"])

        # 获取每个金属的期货行情
        for m_name in target_materials[:6]:
            price_info = _run_with_timeout(lambda: _get_price_info(m_name), 3.0, {"error": "timeout"})
            if "error" not in price_info:
                quotes.append({
                    "name": m_name,
                    "contract": price_info.get("contract", ""),
                    "price": price_info.get("current_price"),
                    "change_pct_24h": price_info.get("change_pct_24h"),
                })

        # 查找这些金属的关联公司（去重）
        if target_materials:
            all_mats = []
            for cid in ids[:5] if ids else []:
                all_mats.extend(_get_cost_exposure(cid))
            # 如果没有选公司，从全库模糊匹配
            if not all_mats:
                all_mats = [{"name": m} for m in target_materials]

            seen_codes = set()
            for m in all_mats:
                if not m.get("name"):
                    continue
                for t in target_materials:
                    if t in m["name"] or m["name"] in t:
                        # 找到所属公司
                        for cid in ids[:5] if ids else []:
                            cmats = _get_cost_exposure(cid)
                            for cm in cmats:
                                if cm.get("name") == m["name"]:
                                    if cid not in seen_codes:
                                        seen_codes.add(cid)
                                        comp = _get_company_context(cid)
                                        if comp and "error" not in comp:
                                            related_companies.append({
                                                "name": comp["name"], "code": comp["code"],
                                                "max_cost_pct": cm.get("cost_pct", 0)
                                            })

        # 关联新闻：按金属关键词搜索
        seen_titles = set()
        for t in target_materials[:3]:
            for n in _search_news_by_keywords(t)[:5]:
                key = n.get("title", "")[:50]
                if key and key not in seen_titles:
                    seen_titles.add(key)
                    related_news.append(n)

        result["data"] = {"quotes": quotes, "related_companies": related_companies[:6], "related_news": related_news[:6]}

    elif tab == "sentiment":
        all_news = []
        seen_titles = set()
        for cid in ids[:5]:
            for n in _search_news(cid):
                key = n.get("title", "")[:60]
                if key and key not in seen_titles:
                    seen_titles.add(key)
                    all_news.append(n)

        # 情绪分布
        distribution = {"positive": 0, "neutral": 0, "negative": 0}
        for n in all_news:
            em = n.get("emotion", "neutral")
            if em in distribution:
                distribution[em] += 1

        total = len(all_news) or 1
        positive = distribution["positive"]
        negative = distribution["negative"]
        # 平均分：50 为中性，正面加分，负面减分
        avg_score = 50 + (positive - negative) / total * 50
        avg_score = max(0, min(100, avg_score))
        # 热度指数：新闻数量归一化
        heat_index = min(100, len(all_news) * 8)
        # 恐慌贪婪指数：与 avg_score 反向
        panic_greed = 100 - avg_score

        result["data"] = {
            "news": all_news[:8],
            "count": len(all_news),
            "distribution": distribution,
            "avg_score": round(avg_score, 1),
            "heat_index": round(heat_index, 1),
            "panic_greed": round(panic_greed, 1),
        }

    return result


def get_recommended_questions(company_id: str = None, message: str = None) -> dict:
    """生成推荐问题（预留 message 参数用于后续上下文扩展）"""
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
