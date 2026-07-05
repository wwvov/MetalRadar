"""期货数据服务 — 从 akshare 获取主力合约行情，文件缓存 + 反爬控制"""

import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta

import pandas as pd

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
# 价格数据缓存 TTL：60 秒（比新闻短，价格变化快）
FUTURES_CACHE_TTL = 60
# 反爬间隔
SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 5)

# 北京时区
TZ_BEIJING = timezone(timedelta(hours=8))

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

# 全局爬取锁：同一时间只允许一个请求在爬取
_last_fetch_time = 0


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _get_cache_path(symbol: str) -> str:
    return os.path.join(CACHE_DIR, f"futures_{symbol}.json")


def _read_cache(symbol: str) -> dict | None:
    """读取单个品种的缓存"""
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


def _write_cache(symbol: str, data: dict):
    """写入缓存"""
    try:
        _ensure_cache_dir()
        data["cached_at"] = time.time()
        with open(_get_cache_path(symbol), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"写入期货缓存失败 {symbol}: {e}")


def _wait_cooldown():
    """反爬冷却等待"""
    global _last_fetch_time
    elapsed = time.time() - _last_fetch_time
    if elapsed < SCRAPE_COOLDOWN:
        wait = SCRAPE_COOLDOWN - elapsed
        logger.info(f"反爬冷却中，等待 {wait:.1f}s...")
        time.sleep(wait)
    _last_fetch_time = time.time()


def _fetch_kline(symbol: str) -> pd.DataFrame:
    """从 akshare 获取主力合约历史K线（带缓存）"""
    cached = _read_cache(symbol)
    if cached and "kline" in cached:
        logger.info(f"期货 {symbol} 命中缓存，{len(cached['kline'])} 条K线")
        return pd.DataFrame(cached["kline"])

    try:
        import akshare as ak
        _wait_cooldown()
        df = ak.futures_main_sina(symbol=symbol)
        logger.info(f"akshare 获取 {symbol} K线: {len(df)} 条")

        # 缓存原始数据
        kline_data = []
        for _, row in df.iterrows():
            kline_data.append({
                "date": str(row.iloc[0]),
                "open": float(row.iloc[1]),
                "high": float(row.iloc[2]),
                "low": float(row.iloc[3]),
                "close": float(row.iloc[4]),
                "volume": int(row.iloc[5]),
                "hold": int(row.iloc[6]),
            })
        _write_cache(symbol, {"kline": kline_data})

        return df
    except ImportError:
        logger.error("akshare 未安装")
        raise
    except Exception as e:
        logger.error(f"获取期货数据失败 {symbol}: {e}")
        # 尝试返回过期缓存
        try:
            path = _get_cache_path(symbol)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "kline" in data:
                    logger.warning(f"使用过期缓存 {symbol}")
                    return pd.DataFrame(data["kline"])
        except Exception:
            pass
        raise


def _get_symbol(material_name: str, contract: str = "") -> str | None:
    """解析品种名 → sina symbol"""
    # 1. 精确匹配品种名
    if material_name in CONTRACT_MAP:
        return CONTRACT_MAP[material_name]
    # 2. 尝试模糊匹配（品种名包含或包含品种名）
    for key, sym in CONTRACT_MAP.items():
        if key in material_name or material_name in key:
            return sym
    # 3. 使用 company_material.contract 字段拼接
    if contract:
        # contract 如 "CU", "AL", "LC" → symbol "CU0"
        clean = contract.strip().upper()
        if clean:
            return f"{clean}0"
    return None


def get_futures_quote(material_name: str, contract: str = "") -> dict | None:
    """获取单个品种最新报价"""
    symbol = _get_symbol(material_name, contract)
    if not symbol:
        logger.warning(f"品种 {material_name} 无对应合约映射")
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
            "price": float(latest.iloc[4]),       # 收盘价
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
    """获取近N日K线数据（用于走势图）"""
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
        # 分位：当前价在区间中的位置 (0=最低, 100=最高)
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
    """计算成本压力等级"""
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

    # 毛利率影响估算：涨跌% * 成本占比% * 弹性系数0.7
    margin_impact = None
    cp_val = float(cost_pct) if cost_pct is not None else None
    if cp_val is not None and cp_val > 0:
        margin_impact = round(change_pct * (cp_val / 100) * 0.7, 2)

    return {
        "base_price": base_price,
        "current_price": current_price,
        "change_pct": change_pct,
        "pressure_level": level,
        "estimated_margin_impact": margin_impact,
    }


def get_dashboard_data(db, company_id: str) -> dict:
    """获取仪表盘聚合数据：公司画像 + 品种报价/压力/分位/走势"""
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

    result_materials = []
    for m in materials:
        contract = m.contract or ""
        quote = get_futures_quote(m.material_name, contract)
        percentile = get_percentile(m.material_name, contract)
        history = get_futures_history(m.material_name, contract, days=60)

        pressure = None
        if quote:
            base_price = getattr(m, "base_price", None)
            pressure = calc_pressure(
                current_price=quote["price"],
                cost_pct=m.cost_pct,
                base_price=base_price,
            )

        result_materials.append({
            "material_name": m.material_name,
            "cost_pct": m.cost_pct,
            "direction": m.direction or "negative",
            "contract": m.contract or "",
            "quote": quote,
            "percentile": percentile,
            "history_3m": history,
            "pressure": pressure,
        })

    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "code": company.id,  # id 即为股票代码
            "industry": company.industry or "",
        },
        "materials": result_materials,
    }
