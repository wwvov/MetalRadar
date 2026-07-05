"""股票相关 API — GET /stocks/{code}/kline, GET /stocks/{code}/info"""

import logging
from fastapi import APIRouter, Query, HTTPException
from app.services import stock_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["股票"])


@router.get("/{code}/kline")
def get_kline(
    code: str,
    frequency: str = Query("daily", description="K线周期: daily | weekly | monthly"),
    start_date: str = Query("", description="起始日期 YYYYMMDD"),
    end_date: str = Query("", description="结束日期 YYYYMMDD"),
    adjust: str = Query("qfq", description="复权方式: qfq(前复权) | hfq(后复权) | ''(不复权)"),
):
    """获取A股历史K线数据

    数据源: akshare stock_zh_a_hist，前复权，缓存1小时。
    可用于ECharts蜡烛图渲染。
    """
    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="股票代码格式错误，需为6位数字")

    if frequency not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="frequency 仅支持 daily/weekly/monthly")

    try:
        data = stock_service.get_stock_kline(
            code=code,
            frequency=frequency,
            start_date=start_date,
            end_date=end_date,
            adjust=adjust,
        )
        return {"ok": True, "data": data}
    except Exception as e:
        logger.error(f"获取股票K线失败 {code}: {e}")
        raise HTTPException(status_code=502, detail=f"获取股票数据失败: {str(e)}")


@router.get("/{code}/info")
def get_stock_info(code: str):
    """获取A股公司基本信息（总市值、流通市值、行业、总股本等）

    数据源: akshare stock_individual_info_em，缓存1天。
    """
    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="股票代码格式错误，需为6位数字")

    try:
        data = stock_service.get_stock_info(code)
        return {"ok": True, "data": data}
    except Exception as e:
        logger.error(f"获取公司信息失败 {code}: {e}")
        raise HTTPException(status_code=502, detail=f"获取公司信息失败: {str(e)}")
