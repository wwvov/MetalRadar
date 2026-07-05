"""期货数据服务 — 从 akshare 获取主力合约行情，文件缓存 + 反爬控制

核心设计：每个品种 symbol 只调用一次 akshare，派生 quote/percentile/history/base_price。
使用 threading.Lock 串行化 akshare 调用，避免并发触发反爬。
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone, timedelta

import pandas as pd

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
# 期货日线数据每天更新一次，缓存 5 分钟足够
FUTURES_CACHE_TTL = 300
# 反爬冷却间隔（秒）— 同一个 akshare 调用之间的最小间隔
SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 3)

# 北京时区
TZ_BEIJING = timezone(timedelta(hours=8))

# 线程锁：确保同一时间只有一个 akshare 调用在进行
_fetch_lock = threading.Lock()
_last_fetch_time = 0.0

# 品种名 → sina symbol（主力合约）
# 支持 LLM 产出的多种品种名称变体
CONTRACT_MAP: dict[str, str] = {
    # 上期所
    "铜": "CU0", "电解铜": "CU0", "阴极铜": "CU0", "铜箔": "CU0",
    "铝": "AL0", "电解铝": "AL0", "氧化铝": "AL0",
    "锌": "ZN0", "铅": "PB0",
    "镍": "NI0", "电解镍": "NI0", "硫酸镍": "NI0",
    "锡": "SN0",
    "黄金": "AU0", "金": "AU0",
    "白银": "AG0", "银": "AG0",
    "螺纹钢": "RB0", "热卷": "HC0", "热轧卷板": "HC0",
    "不锈钢": "SS0",
    "橡胶": "RU0", "天然橡胶": "RU0",
    "沥青": "BU0",
    "燃料油": "FU0",
    "纸浆": "SP0",
    # 大商所
    "铁矿石": "I0",
    "焦煤": "JM0",
    "焦炭": "J0",
    # 广期所
    "碳酸锂": "LC0", "锂": "LC0", "锂精矿": "LC0", "氢氧化锂": "LC0",
    "工业硅": "SI0", "硅": "SI0",
    # 能化
    "原油": "SC0",
    "玻璃": "FG0",
    "纯碱": "SA0",
}

# 品种名 → 价格单位（与 CONTRACT_MAP 保持键一致）
UNIT_MAP: dict[str, str] = {
    # 上期所 — 有色金属 (元/吨)
    "铜": "元/吨", "电解铜": "元/吨", "阴极铜": "元/吨", "铜箔": "元/吨",
    "铝": "元/吨", "电解铝": "元/吨", "氧化铝": "元/吨",
    "锌": "元/吨", "铅": "元/吨",
    "镍": "元/吨", "电解镍": "元/吨", "硫酸镍": "元/吨",
    "锡": "元/吨",
    # 上期所 — 贵金属 (元/克, 元/千克)
    "黄金": "元/克", "金": "元/克",
    "白银": "元/千克", "银": "元/千克",
    # 上期所 — 黑色 (元/吨)
    "螺纹钢": "元/吨", "热卷": "元/吨", "热轧卷板": "元/吨",
    "不锈钢": "元/吨",
    "橡胶": "元/吨", "天然橡胶": "元/吨",
    "沥青": "元/吨", "燃料油": "元/吨",
    "纸浆": "元/吨",
    # 大商所 (元/吨)
    "铁矿石": "元/吨", "焦煤": "元/吨", "焦炭": "元/吨",
    # 广期所 (元/吨)
    "碳酸锂": "元/吨", "锂": "元/吨", "锂精矿": "元/吨", "氢氧化锂": "元/吨",
    "工业硅": "元/吨", "硅": "元/吨",
    # 能化
    "原油": "元/桶",
    "玻璃": "元/吨", "纯碱": "元/吨",
}


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _get_cache_path(symbol: str) -> str:
    return os.path.join(CACHE_DIR, f"futures_{symbol}.json")


def _read_cache(symbol: str) -> dict | None:
    """读取单个品种的缓存（检查 TTL）"""
    try:
        path = _get_cache_path(symbol)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_at = data.get("cached_at", 0)
        if time.time() - cached_at < FUTURES_CACHE_TTL:
            return data
        return None
    except Exception as e:
        logger.warning(f"读取期货缓存失败 {symbol}: {e}")
        return None


def _read_cache_expired(symbol: str) -> dict | None:
    """读取缓存（无视 TTL）— 用于 akshare 失败时的后备"""
    try:
        path = _get_cache_path(symbol)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_cache(symbol: str, data: dict):
    """写入缓存"""
    try:
        _ensure_cache_dir()
        data["cached_at"] = time.time()
        with open(_get_cache_path(symbol), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"写入期货缓存失败 {symbol}: {e}")


def _parse_kline_df(df: pd.DataFrame) -> list[dict]:
    """将 akshare DataFrame 转为标准 K 线记录列表"""
    records = []
    for _, row in df.iterrows():
        records.append({
            "date": str(row.iloc[0]),
            "open": float(row.iloc[1]),
            "high": float(row.iloc[2]),
            "low": float(row.iloc[3]),
            "close": float(row.iloc[4]),
            "volume": int(row.iloc[5]),
            "hold": int(row.iloc[6]),
        })
    return records


def _fetch_kline(symbol: str) -> pd.DataFrame:
    """获取单个品种主力合约全部历史K线（带缓存 + 线程安全反爬控制）

    这是所有期货数据的唯一入口。quote / percentile / history 均从此派生。
    """
    # 1. 检查缓存（锁外，快速路径）
    cached = _read_cache(symbol)
    if cached and "kline" in cached:
        logger.info(f"期货 {symbol} 命中缓存，{len(cached['kline'])} 条K线")
        return pd.DataFrame(cached["kline"])

    # 2. 获取锁，串行化 akshare 调用
    with _fetch_lock:
        # 双重检查：锁内再次检查缓存（其他线程可能已写入）
        cached = _read_cache(symbol)
        if cached and "kline" in cached:
            logger.info(f"期货 {symbol} 缓存命中（锁内双重检查）")
            return pd.DataFrame(cached["kline"])

        # 反爬冷却
        global _last_fetch_time
        elapsed = time.time() - _last_fetch_time
        if elapsed < SCRAPE_COOLDOWN:
            wait = SCRAPE_COOLDOWN - elapsed
            logger.info(f"反爬冷却中，等待 {wait:.1f}s...")
            time.sleep(wait)

        try:
            import akshare as ak
            df = ak.futures_main_sina(symbol=symbol)
            _last_fetch_time = time.time()
            logger.info(f"akshare 获取 {symbol} K线: {len(df)} 条")

            # 缓存原始数据
            kline_data = _parse_kline_df(df)
            _write_cache(symbol, {"kline": kline_data})
            return df

        except ImportError:
            logger.error("akshare 未安装")
            raise
        except Exception as e:
            _last_fetch_time = time.time()
            logger.error(f"获取期货数据失败 {symbol}: {e}")
            # 尝试返回过期缓存作为后备
            expired = _read_cache_expired(symbol)
            if expired and "kline" in expired:
                logger.warning(f"使用过期缓存 {symbol}（akshare 调用失败）")
                return pd.DataFrame(expired["kline"])
            raise


def _get_symbol(material_name: str, contract: str = "") -> str | None:
    """解析品种名 → sina symbol"""
    # 1. 精确匹配品种名
    if material_name in CONTRACT_MAP:
        return CONTRACT_MAP[material_name]
    # 2. 尝试模糊匹配
    for key, sym in CONTRACT_MAP.items():
        if key in material_name or material_name in key:
            return sym
    # 3. 使用 company_material.contract 字段拼接
    if contract:
        clean = contract.strip().upper()
        if clean:
            return f"{clean}0"
    return None


def _get_unit(material_name: str) -> str:
    """解析品种名 → 价格单位"""
    if material_name in UNIT_MAP:
        return UNIT_MAP[material_name]
    # 模糊匹配
    for key, unit in UNIT_MAP.items():
        if key in material_name or material_name in key:
            return unit
    return ""


def get_futures_quote(material_name: str, contract: str = "") -> dict | None:
    """获取单个品种最新报价"""
    symbol = _get_symbol(material_name, contract)
    if not symbol:
        return None

    try:
        df = _fetch_kline(symbol)
        if df.empty:
            return None
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest

        change_pct = 0.0
        if prev.iloc[4] and prev.iloc[4] != 0:
            change_pct = (float(latest.iloc[4]) - float(prev.iloc[4])) / float(prev.iloc[4]) * 100

        return {
            "contract": symbol,
            "date": str(latest.iloc[0]),
            "price": float(latest.iloc[4]),
            "change_pct": round(change_pct, 2),
            "open": float(latest.iloc[1]),
            "high": float(latest.iloc[2]),
            "low": float(latest.iloc[3]),
            "volume": int(latest.iloc[5]),
            "open_interest": int(latest.iloc[6]),
        }
    except Exception as e:
        logger.error(f"获取报价失败 {material_name}: {e}")
        return None


def get_futures_history(material_name: str, contract: str = "", days: int = 60) -> list[dict]:
    """获取近N日K线数据"""
    symbol = _get_symbol(material_name, contract)
    if not symbol:
        return []

    try:
        df = _fetch_kline(symbol)
        if df.empty:
            return []
        recent = df.tail(days)
        return [
            {"date": str(row.iloc[0]), "close": float(row.iloc[4])}
            for _, row in recent.iterrows()
        ]
    except Exception as e:
        logger.error(f"获取历史数据失败 {material_name}: {e}")
        return []


def get_percentile(material_name: str, contract: str = "", days: int = 252) -> dict | None:
    """计算价格分位"""
    symbol = _get_symbol(material_name, contract)
    if not symbol:
        return None

    try:
        df = _fetch_kline(symbol)
        if df.empty:
            return None
        recent = df.tail(days)
        closes = [float(row.iloc[4]) for _, row in recent.iterrows()]
        current = closes[-1]
        year_high = max(closes)
        year_low = min(closes)
        if year_high != year_low:
            percentile = round((current - year_low) / (year_high - year_low) * 100, 1)
        else:
            percentile = 50.0

        return {
            "current_price": current,
            "year_high": year_high,
            "year_low": year_low,
            "percentile": percentile,
        }
    except Exception as e:
        logger.error(f"计算分位失败 {material_name}: {e}")
        return None


def calc_pressure(
    current_price: float,
    cost_pct: float | None,
    base_price: float | None = None,
) -> dict:
    """计算成本压力等级 — 基于当前价相对基准价的涨跌幅度"""
    if base_price and base_price > 0:
        change_pct = round((current_price - base_price) / base_price * 100, 2)
    else:
        change_pct = 0.0

    abs_change = abs(change_pct)
    if abs_change < 5:
        level = "low"
    elif abs_change < 15:
        level = "medium"
    else:
        level = "high"

    return {
        "base_price": base_price,
        "current_price": current_price,
        "change_pct": change_pct,
        "pressure_level": level,
    }


def _derive_material_data(df: pd.DataFrame, material_name: str, cost_pct: float | None, base_price: float | None) -> dict:
    """从一份 K 线 DataFrame 派生单个材料的所有仪表盘数据"""
    if df.empty:
        return {
            "quote": None,
            "percentile_1y": None,
            "percentile_2y": None,
            "history_3m": [],
            "pressure": None,
            "base_price": base_price,
        }

    closes = [float(row.iloc[4]) for _, row in df.iterrows()]

    # --- auto-calculate base_price from 60-day SMA if not set ---
    calculated_base_price = base_price
    if calculated_base_price is None and len(closes) >= 60:
        # 使用最近 60 个交易日的均价作为基准价
        calculated_base_price = round(sum(closes[-60:]) / 60, 2)

    # --- quote: 最新报价 ---
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    change_pct = 0.0
    if prev.iloc[4] and prev.iloc[4] != 0:
        change_pct = (float(latest.iloc[4]) - float(prev.iloc[4])) / float(prev.iloc[4]) * 100

    quote = {
        "contract": "",  # 由调用方填入
        "date": str(latest.iloc[0]),
        "price": float(latest.iloc[4]),
        "change_pct": round(change_pct, 2),
        "open": float(latest.iloc[1]),
        "high": float(latest.iloc[2]),
        "low": float(latest.iloc[3]),
        "volume": int(latest.iloc[5]),
        "open_interest": int(latest.iloc[6]),
    }

    # --- history_3m: 近 60 日收盘价 ---
    recent_60 = df.tail(60)
    history_3m = [
        {"date": str(row.iloc[0]), "close": float(row.iloc[4])}
        for _, row in recent_60.iterrows()
    ]

    # --- percentile: 基于真实期货历史行情计算分位数 ---
    # 近 1 年（252 个交易日）
    recent_1y = closes[-252:] if len(closes) >= 252 else closes
    current_1y = recent_1y[-1]
    high_1y = max(recent_1y)
    low_1y = min(recent_1y)
    if high_1y != low_1y:
        pct_1y = round((current_1y - low_1y) / (high_1y - low_1y) * 100, 1)
    else:
        pct_1y = 50.0

    percentile_1y = {
        "current_price": current_1y,
        "year_high": high_1y,
        "year_low": low_1y,
        "percentile": pct_1y,
    }

    # 近 2 年（504 个交易日）
    recent_2y = closes[-504:] if len(closes) >= 504 else closes
    current_2y = recent_2y[-1]
    high_2y = max(recent_2y)
    low_2y = min(recent_2y)
    if high_2y != low_2y:
        pct_2y = round((current_2y - low_2y) / (high_2y - low_2y) * 100, 1)
    else:
        pct_2y = 50.0

    percentile_2y = {
        "current_price": current_2y,
        "year_high": high_2y,
        "year_low": low_2y,
        "percentile": pct_2y,
    }

    # --- pressure: 成本压力 ---
    pressure = calc_pressure(current_1y, cost_pct, calculated_base_price)

    return {
        "quote": quote,
        "percentile_1y": percentile_1y,
        "percentile_2y": percentile_2y,
        "history_3m": history_3m,
        "pressure": pressure,
        "base_price": calculated_base_price,
    }


def get_dashboard_data(db, company_id: str) -> dict:
    """获取仪表盘聚合数据 — 公司画像品种 + 期货行情 + 压力分析

    优化：先收集所有品种的唯一 symbol，每个 symbol 只调用一次 akshare。
    """
    from app.models.company import Company, CompanyMaterial

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise ValueError(f"公司不存在: {company_id}")

    materials = (
        db.query(CompanyMaterial)
        .filter(CompanyMaterial.company_id == company_id)
        .all()
    )

    # 按成本占比降序
    materials.sort(key=lambda m: m.cost_pct or 0, reverse=True)

    # --- 第一步：收集唯一 symbol，预取所有 K 线 ---
    symbol_to_df: dict[str, pd.DataFrame] = {}
    symbol_to_contract: dict[str, str] = {}

    for m in materials:
        symbol = _get_symbol(m.material_name, m.contract or "")
        if symbol and symbol not in symbol_to_df:
            try:
                symbol_to_df[symbol] = _fetch_kline(symbol)
                symbol_to_contract[symbol] = m.contract or ""
            except Exception as e:
                logger.error(f"预取 {symbol} 失败: {e}，该品种将无数据")
                symbol_to_df[symbol] = pd.DataFrame()

    # --- 第二步：为每种材料派生仪表盘数据 ---
    result_materials = []
    materials_to_update = []  # 收集需要更新 base_price 的材料

    for m in materials:
        symbol = _get_symbol(m.material_name, m.contract or "")
        contract_code = m.contract or ""

        if symbol and symbol in symbol_to_df and not symbol_to_df[symbol].empty:
            df = symbol_to_df[symbol]
            db_base_price = float(m.base_price) if getattr(m, "base_price", None) else None
            derived = _derive_material_data(df, m.material_name, float(m.cost_pct) if m.cost_pct else None, db_base_price)
            # 补充 contract 信息
            if derived["quote"]:
                derived["quote"]["contract"] = symbol
            # 若数据库中无 base_price 但自动计算出了，保存回数据库
            if db_base_price is None and derived.get("base_price") is not None:
                m.base_price = derived["base_price"]
                materials_to_update.append(m)
        else:
            derived = {
                "quote": None,
                "percentile_1y": None,
                "percentile_2y": None,
                "history_3m": [],
                "pressure": None,
                "base_price": None,
            }

        result_materials.append({
            "material_name": m.material_name,
            "unit": _get_unit(m.material_name),
            "cost_pct": float(m.cost_pct) if m.cost_pct else None,
            "direction": m.direction or "negative",
            "contract": contract_code,
            "quote": derived["quote"],
            "percentile_1y": derived["percentile_1y"],
            "percentile_2y": derived["percentile_2y"],
            "history_3m": derived["history_3m"],
            "pressure": derived["pressure"],
        })

    # 持久化自动计算的 base_price
    if materials_to_update:
        db.commit()
        logger.info(f"已为 {len(materials_to_update)} 个品种自动设置基准价")

    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "code": company.id,
            "industry": company.industry or "",
        },
        "materials": result_materials,
    }


def get_overview_data(db) -> dict:
    """获取跨公司聚合视图 — 所有公司涉及的所有唯一金属品种 + 实时价格

    用于仪表盘的"全部公司"模式。
    """
    from app.models.company import Company, CompanyMaterial

    # 查询所有有材料数据的公司
    all_materials = db.query(CompanyMaterial).all()

    # 批量加载所有涉及的公司（避免 N+1）
    company_ids = list(set(m.company_id for m in all_materials))
    companies_map: dict[str, Company] = {}
    if company_ids:
        companies = db.query(Company).filter(Company.id.in_(company_ids)).all()
        companies_map = {c.id: c for c in companies}

    # 按品种名聚合
    metal_companies: dict[str, list[dict]] = {}
    metal_info: dict[str, dict] = {}  # 品种 → {contract, direction, cost_pct}

    for m in all_materials:
        name = m.material_name
        if name not in metal_companies:
            metal_companies[name] = []
            metal_info[name] = {
                "contract": m.contract or "",
                "direction": m.direction or "negative",
                "cost_pct": float(m.cost_pct) if m.cost_pct else None,
            }
        company = companies_map.get(m.company_id)
        metal_companies[name].append({
            "company_id": m.company_id,
            "company_name": company.name if company else m.company_id,
            "cost_pct": float(m.cost_pct) if m.cost_pct else None,
            "direction": m.direction or "negative",
        })

    # 收集所有唯一 symbol
    metals = list(metal_companies.keys())
    symbol_to_df: dict[str, pd.DataFrame] = {}

    for name in metals:
        info = metal_info[name]
        symbol = _get_symbol(name, info["contract"])
        if symbol and symbol not in symbol_to_df:
            try:
                symbol_to_df[symbol] = _fetch_kline(symbol)
            except Exception as e:
                logger.error(f"概览预取 {symbol} 失败: {e}")
                symbol_to_df[symbol] = pd.DataFrame()

    # 构建返回数据
    overview_metals = []
    for name in metals:
        info = metal_info[name]
        symbol = _get_symbol(name, info["contract"])

        quote = None
        percentile_1y = None
        percentile_2y = None
        history_3m = []

        if symbol and symbol in symbol_to_df and not symbol_to_df[symbol].empty:
            df = symbol_to_df[symbol]
            base_price = info.get("base_price")
            derived = _derive_material_data(df, name, info["cost_pct"], base_price)
            if derived["quote"]:
                derived["quote"]["contract"] = symbol
            quote = derived["quote"]
            percentile_1y = derived["percentile_1y"]
            percentile_2y = derived["percentile_2y"]
            history_3m = derived["history_3m"]

        overview_metals.append({
            "material_name": name,
            "unit": _get_unit(name),
            "contract": info["contract"],
            "quote": quote,
            "percentile_1y": percentile_1y,
            "percentile_2y": percentile_2y,
            "history_3m": history_3m,
            "companies": metal_companies[name],
            "total_companies": len(metal_companies[name]),
        })

    # 按受影响公司数量降序
    overview_metals.sort(key=lambda x: x["total_companies"], reverse=True)

    return {
        "metals": overview_metals,
        "total_metals": len(overview_metals),
        "total_companies": len(set(m.company_id for m in all_materials)),
    }


def prefetch_all_symbols(db) -> dict:
    """预热缓存：拉取数据库中所有已知品种的期货数据

    应在应用启动时调用，避免首次用户请求触发逐个 akshare 调用超时。
    返回 {symbol: success} 字典。
    """
    from app.models.company import CompanyMaterial

    materials = db.query(CompanyMaterial).all()
    symbols = set()
    for m in materials:
        symbol = _get_symbol(m.material_name, m.contract or "")
        if symbol:
            symbols.add(symbol)

    if not symbols:
        logger.info("预热：无已知期货品种，跳过")
        return {}

    logger.info(f"预热：准备拉取 {len(symbols)} 个期货品种: {sorted(symbols)}")
    results = {}
    for symbol in sorted(symbols):
        try:
            _fetch_kline(symbol)
            results[symbol] = True
            logger.info(f"预热成功: {symbol}")
        except Exception as e:
            results[symbol] = False
            logger.warning(f"预热失败: {symbol}: {e}")

    success_count = sum(1 for v in results.values() if v)
    logger.info(f"预热完成: {success_count}/{len(symbols)} 成功")
    return results
