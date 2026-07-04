"""公司服务 — 搜索、画像生成、关注管理"""

import logging
from sqlalchemy.orm import Session
from app.models.company import Company, CompanyMaterial
from app.models.financial import FinancialReport
from app.models.user import UserFollow
from app.schemas.company import (
    CompanyBasic,
    CompanySearchResult,
    CompanyDetailOut,
    CompanyPortraitOut,
    CompanyMaterialOut,
    FinancialSummaryOut,
)

logger = logging.getLogger(__name__)

# 内存缓存全量 A 股列表
_stock_list_cache: list[dict] | None = None


def _load_stock_list() -> list[dict]:
    """加载全量 A 股上市公司列表（首次调用时从 akshare 获取并缓存）"""
    global _stock_list_cache
    if _stock_list_cache is not None:
        return _stock_list_cache

    try:
        import akshare as ak
        df = ak.stock_info_a_code_name()
        _stock_list_cache = df.to_dict(orient="records")
        logger.info(f"Loaded {len(_stock_list_cache)} A-share stocks from akshare")
    except Exception as e:
        logger.warning(f"Failed to load stocks from akshare: {e}, using fallback list")
        # 内置常用公司兜底列表
        _stock_list_cache = [
            {"code": "000001", "name": "平安银行"},
            {"code": "000002", "name": "万科A"},
            {"code": "000858", "name": "五粮液"},
            {"code": "002460", "name": "赣锋锂业"},
            {"code": "002466", "name": "天齐锂业"},
            {"code": "300750", "name": "宁德时代"},
            {"code": "600519", "name": "贵州茅台"},
            {"code": "601127", "name": "赛力斯"},
            {"code": "601899", "name": "紫金矿业"},
            {"code": "603799", "name": "华友钴业"},
            {"code": "600111", "name": "北方稀土"},
            {"code": "601600", "name": "中国铝业"},
            {"code": "600362", "name": "江西铜业"},
            {"code": "000630", "name": "铜陵有色"},
            {"code": "000933", "name": "神火股份"},
            {"code": "002340", "name": "格林美"},
            {"code": "300014", "name": "亿纬锂能"},
            {"code": "002074", "name": "国轩高科"},
            {"code": "601012", "name": "隆基绿能"},
        ]

    return _stock_list_cache


def search_companies(db: Session, keyword: str) -> CompanySearchResult:
    """搜索 A 股公司 — 按名称或代码匹配（从 akshare 全量列表查询）"""
    stock_list = _load_stock_list()

    # 模糊匹配
    keyword_lower = keyword.strip().lower()
    matched = []
    for stock in stock_list:
        code = str(stock.get("code", ""))
        name = str(stock.get("name", ""))
        if keyword_lower in code or keyword_lower in name.lower():
            matched.append(stock)
        if len(matched) >= 20:
            break

    companies = [
        CompanyBasic(
            id=str(s.get("code", "")),
            name=str(s.get("name", "")),
            code=str(s.get("code", "")),
            industry="",
        )
        for s in matched
    ]

    return CompanySearchResult(companies=companies)


def get_company_detail(db: Session, company_id: str) -> CompanyDetailOut | None:
    """获取公司详情（含画像和财报摘要）"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return None

    # 构建画像
    materials = [
        CompanyMaterialOut(
            material_name=m.material_name,
            cost_pct=float(m.cost_pct) if m.cost_pct else None,
            source=m.source or "inferred",
            direction=m.direction or "negative",
            contract=m.contract or "",
        )
        for m in company.materials
    ]

    portrait = CompanyPortraitOut(
        position=company.position or "",
        position_detail=company.position_detail or "",
        materials=materials,
    )

    # 最新财报摘要
    latest_report = (
        db.query(FinancialReport)
        .filter(FinancialReport.company_id == company_id)
        .order_by(FinancialReport.report_period.desc())
        .first()
    )

    financial_summary = None
    if latest_report:
        financial_summary = FinancialSummaryOut(
            report_period=latest_report.report_period or "",
            revenue=float(latest_report.revenue) if latest_report.revenue else None,
            cost=float(latest_report.cost) if latest_report.cost else None,
            gross_margin=float(latest_report.gross_margin) if latest_report.gross_margin else None,
            direct_material_pct=float(latest_report.direct_material_pct) if latest_report.direct_material_pct else None,
            direct_labor_pct=float(latest_report.direct_labor_pct) if latest_report.direct_labor_pct else None,
            manufacturing_pct=float(latest_report.manufacturing_pct) if latest_report.manufacturing_pct else None,
        )

    return CompanyDetailOut(
        id=company.id,
        name=company.name,
        code=company.id,
        industry=company.industry or "",
        short_name=company.short_name or "",
        business_desc=company.business_desc or "",
        portrait=portrait,
        financial_summary=financial_summary,
    )


def init_company_profile(
    db: Session, company_code: str, report_text: str | None = None
) -> CompanyDetailOut:
    """初始化公司画像 — 上传财报后由AI生成（当前为占位实现）"""
    # 检查是否已存在
    existing = db.query(Company).filter(Company.id == company_code).first()
    if existing:
        return get_company_detail(db, company_code)

    # TODO: Sprint 2 — 接入 akshare 获取公司基础信息
    # TODO: Sprint 2 — 调用大模型生成画像

    # 占位：创建基本记录
    company = Company(
        id=company_code,
        name=company_code,  # 待补充
        short_name=company_code,
        position="mid",
        position_detail="待AI分析",
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    return get_company_detail(db, company_code)


def get_user_follows(db: Session, user_id: str) -> list[CompanyBasic]:
    """获取用户关注的公司列表"""
    follows = (
        db.query(UserFollow)
        .filter(UserFollow.user_id == user_id)
        .all()
    )

    result = []
    for f in follows:
        company = db.query(Company).filter(Company.id == f.company_id).first()
        if company:
            result.append(
                CompanyBasic(
                    id=company.id,
                    name=company.name,
                    code=company.id,
                    industry=company.industry or "",
                )
            )
        else:
            # 公司记录尚未生成（如刚关注但未初始化画像）
            result.append(
                CompanyBasic(
                    id=f.company_id,
                    name=f.company_id,
                    code=f.company_id,
                    industry="",
                )
            )

    return result


def follow_company(db: Session, user_id: str, company_id: str) -> None:
    """关注公司"""
    existing = (
        db.query(UserFollow)
        .filter(
            UserFollow.user_id == user_id,
            UserFollow.company_id == company_id,
        )
        .first()
    )
    if existing:
        return

    follow = UserFollow(user_id=user_id, company_id=company_id)
    db.add(follow)
    db.commit()


def unfollow_company(db: Session, user_id: str, company_id: str) -> None:
    """取消关注公司"""
    db.query(UserFollow).filter(
        UserFollow.user_id == user_id,
        UserFollow.company_id == company_id,
    ).delete()
    db.commit()
