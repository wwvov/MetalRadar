"""期货数据 API — 敏感金属价格仪表盘数据源"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import futures_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/futures", tags=["期货行情"])


@router.get("/dashboard/{company_id}")
def get_dashboard(company_id: str, db: Session = Depends(get_db)):
    """获取敏感金属价格仪表盘数据 — 单公司画像品种 + 期货行情 + 压力分析"""
    try:
        data = futures_service.get_dashboard_data(db, company_id)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"仪表盘数据获取失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取期货数据失败: {e}")


@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    """获取跨公司聚合视图 — 所有公司涉及的所有金属品种 + 实时价格"""
    try:
        data = futures_service.get_overview_data(db)
        return {"ok": True, "data": data}
    except Exception as e:
        logger.error(f"概览数据获取失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取概览数据失败: {e}")


@router.get("/prefetch")
def prefetch_cache(db: Session = Depends(get_db)):
    """手动触发期货缓存预热 — 拉取所有已知品种数据"""
    try:
        results = futures_service.prefetch_all_symbols(db)
        success = sum(1 for v in results.values() if v)
        return {"ok": True, "data": {"total": len(results), "success": success, "results": results}}
    except Exception as e:
        logger.error(f"缓存预热失败: {e}")
        raise HTTPException(status_code=500, detail=f"缓存预热失败: {e}")
