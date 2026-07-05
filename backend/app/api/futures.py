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


@router.get("/{contract}/kline")
def get_futures_kline(
    contract: str,
    period: str = "daily",
    start_date: str = "",
    end_date: str = "",
    db: Session = Depends(get_db),
):
    """获取期货合约历史K线数据

    数据源: akshare futures_main_sina，缓存5分钟。
    contract 使用连续合约代码（如 LC0、CU0、RB0）。
    """
    from app.services.futures_service import _fetch_kline, _parse_kline_df, _get_cache_path, _read_cache

    # 标准化合约代码为大写
    contract = contract.strip().upper()
    if not contract:
        raise HTTPException(status_code=400, detail="合约代码不能为空")

    try:
        df = _fetch_kline(contract)
        records = _parse_kline_df(df)

        # 按日期范围过滤
        if start_date:
            records = [r for r in records if r["date"] >= start_date]
        if end_date:
            records = [r for r in records if r["date"] <= end_date]

        if period == "weekly":
            records = _resample_weekly(records)
        elif period == "monthly":
            records = _resample_monthly(records)

        return {"ok": True, "data": records}
    except Exception as e:
        logger.error(f"获取期货K线失败 {contract}: {e}")
        raise HTTPException(status_code=502, detail=f"获取期货K线失败: {str(e)}")


def _resample_weekly(records: list[dict]) -> list[dict]:
    """将日线聚合为周线"""
    if not records:
        return []
    from collections import OrderedDict
    weeks = OrderedDict()
    for r in records:
        # 简单按年份+周数分组
        parts = r["date"].split("-")
        if len(parts) == 3:
            from datetime import date
            d = date(int(parts[0]), int(parts[1]), int(parts[2]))
            week_key = f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"
            if week_key not in weeks:
                weeks[week_key] = []
            weeks[week_key].append(r)

    result = []
    for week_key, bars in weeks.items():
        opens = [b["open"] for b in bars]
        highs = [b["high"] for b in bars]
        lows = [b["low"] for b in bars]
        closes = [b["close"] for b in bars]
        volumes = sum(b["volume"] for b in bars)
        holds = bars[-1].get("hold", 0)
        result.append({
            "date": bars[0]["date"],
            "open": opens[0],
            "high": max(highs),
            "low": min(lows),
            "close": closes[-1],
            "volume": volumes,
            "hold": holds,
        })
    return result


def _resample_monthly(records: list[dict]) -> list[dict]:
    """将日线聚合为月线"""
    if not records:
        return []
    from collections import OrderedDict
    months = OrderedDict()
    for r in records:
        month_key = r["date"][:7]  # YYYY-MM
        if month_key not in months:
            months[month_key] = []
        months[month_key].append(r)

    result = []
    for month_key, bars in months.items():
        opens = [b["open"] for b in bars]
        highs = [b["high"] for b in bars]
        lows = [b["low"] for b in bars]
        closes = [b["close"] for b in bars]
        volumes = sum(b["volume"] for b in bars)
        holds = bars[-1].get("hold", 0)
        result.append({
            "date": bars[0]["date"],
            "open": opens[0],
            "high": max(highs),
            "low": min(lows),
            "close": closes[-1],
            "volume": volumes,
            "hold": holds,
        })
    return result
