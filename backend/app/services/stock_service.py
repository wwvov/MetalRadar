"""股票数据服务 — 从 akshare 获取A股K线和公司信息，文件缓存 + 反爬控制

数据源：
- K线: ak.stock_zh_a_hist (前复权)
- 公司信息: ak.stock_individual_info_em
- 财务数据: ak.stock_lrb_em / ak.stock_zcfz_em / ak.stock_xjll_em
"""

import json
import logging
import os
import threading
import time

import pandas as pd

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
STOCK_CACHE_TTL = 3600       # 股票K线缓存1小时（日线每天只更新一次）
STOCK_INFO_CACHE_TTL = 86400  # 公司信息缓存1天
SCRAPE_COOLDOWN = getattr(settings, "SCRAPE_COOLDOWN_SECONDS", 3)

_fetch_lock = threading.Lock()
_last_fetch_time = 0.0


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


def _cooldown():
    """反爬冷却 — 确保两次 akshare 调用之间有足够间隔"""
    global _last_fetch_time
    elapsed = time.time() - _last_fetch_time
    if elapsed < SCRAPE_COOLDOWN:
        wait = SCRAPE_COOLDOWN - elapsed
        logger.info(f"股票数据反爬冷却中，等待 {wait:.1f}s...")
        time.sleep(wait)


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
    """从 DataFrame 行中按优先级取第一个存在的列值"""
    for c in candidates:
        if c in row.index and pd.notna(row[c]):
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
        with _fetch_lock:
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
    _cooldown()

    # 方案A: 新浪源 (更稳定，不易触发反爬)
    try:
        import akshare as ak
        logger.info(f"尝试新浪源获取 {code} 日线...")
        df = ak.stock_zh_a_daily(
            symbol=f"sh{code}" if code.startswith(("6", "9")) else f"sz{code}",
            start_date="20000101",
            end_date="20991231",
            adjust=adjust,
        )
        global _last_fetch_time
        _last_fetch_time = time.time()

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
        import akshare as ak
        logger.info(f"尝试东财源获取 {code} 日线...")
        df = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date="20200101",  # 限制范围提高成功率
            end_date="20991231",
            adjust=adjust,
        )
        _last_fetch_time = time.time()

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
    """获取A股公司基本信息

    Args:
        code: 6位数字股票代码

    Returns:
        {total_market_cap, circulating_market_cap, industry, total_shares, ...}
    """
    cache_key = f"info_{code}"
    cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
    if cached and "data" in cached:
        return cached["data"]

    with _fetch_lock:
        cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
        if cached and "data" in cached:
            return cached["data"]

        _cooldown()

        try:
            import akshare as ak
            df = ak.stock_individual_info_em(symbol=code)
            global _last_fetch_time
            _last_fetch_time = time.time()

            info = {}
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

            info["code"] = code
            logger.info(f"akshare 获取 {code} 公司信息成功")
            _write_cache(cache_key, {"data": info})
            return info

        except ImportError:
            logger.error("akshare 未安装")
            raise
        except Exception as e:
            _last_fetch_time = time.time()
            logger.error(f"获取公司信息失败 {code}: {e}")
            expired = _read_cache_expired(cache_key)
            if expired and "data" in expired:
                return expired["data"]
            raise


def get_financial_data(code: str) -> dict:
    """获取公司最近2个季度的核心财务数据

    使用东财利润表接口获取营收/成本/利润（批量全市场接口，每次拉取全量）。
    资产负债表和现金流量表仅在利润表获取成功后作为补充。

    Args:
        code: 6位数字股票代码

    Returns:
        {quarters: [{period, revenue, cost, net_profit, ...}], source: 'api'}
    """
    cache_key = f"financial_{code}"
    cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
    if cached and "data" in cached:
        return cached["data"]

    with _fetch_lock:
        cached = _read_cache(cache_key, STOCK_INFO_CACHE_TTL)
        if cached and "data" in cached:
            return cached["data"]

        _cooldown()

        try:
            import akshare as ak
            import calendar
            from datetime import datetime

            # 计算最近2个报告期
            today = datetime.now()
            periods = _calc_report_periods(today, 2)

            logger.info(f"获取 {code} 财务数据，报告期: {periods}")

            quarters = []

            for period in periods:
                try:
                    # 利润表（包含营收/成本/利润）
                    df_lr = ak.stock_lrb_em(date=period)
                    global _last_fetch_time
                    _last_fetch_time = time.time()

                    company_rows = df_lr[df_lr["股票代码"] == code]
                    if company_rows.empty:
                        continue

                    row = company_rows.iloc[0]

                    quarter = {
                        "period": period[:4] + "Q" + str((int(period[4:6]) - 1) // 3 + 1),
                        "report_date": period,
                        "revenue": _safe_float(row, "营业总收入"),
                        "cost": _safe_float(row, "营业总支出-营业支出"),
                        "net_profit": _safe_float(row, "净利润"),
                        "operating_profit": _safe_float(row, "营业利润"),
                    }

                    # 资产负债表（可选，不阻塞）
                    try:
                        df_bs = ak.stock_zcfz_em(date=period)
                        _last_fetch_time = time.time()
                        bs_rows = df_bs[df_bs["股票代码"] == code]
                        if not bs_rows.empty:
                            bs_row = bs_rows.iloc[0]
                            quarter["total_assets"] = _safe_float(bs_row, "资产总计")
                            quarter["equity"] = _safe_float(bs_row, "股东权益合计")
                    except Exception:
                        pass

                    quarters.append(quarter)

                except Exception as e:
                    logger.warning(f"获取 {code} {period} 利润表失败: {e}")
                    continue

            result = {
                "code": code,
                "quarters": quarters,
                "source": "api",
            }
            _write_cache(cache_key, {"data": result})
            return result

        except ImportError:
            logger.error("akshare 未安装")
            raise
        except Exception as e:
            _last_fetch_time = time.time()
            logger.error(f"获取财务数据失败 {code}: {e}")
            expired = _read_cache_expired(cache_key)
            if expired and "data" in expired:
                return expired["data"]
            return {"code": code, "quarters": [], "source": "api"}


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


def _safe_float(df_row, col_name: str) -> float | None:
    """安全地从 DataFrame 行中提取浮点数"""
    try:
        if col_name not in df_row.index:
            return None
        val = df_row[col_name]
        if pd.isna(val) or val == "-" or val == "":
            return None
        return float(val)
    except (ValueError, TypeError):
        return None
