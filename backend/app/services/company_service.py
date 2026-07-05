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
from app.services.llm_service import generate_company_portrait, PortraitGenerationError

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
        portrait_generated=bool(company.portrait_generated),
        portrait_updated_at=company.portrait_updated_at,
    )


def _looks_like_stock_code(name: str) -> bool:
    """判断名称是否像股票代码（纯6位数字）而非真实公司名"""
    return bool(name) and len(name.strip()) == 6 and name.strip().isdigit()


def _get_company_info_from_akshare(company_code: str) -> dict | None:
    """从已缓存的 A 股全量列表中查询公司基本信息（不再单独调用 akshare）"""
    stock_list = _load_stock_list()  # 复用三级缓存
    code_str = str(company_code).zfill(6)
    for stock in stock_list:
        stock_code = str(stock.get("code", "")).zfill(6)
        if stock_code == code_str:
            name = str(stock.get("name", company_code))
            # 如果缓存中的名称也像股票代码，说明缓存损坏，不返回
            if _looks_like_stock_code(name):
                logger.warning(f"缓存中 {company_code} 的名称为股票代码 '{name}'，缓存可能损坏")
                continue
            return {
                "name": name,
                "code": code_str,
            }
    logger.info(f"Company {company_code} not found in stock list cache")
    return None


def _is_portrait_meaningful(company: Company) -> bool:
    """判断已有画像是否有实际意义（非占位/空数据）"""
    if not company.portrait_generated:
        return False
    # 占位画像的特征：position_detail 为"待AI分析"且无 industry
    if company.position_detail == "待AI分析" and not company.industry:
        return False
    # 有行业信息 或 有品种 即认为有意义
    if company.industry or (company.materials and len(company.materials) > 0):
        return True
    return False


