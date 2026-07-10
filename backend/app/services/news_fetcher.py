"""新闻抓取服务 — 从 akshare 获取多源新闻，文件缓存 + 反爬控制"""

import json
import hashlib
import logging
import os
import time
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.news import News
from app.services._scrape_control import retry_with_backoff, acquire_lock
from sqlalchemy.orm import Session
from datetime import datetime


def _parse_pub_time(pub_time_raw) -> datetime | None:
    """解析发布时间字符串（优先 pandas，fallback datetime）"""
    if pub_time_raw is None:
        return None
    try:
        import pandas as pd
        return pd.Timestamp(pub_time_raw).to_pydatetime()
    except Exception:
        try:
            return datetime.fromisoformat(str(pub_time_raw))
        except Exception:
            return None

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
        def _call():
            return ak.futures_news_shmet()
        df = retry_with_backoff(_call, max_retries=2, label="上海金属网新闻", source="shmet")
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
                    pub_time = _parse_pub_time(pub_time_raw)
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
        def _call():
            return ak.stock_info_global_em()
        df = retry_with_backoff(_call, max_retries=2, label="东方财富全球快讯", source="eastmoney")
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
                    pub_time = _parse_pub_time(pub_time_raw)
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
        def _call():
            return ak.stock_info_global_sina()
        df = retry_with_backoff(_call, max_retries=2, label="新浪全球快讯", source="sina")
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
                    pub_time = _parse_pub_time(pub_time_raw)
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


# —— 产业/金属关键词 —— 用于预过滤无关新闻（加密货币/体育/娱乐等）
_INDUSTRY_KEYWORDS = [
    # 金属品种
    "铜", "铝", "铅", "锌", "镍", "锡", "钴", "锂", "钨", "钼", "锑", "锰", "铬",
    "黄金", "白银", "铂", "钯", "稀土", "硅", "镁", "钛", "锆", "铟", "镓", "锗",
    "铁矿石", "钢", "钢材", "螺纹钢", "热卷", "线材", "不锈钢", "电解铝", "电解铜",
    "碳酸锂", "氢氧化锂", "钴酸锂", "三元材料", "磷酸铁锂", "电解液", "隔膜",
    "光伏", "多晶硅", "单晶硅", "硅片", "电池级",
    # 产业链
    "新能源", "电动车", "动力电池", "储能", "锂电池", "钠电池", "固态电池",
    "有色金属", "矿产", "矿山", "冶炼", "精炼", "加工费", "TC", "RC",
    "正极", "负极", "前驱体", "六氟磷酸锂", "溶剂",
    # 行业相关
    "汽车", "比亚迪", "特斯拉", "宁德时代", "产业链", "供应链",
    # 宏观/政策
    "美联储", "加息", "降息", "利率", "央行", "PMI", "GDP", "通胀",
    "关税", "制裁", "出口管制", "贸易战", "地缘", "冲突",
    "基建", "房地产", "制造业", "工业增加值", "社融", "信贷",
    "新能源车", "风电", "光伏", "储能", "特高压", "电网",
]

def _is_industry_relevant(item: dict) -> bool:
    """检查新闻是否与金属/产业链相关（标题或摘要含关键词）"""
    text = (item.get("title", "") + " " + item.get("summary", "")).lower()
    return any(kw in text for kw in _INDUSTRY_KEYWORDS)


def fetch_all_news(force: bool = False) -> list[dict]:
    """从所有数据源获取新闻（使用文件缓存 + 全局反爬锁）

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

    # 按顺序逐个数据源获取（全局锁 + 统一退避防反爬）
    fetchers = [
        ("上海金属网", _fetch_shmet_news),
        ("东方财富", _fetch_eastmoney_global),
        ("新浪财经", _fetch_sina_global),
    ]

    for name, fetcher in fetchers:
        with acquire_lock():
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

    # 产业关键词预过滤：丢弃与金属/产业链完全无关的新闻
    before_filter = len(all_items)
    all_items = [item for item in all_items if _is_industry_relevant(item)]
    logger.info(f"关键词预过滤: {before_filter} → {len(all_items)} 条")

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


def run_refresh_pipeline() -> dict:
    """完整的刷新流水线：抓取→入库→LLM分类

    供 API 端点和后台调度线程复用。

    Returns:
        {"fetch": {...}, "classify": {...}}
    """
    from app.services.news_classifier import classify_news_batch

    db = SessionLocal()
    try:
        logger.info("新闻刷新流水线启动")
        raw_items = fetch_all_news(force=True)
        fetch_result = sync_news_to_db(db, raw_items)
        logger.info(f"新闻入库完成: 新增 {fetch_result['inserted']}, 跳过 {fetch_result['skipped']}")

        classify_result = classify_news_batch(db, limit=100)
        logger.info(f"新闻分类完成: {classify_result['classified']} 条")

        return {"fetch": fetch_result, "classify": classify_result}
    except Exception as e:
        logger.error(f"新闻刷新流水线失败: {e}")
        raise
    finally:
        db.close()
