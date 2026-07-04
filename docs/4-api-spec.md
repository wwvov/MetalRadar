# API 接口定义

Base URL: `/api`

## 数据动态性声明
所有字段值均来自运行时数据库或外部接口，无固定值。以下 JSON 仅展示结构，非真实数据。

---

## 公司相关

### 前端调用接口
- `GET /companies/search?keyword=xxx`
  → `{ companies: Array<{id, name, code, industry}> }`

- `GET /companies/{id}`
  → 公司基本信息 + portrait（position, materials 列表）

- `POST /companies/init`
  multipart: `company_code`, `report_pdf`(可选)
  → 完整 portrait JSON（由大模型生成）

### 后端数据源（供后端实现参考）
| 来源 | 底层接口 | 说明 |
|------|---------|------|
| 东方财富-个股信息 | `ak.stock_individual_info_em(symbol)` | 传入6位数字代码，返回总股本、流通股、总市值、流通市值、行业、上市时间等。用于补全公司基础信息。 |
| 雪球-公司概况 | `ak.stock_individual_basic_info_xq(symbol)` | 传入如 `SH601127`，返回公司简介、主营业务等文本。可用于画像生成时补充业务描述。 |
| 同花顺-主营介绍 | `ak.stock_zyjs_ths(symbol)` | 传入6位数字代码，返回主营业务、产品类型、产品名称、经营范围等结构化字段。适合作为公司画像的权威业务描述来源。**注意：该接口有反爬限制，仅应在用户确认添加公司时调用一次，结果缓存至少 1 天，严禁高频调用。** |
| 东方财富-资产负债表 | `ak.stock_zcfz_em(date)` | 传入报告期如 `20240331`，返回全市场公司的资产、负债、股东权益等字段。用于提取单个公司的资产负债表数据。 |
| 东方财富-利润表 | `ak.stock_lrb_em(date)` | 传入报告期，返回全市场公司的营业收入、营业成本、费用、利润等。 |
| 东方财富-现金流量表 | `ak.stock_xjll_em(date)` | 传入报告期，返回全市场公司的经营性/投资性/融资性现金流净额及同比增长。 |

## 新闻相关

### 前端调用接口
- `GET /news?tab=all|followed_companies|sensitive_metals|macro&company=&metal=&page=`
  → `{ news: NewsItem[], total }`
  后端从多个新闻源聚合，经实体识别、去重、关联度计算后统一返回。

- `POST /news/{id}/favorite` body: `{ linked_company_id? }`
- `POST /news/{id}/read`

### 后端新闻源（供后端实现参考）
| 来源 | 底层接口 | 说明 | 对应Tab |
|------|---------|------|---------|
| 上海金属网-快讯 | `ak.futures_news_shmet(symbol)` | 遍历所有金属品种（铜/铝/铅/锌/镍/锡/贵金属/小金属）抓取。返回时间、内容。 | 敏感品种 |
| 东方财富-个股新闻 | `ak.stock_news_em(symbol)` | 传入股票代码，单次返回最近100条个股相关新闻。 | 关注公司 |
| 东方财富-财经早餐 | `ak.stock_info_cjzc_em()` | 返回全部历史财经早餐数据（标题、摘要、时间、链接）。 | 宏观政策 |
| 东方财富-全球快讯 | `ak.stock_info_global_em()` | 单次返回最近200条全球财经快讯。 | 宏观政策/全部 |
| 新浪财经-全球快讯 | `ak.stock_info_global_sina()` | 单次返回最近20条快讯。 | 宏观政策 |
| 富途牛牛-快讯 | `ak.stock_info_global_futu()` | 单次返回最近50条快讯。 | 全部 |
| 同花顺-全球直播 | `ak.stock_info_global_ths()` | 单次返回最近20条快讯。 | 全部/宏观政策 |
| 财联社-电报 | `ak.stock_info_global_cls(symbol)` | symbol 可选 "全部" 或 "重点"，返回最近20条。 | 宏观政策/敏感品种 |

### 新闻拉取与反爬策略
- **全量拉取**：后端定时（或用户手动刷新时）遍历所有必要 symbol 抓取上述接口，结果统一做实体识别、去重、情绪分析后存入数据库。
- **频率控制**：
  - 同一数据源两次请求间隔不得低于 **30 秒**。
  - 个股新闻接口 `stock_news_em` 仅对已关注公司拉取，每个公司每天最多拉取一次。
  - 同花顺相关接口（含主营介绍 `stock_zyjs_ths`）必须遵守 **单次调用 + 缓存** 原则，严禁高频轮询。
- **缓存策略**：所有拉取结果在 Redis 中缓存 5 分钟（新闻类）到 1 天（公司信息类），减少对上游的直接调用。
- **前端调用**：前端仅调用统一的 `/api/news` 聚合接口，不直接接触第三方源。

## 行情与图表

### 股票K线
- `GET /stocks/{code}/kline?frequency=daily&from=&to=&adjustflag=2`
  → `{ data: [{date, open, high, low, close, volume, amount, turn, pctChg, ...}] }`
  数据源：BaoStock `query_history_k_data_plus`，默认前复权，频率支持 daily/weekly/monthly/5/15/30/60

### 期货K线
- `GET /futures/{contract}/kline?period=daily&from=&to=`
  → `{ data: [{date, open, high, low, close, volume, hold}] }`
  数据源：新浪财经 `ak.futures_zh_daily_sina(symbol)`。合约代码需转换为连续合约格式（品种代码+0，如 `RB0`、`LC0`），或指定月份合约。默认使用连续合约。

### 期货实时行情
- `GET /futures/{contract}/quote`
  → `{ contract, price, change_pct, open, high, low, volume, open_interest, timestamp }`
  数据源：新浪财经 `ak.futures_zh_realtime(symbol=品种中文名)`。后端需根据合约映射表，将合约代码转为品种中文名，获取行情后筛选对应连续合约或主力合约。

### 合约映射表（关键品种示例）
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

### 波动率锥（后端计算）
- `GET /futures/{contract}/volatility-cone`
  → `{ periods, current_volatility, distribution }`
  基于期货K线数据计算各期限（5/10/20/60/120日）的历史波动率分布及当前波动率。

### 价格分位图（后端计算）
- `GET /futures/{contract}/price-percentile`
  → `{ current_price, year_high, year_low, percentile, base_price }`
  基于期货K线数据计算近一年价格区间及当前价百分位。

### 价格背离分析（后端计算）
- `GET /companies/{id}/divergence?material=铜`
  → `{ correlation_series, events, analysis_text }`
  后端使用股票K线和期货K线计算滚动相关系数，并由AI生成分析文本。

### 材料成本压力（后端计算）
- `GET /companies/{id}/cost-pressure`
  → `{ materials: [{ name, cost_pct, base_price, current_price, change_pct, pressure_level, estimated_margin_impact }] }`
  基于期货实时价与财报基准价计算。

## AI Agent
- `POST /chat` body: `{ company_id, message, scenario? }`
  → `{ reply: string, chart?: { type, ... } }`
  chart 类型：line / bar / flow / gauge，具体字段见 ai-capabilities