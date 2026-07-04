"""公司信息模型 — 对齐 data-model.md"""

from sqlalchemy import Column, String, Text, Integer, Numeric, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(String(20), primary_key=True, comment="股票代码")
    name = Column(String(100), nullable=False, comment="公司全称")
    short_name = Column(String(50), comment="公司简称")
    industry = Column(String(50), comment="所属行业")
    business_desc = Column(Text, comment="主营业务描述")
    position = Column(String(20), comment="产业链位置: up/mid/down")
    position_detail = Column(String(100), comment="细分环节描述")
    portrait_generated = Column(Boolean, default=False, comment="画像是否已由AI生成")
    portrait_updated_at = Column(DateTime, comment="画像最后更新时间")

    # 关系
    materials = relationship("CompanyMaterial", back_populates="company", cascade="all, delete-orphan")
    financial_reports = relationship("FinancialReport", back_populates="company", cascade="all, delete-orphan")


class CompanyMaterial(Base):
    __tablename__ = "company_materials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(String(20), ForeignKey("companies.id"), nullable=False)
    material_name = Column(String(50), nullable=False, comment="原材料品种名")
    cost_pct = Column(Numeric(5, 2), comment="成本占比(%)")
    source = Column(String(20), comment="数据来源: report / inferred")
    direction = Column(String(10), comment="影响方向: negative / positive")
    contract = Column(String(20), comment="对应期货合约代码")

    company = relationship("Company", back_populates="materials")
