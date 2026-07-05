"""股票数据服务 — 从 akshare 获取A股K线和公司信息，文件缓存 + 反爬控制

数据源：
- K线: ak.stock_zh_a_hist (前复权)
- 公司信息: ak.stock_individual_info_em
- 财务数据: ak.stock_lrb_em / ak.stock_zcfz_em / ak.stock_xjll_em
"""

import json
import logging
import os
import time

import pandas as pd

from app.core.config import settings
from app.services._scrape_control import (
    cooldown as _cooldown,
    mark_fetch_time as _mark_fetch_time,
    retry_with_backoff as _retry_with_backoff,
    acquire_lock as _acquire_lock,
    SCRAPE_COOLDOWN,
)

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
STOCK_CACHE_TTL = 3600       # 股票K线缓存1小时（日线每天只更新一次）
STOCK_INFO_CACHE_TTL = 86400  # 公司信息缓存1天


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _get_cache_path(key: str) -> str:
    return os.path.join(CACHE_DIR, f"stock_{key}.json")


def _read_cache(key: str, ttl: int) -> dict | None:
    try:
        path = _get_cache_path(key)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_at = data.get("cached_at", 0)
        if time.time() - cached_at < ttl:
            return data
        return None
    except Exception as e:
        logger.warning(f"读取股票缓存失败 {key}: {e}")
        return None


def _read_cache_expired(key: str) -> dict | None:
    try:
        path = _get_cache_path(key)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_cache(key: str, data: dict):
    try:
        _ensure_cache_dir()
        data["cached_at"] = time.time()
        with open(_get_cache_path(key), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"写入股票缓存失败 {key}: {e}")


# ---- 按报告期缓存（跨公司共享） ----
PERIOD_CACHE_TTL = 6 * 3600  # 报告期数据6小时内不变


def _get_period_cache_path(prefix: str, period: str) -> str:
    return os.path.join(CACHE_DIR, f"{prefix}_{period}.json")


def _read_period_cache(prefix: str, period: str) -> list[dict] | None:
    """读取按报告期缓存的报表数据，返回 rows 列表或 None"""
    try:
        path = _get_period_cache_path(prefix, period)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if time.time() - data.get("cached_at", 0) < PERIOD_CACHE_TTL:
            return data.get("rows", [])
    except Exception:
        pass
    return None


def _write_period_cache(prefix: str, period: str, rows: list[dict]):
    """写入按报告期缓存的报表数据"""
    try:
        _ensure_cache_dir()
        with open(_get_period_cache_path(prefix, period), "w", encoding="utf-8") as f:
            json.dump({"rows": rows, "cached_at": time.time()}, f, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"写入期缓存失败 {prefix}_{period}: {e}")


def _parse_kline_df(df: pd.DataFrame) -> list[dict]:
    """将 akshare DataFrame 转为标准K线记录

    兼容两种列名格式:
    - stock_zh_a_hist (东财): 日期/开盘/最高/最低/收盘/成交量/成交额/换手率/涨跌幅
    - stock_zh_a_daily (新浪): date/open/high/low/close/volume
    """
    records = []
    for _, row in df.iterrows():
        date_val = _safe_col(row, ["日期", "date"])
        open_val = _safe_col(row, ["开盘", "open"])
        high_val = _safe_col(row, ["最高", "high"])
        low_val = _safe_col(row, ["最低", "low"])
        close_val = _safe_col(row, ["收盘", "close"])
        volume_val = _safe_col(row, ["成交量", "volume"])
        amount_val = _safe_col(row, ["成交额", "amount"])
        turn_val = _safe_col(row, ["换手率", "turn"])
        pct_val = _safe_col(row, ["涨跌幅", "pctChg"])

        if not date_val or not close_val:
            continue

        records.append({
            "date": str(date_val),
            "open": float(open_val) if open_val else 0,
            "high": float(high_val) if high_val else 0,
            "low": float(low_val) if low_val else 0,
            "close": float(close_val),
            "volume": int(float(volume_val)) if volume_val else 0,
            "amount": float(amount_val) if amount_val else None,
            "turn": float(turn_val) if turn_val else None,
            "pctChg": float(pct_val) if pct_val else None,
        })
    return records


