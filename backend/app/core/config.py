"""应用配置 — 从环境变量加载，提供合理默认值"""

from pydantic_settings import BaseSettings


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

    # 反爬控制
    SCRAPE_COOLDOWN_SECONDS: int = 3

    # AI / LLM
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
