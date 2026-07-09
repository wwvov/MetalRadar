"""应用配置 — 从环境变量加载，提供合理默认值

环境变量加载优先级（从高到低）：
1. 系统 / 云端平台注入的环境变量（Render, Railway 等）— 云端部署时使用
2. backend/.env 文件 — 本地开发使用，多路径自动搜索
3. 代码中的默认值 — 最后兜底
"""

import os
import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# ─── .env 文件搜索 ──────────────────────────────────────────────────────
# 无论从哪个目录启动都能找到 backend/.env，云端部署时环境变量优先

_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))  # .../backend/app/core/
_BACKEND_DIR = os.path.dirname(os.path.dirname(_CONFIG_DIR))  # .../backend/


def _find_env_file() -> str:
    """搜索 .env 文件，返回第一个存在的路径；都不存在则返回 backend/.env（默认位置）。

    搜索顺序：
    1. backend/.env（相对 config.py，始终优先）
    2. ./.env（当前工作目录）
    3. ./backend/.env（从项目根目录启动时）

    云端部署说明：
    - Render / Railway 等平台通过 Dashboard 设置环境变量
    - pydantic-settings 会优先读取真实环境变量，.env 文件仅作 fallback
    - 若 .env 文件不存在，pydantic-settings 只会输出一条 debug 日志，不会报错
    """
    candidates = [
        os.path.join(_BACKEND_DIR, ".env"),        # backend/.env（标准位置）
        os.path.join(os.getcwd(), ".env"),          # ./.env
        os.path.join(os.getcwd(), "backend", ".env"),  # ./backend/.env
    ]
    for path in candidates:
        if os.path.isfile(path):
            logger.info(f"找到 .env 文件: {path}")
            return path
    # 未找到时返回标准位置 — pydantic-settings 会静默跳过不存在的文件
    default = candidates[0]
    logger.debug(f"未找到 .env 文件，使用默认路径: {default}（如云端部署请忽略）")
    return default


class Settings(BaseSettings):
    # 应用
    APP_NAME: str = "MetalRadar API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # 数据库
    DATABASE_URL: str = "sqlite:///./metalradar.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False  # 本地开发可关闭 Redis

    # 新闻缓存 (秒)
    NEWS_CACHE_TTL: int = 300
    COMPANY_CACHE_TTL: int = 86400

    # 新闻自动刷新 (分钟)，0 表示禁用
    NEWS_AUTO_REFRESH_MINUTES: int = 30

    # 反爬控制
    SCRAPE_COOLDOWN_SECONDS: int = 3

    # AI / LLM
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = _find_env_file()
        env_file_encoding = "utf-8"


settings = Settings()
