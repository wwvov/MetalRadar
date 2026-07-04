"""公司相关 API — 对齐 api-spec.md"""

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import company_service
from app.schemas.company import CompanySearchResult, CompanyDetailOut, PortraitUpdateIn

router = APIRouter(prefix="/companies", tags=["公司"])

DEFAULT_USER = "default"


@router.get("/search", response_model=CompanySearchResult)
def search(keyword: str = Query(..., min_length=1, description="搜索关键词"), db: Session = Depends(get_db)):
    """搜索 A 股公司 — 从 akshare 全量列表实时匹配"""
    return company_service.search_companies(db, keyword)


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_detail(company_id: str, db: Session = Depends(get_db)):
    """获取公司详情（含画像）"""
    result = company_service.get_company_detail(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="公司不存在")
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
            report_text = content.decode("utf-8", errors="ignore")
        except Exception:
            report_text = str(content)

    try:
        return company_service.init_company_profile(db, company_code, report_text, company_name)
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
            report_text = content.decode("utf-8", errors="ignore")
        except Exception:
            report_text = str(content)

    try:
        return company_service.regenerate_company_portrait(db, company_id, report_text)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
