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


def _warmup_futures_cache():
    """后台线程：预热期货数据缓存"""
    try:
        db = SessionLocal()
        from app.services.futures_service import prefetch_all_symbols
        prefetch_all_symbols(db)
        db.close()
    except Exception as e:
        logger.warning(f"期货缓存预热失败（不影响正常启动）: {e}")


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库，后台预热期货缓存 + 新闻自动刷新"""
    init_db()
    # 后台预热期货缓存，不阻塞启动
    threading.Thread(target=_warmup_futures_cache, daemon=True).start()
    # 后台新闻自动刷新（守护线程，进程退出时自动终止）
    threading.Thread(target=_news_auto_refresh, daemon=True).start()
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
