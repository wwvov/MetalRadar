"""新闻服务 — 聚合、过滤、关联度计算"""

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.models.news import News
from app.models.company import Company, CompanyMaterial
from app.models.user import UserFollow, UserFavorite, UserRead
from app.schemas.news import NewsItem, NewsListResponse

# ===== 全量金属品种映射（上海金属网 86 个期货相关品种） =====
METAL_CATEGORY_MAP: dict[str, list[str]] = {
    "贵金属": ["黄金", "白银", "铂", "钯"],
    "小金属": ["锂", "钴", "稀土", "钨", "钼", "锑", "锰", "硅", "镁", "钛", "铟", "锗", "镓", "铋", "镉", "锆", "铪", "钒", "铌", "钽", "铍", "铼"],
}

# 全部独立金属品种（上海金属网覆盖）
ALL_METALS = [
    "铜", "铝", "铅", "锌", "镍", "锡",
    "黄金", "白银", "铂", "钯",
    "锂", "钴", "稀土", "钨", "钼", "锑", "锰", "硅",
    "铁矿石", "螺纹钢", "热卷", "线材", "冷轧", "不锈钢",
    "焦煤", "焦炭", "动力煤",
    "原油", "沥青", "燃料油", "天然气",
    "橡胶", "纸浆", "玻璃", "纯碱",
]

# 不在主聚合流中出现的来源（走专属区块）
SHMET_SOURCE = "上海金属网"


