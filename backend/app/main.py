"""MetalRadar API — FastAPI 主入口"""

import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db, SessionLocal
from app.api import news, companies, user, seed, futures

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库，后台预热期货缓存"""
    init_db()
    # 后台预热期货缓存，不阻塞启动
    threading.Thread(target=_warmup_futures_cache, daemon=True).start()
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


@app.get("/api/health")
def health_check():
    """健康检查"""
    return {"status": "ok", "version": settings.APP_VERSION}
