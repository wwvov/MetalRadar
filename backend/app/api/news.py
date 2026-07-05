"""新闻相关 API — 对齐 api-spec.md"""

import logging
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db, SessionLocal
from app.services import news_service
from app.services.news_fetcher import fetch_all_news, sync_news_to_db, run_refresh_pipeline
from app.services.news_classifier import classify_news_batch
from app.schemas.news import NewsListResponse, FavoriteRequest

logger = logging.getLogger(__name__)

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


@router.post("/fetch")
def fetch_news(
    force: bool = Query(False, description="强制刷新，跳过缓存"),
    db: Session = Depends(get_db),
):
    """从 akshare 获取最新新闻（多源聚合 + 文件缓存 + 入库）"""
    try:
        raw_items = fetch_all_news(force=force)
        result = sync_news_to_db(db, raw_items)
        return {
            "ok": True,
            **result,
            "sources": list(set(item["source"] for item in raw_items)),
        }
    except Exception as e:
        logger.error(f"新闻抓取失败: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/classify")
def classify_news(
    limit: int = Query(50, ge=1, le=100, description="最多处理多少条未分类新闻"),
    db: Session = Depends(get_db),
):
    """使用 LLM 对未分类新闻进行智能标注（品种/公司/情绪/事件类型）"""
    try:
        result = classify_news_batch(db, limit=limit)
        return {"ok": True, **result}
    except Exception as e:
        logger.error(f"新闻分类失败: {e}")
        return {"ok": False, "error": str(e)}


# 刷新任务状态
_refresh_status: dict = {"running": False, "message": "", "result": None}


def _run_refresh_pipeline():
    """后台执行完整刷新管道（委托给 service 层）"""
    global _refresh_status
    _refresh_status = {"running": True, "message": "开始抓取新闻...", "result": None}
    try:
        _refresh_status["message"] = "正在从 akshare 获取新闻..."
        result = run_refresh_pipeline()
        _refresh_status = {
            "running": False,
            "message": "刷新完成",
            "result": result,
        }
        logger.info(f"新闻刷新完成: {result}")
    except Exception as e:
        logger.error(f"新闻刷新失败: {e}")
        _refresh_status = {"running": False, "message": f"刷新失败: {e}", "result": None}


@router.post("/refresh")
def refresh_news(background_tasks: BackgroundTasks):
    """完整刷新管道（后台异步）：抓取新闻 → 入库 → LLM 分类"""
    if _refresh_status["running"]:
        return {"ok": False, "error": "刷新任务正在进行中", "status": _refresh_status}

    background_tasks.add_task(_run_refresh_pipeline)
    return {"ok": True, "message": "刷新任务已启动", "status": _refresh_status}


@router.get("/refresh/status")
def refresh_status():
    """查询刷新任务状态"""
    return _refresh_status
