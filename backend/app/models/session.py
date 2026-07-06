"""会话模型 — Agent对话会话管理"""

import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Text, DateTime, JSON, Float, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

TZ = timezone(timedelta(hours=8))


def _now():
    return datetime.now(TZ)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True,
                default=lambda: str(uuid.uuid4()),
                comment="会话ID")
    title = Column(String(100), default="新对话", comment="会话标题")
    model = Column(String(50), default="glm-5.2", comment="使用的模型")
    created_at = Column(DateTime, default=_now, comment="创建时间")
    updated_at = Column(DateTime, default=_now, onupdate=_now, comment="最后活跃时间")
    company_id = Column(String(20), comment="关联公司ID（可为空）")

    messages = relationship("ChatMessageRecord", back_populates="session",
                           cascade="all, delete-orphan", order_by="ChatMessageRecord.created_at")


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String(10), nullable=False, comment="user / assistant")
    content = Column(Text, nullable=False, comment="消息内容")
    charts = Column(JSON, comment="内嵌图表数据")
    risk_score = Column(Float, comment="风险评分")
    risk_level = Column(String(20), comment="风险等级")
    sources = Column(JSON, comment="数据来源")
    created_at = Column(DateTime, default=_now, comment="创建时间")

    session = relationship("ChatSession", back_populates="messages")


class SharedReport(Base):
    __tablename__ = "shared_reports"

    id = Column(String(36), primary_key=True,
                default=lambda: str(uuid.uuid4()),
                comment="报告分享ID")
    report_data = Column(JSON, nullable=False, comment="报告完整数据(JSON)")
    created_at = Column(DateTime, default=_now, comment="创建时间")
    expires_at = Column(DateTime, comment="过期时间")
