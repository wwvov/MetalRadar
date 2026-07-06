# API 接口定义

Base URL: `/api`

## 数据动态性声明
所有字段值均来自运行时数据库或外部接口，无固定值。以下 JSON 仅展示结构，非真实数据。

## 状态说明
- ✅ 已实现
- 🔧 部分实现
- 📋 计划中（Sprint 2/3）

---

## 新闻相关 ✅

### 前端调用接口
- `GET /news?tab=all|followed_companies|sensitive_metals|macro|macro_panel|shmet_block|favorites&company=&metal=&companies=&metals=&metal_category=&source=&page=`
  → `{ news: NewsItem[], total }`

  后端从多个新闻源聚合，经实体识别、去重、LLM分类后统一返回。

  **Tab 说明:**
  | Tab | 说明 |
  |-----|------|
  | `all` | 全量新闻（排除上海金属网，该源走专属区块） |
  | `followed_companies` | 仅包含用户关注公司的新闻（按 company_entities 匹配，同时支持代码+名称兜底） |
  | `sensitive_metals` | 仅包含用户关注公司所用原材料的品种新闻 |
  | `macro` | 纯宏观/政策类（关联度 gray，排除上海金属网） |
  | `macro_panel` | 宏观快讯面板（无公司+无金属实体的纯宏观新闻，最多15条） |
  | `shmet_block` | 上海金属网专属区块（可按 metal_category=贵金属\|小金属 筛选） |
  | `favorites` | 用户收藏夹：直接查 UserFavorite 表返回全部收藏新闻，不过滤来源，最多100条 |

- `POST /news/{id}/favorite` body: `{ linked_company_id? }`
- `POST /news/{id}/read`
- `POST /news/read-all` body: `{ news_ids: string[] }` — 批量标记已读

### 新闻管理接口
- `POST /news/fetch?force=false` — 手动触发多源新闻抓取（3源聚合 + 去重 + 入库）
- `POST /news/classify?limit=50` — 使用 LLM 对未分类新闻进行智能标注（最多100条/次）
- `POST /news/refresh` — 完整刷新管道（后台异步）：抓取 → 入库 → LLM 分类
- `GET /news/refresh/status` — 查询刷新任务状态

### 后端新闻源（实际已接入）
| 来源 | 底层接口 | 说明 | 对应Tab |
|------|---------|------|---------|
| 上海金属网-快讯 | `ak.futures_news_shmet(symbol)` | 遍历所有金属品种（铜/铝/铅/锌/镍/锡/贵金属/小金属）抓取。返回时间、内容。 | 敏感品种 |
| 东方财富-全球快讯 | `ak.stock_info_global_em()` | 单次返回最近200条全球财经快讯。 | 宏观政策/全部 |
| 新浪财经-全球快讯 | `ak.stock_info_global_sina()` | 单次返回最近20条快讯。 | 宏观政策 |

### 新闻源（Sprint 3 计划扩展）
| 来源 | 底层接口 | 说明 |
|------|---------|------|
| 东方财富-个股新闻 | `ak.stock_news_em(symbol)` | 仅对已关注公司拉取，每个公司每天最多1次 |
| 财联社-电报 | `ak.stock_info_global_cls(symbol)` | 可选 "全部" 或 "重点" |

### 新闻拉取与反爬策略
- **全量拉取**：用户手动触发 `/news/refresh` 时遍历所有必要 symbol 抓取，结果统一做实体识别、去重、情绪分析后存入数据库。
- **频率控制**：
  - 同一数据源两次请求间隔不低于 **5 秒**（`SCRAPE_COOLDOWN = 5`）。
  - **自适应冷却**：连续失败时冷却时间指数增长（2s → 4s → 8s → ... → 120s 上限），成功后自动重置。
  - **数据源故障跟踪**：东财源连续失败 5 次自动跳过 10 分钟，10 次跳过 30 分钟；成功后自动恢复。
  - **空值缓存保护**：数据源失败时不再将 null 写入缓存，保留旧数据兜底。
  - 财务数据连续 API 调用间隔随机 **0.3~1.0 秒**，仅在实际发起网络请求时生效（命中缓存则跳过）。
  - 个股新闻接口 `stock_news_em` 仅对已关注公司拉取，每个公司每天最多拉取一次。
  - 同花顺相关接口必须遵守 **单次调用 + 缓存** 原则，严禁高频轮询。