def _safe_col(row, candidates: list[str]):
    """从 DataFrame 行或 dict 中按优先级取第一个存在的列值"""
    for c in candidates:
        if hasattr(row, "index"):
            if c in row.index and pd.notna(row[c]):
                return row[c]
        elif isinstance(row, dict):
            if c in row and row[c] is not None and not (isinstance(row[c], float) and pd.isna(row[c])):
                return row[c]
    return None


def _derive_weekly(daily_data: list[dict]) -> list[dict]:
    """从日线数据聚合为周线"""
    if not daily_data:
        return []
    from collections import OrderedDict
    from datetime import date as dt_date
    weeks = OrderedDict()
    for r in daily_data:
        try:
            parts = r["date"].split("-")
            d = dt_date(int(parts[0]), int(parts[1]), int(parts[2]))
            iso = d.isocalendar()
            week_key = f"{iso[0]}-W{iso[1]:02d}"
        except Exception:
            week_key = r["date"][:7]  # fallback
        if week_key not in weeks:
            weeks[week_key] = []
        weeks[week_key].append(r)

    result = []
    for bars in weeks.values():
        opens = [b["open"] for b in bars]
        highs = [b["high"] for b in bars]
        lows = [b["low"] for b in bars]
        closes = [b["close"] for b in bars]
        volumes = sum(b["volume"] for b in bars)
        result.append({
            "date": bars[0]["date"],
            "open": opens[0],
            "high": max(highs),
            "low": min(lows),
            "close": closes[-1],
            "volume": volumes,
            "amount": None,
            "turn": None,
            "pctChg": None,
        })
    return result


def _derive_monthly(daily_data: list[dict]) -> list[dict]:
    """从日线数据聚合为月线"""
    if not daily_data:
        return []
    from collections import OrderedDict
    months = OrderedDict()
    for r in daily_data:
        month_key = r["date"][:7]
        if month_key not in months:
            months[month_key] = []
        months[month_key].append(r)

    result = []
    for bars in months.values():
        opens = [b["open"] for b in bars]
        highs = [b["high"] for b in bars]
        lows = [b["low"] for b in bars]
        closes = [b["close"] for b in bars]
        volumes = sum(b["volume"] for b in bars)
        result.append({
            "date": bars[0]["date"],
            "open": opens[0],
            "high": max(highs),
            "low": min(lows),
            "close": closes[-1],
            "volume": volumes,
            "amount": None,
            "turn": None,
            "pctChg": None,
        })
    return result


def get_stock_kline(code: str, frequency: str = "daily", start_date: str = "", end_date: str = "", adjust: str = "qfq") -> list[dict]:
    """获取A股历史K线数据

    策略：
    1. 始终获取日线数据（新浪源更稳定），缓存1小时
    2. 周线/月线从日线服务器端聚合（避免额外API调用触发反爬）
    3. 新浪源失败时回退东财源

    Args:
        code: 6位数字股票代码，如 "000001"
        frequency: daily | weekly | monthly
        start_date: 起始日期 YYYYMMDD
        end_date: 结束日期 YYYYMMDD
        adjust: 复权方式 qfq(前复权) | hfq(后复权) | ""(不复权)

    Returns:
        K线记录列表 [{date, open, high, low, close, volume, amount, turn, pctChg}]
    """
    # 缓存键基于日线（周/月从日线派生）
    daily_cache_key = f"kline_{code}_daily_{adjust}"

    # 检查日线缓存
    cached_daily = _read_cache(daily_cache_key, STOCK_CACHE_TTL)
    if cached_daily and "data" in cached_daily:
        daily_data = cached_daily["data"]
        logger.info(f"股票 {code} 日线命中缓存，{len(daily_data)} 条")
    else:
        # 需要获取日线数据
        with _acquire_lock():
            cached_daily = _read_cache(daily_cache_key, STOCK_CACHE_TTL)
            if cached_daily and "data" in cached_daily:
                daily_data = cached_daily["data"]
            else:
                daily_data = _fetch_daily_kline(code, adjust, daily_cache_key)
                if not daily_data:
                    raise RuntimeError(f"无法获取 {code} 的K线数据，数据源暂不可用")

    # 按日期范围过滤
    if start_date:
        daily_data = [d for d in daily_data if d["date"] >= start_date]
    if end_date:
        daily_data = [d for d in daily_data if d["date"] <= end_date]

    # 按频率返回
    if frequency == "weekly":
        return _derive_weekly(daily_data)
    elif frequency == "monthly":
        return _derive_monthly(daily_data)
    else:
        return daily_data