def get_news_list(
    db: Session,
    user_id: str = "default",
    tab: str = "all",
    company_filter: str | None = None,
    company_filters: list[str] | None = None,
    metal_filter: str | None = None,
    metal_filters: list[str] | None = None,
    metal_category: str | None = None,
    source_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> NewsListResponse:
    """获取新闻列表，支持多 Tab 和多值筛选"""

    query = db.query(News)

    # ===== Tab 路由 =====
    if tab == "macro_panel":
        # 宏观快讯面板：纯宏观/政策类（无公司实体 + 无金属实体），最多15条
        query = query.filter(News.source != SHMET_SOURCE)
        query = query.filter(News.is_relevant == True)
        # 排除含公司或金属实体的行业新闻
        query = query.filter(
            or_(
                News.company_entities == None,
                News.company_entities == [],
            )
        )
        query = query.filter(
            or_(
                News.metal_entities == None,
                News.metal_entities == [],
            )
        )
        return _execute_query(db, query, user_id, page, 15, skip_source_exclusion=True)

    if tab == "shmet_block":
        # 上海金属网专属区块：仅上海金属网来源的新闻
        query = query.filter(News.source == SHMET_SOURCE)

        # 金属品类筛选
        if metal_category and metal_category in METAL_CATEGORY_MAP:
            metal_list = METAL_CATEGORY_MAP[metal_category]
            conditions = [News.metal_entities.contains([m]) for m in metal_list]
            query = query.filter(or_(*conditions))
        elif metal_filter:
            query = query.filter(News.metal_entities.contains([metal_filter]))
        # else: 返回全部上海金属网新闻（"要闻"）

        return _execute_query(db, query, user_id, page, page_size, skip_source_exclusion=True)

    if tab == "favorites":
        # 收藏夹：直接查 UserFavorite 获取全部收藏新闻 ID，不过滤来源
        fav_rows = db.query(UserFavorite).filter(UserFavorite.user_id == user_id).all()
        fav_news_ids = [row.news_id for row in fav_rows]
        if not fav_news_ids:
            return NewsListResponse(news=[], total=0)
        query = query.filter(News.id.in_(fav_news_ids))
        # 大 page_size 确保全部返回（收藏夹通常不会超过100条）
        return _execute_query(db, query, user_id, page, max(page_size, 100), skip_source_exclusion=True)

    # ===== 主聚合流 Tab =====
    if tab == "followed_companies":
        followed_codes = _get_followed_codes(db, user_id)
        if not followed_codes:
            return NewsListResponse(news=[], total=0)
        # 同时用股票代码和公司名称匹配（LLM 输出格式可能不一致）
        conditions = [News.company_entities.contains([code]) for code in followed_codes]
        # 查询关注公司的名称，加入名称兜底匹配
        followed_names = [
            name for (name,) in db.query(Company.name)
            .filter(Company.id.in_(followed_codes))
            .all()
        ]
        conditions += [News.company_entities.contains([name]) for name in followed_names]
        query = query.filter(or_(*conditions))

    elif tab == "sensitive_metals":
        # 获取关注公司的原材料品种，仅展示与用户关注公司相关的品种新闻
        followed_codes = _get_followed_codes(db, user_id)
        if not followed_codes:
            return NewsListResponse(news=[], total=0)

        material_rows = (
            db.query(CompanyMaterial.material_name)
            .filter(CompanyMaterial.company_id.in_(followed_codes))
            .distinct()
            .all()
        )
        material_names = [m[0] for m in material_rows]

        if not material_names:
            return NewsListResponse(news=[], total=0)

        # 仅返回 metal_entities 非空 且 匹配关注品种的新闻
        query = query.filter(func.json_array_length(News.metal_entities) > 0)
        conditions = [News.metal_entities.contains([m]) for m in material_names]
        query = query.filter(or_(*conditions))
        query = query.filter(News.is_relevant == True)

    elif tab == "macro":
        # 宏观 Tab：仅灰级关联 + 排除上海金属网
        query = query.filter(News.source != SHMET_SOURCE)
        query = query.filter(News.relevance_level == "gray")
    else:
        # "all" Tab：全量但排除上海金属网（走专属区块展示）
        query = query.filter(News.source != SHMET_SOURCE)

    # ===== 多值筛选器 =====
    if company_filters:
        conditions = [News.company_entities.contains([c]) for c in company_filters]
        query = query.filter(or_(*conditions))
    elif company_filter:
        query = query.filter(News.company_entities.contains([company_filter]))

    if metal_filters:
        conditions = [News.metal_entities.contains([m]) for m in metal_filters]
        query = query.filter(or_(*conditions))
    elif metal_filter and not metal_category:
        query = query.filter(News.metal_entities.contains([metal_filter]))

    # 来源筛选
    if source_filter:
        query = query.filter(News.source == source_filter)

    return _execute_query(db, query, user_id, page, page_size)


def _execute_query(
    db: Session,
    query,
    user_id: str,
    page: int,
    page_size: int,
    skip_source_exclusion: bool = False,
) -> NewsListResponse:
    """执行查询并附加关联度和收藏状态"""
    total = query.count()
    news_list = (
        query.order_by(News.pub_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    followed_codes = _get_followed_codes(db, user_id)
    # 预计算关注公司的名称集合（用于名-码兜底匹配）
    followed_names: set[str] = set()
    if followed_codes:
        followed_names = {
            name for (name,) in db.query(Company.name)
            .filter(Company.id.in_(followed_codes))
            .all()
        }
    favorites = {
        f.news_id: f.linked_company_id
        for f in db.query(UserFavorite)
        .filter(UserFavorite.user_id == user_id)
        .all()
    }
    read_ids = {
        r.news_id
        for r in db.query(UserRead)
        .filter(UserRead.user_id == user_id)
        .all()
    }

    items = []
    for n in news_list:
        item = NewsItem.model_validate(n)
        item.relevance_level = _calc_relevance(n, followed_codes, followed_names)
        if n.id in favorites:
            item.is_favorited = True
            item.linked_company_id = favorites[n.id]
        item.is_read = n.id in read_ids
        items.append(item)

    return NewsListResponse(news=items, total=total)


def _get_followed_codes(db: Session, user_id: str) -> list[str]:
    return [
        f.company_id
        for f in db.query(UserFollow).filter(UserFollow.user_id == user_id).all()
    ]


def _calc_relevance(news: News, followed_codes: list[str], followed_names: set[str] | None = None) -> str:
    """关联度：红(公司+金属) > 蓝(公司) > 黄(金属) > 灰(无关)"""
    companies = news.company_entities or []
    metals = news.metal_entities or []

    # 同时匹配股票代码和公司名称（LLM 输出格式可能不一致）
    has_followed_company = any(c in followed_codes for c in companies)
    if not has_followed_company and followed_names:
        has_followed_company = any(c in followed_names for c in companies)

    has_metal = len(metals) > 0

    if has_followed_company and has_metal:
        return "red"
    elif has_followed_company:
        return "blue"
    elif has_metal:
        return "yellow"
    else:
        return "gray"


def favorite_news(
    db: Session, user_id: str, news_id: str, linked_company_id: str | None = None
) -> None:
    """收藏/取消收藏新闻"""
    existing = (
        db.query(UserFavorite)
        .filter(UserFavorite.user_id == user_id, UserFavorite.news_id == news_id)
        .first()
    )
    if existing:
        db.delete(existing)
    else:
        fav = UserFavorite(
            user_id=user_id,
            news_id=news_id,
            linked_company_id=linked_company_id,
        )
        db.add(fav)
    db.commit()


def mark_news_read(db: Session, user_id: str, news_id: str) -> None:
    """标记新闻已读"""
    existing = (
        db.query(UserRead)
        .filter(UserRead.user_id == user_id, UserRead.news_id == news_id)
        .first()
    )
    if not existing:
        db.add(UserRead(user_id=user_id, news_id=news_id))
        db.commit()


def mark_all_read(db: Session, user_id: str, news_ids: list[str]) -> None:
    """批量标记已读"""
    for nid in news_ids:
        existing = (
            db.query(UserRead)
            .filter(UserRead.user_id == user_id, UserRead.news_id == nid)
            .first()
        )
        if not existing:
            db.add(UserRead(user_id=user_id, news_id=nid))
    db.commit()
