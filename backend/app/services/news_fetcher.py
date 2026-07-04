"""新闻抓取服务 — 从 akshare 获取多源新闻，文件缓存 + 反爬控制"""

import json
import hashlib
import logging
import os
import time
from datetime import datetime, timezone, timedelta

import pandas as pd

from app.core.config import settings
from app.models.news import News
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
RAW_NEWS_CACHE_FILE = os.path.join(CACHE_DIR, "news_raw.json")
# 缓存 TTL：默认 10 分钟，避免频繁调用 akshare 被反爬
NEWS_CACHE_TTL = getattr(settings, "NEWS_CACHE_TTL", 300)

# 反爬间隔：不同数据源之间至少间隔 N 秒（适当降低以加快刷新速度）
SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 5)

# 上海金属网来源名称
SHMET_SOURCE = "上海金属网"

# 北京时区
TZ_BEIJING = timezone(timedelta(hours=8))


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _read_raw_cache() -> dict | None:
    """读取原始新闻缓存"""
    try:
        if not os.path.exists(RAW_NEWS_CACHE_FILE):
            return None
        with open(RAW_NEWS_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_at = data.get("cached_at", 0)
        if time.time() - cached_at < NEWS_CACHE_TTL:
            logger.info(f"原始新闻缓存有效，{len(data.get('items', []))} 条")
            return data
        logger.info("原始新闻缓存已过期")
        return None
    except Exception as e:
        logger.warning(f"读取新闻缓存失败: {e}")
        return None


def _write_raw_cache(items: list[dict], sources: list[str]):
    """写入原始新闻缓存"""
    try:
        _ensure_cache_dir()
        with open(RAW_NEWS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "cached_at": time.time(),
                "sources": sources,
                "count": len(items),
                "items": items,
            }, f, ensure_ascii=False)
        logger.info(f"写入新闻缓存: {len(items)} 条, 来源: {sources}")
    except Exception as e:
        logger.warning(f"写入新闻缓存失败: {e}")


def _make_news_id(title: str, source: str, pub_time: datetime | None = None) -> str:
    """生成新闻唯一 ID: news_YYYYMMDD_hash8"""
    raw = f"{source}:{title}"
    if pub_time:
        raw += pub_time.strftime("%Y%m%d%H%M")
    hash_hex = hashlib.md5(raw.encode("utf-8")).hexdigest()[:8]
    date_str = (pub_time or datetime.now(TZ_BEIJING)).strftime("%Y%m%d")
    return f"news_{date_str}_{hash_hex}"


def _fetch_shmet_news() -> list[dict]:
    """从 akshare 获取上海金属网新闻 — 列名: 发布时间, 内容"""
    try:
        import akshare as ak
        logger.info("正在从 akshare 获取上海金属网新闻...")
        df = ak.futures_news_shmet()
        if df is None or df.empty:
            logger.warning("上海金属网新闻返回空数据")
            return []

        items = []
        for _, row in df.iterrows():
            content = str(row.get("内容", "")).strip()
            if not content or len(content) < 10:
                continue

            # 上海金属网格式: "SHMET07月05日讯：..." → 提取标题(前60字)
            # 内容即正文，没有独立标题栏
            title = content[:100]
            # 去掉 "SHMET" 前缀使标题更干净
            if "讯：" in title:
                title = title.split("讯：", 1)[-1]
            title = title.strip()[:80]

            summary = content[:300] if len(content) > 100 else ""

            pub_time_raw = row.get("发布时间", None)
            pub_time = None
            if pub_time_raw:
                try:
                    pub_time = pd.Timestamp(pub_time_raw).to_pydatetime()
                except Exception:
                    pass

            items.append({
                "title": title,
                "summary": summary,
                "source": SHMET_SOURCE,
                "pub_time": (pub_time or datetime.now(TZ_BEIJING)).isoformat(),
                "raw_url": "",
            })
        logger.info(f"上海金属网: 获取 {len(items)} 条")
        return items
    except ImportError:
        logger.warning("akshare 未安装，跳过上海金属网新闻")
        return []
    except Exception as e:
        logger.warning(f"获取上海金属网新闻失败: {e}")
        return []


def _fetch_eastmoney_global() -> list[dict]:
    """从 akshare 获取东方财富全球快讯 — 列名: 标题, 摘要, 发布时间, 链接"""
    try:
        import akshare as ak
        logger.info("正在从 akshare 获取东方财富全球快讯...")
        df = ak.stock_info_global_em()
        if df is None or df.empty:
            logger.warning("东方财富全球快讯返回空数据")
            return []

        items = []
        for _, row in df.iterrows():
            title = str(row.get("标题", "")).strip()
            if not title or len(title) < 4:
                continue
            summary = str(row.get("摘要", "")).strip()
            pub_time_raw = row.get("发布时间", None)

            pub_time = None
            if pub_time_raw:
                try:
                    pub_time = pd.Timestamp(pub_time_raw).to_pydatetime()
                except Exception:
                    pass

            items.append({
                "title": title[:200],
                "summary": summary[:500] if summary != title else "",
                "source": "东方财富",
                "pub_time": (pub_time or datetime.now(TZ_BEIJING)).isoformat(),
                "raw_url": str(row.get("链接", "")),
            })
        logger.info(f"东方财富全球快讯: 获取 {len(items)} 条")
        return items
    except ImportError:
        logger.warning("akshare 未安装")
        return []
    except Exception as e:
        logger.warning(f"获取东方财富全球快讯失败: {e}")
        return []


