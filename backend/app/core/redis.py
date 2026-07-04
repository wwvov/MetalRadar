"""Redis 连接（可选，本地开发可关闭）"""

import redis.asyncio as aioredis
from .config import settings


async def get_redis():
    """获取 Redis 连接（仅在启用时）"""
    if not settings.REDIS_ENABLED:
        return None
    return await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
