"""全局反爬控制 — 所有 akshare 调用共享此模块的锁和冷却机制

确保同一时刻只有一个 akshare 调用在进行，两次调用之间有足够冷却间隔。
stock_service 和 futures_service 共用此模块，避免并发触发反爬。
"""

import logging
import threading
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 5)

_fetch_lock = threading.Lock()
_last_fetch_time = 0.0


def cooldown():
    """反爬冷却 — 确保两次 akshare 调用之间有足够间隔"""
    global _last_fetch_time
    elapsed = time.time() - _last_fetch_time
    if elapsed < SCRAPE_COOLDOWN:
        wait = SCRAPE_COOLDOWN - elapsed
        logger.info(f"反爬冷却中，等待 {wait:.1f}s...")
        time.sleep(wait)


def mark_fetch_time():
    """标记一次 akshare 调用完成，更新全局时间戳"""
    global _last_fetch_time
    _last_fetch_time = time.time()


def retry_with_backoff(fn, max_retries: int = 2, label: str = ""):
    """带指数退避的重试调用 + 自动冷却

    Args:
        fn: 要调用的函数（无参）
        max_retries: 最大重试次数
        label: 日志标签

    Returns:
        fn 的返回值

    Raises:
        最后一次重试的异常（所有重试均失败时）
    """
    for attempt in range(max_retries + 1):
        try:
            cooldown()
            result = fn()
            mark_fetch_time()
            return result
        except Exception as e:
            if attempt < max_retries:
                wait = (2 ** attempt) * SCRAPE_COOLDOWN
                logger.warning(f"{label} 第{attempt+1}次失败: {e}，{wait:.0f}s后重试...")
                time.sleep(wait)
            else:
                logger.error(f"{label} 所有重试失败: {e}")
                raise


def acquire_lock():
    """获取全局抓取锁（用于需要跨多次调用的原子操作）"""
    return _fetch_lock