def _fetch_daily_kline(code: str, adjust: str, cache_key: str) -> list[dict]:
    """获取日线数据：优先新浪源，失败回退东财源"""
    import akshare as ak

    # 方案A: 新浪源 (更稳定，不易触发反爬)
    try:
        logger.info(f"尝试新浪源获取 {code} 日线...")
        df = _retry_with_backoff(
            lambda: ak.stock_zh_a_daily(
                symbol=f"sh{code}" if code.startswith(("6", "9")) else f"sz{code}",
                start_date="20000101",
                end_date="20991231",
                adjust=adjust,
            ),
            max_retries=1,
            label=f"新浪K线 {code}",
        )

        if df is not None and not df.empty:
            daily_data = _parse_kline_df(df)
            if daily_data:
                _write_cache(cache_key, {"data": daily_data})
                logger.info(f"新浪源获取 {code} 日线成功: {len(daily_data)} 条")
                return daily_data
    except Exception as e:
        logger.warning(f"新浪源获取 {code} 失败: {e}，尝试东财源...")

    # 方案B: 东财源 (数据更全但可能被反爬)
    try:
        logger.info(f"尝试东财源获取 {code} 日线...")
        df = _retry_with_backoff(
            lambda: ak.stock_zh_a_hist(
                symbol=code,
                period="daily",
                start_date="20200101",
                end_date="20991231",
                adjust=adjust,
            ),
            max_retries=1,
            label=f"东财K线 {code}",
        )

        if df is not None and not df.empty:
            daily_data = _parse_kline_df(df)
            if daily_data:
                _write_cache(cache_key, {"data": daily_data})
                logger.info(f"东财源获取 {code} 日线成功: {len(daily_data)} 条")
                return daily_data
    except Exception as e:
        logger.warning(f"东财源获取 {code} 也失败: {e}")

    # 方案C: 过期缓存兜底
    expired = _read_cache_expired(cache_key)
    if expired and "data" in expired:
        logger.warning(f"使用过期缓存 {code}（所有数据源失败）")
        return expired["data"]

    return []


def get_stock_info(code: str) -> dict:
    """获取A股公司基本信息（市值/行业/股本等）

    双数据源（反爬友好）：
    1. stock_zh_a_spot_em — 全市场实时行情(总市值)，一次调用覆盖所有A股，
       5分钟共享缓存，大幅减少API调用次数
    2. stock_individual_info_em — 详细信息(行业/总股本)，仅兜底

    Args:
        code: 6位数字股票代码

    Returns:
        {total_market_cap, circulating_market_cap, industry, total_shares, ...}
    """
    cache_key = f"info_{code}"
    cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
    if cached and "data" in cached:
        return cached["data"]

    with _acquire_lock():
        cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
        if cached and "data" in cached:
            return cached["data"]

        import akshare as ak

        info = {"code": code, "total_market_cap": None, "circulating_market_cap": None,
                "industry": "", "total_shares": None, "circulating_shares": None,
                "pe": None, "pb": None}

        # --- 数据源1（优先）: stock_zh_a_spot_em 全市场实时行情 ---
        # 一次API调用覆盖所有A股，5分钟共享缓存，比 per-stock 调用反爬风险低得多
        try:
            spot = _get_spot_market_cache()
            for _, row in spot.iterrows():
                if str(row.get("代码", "")) == code:
                    mc = row.get("总市值")
                    info["total_market_cap"] = float(mc) if mc and mc != "-" else None
                    cmc = row.get("流通市值")
                    info["circulating_market_cap"] = float(cmc) if cmc and cmc != "-" else None
                    # 市盈率(动态) & 市净率 — akshare spot 行情包含这两个字段
                    pe_val = row.get("市盈率-动态")
                    info["pe"] = float(pe_val) if pe_val is not None and pe_val != "-" and float(pe_val) > 0 else None
                    pb_val = row.get("市净率")
                    info["pb"] = float(pb_val) if pb_val is not None and pb_val != "-" and float(pb_val) > 0 else None
                    logger.info(f"公司信息 {code} 从全市场行情获取: 市值={info['total_market_cap']}, PE={info['pe']}, PB={info['pb']}")
                    break
        except Exception as e:
            logger.warning(f"公司信息 {code} spot_em 失败: {e}")

        # --- 数据源2（兜底）: stock_individual_info_em 详细信息 ---
        # 仅在市值获取失败时尝试，减少不必要的API调用
        if info["total_market_cap"] is None:
            try:
                def _fetch_info():
                    return ak.stock_individual_info_em(symbol=code)

                df = _retry_with_backoff(_fetch_info, max_retries=1, label=f"公司信息 {code}")

                for _, row in df.iterrows():
                    key = str(row["item"])
                    val = row["value"]
                    if key == "总市值":
                        info["total_market_cap"] = float(val) if val and val != "-" else None
                    elif key == "流通市值":
                        info["circulating_market_cap"] = float(val) if val and val != "-" else None
                    elif key == "行业":
                        info["industry"] = str(val) if val else ""
                    elif key == "总股本":
                        info["total_shares"] = float(val) if val and val != "-" else None
                    elif key == "流通股":
                        info["circulating_shares"] = float(val) if val and val != "-" else None
                    elif key in ("市盈率-动态", "市盈率"):
                        info["pe"] = float(val) if val and val != "-" and float(val) > 0 else None
                    elif key in ("市净率",):
                        info["pb"] = float(val) if val and val != "-" and float(val) > 0 else None

                logger.info(f"公司信息 {code} 获取成功(individual_info)")
            except Exception as e:
                logger.warning(f"公司信息 {code} individual_info 失败: {e}")

        # 写入缓存（即使市值为空也缓存，避免反复重试触发反爬）
        _write_cache(cache_key, {"data": info})

        # 如果还是空，尝试过期缓存
        if info["total_market_cap"] is None:
            expired = _read_cache_expired(cache_key)
            if expired and "data" in expired and expired["data"].get("total_market_cap"):
                logger.warning(f"使用过期缓存 {code}")
                return expired["data"]

        return info


