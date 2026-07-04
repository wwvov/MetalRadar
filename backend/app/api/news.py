"""新闻相关 API — 对齐 api-spec.md"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import news_service
from app.schemas.news import NewsListResponse, FavoriteRequest

router = APIRouter(prefix="/news", tags=["新闻"])

DEFAULT_USER = "default"


@router.get("", response_model=NewsListResponse)
def list_news(
    tab: str = Query(
        "all",
        description="Tab: all|followed_companies|sensitive_metals|macro|macro_panel|shmet_block",
    ),
    company: str | None = Query(None, description="单个公司筛选"),
    companies: str | None = Query(None, description="多公司筛选(逗号分隔)"),
    metal: str | None = Query(None, description="单个金属品种筛选"),
    metals: str | None = Query(None, description="多金属品种筛选(逗号分隔)"),
    metal_category: str | None = Query(None, description="金属品类: 贵金属|小金属"),
    source: str | None = Query(None, description="来源筛选"),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    """获取新闻列表 — 支持多Tab+多值筛选+专属区块"""
    # 解析多值参数
    company_list = [c.strip() for c in companies.split(",") if c.strip()] if companies else None
    metal_list = [m.strip() for m in metals.split(",") if m.strip()] if metals else None

    return news_service.get_news_list(
        db=db,
        user_id=DEFAULT_USER,
        tab=tab,
        company_filter=company if not company_list else None,
        company_filters=company_list,
        metal_filter=metal if not metal_list else None,
        metal_filters=metal_list,
        metal_category=metal_category,
        source_filter=source,
        page=page,
    )


@router.post("/{news_id}/favorite")
def favorite_news(
    news_id: str,
    body: FavoriteRequest,
    db: Session = Depends(get_db),
):
    """收藏/取消收藏新闻（可附带关联公司）"""
    news_service.favorite_news(
        db=db,
        user_id=DEFAULT_USER,
        news_id=news_id,
        linked_company_id=body.linked_company_id,
    )
    return {"ok": True}


@router.post("/{news_id}/read")
def read_news(news_id: str, db: Session = Depends(get_db)):
    """标记新闻已读"""
    news_service.mark_news_read(db=db, user_id=DEFAULT_USER, news_id=news_id)
    return {"ok": True}


@router.post("/read-all")
def read_all_news(
    body: dict,
    db: Session = Depends(get_db),
):
    """批量标记已读"""
    news_ids = body.get("news_ids", [])
    if news_ids:
        news_service.mark_all_read(db=db, user_id=DEFAULT_USER, news_ids=news_ids)
    return {"ok": True, "count": len(news_ids)}
