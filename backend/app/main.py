"""MetalRadar API — FastAPI 主入口"""

import logging
import threading
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db, SessionLocal
from app.api import news, companies, user, seed, futures, stocks

logger = logging.getLogger(__name__)


def _startup_cleanup_and_warmup():
    """后台线程：清理过期缓存 + 按需预热期货数据

    文件缓存跨重启持久化，启动时强制使旧缓存失效，
    确保首次用户请求触发全新 akshare 拉取而非返回旧数据。

    反爬优化：
    - 不在启动时一次性拉取所有期货品种（避免 burst 触发反爬）
    - 仅在缓存文件已过期时设置 cached_at=0（保留有效缓存）
    - 期货数据由用户首次请求或后台定期刷新自然驱动
    """
    import os
    import json
    import time as time_mod

    cache_dir = os.path.join(os.path.dirname(__file__), "..", ".cache")

    # 选择性清理：只将已过期的缓存文件设为立即过期
    # 保留仍在 TTL 内的缓存（跨短时重启不丢数据）
    if os.path.isdir(cache_dir):
        cleaned_always = 0  # 总是过期的（超过24小时）
        cleaned_recent = 0  # 仍在TTL内但标记为过期（启动时强制刷新）
        now = time_mod.time()
        for fn in os.listdir(cache_dir):
            if not fn.endswith(".json"):
                continue
            fpath = os.path.join(cache_dir, fn)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                cached_at = data.get("cached_at", 0)
                # 超过24小时的旧缓存 → 设0（强制刷新）
                # 24小时内的 → 保留（短时重启不丢数据）
                if "cached_at" in data:
                    age_hours = (now - cached_at) / 3600
                    if age_hours > 24 or cached_at == 0:
                        # 超过24小时或已为0，强制过期
                        data["cached_at"] = 0
                        with open(fpath, "w", encoding="utf-8") as f:
                            json.dump(data, f, ensure_ascii=False, default=str)
                        cleaned_always += 1
                    elif age_hours > 1:
                        # 1-24小时内的缓存，将cached_at回拨以缩短首次TTL
                        # (保留数据但使其更快过期，避免服务重启后长时间不刷新)
                        data["cached_at"] = now - 3600  # 假装1小时前缓存
                        with open(fpath, "w", encoding="utf-8") as f:
                            json.dump(data, f, ensure_ascii=False, default=str)
                        cleaned_recent += 1
                    # <1小时的缓存保持不变
            except Exception:
                pass
        if cleaned_always > 0 or cleaned_recent > 0:
            logger.info(
                f"启动清理: {cleaned_always} 个过期缓存已标记, "
                f"{cleaned_recent} 个近期缓存已缩短TTL"
            )

    # 不再在启动时预热所有期货 — 避免 burst akshare 调用触发反爬
    # 期货数据由用户首次请求时的 on-demand _fetch_kline 拉取，
    # 或后台 _market_data_auto_refresh 周期性刷新
    logger.info("启动预热已跳过（数据将按需加载，避免触发反爬）")


def _news_auto_refresh():
    """后台守护线程：周期性自动刷新新闻（抓取→入库→LLM分类）"""
    interval_minutes = settings.NEWS_AUTO_REFRESH_MINUTES
    if interval_minutes <= 0:
        logger.info("新闻自动刷新已禁用 (NEWS_AUTO_REFRESH_MINUTES=0)")
        return

    # 启动延迟：等期货预热 + 初始数据加载完成
    startup_delay = 120
    logger.info(f"新闻自动刷新线程已启动，将在 {startup_delay}s 后首次刷新，之后每 {interval_minutes} 分钟一次")
    time.sleep(startup_delay)

    from app.services.news_fetcher import run_refresh_pipeline

    while True:
        try:
            logger.info("后台新闻自动刷新开始...")
            result = run_refresh_pipeline()
            logger.info(
                f"后台新闻自动刷新完成: "
                f"抓取新增 {result['fetch']['inserted']} 条, "
                f"分类 {result['classify']['classified']} 条"
            )
        except Exception as e:
            logger.error(f"后台新闻自动刷新失败（将在下个周期重试）: {e}")

        time.sleep(interval_minutes * 60)


def _is_trading_hours() -> bool:
    """判断当前是否在A股交易时段（工作日 9:00–16:00 北京时间）"""
    from datetime import datetime, timezone, timedelta
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    # 周末不交易
    if now.weekday() >= 5:
        return False
    # 交易时段 9:00–16:00
    trade_start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    trade_end = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return trade_start <= now <= trade_end


