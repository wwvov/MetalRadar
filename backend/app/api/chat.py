"""Agent Chat & Report — API 路由"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import (
    ChatRequest, ChatResponse,
    ReportGenerateRequest, RiskReport,
    PressureTestRequest, PressureTestScenario,
)
from app.services.agent_service import (
    process_chat, generate_report, run_pressure_test,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat & Agent"])


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Agent 对话接口

    支持三种场景模式：
    - risk_scan: 全面风险扫描，返回风险评分和等级
    - event_impact: 事件传导分析
    - free_qa: 自由问答（默认）
    """
    try:
        history = None
        if request.history:
            history = [{"role": h.role, "content": h.content} for h in request.history]

        response = process_chat(
            company_id=request.company_id,
            message=request.message,
            scenario=request.scenario,
            history=history,
        )
        return response
    except Exception as e:
        logger.error(f"Agent chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent分析失败: {str(e)}")


@router.post("/report", response_model=RiskReport)
def create_report(request: ReportGenerateRequest):
    """生成 MRI 风险分析报告

    基于指定公司的原材料数据和当前市场行情，生成结构化风险分析报告。
    报告包含：风险评分、推理链路、数据依据、情景模拟、行动建议。
    """
    try:
        report = generate_report(
            company_id=request.company_id,
            material=request.material,
        )
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Report generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@router.post("/pressure-test", response_model=list[PressureTestScenario])
def pressure_test(request: PressureTestRequest):
    """压力测试沙盒

    用户自定义原料价格涨跌、汇率升降等参数，Agent 回算预期成本影响。
    """
    try:
        results = run_pressure_test(request)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Pressure test error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"压力测试失败: {str(e)}")


@router.get("/context/{company_id}")
def get_company_agent_context(company_id: str):
    """获取公司Agent分析上下文预览

    返回该公司可用于Agent分析的所有数据摘要：
    产业链位置、原材料结构、近期新闻、价格行情等。
    """
    from app.services.agent_service import (
        _get_company_context, _get_cost_exposure, _search_risk_news,
    )

    company_ctx = _get_company_context(company_id)
    if "error" in company_ctx:
        raise HTTPException(status_code=404, detail=company_ctx["error"])

    cost_data = _get_cost_exposure(company_id)
    risk_news = _search_risk_news(company_id)

    return {
        "company": company_ctx,
        "materials": cost_data,
        "recent_news_count": len(risk_news),
        "recent_news": risk_news[:5],
    }
