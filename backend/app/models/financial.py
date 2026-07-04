"""财报模型 — 对齐 data-model.md"""

from sqlalchemy import Column, String, Integer, Numeric, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class FinancialReport(Base):
    __tablename__ = "financial_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(String(20), ForeignKey("companies.id"), nullable=False)
    report_period = Column(String(10), comment="报告期, 如 2025Q4")
    revenue = Column(Numeric(15, 2), comment="营业收入(元)")
    cost = Column(Numeric(15, 2), comment="营业成本(元)")
    gross_margin = Column(Numeric(5, 2), comment="毛利率(%)")
    direct_material_pct = Column(Numeric(5, 2), comment="直接材料占成本比例(%)")
    direct_labor_pct = Column(Numeric(5, 2), comment="直接人工占成本比例(%)")
    manufacturing_pct = Column(Numeric(5, 2), comment="制造费用占成本比例(%)")
    raw_data = Column(JSON, comment="AI从财报提取的完整结构化数据")

    company = relationship("Company", back_populates="financial_reports")
