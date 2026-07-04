"""公司服务 — 搜索、画像生成、关注管理"""

import json
import logging
import os
import time
from datetime import datetime
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
    PortraitUpdateIn,
)
from app.services.llm_service import generate_company_portrait

logger = logging.getLogger(__name__)

# ===== 全量 A 股列表缓存 =====
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
CACHE_FILE = os.path.join(CACHE_DIR, "stock_list.json")
CACHE_TTL_SECONDS = 86400  # 24 小时 — A股列表不频繁变动

# 内存缓存
_stock_list_cache: list[dict] | None = None

# 兜底常用公司列表（金属/新能源相关）
_FALLBACK_STOCKS = [
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


def _ensure_cache_dir():
    """确保缓存目录存在"""
    os.makedirs(CACHE_DIR, exist_ok=True)


def _read_file_cache() -> list[dict] | None:
    """从文件缓存读取股票列表（检查 TTL）"""
    try:
        if not os.path.exists(CACHE_FILE):
            return None
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_at = data.get("cached_at", 0)
        stocks = data.get("stocks", [])
        if time.time() - cached_at < CACHE_TTL_SECONDS and stocks:
            logger.info(f"Loaded {len(stocks)} stocks from file cache (age: {int(time.time() - cached_at)}s)")
            return stocks
        else:
            logger.info("File cache expired or empty")
            return None
    except Exception as e:
        logger.warning(f"Failed to read stock list cache: {e}")
        return None


def _write_file_cache(stocks: list[dict]):
    """将股票列表写入文件缓存"""
    try:
        _ensure_cache_dir()
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"cached_at": time.time(), "stocks": stocks}, f, ensure_ascii=False)
        logger.info(f"Written {len(stocks)} stocks to file cache")
    except Exception as e:
        logger.warning(f"Failed to write stock list cache: {e}")


def _load_stock_list() -> list[dict]:
    """加载全量 A 股上市公司列表（三级缓存：内存 → 文件 → akshare）"""
    global _stock_list_cache

    # L1: 内存缓存
    if _stock_list_cache is not None:
        return _stock_list_cache

    # L2: 文件缓存
    file_cache = _read_file_cache()
    if file_cache is not None:
        _stock_list_cache = file_cache
        return _stock_list_cache

    # L3: 从 akshare 获取（仅此一处调用 akshare）
    try:
        import akshare as ak
        logger.info("Fetching full A-share stock list from akshare...")
        df = ak.stock_info_a_code_name()
        _stock_list_cache = df.to_dict(orient="records")
        logger.info(f"Loaded {len(_stock_list_cache)} A-share stocks from akshare")
        _write_file_cache(_stock_list_cache)
    except Exception as e:
        logger.warning(f"Failed to load stocks from akshare: {e}, using fallback list")
        _stock_list_cache = _FALLBACK_STOCKS
        # 不缓存兜底列表到文件，下次启动仍重试 akshare

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
        portrait_updated_at=company.portrait_updated_at,
    )


def _get_company_info_from_akshare(company_code: str) -> dict | None:
    """从已缓存的 A 股全量列表中查询公司基本信息（不再单独调用 akshare）"""
    stock_list = _load_stock_list()  # 复用三级缓存
    code_str = str(company_code).zfill(6)
    for stock in stock_list:
        stock_code = str(stock.get("code", "")).zfill(6)
        if stock_code == code_str:
            return {
                "name": str(stock.get("name", company_code)),
                "code": code_str,
            }
    logger.info(f"Company {company_code} not found in stock list cache")
    return None