def init_company_profile(
    db: Session, company_code: str, report_text: str | None = None, company_name: str = "",
    *, llm_timeout: float = 60, llm_retries: int = 3,
) -> CompanyDetailOut:
    """初始化公司画像 — 获取公司信息后调用大模型生成完整画像

    Args:
        llm_timeout: LLM 超时秒数（自动修复用15秒，手动操作用60秒）
        llm_retries: LLM 重试次数（自动修复用1次，手动操作用3次）

    Raises:
        PortraitGenerationError: LLM 调用失败，调用方应处理
    """
    company_code = str(company_code).zfill(6)

    # 检查是否已存在有效画像
    existing = db.query(Company).filter(Company.id == company_code).first()
    if existing and _is_portrait_meaningful(existing):
        logger.info(f"公司 {company_code} 已有有效画像，直接返回")
        return get_company_detail(db, company_code)

    if existing and existing.portrait_generated:
        logger.info(f"公司 {company_code} 画像为占位数据，将重新生成")

    # 解析公司名称：如果传入的名称像股票代码或为空，从缓存查真实名称
    company_info = None
    industry_hint = ""

    if not company_name or _looks_like_stock_code(company_name):
        if _looks_like_stock_code(company_name):
            logger.info(f"公司名称 '{company_name}' 像股票代码，从缓存查真实名称")
        company_info = _get_company_info_from_akshare(company_code)
        if company_info and not _looks_like_stock_code(company_info["name"]):
            company_name = company_info["name"]
        elif not company_name:
            company_name = company_code
        # else: 前端已传有效名称，保留使用
    else:
        # 前端已传真实名称，但也可以从缓存获取行业提示
        pass

    # 尝试获取行业信息作为 LLM 提示
    if company_info:
        industry_hint = company_info.get("industry", "")

    # --- 提取并持久化财报数据（如有上传 PDF） ---
    if report_text and report_text.strip():
        try:
            from app.services.llm_service import extract_financial_report, FinancialExtractionError
            financial_data = extract_financial_report(
                report_text,
                company_name,
                timeout=llm_timeout,
                max_retries=llm_retries,
            )

            if financial_data.get("report_period"):
                # Upsert: 同公司+同报告期 → 更新而非重复创建
                existing_report = (
                    db.query(FinancialReport)
                    .filter(
                        FinancialReport.company_id == company_code,
                        FinancialReport.report_period == financial_data["report_period"],
                    )
                    .first()
                )

                if existing_report:
                    existing_report.revenue = financial_data.get("revenue")
                    existing_report.cost = financial_data.get("cost")
                    existing_report.gross_margin = financial_data.get("gross_margin")
                    existing_report.direct_material_pct = financial_data.get("direct_material_pct")
                    existing_report.direct_labor_pct = financial_data.get("direct_labor_pct")
                    existing_report.manufacturing_pct = financial_data.get("manufacturing_pct")
                    existing_report.raw_data = financial_data.get("raw_data")
                    logger.info(f"已更新财报记录: {company_name} {financial_data['report_period']}")
                else:
                    report_record = FinancialReport(
                        company_id=company_code,
                        report_period=financial_data["report_period"],
                        revenue=financial_data.get("revenue"),
                        cost=financial_data.get("cost"),
                        gross_margin=financial_data.get("gross_margin"),
                        direct_material_pct=financial_data.get("direct_material_pct"),
                        direct_labor_pct=financial_data.get("direct_labor_pct"),
                        manufacturing_pct=financial_data.get("manufacturing_pct"),
                        raw_data=financial_data.get("raw_data"),
                    )
                    db.add(report_record)
                    logger.info(f"已保存财报记录: {company_name} {financial_data['report_period']}")
            else:
                logger.warning(f"财报数据提取未返回 report_period: {company_name}")

        except FinancialExtractionError as e:
            logger.warning(f"财报数据提取失败（不影响画像生成）: {company_name}: {e}")
        except Exception as e:
            logger.error(f"财报数据提取异常: {company_name}: {type(e).__name__}: {e}")
    # --- 财报提取结束 ---

    # 调用大模型生成画像 — 失败时抛出 PortraitGenerationError
    logger.info(f"正在为 {company_name}({company_code}) 生成AI画像...")
    portrait_data = generate_company_portrait(
        company_name=company_name,
        company_code=company_code,
        industry_hint=industry_hint,
        report_text=report_text,
        timeout=llm_timeout,
        max_retries=llm_retries,
    )

    # 验证画像质量
    materials = portrait_data.get("materials", [])
    is_fallback = (
        portrait_data.get("position_detail") == "待AI分析"
        and not portrait_data.get("industry")
        and len(materials) == 0
    )

    # 保存或更新公司记录
    if existing:
        existing.name = company_name
        if not is_fallback:
            existing.industry = portrait_data.get("industry", "") or existing.industry
            existing.business_desc = portrait_data.get("business_desc", "") or existing.business_desc
            existing.position = portrait_data.get("position", "mid")
            existing.position_detail = portrait_data.get("position_detail", "")
            existing.portrait_generated = True
            existing.portrait_updated_at = datetime.utcnow()
            # 清除旧材料记录，重新生成
            db.query(CompanyMaterial).filter(CompanyMaterial.company_id == company_code).delete()
        else:
            # 占位画像：只更新名称，保持 portrait_generated=False 以便后续重试
            existing.portrait_generated = False
            existing.position = portrait_data.get("position", "mid")
            existing.position_detail = portrait_data.get("position_detail", "")
    else:
        company = Company(
            id=company_code,
            name=company_name,
            short_name=company_name,
            industry=portrait_data.get("industry", ""),
            business_desc=portrait_data.get("business_desc", ""),
            position=portrait_data.get("position", "mid"),
            position_detail=portrait_data.get("position_detail", ""),
            portrait_generated=not is_fallback,  # 占位画像不标记为已生成
            portrait_updated_at=datetime.utcnow() if not is_fallback else None,
        )
        db.add(company)

    # 保存敏感品种列表（仅当非占位时）
    if not is_fallback:
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

    if not is_fallback:
        logger.info(f"公司画像已保存: {company_name}({company_code}), {len(materials)} 个敏感品种")
    else:
        logger.warning(f"公司画像为占位数据: {company_name}({company_code})，portrait_generated=False")

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


