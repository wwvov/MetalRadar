"""用户相关模型 — 对齐 data-model.md"""

from sqlalchemy import Column, String, Integer, ForeignKey
from app.core.database import Base


class UserFollow(Base):
    __tablename__ = "user_follows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(50), nullable=False, comment="用户标识")
    company_id = Column(String(20), nullable=False, comment="关注的公司股票代码")


class UserFavorite(Base):
    __tablename__ = "user_favorites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(50), nullable=False, comment="用户标识")
    news_id = Column(String(50), ForeignKey("news.id"), nullable=False)
    linked_company_id = Column(String(20), nullable=True, comment="收藏时关联的公司ID")


class UserRead(Base):
    __tablename__ = "user_reads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(50), nullable=False, comment="用户标识")
    news_id = Column(String(50), ForeignKey("news.id"), nullable=False)