def _market_data_auto_refresh():
    """后台守护线程：周期性刷新市场行情数据

    设计原则：
    - 不主动 invalidate 缓存，依赖动态 TTL 自然过期驱动刷新
    - 交易时段：每 5 分钟检查一次（spot TTL=60s，每次检查都可能触发实际刷新）
    - 非交易时段：每 30 分钟检查一次（spot TTL=300s，基本不做实际调用）
    - 期货数据仅在交易时段且缓存过期时才刷新
    - 调用失败保留旧缓存，不丢数据，不重试
    - 检测到东财源被封禁时，降低检查频率，等待封禁自然过期
    """
    startup_delay = 180
    logger.info(f"市场数据自动刷新线程已启动，将在 {startup_delay}s 后开始")
    time.sleep(startup_delay)

    backoff_multiplier = 1  # 连续失败时的退避倍数

    while True:
        try:
            trading = _is_trading_hours()

            # 检查是否有数据源被封禁
            from app.services._scrape_control import should_skip_source as _should_skip
            eastmoney_blocked = _should_skip("eastmoney")

            if eastmoney_blocked:
                # 东财源被封禁 → 降低检查频率，避免无谓的失败请求
                base_interval = 600 if trading else 3600  # 10min/1h
                if backoff_multiplier < 8:
                    backoff_multiplier *= 2
                interval = base_interval * min(backoff_multiplier, 8)
                logger.info(f"东财源被封禁，降低刷新频率至 {interval}s")
            elif trading:
                interval = 300  # 交易时段：5分钟
                backoff_multiplier = max(1, backoff_multiplier // 2)  # 逐渐恢复
            else:
                interval = 1800  # 非交易时段：30分钟
                backoff_multiplier = max(1, backoff_multiplier // 2)

            if trading or not eastmoney_blocked:
                db = SessionLocal()
                try:
                    from app.services.stock_service import refresh_market_data
                    result = refresh_market_data(db if trading else None)
                    if result.get("spot_refreshed"):
                        backoff_multiplier = 1  # 成功 → 重置退避
                        logger.info(
                            f"后台市场数据已刷新: 全市场行情 {result['spot_count']} 只, "
                            f"期货 {result['futures_count']} 个品种"
                        )
                finally:
                    db.close()
            else:
                logger.debug("非交易时段且东财源被封禁，跳过此次刷新")
        except Exception as e:
            logger.error(f"后台市场数据刷新失败（将在下个周期重试）: {e}")
            backoff_multiplier = min(backoff_multiplier * 2, 8)

        time.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库，后台预热期货缓存 + 新闻自动刷新"""
    init_db()
    # 启动时清理过期缓存 + 预热期货数据，不阻塞启动
    threading.Thread(target=_startup_cleanup_and_warmup, daemon=True).start()
    # 后台新闻自动刷新（守护线程，进程退出时自动终止）
    threading.Thread(target=_news_auto_refresh, daemon=True).start()
    # 后台市场行情自动刷新（守护线程，保持股票市值+期货数据新鲜）
    threading.Thread(target=_market_data_auto_refresh, daemon=True).start()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(news.router, prefix="/api")
app.include_router(companies.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(seed.router, prefix="/api")
app.include_router(futures.router, prefix="/api")
app.include_router(stocks.router, prefix="/api")


@app.get("/api/health")
def health_check():
    """健康检查"""
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/api/market/status")
def market_data_status():
    """市场数据刷新状态 — 前端用于展示数据新鲜度"""
    from datetime import datetime, timezone, timedelta
    from app.services.stock_service import get_last_refresh_times
    from app.services._scrape_control import get_failure_stats

    tz = timezone(timedelta(hours=8))
    times = get_last_refresh_times()
    failure_stats = get_failure_stats()

    def fmt_ts(ts):
        if ts is None:
            return None
        return datetime.fromtimestamp(ts, tz=tz).strftime("%Y-%m-%d %H:%M:%S")

    return {
        "ok": True,
        "data": {
            "spot_market_last_refresh": fmt_ts(times.get("spot_market")),
            "futures_last_refresh": fmt_ts(times.get("futures")),
            "trading_hours": _is_trading_hours(),
            "data_source_status": {
                "eastmoney_blocked": failure_stats["sources"].get("eastmoney", {}).get("skip_until", 0) > 0,
                "consecutive_failures": failure_stats["consecutive_failures"],
                "source_details": failure_stats["sources"],
            },
        },
    }


@app.post("/api/market/refresh")
def force_refresh_market_data():
    """手动强制刷新市场数据 — 使缓存失效并立即重新拉取

    用于用户点击「刷新」按钮时调用。不做重试，失败返回错误信息。
    """
    from app.services.stock_service import refresh_market_data

    db = SessionLocal()
    try:
        result = refresh_market_data(db)
        return {
            "ok": True,
            "data": {
                "spot_refreshed": result.get("spot_refreshed", False),
                "spot_count": result.get("spot_count", 0),
                "futures_count": result.get("futures_count", 0),
            },
        }
    except Exception as e:
        logger.error(f"手动刷新市场数据失败: {e}")
        return {
            "ok": False,
            "error": str(e),
        }
    finally:
        db.close()
