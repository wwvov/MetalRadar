"""公司相关 Pydantic Schema — 对齐 api-spec.md"""

from pydantic import BaseModel
from typing import Optional


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


class CompanyPortraitOut(BaseModel):
    position: str = ""
    position_detail: str = ""
    materials: list[CompanyMaterialOut] = []


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

    class Config:
        from_attributes = True
