"""公司相关 API — 对齐 api-spec.md"""

import logging
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import company_service
from app.services.llm_service import PortraitGenerationError
from app.services.pdf_parser import extract_text_from_pdf
from app.schemas.company import CompanySearchResult, CompanyDetailOut, PortraitUpdateIn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["公司"])

DEFAULT_USER = "default"


@router.get("/search", response_model=CompanySearchResult)
def search(keyword: str = Query(..., min_length=1, description="搜索关键词"), db: Session = Depends(get_db)):
    """搜索 A 股公司 — 从 akshare 全量列表实时匹配"""
    return company_service.search_companies(db, keyword)


@router.get("/with-materials")
def get_companies_with_materials(db: Session = Depends(get_db)):
    """获取所有有敏感材料数据的公司列表 — 用于仪表盘公司选择器"""
    from app.models.company import Company, CompanyMaterial
    from sqlalchemy import distinct
    company_ids = db.query(distinct(CompanyMaterial.company_id)).all()
    ids = [row[0] for row in company_ids]
    companies = db.query(Company).filter(Company.id.in_(ids)).all()
    return {
        "ok": True,
        "data": [
            {
                "id": c.id,
                "name": c.name,
                "code": c.id,
                "industry": c.industry or "",
            }
            for c in companies
        ],
    }


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_detail(company_id: str, db: Session = Depends(get_db)):
    """获取公司详情（含画像）— 若画像无效则自动触发重新生成"""
    result = company_service.get_company_detail(db, company_id)

    if not result:
        # 公司记录不存在 — 尝试自动创建（快速模式：15秒超时，1次重试）
        logger.info(f"公司 {company_id} 记录不存在，尝试自动初始化...")
        try:
            result = company_service.init_company_profile(
                db, company_id, report_text=None, company_name="",
                llm_timeout=15, llm_retries=1,
            )
        except PortraitGenerationError:
            # LLM 不可用 — 创建占位记录，让用户稍后手动重新生成
            logger.warning(f"公司 {company_id} LLM不可用，创建占位记录")
            result = company_service.init_company_profile_fallback(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"公司初始化失败: {str(e)}")
        return result

    # 自动修复：画像无效 → 重新生成（快速模式：15秒超时，1次重试）
    if not result.portrait_generated:
        logger.info(f"公司 {company_id} 画像无效，自动触发重新生成...")
        try:
            result = company_service.init_company_profile(
                db, company_id,
                report_text=None,
                company_name=result.name if result.name != company_id else "",
                llm_timeout=15, llm_retries=1,
            )
        except PortraitGenerationError:
            logger.warning(f"公司 {company_id} 自动重新生成失败，返回现有占位数据")
        except Exception:
            logger.warning(f"公司 {company_id} 自动重新生成异常，返回现有数据")

    return result


@router.post("/init", response_model=CompanyDetailOut)
async def init_company(
    company_code: str = Form(...),
    company_name: str = Form(""),
    report_pdf: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """初始化公司画像 — 用户确认添加公司时调用，由大模型生成完整画像"""
    report_text = None
    if report_pdf:
        content = await report_pdf.read()
        try:
            report_text = extract_text_from_pdf(content)
            if not report_text.strip():
                logger.warning(f"上传的PDF未提取到文本内容（可能是扫描件/图片PDF）")
                report_text = None
        except ValueError as e:
            logger.warning(f"PDF解析失败: {e}")
            report_text = None

    try:
        return company_service.init_company_profile(db, company_code, report_text, company_name)
    except PortraitGenerationError as e:
        raise HTTPException(status_code=502, detail=f"AI服务暂时不可用: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"画像生成失败: {str(e)}")


@router.put("/{company_id}/portrait", response_model=CompanyDetailOut)
def update_portrait(company_id: str, data: PortraitUpdateIn, db: Session = Depends(get_db)):
    """保存用户修正后的公司画像"""
    try:
        return company_service.update_company_portrait(db, company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{company_id}/regenerate", response_model=CompanyDetailOut)
async def regenerate_portrait(
    company_id: str,
    report_pdf: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """重新生成公司画像 — 用户更换财报后重新调用大模型"""
    report_text = None
    if report_pdf:
        content = await report_pdf.read()
        try:
            report_text = extract_text_from_pdf(content)
            if not report_text.strip():
                logger.warning(f"上传的PDF未提取到文本内容（可能是扫描件/图片PDF）")
                report_text = None
        except ValueError as e:
            logger.warning(f"PDF解析失败: {e}")
            report_text = None

    try:
        return company_service.regenerate_company_portrait(db, company_id, report_text)
    except PortraitGenerationError as e:
        raise HTTPException(status_code=502, detail=f"AI服务暂时不可用: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{company_id}/upload-report", response_model=CompanyDetailOut)
async def upload_financial_report(
    company_id: str,
    report_pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传财报PDF — 仅提取财务数据，不重新生成画像"""
    # 解析 PDF
    content = await report_pdf.read()
    try:
        report_text = extract_text_from_pdf(content)
        if not report_text.strip():
            raise HTTPException(
                status_code=400,
                detail="PDF未提取到文本内容，可能是扫描件/图片PDF，请上传包含文字层的PDF文件",
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 调用 LLM 提取财务数据
    try:
        from app.services.llm_service import extract_financial_report, FinancialExtractionError
        financial_data = extract_financial_report(report_text, company_id)
    except FinancialExtractionError as e:
        raise HTTPException(status_code=502, detail=f"AI财报分析失败: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"财报分析异常: {str(e)}")

    if not financial_data.get("report_period"):
        raise HTTPException(status_code=422, detail="AI未能从PDF中识别到有效的报告期信息")

    # 保存到数据库
    try:
        return company_service.save_financial_report(db, company_id, financial_data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
