"""Agent Chat & Report — API 路由"""

import logging
from fastapi import APIRouter, HTTPException, Body

from app.schemas.chat import (
    ChatRequest, ChatResponse, ReportGenerateRequest, RiskReport,
)
from app.services.agent_service import (
    process_chat, generate_report, generate_multi_report, share_report, get_shared_report,
    create_session, list_sessions, get_session, delete_session, rename_session,
    get_available_models, get_dashboard_context, get_recommended_questions,
)
from app.services.agent_service import _get_company_context, _get_cost_exposure, _search_news

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Chat & Agent"])

# ─── Chat ───────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Agent 对话接口"""
    try:
        history = [{"role": h.role, "content": h.content} for h in request.history] if request.history else None
        return process_chat(
            company_id=request.company_id, message=request.message,
            scenario=request.scenario, history=history,
            session_id=request.session_id, model=request.model or "deepseek-v4-flash",
        )
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─── Sessions ───────────────────────────────────────────────────

@router.post("/sessions")
def api_create_session(body: dict = Body(...)):
    return create_session(title=body.get("title", "新对话"), model=body.get("model", "glm-5.2"))


@router.get("/sessions")
def api_list_sessions():
    return {"sessions": list_sessions()}


@router.get("/sessions/{session_id}")
def api_get_session(session_id: str):
    s = get_session(session_id)
    if not s:
        raise HTTPException(404, "会话不存在")
    return s


@router.delete("/sessions/{session_id}")
def api_delete_session(session_id: str):
    if not delete_session(session_id):
        raise HTTPException(404, "会话不存在")
    return {"ok": True}


@router.patch("/sessions/{session_id}")
def api_rename_session(session_id: str, body: dict = Body(...)):
    s = rename_session(session_id, body.get("title", "新对话"))
    if not s:
        raise HTTPException(404, "会话不存在")
    return s


# ─── Models ─────────────────────────────────────────────────────

@router.get("/models")
def api_models():
    return get_available_models()


# ─── Report ─────────────────────────────────────────────────────

@router.post("/report", response_model=RiskReport)
def create_report(request: ReportGenerateRequest):
    try:
        return generate_report(company_id=request.company_id, material=request.material)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Report error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/report/multi")
def create_multi_report(body: dict = Body(...)):
    """多品种对比报告"""
    try:
        return generate_multi_report(body["company_id"], body.get("materials", []))
    except Exception as e:
        logger.error(f"Multi report error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/report/share")
def share_report_api(body: dict = Body(...)):
    """分享报告，返回分享ID"""
    try:
        share_id = share_report(body["report_data"])
        return {"share_id": share_id, "url": f"/report/share/{share_id}"}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/report/share/{share_id}")
def get_shared_report_api(share_id: str):
    r = get_shared_report(share_id)
    if not r:
        raise HTTPException(404, "报告不存在或已过期")
    return r


# ─── Dashboard ──────────────────────────────────────────────────

@router.get("/dashboard")
def api_dashboard(company_id: str = None, tab: str = "company"):
    return get_dashboard_context(company_id, tab)


@router.get("/recommended")
def api_recommended(company_id: str = None):
    return get_recommended_questions(company_id)


# ─── Context ────────────────────────────────────────────────────

@router.get("/context/{company_id}")
def get_company_agent_context(company_id: str):
    company_ctx = _get_company_context(company_id)
    if "error" in company_ctx:
        raise HTTPException(404, company_ctx["error"])
    cost_data = _get_cost_exposure(company_id)
    risk_news = _search_news(company_id)
    return {"company": company_ctx, "materials": cost_data,
            "recent_news_count": len(risk_news), "recent_news": risk_news[:5]}
