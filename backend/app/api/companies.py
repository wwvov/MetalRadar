"""公司相关 API — 对齐 api-spec.md"""

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import company_service
from app.schemas.company import CompanySearchResult, CompanyDetailOut

router = APIRouter(prefix="/companies", tags=["公司"])

DEFAULT_USER = "default"


@router.get("/search", response_model=CompanySearchResult)
def search(keyword: str = Query(..., min_length=1, description="搜索关键词"), db: Session = Depends(get_db)):
    """搜索 A 股公司 — 从 akshare 全量列表实时匹配"""
    return company_service.search_companies(db, keyword)


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_detail(company_id: str, db: Session = Depends(get_db)):
    """获取公司详情（含画像）"""
    return company_service.get_company_detail(db, company_id)


@router.post("/init", response_model=CompanyDetailOut)
async def init_company(
    company_code: str = Form(...),
    report_pdf: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """初始化公司画像 — 用户确认添加公司时调用"""
    report_text = None
    if report_pdf:
        # TODO: Sprint 2 — PDF 解析
        report_text = await report_pdf.read()

    return company_service.init_company_profile(db, company_code, report_text)