def init_company_profile(
    db: Session, company_code: str, report_text: str | None = None, company_name: str = ""
) -> CompanyDetailOut:
    """初始化公司画像 — 获取公司信息后调用大模型生成完整画像"""
    company_code = str(company_code).zfill(6)

    # 检查是否已存在
    existing = db.query(Company).filter(Company.id == company_code).first()
    if existing and existing.portrait_generated:
        # 已有完整画像，直接返回
        return get_company_detail(db, company_code)

    # 优先使用前端传入的公司名称；否则从 akshare 获取
    if not company_name:
        company_info = _get_company_info_from_akshare(company_code)
        company_name = company_info["name"] if company_info else company_code
        industry_hint = ""
    else:
        company_info = None  # 已有名称，不需要再查 akshare 基础信息
        industry_hint = ""

    # 尝试获取行业信息作为 LLM 提示
    if company_info:
        industry_hint = company_info.get("industry", "")

    # 调用大模型生成画像
    logger.info(f"正在为 {company_name}({company_code}) 生成AI画像...")
    portrait_data = generate_company_portrait(
        company_name=company_name,
        company_code=company_code,
        industry_hint=industry_hint,
        report_text=report_text,
    )

    # 保存或更新公司记录
    if existing:
        existing.name = company_name
        existing.industry = portrait_data.get("industry", "") or existing.industry
        existing.business_desc = portrait_data.get("business_desc", "") or existing.business_desc
        existing.position = portrait_data.get("position", "mid")
        existing.position_detail = portrait_data.get("position_detail", "")
        existing.portrait_generated = True
        existing.portrait_updated_at = datetime.utcnow()
        # 清除旧材料记录，重新生成
        db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_code).delete()
    else:
        company = Company(
            id=company_code,
            name=company_name,
            short_name=company_name,
            industry=portrait_data.get("industry", ""),
            business_desc=portrait_data.get("business_desc", ""),
            position=portrait_data.get("position", "mid"),
            position_detail=portrait_data.get("position_detail", ""),
            portrait_generated=True,
            portrait_updated_at=datetime.utcnow(),
        )
        db.add(company)

    # 保存敏感品种列表
    materials = portrait_data.get("materials", [])
    for m in materials:
        material = CompanyMaterial(
            company_id=company_code,
            material_name=m.get("material_name", ""),
            cost_pct=m.get("cost_pct"),
            source=m.get("source", "inferred"),
            direction=m.get("direction", "negative"),
            contract=m.get("contract", ""),
        )
        db.add(material)

    db.commit()

    if existing:
        db.refresh(existing)

    logger.info(f"公司画像已保存: {company_name}({company_code}), {len(materials)} 个敏感品种")
    return get_company_detail(db, company_code)


def update_company_portrait(
    db: Session, company_code: str, data: PortraitUpdateIn
) -> CompanyDetailOut:
    """更新公司画像 — 用户手动修正后保存"""
    company = db.query(Company).filter(Company.id == company_code).first()
    if not company:
        raise ValueError(f"公司 {company_code} 不存在")

    # 更新基本字段
    if data.position is not None:
        company.position = data.position
    if data.position_detail is not None:
        company.position_detail = data.position_detail
    if data.business_desc is not None:
        company.business_desc = data.business_desc

    # 更新敏感品种列表
    if data.materials is not None:
        # 清除旧记录
        db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_code).delete()
        # 写入新记录
        for m in data.materials:
            material = CompanyMaterial(
                company_id=company_code,
                material_name=m.material_name,
                cost_pct=m.cost_pct,
                source=m.source or "manual",
                direction=m.direction or "negative",
                contract=m.contract or "",
            )
            db.add(material)

    company.portrait_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(company)

    logger.info(f"公司画像已更新: {company.name}({company_code})")
    return get_company_detail(db, company_code)


def regenerate_company_portrait(
    db: Session, company_code: str, report_text: str | None = None
) -> CompanyDetailOut:
    """重新生成公司画像 — 用户更换财报后重新调用大模型"""
    company = db.query(Company).filter(Company.id == company_code).first()
    if not company:
        raise ValueError(f"公司 {company_code} 不存在")

    # 清除 portrait_generated 标记，让 init_company_profile 重新生成
    company.portrait_generated = False
    db.commit()

    return init_company_profile(db, company_code, report_text)


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