- **缓存策略**：所有拉取结果以 JSON 文件缓存（`.cache/` 目录），新闻类 TTL=300s（5分钟），公司信息类 TTL=86400s（1天），报告期数据 TTL=6小时。
- **前端调用**：前端仅调用统一的 `/api/news` 聚合接口，不直接接触第三方源。

---

## 公司相关 ✅

### 前端调用接口
- `GET /companies/search?keyword=xxx`
  → `{ companies: Array<{id, name, code, industry}> }`

- `GET /companies/{id}`
  → 公司基本信息 + portrait（position, materials 列表）
  若画像数据无效（portrait_generated=false），后端自动触发后台重新生成。

- `POST /companies/init`
  multipart: `company_code`, `report_pdf`(可选)
  → 完整 portrait JSON（由大模型生成）

- `GET /companies/with-materials`
  → 获取所有已有画像材料的公司列表（用于仪表盘公司选择）

- `PUT /companies/{id}/portrait`
  → 手动编辑公司画像（position, position_detail, materials 等）

- `POST /companies/{id}/regenerate`
  → 强制重新生成公司 AI 画像

### 财务数据接口 ✅
- `GET /companies/{id}/financials`
  → 聚合财务数据，按优先级合并多源：`user_edit` > 东方财富API > `report_ai`。返回 `FinancialData`（含季度趋势 `quarters[]`、核心指标摘要、数据来源标签）。
- `POST /companies/{id}/upload-report`
  → multipart 上传财报PDF，LLM提取财务指标存入 `financial_reports` 表。同时刷新公司详情、财务数据、成本压力缓存。
- `GET /companies/{id}/cost-pressure`
  → 按公司材料返回成本压力分析（基准价、当前价、涨跌幅、压力等级、毛利率影响估算）。
- `GET /companies/{id}/divergence`
  → 股票 vs 期货价格背离分析（60日滚动相关系数 + AI解读文本）。

- `POST /companies/{id}/analyze-chain`
  → 使用 LLM 分析公司在产业链中的完整位置，生成全景流程图(Mermaid)、各环节业务说明、位置总结。结果缓存到 `company.chain_analysis` JSON 字段。

### 后端数据源（供后端实现参考）
| 来源 | 底层接口 | 说明 |
|------|---------|------|
| 东方财富-个股信息 | `ak.stock_individual_info_em(symbol)` | 传入6位数字代码，返回总股本、流通股、总市值、流通市值、行业、上市时间等。用于补全公司基础信息。 |
| 雪球-公司概况 | `ak.stock_individual_basic_info_xq(symbol)` | 传入如 `SH601127`，返回公司简介、主营业务等文本。可用于画像生成时补充业务描述。 |
| 同花顺-主营介绍 | `ak.stock_zyjs_ths(symbol)` | 传入6位数字代码，返回主营业务、产品类型、产品名称、经营范围等结构化字段。适合作为公司画像的权威业务描述来源。**注意：该接口有反爬限制，仅应在用户确认添加公司时调用一次，结果缓存至少 1 天，严禁高频调用。** |
| 东方财富-资产负债表 | `ak.stock_zcfz_em(date)` | 传入报告期如 `20240331`，返回全市场公司的资产/负债/权益等字段。关键列名：`资产-总资产`、`负债-总负债`、`股东权益合计`。 |
| 东方财富-利润表 | `ak.stock_lrb_em(date)` | 传入报告期，返回全市场公司的营业收入、营业成本、费用、利润等。**不含扣非净利润**。 |
| 东方财富-现金流量表 | `ak.stock_xjll_em(date)` | 传入报告期，返回全市场公司的经营性/投资性/融资性现金流净额。关键列名：`经营性现金流-现金流量净额`。 |
| 东方财富-财务分析指标 | `ak.stock_financial_analysis_indicator(symbol, start_year)` | **按股票代码获取**，返回86项财务指标（含`扣除非经常性损益后的净利润(元)`、资产负债率等）。用于补充 `stock_lrb_em` 缺失的扣非净利润字段。累计值需转为单季度值。 |

---

## 行情市场状态 ✅

- `GET /api/market/status`
  → 返回行情数据新鲜度与数据源状态：
  ```json
  {
    "ok": true,
    "data": {
      "spot_market_last_refresh": "2026-07-06T12:05:00",
      "futures_last_refresh": "2026-07-06T12:05:58",
      "trading_hours": true,
      "data_source_status": {
        "eastmoney_blocked": false,
        "consecutive_failures": 0,
        "source_details": {
          "eastmoney": {"failures": 0, "skip_until": null}
        }
      }
    }
  }
  ```
  - `trading_hours`: 当前是否交易时段
  - `data_source_status.eastmoney_blocked`: 东财源是否被自动跳过
  - `source_details`: 各数据源故障跟踪（连续失败次数、跳过截止时间）

