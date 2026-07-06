"""全局反爬控制 — 所有 akshare 调用共享此模块的锁和冷却机制

确保同一时刻只有一个 akshare 调用在进行，两次调用之间有足够冷却间隔。
stock_service 和 futures_service 共用此模块，避免并发触发反爬。

自适应退避：
- 连续成功 → 使用基础冷却时间 (SCRAPE_COOLDOWN = 5s)
- 连续失败 → 指数增长冷却时间 (5s → 10s → 20s → 40s → ... 上限 120s)
- 成功后重置冷却时间
- 提供 should_skip_source() 用于判断某个数据源是否已被暂时封禁
"""

import logging
import threading
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 5)
_MAX_COOLDOWN = 120  # 最大冷却时间 2 分钟

_fetch_lock = threading.Lock()
_last_fetch_time = 0.0

# 自适应退避状态
_consecutive_failures = 0
_consecutive_successes = 0
_last_failure_time = 0.0

# 数据源级别故障跟踪
# key = source name (e.g. "eastmoney", "sina"), value = {"failures": N, "first_failure": ts, "skip_until": ts}
_source_failure_tracker: dict[str, dict] = {}
_source_tracker_lock = threading.Lock()


def _current_cooldown() -> float:
    """计算当前自适应冷却时间（基于连续失败次数）"""
    if _consecutive_failures <= 2:
        return SCRAPE_COOLDOWN
    # 指数增长，上限 120s
    cooldown = min(SCRAPE_COOLDOWN * (2 ** (_consecutive_failures - 2)), _MAX_COOLDOWN)
    return cooldown


def cooldown(source: str = ""):
    """反爬冷却 — 使用自适应冷却时间"""
    global _last_fetch_time
    cd = _current_cooldown()
    elapsed = time.time() - _last_fetch_time
    if elapsed < cd:
        wait = cd - elapsed
        if wait > 2:
            logger.debug(f"反爬冷却中 (连续失败{_consecutive_failures}次, cd={cd:.0f}s), 等待 {wait:.1f}s...")
        time.sleep(wait)


def mark_fetch_time():
    """标记一次 akshare 调用完成，更新全局时间戳"""
    global _last_fetch_time
    _last_fetch_time = time.time()


def mark_success():
    """标记一次成功调用 → 重置自适应冷却"""
    global _consecutive_failures, _consecutive_successes
    _consecutive_failures = 0
    _consecutive_successes += 1


def mark_failure():
    """标记一次失败调用 → 增加冷却时间"""
    global _consecutive_failures, _consecutive_successes, _last_failure_time
    _consecutive_failures += 1
    _consecutive_successes = 0
    _last_failure_time = time.time()
    if _consecutive_failures >= 3:
        logger.warning(
            f"akshare 连续 {_consecutive_failures} 次失败，"
            f"冷却时间已增至 {_current_cooldown():.0f}s"
        )


def mark_source_failure(source: str):
    """标记特定数据源的失败"""
    with _source_tracker_lock:
        now = time.time()
        if source not in _source_failure_tracker:
            _source_failure_tracker[source] = {"failures": 1, "first_failure": now, "skip_until": 0}
        else:
            tracker = _source_failure_tracker[source]
            tracker["failures"] += 1
            # 连续失败 5 次以上 → 跳过该数据源 10 分钟
            if tracker["failures"] >= 5:
                tracker["skip_until"] = now + 600  # 10 分钟
                logger.warning(
                    f"数据源 {source} 连续失败 {tracker['failures']} 次，"
                    f"将跳过 10 分钟以避免触发反爬"
                )
            # 连续失败 10 次以上 → 跳过 30 分钟
            if tracker["failures"] >= 10:
                tracker["skip_until"] = now + 1800  # 30 分钟
                logger.warning(
                    f"数据源 {source} 连续失败 {tracker['failures']} 次，"
                    f"将跳过 30 分钟"
                )


def mark_source_success(source: str):
    """标记特定数据源的成功（重置跳过计时器）"""
    with _source_tracker_lock:
        if source in _source_failure_tracker:
            prev = _source_failure_tracker[source]
            if prev["failures"] >= 5:
                logger.info(f"数据源 {source} 已恢复（之前连续失败 {prev['failures']} 次）")
            del _source_failure_tracker[source]


def should_skip_source(source: str) -> bool:
    """判断是否应该跳过某个数据源（已被暂时封禁）"""
    with _source_tracker_lock:
        if source not in _source_failure_tracker:
            return False
        tracker = _source_failure_tracker[source]
        if tracker["skip_until"] > time.time():
            remaining = int(tracker["skip_until"] - time.time())
            logger.debug(f"跳过数据源 {source}（剩余 {remaining}s 冷却）")
            return True
        return False


def retry_with_backoff(fn, max_retries: int = 2, label: str = "", source: str = ""):
    """带自适应退避的重试调用

    Args:
        fn: 要调用的函数（无参）
        max_retries: 最大重试次数
        label: 日志标签
        source: 数据源名称（如 "sina", "eastmoney"），用于故障跟踪

    Returns:
        fn 的返回值

    Raises:
        最后一次重试的异常（所有重试均失败时）
    """
    # 如果该数据源已被封禁，直接跳过
    if source and should_skip_source(source):
        raise RuntimeError(f"数据源 {source} 暂时被跳过（反爬保护）")

    for attempt in range(max_retries + 1):
        try:
            cooldown()
            result = fn()
            mark_fetch_time()
            mark_success()
            if source:
                mark_source_success(source)
            return result
        except Exception as e:
            mark_failure()
            if source:
                mark_source_failure(source)
            if attempt < max_retries:
                wait = (2 ** attempt) * _current_cooldown()
                logger.warning(f"{label} 第{attempt+1}次失败: {e}，{wait:.0f}s后重试...")
                time.sleep(wait)
            else:
                logger.error(f"{label} 所有重试 ({max_retries+1}次) 失败: {e}")
                raise


def acquire_lock():
    """获取全局抓取锁（用于需要跨多次调用的原子操作）"""
    return _fetch_lock


def get_failure_stats() -> dict:
    """返回当前故障统计（供 /api/market/status 使用）"""
    with _source_tracker_lock:
        sources = {}
        for name, tracker in _source_failure_tracker.items():
            sources[name] = {
                "failures": tracker["failures"],
                "skip_until": tracker["skip_until"] if tracker["skip_until"] > time.time() else 0,
            }
    return {
        "consecutive_failures": _consecutive_failures,
        "consecutive_successes": _consecutive_successes,
        "current_cooldown": _current_cooldown(),
        "sources": sources,
    }