def init_company_profile_fallback(
    db: Session, company_code: str
) -> CompanyDetailOut:
    """LLM不可用时创建占位公司记录 — 保存正确公司名，标记 portrait_generated=False 以便后续重试"""
    company_code = str(company_code).zfill(6)

    existing = db.query(Company).filter(Company.id == company_code).first()

    # 从 akshare 缓存查找公司名；若查不到或仍为股票代码则用代码作名称
    company_info = _get_company_info_from_akshare(company_code)
    if company_info and not _looks_like_stock_code(company_info["name"]):
        company_name = company_info["name"]
    else:
        company_name = company_code

    if existing:
        existing.name = company_name
        existing.portrait_generated = False
    else:
        company = Company(
            id=company_code,
            name=company_name,
            short_name=company_name,
            industry="",
            business_desc="",
            position="mid",
            position_detail="待AI分析 — 点击「重新生成」获取完整画像",
            portrait_generated=False,
        )
        db.add(company)

    db.commit()
    logger.info(f"占位公司记录已保存: {company_name}({company_code}), portrait_generated=False")
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


def save_financial_report(
    db: Session, company_code: str, financial_data: dict
) -> CompanyDetailOut:
    """保存财报数据 — 仅写入 financial_reports 表，不修改画像"""
    company = db.query(Company).filter(Company.id == company_code).first()
    if not company:
        raise ValueError(f"公司 {company_code} 不存在")

    report_period = financial_data.get("report_period")
    if not report_period:
        raise ValueError("缺少 report_period")

    # Upsert: 同公司+同报告期 → 更新
    existing_report = (
        db.query(FinancialReport)
        .filter(
            FinancialReport.company_id == company_code,
            FinancialReport.report_period == report_period,
        )
        .first()
    )

    raw_data = financial_data.get("raw_data") or {}
    raw_data["extraction_source"] = "report_ai"

    if existing_report:
        existing_report.revenue = financial_data.get("revenue")
        existing_report.cost = financial_data.get("cost")
        existing_report.gross_margin = financial_data.get("gross_margin")
        existing_report.direct_material_pct = financial_data.get("direct_material_pct")
        existing_report.direct_labor_pct = financial_data.get("direct_labor_pct")
        existing_report.manufacturing_pct = financial_data.get("manufacturing_pct")
        existing_report.raw_data = raw_data
        logger.info(f"已更新财报记录: {company.name} {report_period}")
    else:
        report_record = FinancialReport(
            company_id=company_code,
            report_period=report_period,
            revenue=financial_data.get("revenue"),
            cost=financial_data.get("cost"),
            gross_margin=financial_data.get("gross_margin"),
            direct_material_pct=financial_data.get("direct_material_pct"),
            direct_labor_pct=financial_data.get("direct_labor_pct"),
            manufacturing_pct=financial_data.get("manufacturing_pct"),
            raw_data=raw_data,
        )
        db.add(report_record)
        logger.info(f"已保存财报记录: {company.name} {report_period}")

    db.commit()
    db.refresh(company)

    return get_company_detail(db, company_code)


def get_user_follows(db: Session, user_id: str) -> list[CompanyBasic]:
    """获取用户关注的公司列表（含画像摘要）"""
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
            # 公司记录尚未生成（如刚关注但未初始化画像），返回占位
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