def _fetch_sina_global() -> list[dict]:
    """从 akshare 获取新浪全球快讯 — 列名: 时间, 内容"""
    try:
        import akshare as ak
        logger.info("正在从 akshare 获取新浪全球快讯...")
        df = ak.stock_info_global_sina()
        if df is None or df.empty:
            logger.warning("新浪全球快讯返回空数据")
            return []

        items = []
        for _, row in df.iterrows():
            content = str(row.get("内容", "")).strip()
            if not content or len(content) < 10:
                continue
            # 新浪全球快讯: 内容即完整新闻文本，取前80字作标题
            title = content[:80]
            summary = content[:300] if len(content) > 80 else ""

            pub_time_raw = row.get("时间", None)
            pub_time = None
            if pub_time_raw:
                try:
                    pub_time = pd.Timestamp(pub_time_raw).to_pydatetime()
                except Exception:
                    pass

            items.append({
                "title": title,
                "summary": summary,
                "source": "新浪财经",
                "pub_time": (pub_time or datetime.now(TZ_BEIJING)).isoformat(),
                "raw_url": "",
            })
        logger.info(f"新浪全球快讯: 获取 {len(items)} 条")
        return items
    except ImportError:
        logger.warning("akshare 未安装")
        return []
    except Exception as e:
        logger.warning(f"获取新浪全球快讯失败: {e}")
        return []


def _deduplicate_items(items: list[dict]) -> list[dict]:
    """按标题去重，保留最早出现的"""
    seen = set()
    unique = []
    for item in items:
        key = (item["title"][:80], item["source"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def fetch_all_news(force: bool = False) -> list[dict]:
    """从所有数据源获取新闻（使用文件缓存）

    Args:
        force: 强制刷新，跳过缓存

    Returns:
        新闻条目列表，每个包含 title/summary/source/pub_time/raw_url
    """
    # 检查缓存
    if not force:
        cached = _read_raw_cache()
        if cached:
            return cached["items"]

    all_items: list[dict] = []

    # 按顺序逐个数据源获取（反爬：每个源之间间隔）
    fetchers = [
        ("上海金属网", _fetch_shmet_news),
        ("东方财富", _fetch_eastmoney_global),
        ("新浪财经", _fetch_sina_global),
    ]

    for i, (name, fetcher) in enumerate(fetchers):
        if i > 0:
            logger.info(f"反爬冷却 {SCRAPE_COOLDOWN}s...")
            time.sleep(SCRAPE_COOLDOWN)

        try:
            items = fetcher()
            all_items.extend(items)
        except Exception as e:
            logger.error(f"数据源 [{name}] 获取异常: {e}")

    # 去重
    all_items = _deduplicate_items(all_items)
    logger.info(f"总共获取 {len(all_items)} 条新闻（去重后）")

    # 按时间倒序排列
    all_items.sort(key=lambda x: x.get("pub_time", ""), reverse=True)

    # 写入缓存
    sources = list(set(item["source"] for item in all_items))
    _write_raw_cache(all_items, sources)

    return all_items


def sync_news_to_db(db: Session, raw_items: list[dict]) -> dict:
    """将原始新闻同步到数据库（增量：只插入新新闻）

    Returns:
        {"inserted": N, "skipped": N, "total": N}
    """
    inserted = 0
    skipped = 0

    for item in raw_items:
        title = item["title"]
        source = item["source"]
        pub_time_raw = item.get("pub_time")

        # 解析发布时间
        pub_time = None
        if pub_time_raw:
            try:
                pub_time = datetime.fromisoformat(pub_time_raw)
            except Exception:
                pub_time = datetime.now(TZ_BEIJING)

        news_id = _make_news_id(title, source, pub_time)

        # 检查是否已存在
        existing = db.query(News).filter(News.id == news_id).first()
        if existing:
            skipped += 1
            continue

        # 插入新记录（未分类状态）
        news = News(
            id=news_id,
            title=title[:200],
            summary=item.get("summary", "")[:500],
            source=source,
            pub_time=pub_time or datetime.now(TZ_BEIJING),
            tags=[],
            company_entities=[],
            metal_entities=[],
            relevance_level="gray",
            emotion="neutral",
            is_relevant=True,  # 默认相关，待 LLM 分类后筛选
            event_type="",
            raw_url=item.get("raw_url", ""),
        )
        db.add(news)
        inserted += 1

    db.commit()
    logger.info(f"新闻同步完成: 新增 {inserted}, 跳过 {skipped}, 总计 {len(raw_items)}")
    return {"inserted": inserted, "skipped": skipped, "total": len(raw_items)}


def get_unclassified_news(db: Session, limit: int = 50) -> list[News]:
    """获取尚未被 LLM 分类的新闻（event_type 为空表示未处理）"""
    return (
        db.query(News)
        .filter(
            News.is_relevant == True,
            News.event_type == "",  # 未分类标记：event_type 为空
        )
        .order_by(News.pub_time.desc())
        .limit(limit)
        .all()
    )
