"""新闻模型 — 对齐 data-model.md"""

from sqlalchemy import Column, String, Text, TIMESTAMP, JSON, Boolean
from app.core.database import Base


class News(Base):
    __tablename__ = "news"

    id = Column(String(50), primary_key=True, comment="系统生成: news_YYYYMMDD_NNN")
    title = Column(String(200), nullable=False, comment="新闻标题")
    summary = Column(Text, comment="新闻摘要")
    source = Column(String(50), comment="抓取来源")
    pub_time = Column(TIMESTAMP, comment="发布时间")
    tags = Column(JSON, comment="AI生成的标签数组")
    company_entities = Column(JSON, comment="关联公司代码数组")
    metal_entities = Column(JSON, comment="关联金属品种数组")
    relevance_level = Column(String(10), comment="关联度: red/yellow/blue/gray")
    emotion = Column(String(10), comment="情绪: positive/negative/neutral")
    is_relevant = Column(Boolean, default=True, comment="是否与商品市场相关")
    event_type = Column(String(20), comment="事件类型: supply_disruption/price_surge/policy_favorable/monetary_policy等")
    raw_url = Column(String(500), comment="原文链接")
