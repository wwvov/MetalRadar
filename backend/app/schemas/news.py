"""新闻相关 Pydantic Schema — 对齐 api-spec.md"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NewsItem(BaseModel):
    id: str
    title: str
    summary: str = ""
    source: str = ""
    pub_time: Optional[datetime] = None
    tags: list[str] = []
    company_entities: list[str] = []
    metal_entities: list[str] = []
    relevance_level: str = "gray"
    emotion: str = "neutral"
    is_relevant: bool = True
    event_type: str = ""
    raw_url: str = ""
    is_favorited: bool = False
    is_read: bool = False
    linked_company_id: Optional[str] = None

    class Config:
        from_attributes = True


class NewsListResponse(BaseModel):
    news: list[NewsItem]
    total: int


class FavoriteRequest(BaseModel):
    linked_company_id: Optional[str] = None