# 全市场实时行情缓存（跨股票共享，5分钟TTL）
_SPOT_CACHE_TTL = 300  # 5分钟
_spot_cache: dict | None = None


def _get_spot_market_cache():
    """获取全市场A股实时行情（缓存5分钟，跨股票共享）"""
    global _spot_cache
    now = time.time()
    if _spot_cache and (now - _spot_cache.get("_ts", 0) < _SPOT_CACHE_TTL):
        return _spot_cache["df"]

    import akshare as ak

    def _fetch_spot():
        return ak.stock_zh_a_spot_em()

    df = _retry_with_backoff(_fetch_spot, max_retries=2, label="全市场实时行情")
    _spot_cache = {"df": df, "_ts": now}
    logger.info(f"全市场实时行情获取成功: {len(df)} 只股票")
    return df


def get_financial_data(code: str) -> dict:
    """获取公司最近8个季度（2年）的核心财务数据

    使用东财利润表接口，按报告期缓存全市场数据（跨公司共享）。
    首次拉取一个报告期需要 ~3s，后续公司命中缓存几乎即时。

    Args:
        code: 6位数字股票代码

    Returns:
        {quarters: [{period, revenue, cost, net_profit, ...}], source: 'api'}
    """
    cache_key = f"financial_{code}"
    cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
    if cached and "data" in cached:
        return cached["data"]

    with _acquire_lock():
        cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
        if cached and "data" in cached:
            return cached["data"]

        try:
            import akshare as ak
            from datetime import datetime
            import random
            import time as time_mod

            today = datetime.now()
            # 计算最近8个报告期，过滤掉财报可能尚未披露的（<45天），取最多8个
            from datetime import timedelta
            periods = _calc_report_periods(today, 8)
            cutoff = today - timedelta(days=45)
            periods = [p for p in periods if _period_to_date(p) < cutoff][:8]
            logger.info(f"获取 {code} 财务数据，报告期: {periods}")

            # 统计实际API调用次数，控制频次避免触发反爬
            api_calls = 0
            quarters = []

            for period in periods:
                # --- 利润表 ---
                rows = _read_period_cache("lrb", period)
                if rows is None:
                    try:
                        if api_calls > 0:
                            time_mod.sleep(random.uniform(0.4, 0.9))
                        def _fetch_lrb():
                            return ak.stock_lrb_em(date=period)

                        df_lr = _retry_with_backoff(_fetch_lrb, max_retries=2, label=f"利润表 {period}")
                        rows = df_lr.to_dict(orient="records")
                        _write_period_cache("lrb", period, rows)
                        api_calls += 1
                        logger.info(f"利润表 {period} 获取成功，{len(rows)} 条记录")
                    except Exception as e:
                        logger.warning(f"利润表 {period} 获取失败（已重试）: {e}")
                        continue
                else:
                    logger.info(f"利润表 {period} 命中期缓存")

                # 从全市场数据中查找目标公司
                company_row = None
                for row in rows:
                    if str(row.get("股票代码", "")) == code:
                        company_row = row
                        break
                if company_row is None:
                    logger.info(f"公司 {code} 在 {period} 利润表中无数据（可能尚未披露）")
                    continue

                quarter = {
                    "period": period[:4] + "Q" + str((int(period[4:6]) - 1) // 3 + 1),
                    "report_date": period,
                    "revenue": _safe_float(company_row, "营业总收入"),
                    "cost": _safe_float(company_row, "营业总支出-营业支出"),
                    "net_profit": _safe_float(company_row, "净利润"),
                    "operating_profit": _safe_float(company_row, "营业利润"),
                }

                # --- 资产负债表（可选） ---
                bs_rows = _read_period_cache("bs", period)
                if bs_rows is None:
                    try:
                        if api_calls > 0:
                            time_mod.sleep(random.uniform(0.3, 0.7))
                        def _fetch_bs():
                            return ak.stock_zcfz_em(date=period)

                        df_bs = _retry_with_backoff(_fetch_bs, max_retries=1, label=f"资产负债表 {period}")
                        bs_rows = df_bs.to_dict(orient="records")
                        _write_period_cache("bs", period, bs_rows)
                        api_calls += 1
                    except Exception:
                        bs_rows = []

                for bs_row in bs_rows:
                    if str(bs_row.get("股票代码", "")) == code:
                        quarter["total_assets"] = _safe_float(bs_row, "资产-总资产")
                        quarter["equity"] = _safe_float(bs_row, "股东权益合计")
                        quarter["total_liabilities"] = _safe_float(bs_row, "负债-总负债")
                        break

                # --- 现金流量表（可选） ---
                cf_rows = _read_period_cache("cf", period)
                if cf_rows is None:
                    try:
                        if api_calls > 0:
                            time_mod.sleep(random.uniform(0.3, 0.7))
                        def _fetch_cf():
                            return ak.stock_xjll_em(date=period)

                        df_cf = _retry_with_backoff(_fetch_cf, max_retries=1, label=f"现金流量表 {period}")
                        cf_rows = df_cf.to_dict(orient="records")
                        _write_period_cache("cf", period, cf_rows)
                        api_calls += 1
                    except Exception:
                        cf_rows = []

                for cf_row in cf_rows:
                    if str(cf_row.get("股票代码", "")) == code:
                        quarter["operating_cashflow"] = _safe_float(cf_row, "经营性现金流-现金流量净额")
                        break

                quarters.append(quarter)

            # --- 扣非净利润：从财务分析指标获取（stock_lrb_em 不含此字段） ---
            try:
                if api_calls > 0:
                    time_mod.sleep(random.uniform(0.5, 1.0))
                current_year = today.year
                df_indicator = ak.stock_financial_analysis_indicator(
                    symbol=code, start_year=str(current_year - 1)
                )
                api_calls += 1
                # 构建 日期→扣非净利润 映射（数据为累计值，需转为单季度值）
                kf_map: dict[str, float] = {}  # period -> standalone value
                kf_rows = sorted(
                    df_indicator.to_dict(orient="records"),
                    key=lambda r: str(r.get("日期", ""))
                )
                prev_cumulative = 0.0
                for kf_row in kf_rows:
                    date_str = str(kf_row.get("日期", ""))  # e.g. "2024-03-31"
                    if not date_str or len(date_str) < 10:
                        continue
                    cumulative = _safe_float(kf_row, "扣除非经常性损益后的净利润(元)") or 0.0
                    period = date_str[:4] + "Q" + str((int(date_str[5:7]) - 1) // 3 + 1)
                    standalone = cumulative - prev_cumulative
                    if standalone < 0:
                        standalone = cumulative  # Q1 or reset case
                    kf_map[period] = standalone
                    prev_cumulative = cumulative

                for q in quarters:
                    if q.get("deducted_net_profit") is None:
                        q["deducted_net_profit"] = kf_map.get(q["period"])
            except Exception as e:
                logger.warning(f"扣非净利润获取失败 {code}: {e}")

            result = {
                "code": code,
                "quarters": quarters,
                "source": "api",
            }
            _write_cache(cache_key, {"data": result})
            logger.info(f"公司 {code} 财务数据完成: {len(quarters)} 个季度")
            return result

        except ImportError:
            logger.error("akshare 未安装")
            raise
        except Exception as e:
            _mark_fetch_time()
            logger.error(f"获取财务数据失败 {code}: {e}")
            expired = _read_cache_expired(cache_key)
            if expired and "data" in expired:
                return expired["data"]
            return {"code": code, "quarters": [], "source": "api"}


def _period_to_date(period_str: str):
    """将报告期字符串 '20250331' 转为 datetime 对象"""
    from datetime import datetime as dt
    return dt.strptime(period_str, "%Y%m%d")


def _calc_report_periods(today, count: int) -> list[str]:
    """计算最近N个季度末日期"""
    import calendar
    current_q_end_month = ((today.month - 1) // 3) * 3 + 3
    current_q_end_year = today.year

    if today.month < current_q_end_month or (
        today.month == current_q_end_month and today.day < 15
    ):
        current_q_end_month -= 3
        if current_q_end_month <= 0:
            current_q_end_month += 12
            current_q_end_year -= 1

    periods = []
    for i in range(count):
        q_month = current_q_end_month - i * 3
        q_year = current_q_end_year
        while q_month <= 0:
            q_month += 12
            q_year -= 1
        last_day = calendar.monthrange(q_year, q_month)[1]
        periods.append(f"{q_year}{q_month:02d}{last_day:02d}")

    return periods


def get_cost_pressure_data(db, company_id: str) -> dict:
    """获取公司材料成本压力数据（复用 futures_service）"""
    from app.services.futures_service import get_dashboard_data
    return get_dashboard_data(db, company_id)


def get_divergence_analysis(db, company_id: str, material_name: str = "") -> dict:
    """股票 vs 期货价格背离分析

    计算股票价格与敏感原材料期货价格的滚动相关系数，识别背离区间。

    Args:
        db: 数据库会话
        company_id: 公司代码
        material_name: 品种名（为空则使用成本占比最高的品种）

    Returns:
        {correlation_series, events, analysis_text, stock_code, material}
    """
    import numpy as np
    from app.models.company import Company, CompanyMaterial
    from app.services.futures_service import _get_symbol, _fetch_kline

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise ValueError(f"公司不存在: {company_id}")

    materials = db.query(CompanyMaterial).filter(
        CompanyMaterial.company_id == company_id
    ).all()

    if not materials:
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": "该公司暂无敏感品种数据，无法进行背离分析。",
            "stock_code": company_id,
            "material": "",
        }

    # 选择品种：指定或成本占比最高
    if material_name:
        target = next((m for m in materials if m.material_name == material_name), materials[0])
    else:
        materials_sorted = sorted(materials, key=lambda m: m.cost_pct or 0, reverse=True)
        target = materials_sorted[0]

    material_name = target.material_name

    # 获取期货 symbol
    symbol = _get_symbol(material_name, target.contract or "")
    if not symbol:
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": f"品种「{material_name}」无对应期货合约，无法进行背离分析。",
            "stock_code": company_id,
            "material": material_name,
        }

    # 获取期货K线
    try:
        futures_df = _fetch_kline(symbol)
    except Exception as e:
        logger.warning(f"获取期货K线失败 {symbol}: {e}")
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": f"获取品种「{material_name}」期货数据失败，无法进行背离分析。",
            "stock_code": company_id,
            "material": material_name,
        }

    # 获取股票K线（至少需要和期货数据一样长）
    from app.services.stock_service import get_stock_kline
    futures_dates = [str(row.iloc[0]) for _, row in futures_df.iterrows()]
    if not futures_dates:
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": "期货数据为空，无法进行背离分析。",
            "stock_code": company_id,
            "material": material_name,
        }

    start_date = futures_dates[0].replace("-", "")
    end_date = futures_dates[-1].replace("-", "")

    try:
        stock_kline = get_stock_kline(company_id, "daily", start_date, end_date, "qfq")
    except Exception as e:
        logger.warning(f"获取股票K线失败 {company_id}: {e}")
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": "获取股票K线数据失败，无法进行背离分析。",
            "stock_code": company_id,
            "material": material_name,
        }

    # 构建日期索引的价格序列
    stock_price_map = {d["date"]: d["close"] for d in stock_kline}

    futures_closes = [float(row.iloc[4]) for _, row in futures_df.iterrows()]

    # 对齐日期
    aligned = []
    for i, (_, row) in enumerate(futures_df.iterrows()):
        date_str = str(row.iloc[0])
        if date_str in stock_price_map:
            aligned.append({
                "date": date_str,
                "stock_close": stock_price_map[date_str],
                "futures_close": futures_closes[i],
            })

    if len(aligned) < 60:
        return {
            "correlation_series": [],
            "events": [],
            "analysis_text": f"股票与期货重叠交易日不足60天（当前{len(aligned)}天），无法计算可靠的相关系数。",
            "stock_code": company_id,
            "material": material_name,
        }

    # 计算60日滚动相关系数
    window = min(60, len(aligned) // 2)
    correlation_series = []
    stock_prices = [a["stock_close"] for a in aligned]
    futures_prices = [a["futures_close"] for a in aligned]

    for i in range(window - 1, len(aligned)):
        s_window = stock_prices[i - window + 1 : i + 1]
        f_window = futures_prices[i - window + 1 : i + 1]
        try:
            corr = np.corrcoef(s_window, f_window)[0, 1]
            if np.isnan(corr):
                corr = 0.0
        except Exception:
            corr = 0.0

        correlation_series.append({
            "date": aligned[i]["date"],
            "correlation": round(float(corr), 4),
        })

    # 识别背离事件：相关系数从正转负或从负转正
    events = []
    for i in range(1, len(correlation_series)):
        prev = correlation_series[i - 1]["correlation"]
        curr = correlation_series[i]["correlation"]
        if prev > 0 and curr < -0.3:
            events.append({
                "date": correlation_series[i]["date"],
                "type": "negative_divergence",
                "description": f"股票与{target.material_name}价格从正相关转为显著负相关，可能出现背离信号",
            })
        elif prev < 0 and curr > 0.3:
            events.append({
                "date": correlation_series[i]["date"],
                "type": "positive_convergence",
                "description": f"股票与{target.material_name}价格从负相关转为正相关，相关性恢复",
            })

    # 生成分析文本
    if correlation_series:
        recent_corr = correlation_series[-1]["correlation"]
        avg_corr = np.mean([c["correlation"] for c in correlation_series])

        if recent_corr > 0.5:
            analysis = f"当前股票价格与{target.material_name}价格呈显著正相关（{recent_corr:.2f}），"
            analysis += f"表明公司股价受原材料价格影响较大。原材料涨价时，股价倾向于同步上涨。"
        elif recent_corr > 0:
            analysis = f"当前股票价格与{target.material_name}价格呈弱正相关（{recent_corr:.2f}），"
            analysis += "关联度有限，股价受多因素综合影响。"
        elif recent_corr > -0.3:
            analysis = f"当前股票价格与{target.material_name}价格几乎无相关（{recent_corr:.2f}），"
            analysis += "原材料价格短期对股价影响不显著。"
        else:
            analysis = f"当前股票价格与{target.material_name}价格呈负相关（{recent_corr:.2f}），"
            analysis += "可能反映市场对成本上升侵蚀利润的担忧，或公司有有效的对冲策略。"

        if abs(recent_corr - avg_corr) > 0.3:
            analysis += f"近期相关性发生显著变化（均值{avg_corr:.2f}），值得关注。"
    else:
        analysis = "数据不足以生成分析。"

    return {
        "correlation_series": correlation_series,
        "events": events[-5:],  # 最近5个事件
        "analysis_text": analysis,
        "stock_code": company_id,
        "material": material_name,
    }


def _safe_float(row, col_name: str) -> float | None:
    """安全地从 DataFrame 行或 dict 中提取浮点数"""
    try:
        # DataFrame row: use .index to check column existence
        if hasattr(row, "index"):
            if col_name not in row.index:
                return None
        # Plain dict: use 'in' operator
        elif isinstance(row, dict):
            if col_name not in row:
                return None
        else:
            return None

        val = row[col_name]
        if pd.isna(val) or val == "-" or val == "":
            return None
        return float(val)
    except (ValueError, TypeError):
        return None
