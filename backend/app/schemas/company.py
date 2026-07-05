"""公司相关 Pydantic Schema — 对齐 api-spec.md"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CompanyBasic(BaseModel):
    id: str
    name: str
    code: str
    industry: str = ""

    class Config:
        from_attributes = True


class CompanySearchResult(BaseModel):
    companies: list[CompanyBasic]


class CompanyMaterialOut(BaseModel):
    material_name: str
    cost_pct: Optional[float] = None
    source: str = "inferred"
    direction: str = "negative"
    contract: str = ""

    class Config:
        from_attributes = True


class CompanyMaterialIn(BaseModel):
    """用于更新画像时的品种输入"""
    material_name: str
    cost_pct: Optional[float] = None
    source: str = "manual"
    direction: str = "negative"
    contract: str = ""


class CompanyPortraitOut(BaseModel):
    position: str = ""
    position_detail: str = ""
    materials: list[CompanyMaterialOut] = []


class PortraitUpdateIn(BaseModel):
    """用户更新画像的请求体"""
    position: Optional[str] = None
    position_detail: Optional[str] = None
    business_desc: Optional[str] = None
    materials: Optional[list[CompanyMaterialIn]] = None


class FinancialSummaryOut(BaseModel):
    report_period: str = ""
    revenue: Optional[float] = None
    cost: Optional[float] = None
    gross_margin: Optional[float] = None
    direct_material_pct: Optional[float] = None
    direct_labor_pct: Optional[float] = None
    manufacturing_pct: Optional[float] = None

    class Config:
        from_attributes = True


class CompanyDetailOut(BaseModel):
    id: str
    name: str
    code: str = ""
    industry: str = ""
    short_name: str = ""
    business_desc: str = ""
    portrait: CompanyPortraitOut = CompanyPortraitOut()
    financial_summary: Optional[FinancialSummaryOut] = None
    portrait_generated: bool = False
    portrait_updated_at: Optional[datetime] = None
    chain_analysis: Optional[dict] = None

    class Config:
        from_attributes = True