- `POST /api/market/refresh`
  → 手动触发行情数据刷新（交易时段内有效，后端去重防并发）

---

## 期货与仪表盘 ✅

### 仪表盘接口
- `GET /futures/dashboard/{company_id}`
  → 按公司材料返回期货行情数据：实时报价、成本压力（加权影响计算）、价格分位（过去365/730天）、迷你K线、**2026年以来涨跌幅(YTD)**

- `GET /futures/overview?company_ids=xxx,yyy`
  → 跨公司总览模式：多公司材料的价格变化汇总对比（含YTD）

- `GET /futures/prefetch`
  → 预热期货缓存（按需，不再一次性全量预热避免触发反爬）

### 期货K线 ✅
- `GET /futures/{contract}/kline?period=daily&from=&to=`
  → `{ data: [{date, open, high, low, close, volume, hold}] }`
  数据源：新浪财经 `ak.futures_zh_daily_sina(symbol)`（英文列名），回退 `futures_main_sina`。合约代码需转换为连续合约格式（品种代码+0，如 `RB0`、`LC0`）。K线日期过滤格式统一为 YYYYMMDD。

### 期货实时行情 ✅
- `GET /futures/{contract}/quote`
  → `{ contract, price, change_pct, open, high, low, volume, open_interest, timestamp }`
  数据源：新浪财经 `ak.futures_zh_realtime(symbol=品种中文名)`，`_safe_col` 列名安全解析。

### 合约映射表（关键品种）
| 画像合约 | 品种中文名 | 连续合约代码 | 说明 |
|---------|-----------|------------|------|
| LC主力 | 碳酸锂 | LC0 | 广期所，连续合约 |
| CU主力 | 沪铜 | CU0 | 上期所 |
| AL主力 | 沪铝 | AL0 | 上期所 |
| NI主力 | 沪镍 | NI0 | 上期所 |
| ZN主力 | 沪锌 | ZN0 | 上期所 |
| RB主力 | 螺纹钢 | RB0 | 上期所 |
| HC主力 | 热卷 | HC0 | 上期所 |
| AU主力 | 黄金 | AU0 | 上期所 |
| AG主力 | 白银 | AG0 | 上期所 |
| 无期货品种 | 钴 / 稀土 | 退至现货 | 通过上海金属网快讯获取现货价 |

### 其他图表数据 🔧（部分完成）
- `GET /futures/{contract}/volatility-cone` — 波动率锥 📋
- `GET /futures/{contract}/price-percentile` — 价格分位图 ✅
- `GET /companies/{id}/divergence` — 价格背离分析 ✅
- `GET /companies/{id}/cost-pressure` — 材料成本压力 ✅

---

## 股票 ✅

- `GET /stocks/{code}/kline?frequency=daily&from=&to=&adjust=`
  → `{ data: [{date, open, high, low, close, volume, amount, turn, pctChg, ...}] }`
  数据源：新浪财经 `stock_zh_a_daily` → 东财 `stock_zh_a_hist` 兜底，默认前复权。
  日期过滤格式统一为 YYYYMMDD，东财失败时不再将 null 写入缓存。

- `GET /stocks/{code}/info`
  → `{ data: {code, total_market_cap, circulating_market_cap, industry, total_shares, circulating_shares, pe, pb} }`
  数据源：东财全市场行情 `stock_zh_a_spot_em`（PE/PB/市值），`stock_individual_info_em` 兜底。
  增加东财源封禁检测，被封时跳过以避免无效请求。

---

## 用户管理 ✅

- `GET /user/follows` → `{ companies: [...] }` 获取用户关注列表
- `POST /user/follows` body: `{ company_id }` 添加关注公司
- `DELETE /user/follows/{company_id}` 取消关注

---

## AI Agent 对话 📋（Sprint 3 待实现）

- `POST /chat` body: `{ company_id, message, scenario? }`
  → `{ reply: string, chart?: { type, ... } }`
  chart 类型：line / bar / flow / gauge，具体字段见 ai-capabilities

---

## 开发/种子数据

- `POST /seed/sprint1` — 导入 Sprint 1 开发种子数据（预配3家公司 + 30+条新闻）
- `GET /health` — 健康检查