def get_aggregated_financials(db: Session, company_id: str) -> dict:
    """获取聚合财务数据（按优先级合并多个来源）

    优先级：
    1. financial_reports 中 extraction_source='user_edit'
    2. financial_reports 中 extraction_source='report_ai'（最新）
    3. 东方财富三大报表 API（akshare）
    4. 都无数据时返回空
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise ValueError(f"公司不存在: {company_id}")

    result = {
        "company_id": company_id,
        "company_name": company.name,
        "source": "none",
        "quarters": [],
        "direct_material_pct": None,
        "direct_labor_pct": None,
        "manufacturing_pct": None,
        "gross_margin": None,
        "revenue": None,
        "cost": None,
        "report_period": "",
    }

    # 优先级1: user_edit — 查询 raw_data JSON 中的 extraction_source 字段
    from sqlalchemy import func
    user_edit = (
        db.query(FinancialReport)
        .filter(
            FinancialReport.company_id == company_id,
            func.json_extract(FinancialReport.raw_data, '$.extraction_source') == 'user_edit',
        )
        .order_by(FinancialReport.id.desc())
        .first()
    )
    if user_edit:
        _fill_from_report(result, user_edit, "user_edit")
        if result["cost"] is None or result["gross_margin"] is None:
            _supplement_from_api(result, company_id)
        return result

    # 优先级2: report_ai — AI从财报提取
    report_ai = (
        db.query(FinancialReport)
        .filter(
            FinancialReport.company_id == company_id,
            func.json_extract(FinancialReport.raw_data, '$.extraction_source') == 'report_ai',
        )
        .order_by(FinancialReport.id.desc())
        .first()
    )
    if report_ai:
        _fill_from_report(result, report_ai, "report_ai")
        if result["cost"] is None or result["gross_margin"] is None:
            _supplement_from_api(result, company_id)
        return result

    # 优先级2b: 兼容旧数据 — 有财务数据但没有 extraction_source 标记
    legacy_report = (
        db.query(FinancialReport)
        .filter(FinancialReport.company_id == company_id)
        .order_by(FinancialReport.id.desc())
        .first()
    )
    if legacy_report:
        _fill_from_report(result, legacy_report, "report_ai")
        # 若DB报告数据不完整（缺cost/gross_margin），尝试用API补充
        if result["cost"] is None or result["gross_margin"] is None:
            logger.info(f"DB报告数据不完整，尝试API补充 {company_id}")
            _supplement_from_api(result, company_id)
        return result

    # 优先级3: 东方财富 API
    try:
        from app.services.stock_service import get_financial_data
        api_data = get_financial_data(company_id)
        if api_data and api_data.get("quarters"):
            result["source"] = "api"
            result["quarters"] = api_data["quarters"]
            # 从最新季度提取摘要
            latest = api_data["quarters"][0] if api_data["quarters"] else {}
            result["report_period"] = latest.get("period", "")
            result["revenue"] = latest.get("revenue")
            result["cost"] = latest.get("cost")
            if latest.get("revenue") and latest.get("cost"):
                result["gross_margin"] = round(
                    (latest["revenue"] - latest["cost"]) / latest["revenue"] * 100, 2
                )
            return result
    except Exception as e:
        logger.warning(f"从东方财富API获取财务数据失败 {company_id}: {e}")

    return result


def _fill_from_report(result: dict, report: FinancialReport, source: str):
    """从 FinancialReport 记录填充结果"""
    result["source"] = source
    result["report_period"] = report.report_period or ""
    result["revenue"] = float(report.revenue) if report.revenue else None
    result["cost"] = float(report.cost) if report.cost else None
    result["gross_margin"] = float(report.gross_margin) if report.gross_margin else None
    result["direct_material_pct"] = float(report.direct_material_pct) if report.direct_material_pct else None
    result["direct_labor_pct"] = float(report.direct_labor_pct) if report.direct_labor_pct else None
    result["manufacturing_pct"] = float(report.manufacturing_pct) if report.manufacturing_pct else None


def _supplement_from_api(result: dict, company_id: str):
    """用东方财富API补充DB报告中缺失的字段（cost, gross_margin等）

    合并策略：API数据不覆盖DB已有值，只填补缺失字段。
    """
    try:
        from app.services.stock_service import get_financial_data
        api_data = get_financial_data(company_id)
        if not api_data or not api_data.get("quarters"):
            return

        # 使用最新季度的数据补充
        latest = api_data["quarters"][0] if api_data["quarters"] else {}

        # 只填补DB报告中缺失的字段
        if result["cost"] is None:
            result["cost"] = latest.get("cost")
        if result["gross_margin"] is None and result["revenue"] and result["cost"]:
            result["gross_margin"] = round(
                (result["revenue"] - result["cost"]) / result["revenue"] * 100, 2
            )

        # 补充季度数据（如果DB报告没有）
        if not result["quarters"]:
            result["quarters"] = api_data["quarters"]

        # 标记为混合来源
        if result["cost"] is not None:
            result["source"] = result["source"] + "+api"
            logger.info(f"API补充 {company_id} 成功: cost={result['cost']}, gross_margin={result['gross_margin']}")
    except Exception as e:
        logger.warning(f"API补充 {company_id} 失败（不影响DB数据）: {e}")
