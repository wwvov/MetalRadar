# AI 能力与工作流

## 数据动态性声明
本章中出现的所有 Prompt 输出示例，仅用于说明大模型应返回的 JSON **结构**和**字段**。实际返回内容完全取决于输入的新闻文本、公司信息或用户提问，不存在任何预设值。

## LLM 配置

- **提供商**: DeepSeek API（OpenAI 兼容接口）
- **Base URL**: `https://api.deepseek.com/v1`
- **模型**: `deepseek-chat`（可通过 `.env` 的 `LLM_MODEL` 覆盖，默认 `gpt-4o-mini`）
- **SDK**: `openai` Python 包
- **关键参数**: temperature=0.2, max_tokens=3000, timeout=90s, response_format={"type": "json_object"}

---

## 新闻实体识别与分类 ✅（已实现）

每条新闻入库后调用大模型进行批量分类（每批 BATCH_SIZE=15 条），使用以下 System Prompt：

### 金属品种清单（识别标准）
- 有色: 铜, 铝, 铅, 锌, 镍, 锡
- 贵金属: 黄金, 白银, 铂, 钯
- 小金属/新能源: 锂(碳酸锂/氢氧化锂), 钴, 稀土, 钨, 钼, 锑, 锰, 硅(工业硅), 镁, 钛, 铟, 锗, 镓, 钒, 铌
- 黑色金属: 铁矿石, 螺纹钢, 热卷(热轧卷板), 线材, 冷轧, 不锈钢, 废钢
- 能源/煤炭: 焦煤, 焦炭, 动力煤, 原油, 沥青, 燃料油, 天然气
- 其他大宗: 橡胶, 纸浆, 玻璃, 纯碱

### 事件类型（10 类）
| 类型 | 说明 |
|------|------|
| supply_disruption | 矿山停产/罢工/环保限产/运输中断/出口限制等供给端事件 |
| price_surge | 期货/现货价格大幅上涨(>2%) |
| price_drop | 期货/现货价格大幅下跌(>2%) |
| policy_favorable | 产业政策利好(降准降息/补贴/减产/收储/关税优惠) |
| monetary_policy | 央行货币政策(利率/准备金/LPR/MLF/逆回购) |
| macro_economy | 宏观经济数据/趋势(GDP/PMI/CPI/社融/进出口) |
| industry_trend | 行业发展趋势/技术突破/公司财报/机构研报 |
| demand_change | 下游需求变化(排产/订单/开工率/消费) |
| inventory_change | 库存数据(LME/SHFE/社会库存/保税区/港口) |
| geopolitical | 地缘政治/贸易争端/制裁/战争/选举 |

### 分类规则要点
1. **is_relevant**: 新闻标题或摘要中必须**明确出现**上述清单中的具体金属品种名称，才设为 true。宏观政策（降准降息、GDP/PMI/CPI 等）、地缘政治（未提具体品种）、股市大盘、非大宗产业新闻均设为 false。
2. **metal_entities**: 从新闻中提取涉及的金属品种名称（必须是清单中的标准名称）。
3. **company_entities**: 提取新闻中明确提到的 A 股上市公司 **6 位数字股票代码**（如 "601899"）。**注意：只输出代码，不要输出公司名称。** 无则空数组。
4. **relevance_level**: red(公司+金属) > yellow(仅金属) > blue(仅公司) > gray(无关联)
5. **emotion**: positive(利多) / negative(利空) / neutral(中性)
6. **event_type**: 10 选 1，无匹配用 industry_trend
7. **tags**: 2-5 个中文关键词
8. **一致性校验**: metal_entities 和 company_entities 都为空时，is_relevant 必须为 false，relevance_level 必须为 gray，emotion 必须为 neutral。

### LLM 输出格式
```json
{
  "results": [
    {
      "index": 0,
      "is_relevant": true,
      "metal_entities": ["铜", "黄金"],
      "company_entities": ["601899"],
      "relevance_level": "red",
      "emotion": "positive",
      "event_type": "price_surge",
      "tags": ["铜价", "LME", "库存新低"]
    }
  ]
}
```

### 处理管线
1. 新闻入库 → `event_type = ""`（标记为未分类）
2. `/news/classify` 或 `/news/refresh` 触发 LLM 批量分类
3. LLM 输出 JSON → 解析 → 更新对应 News 记录
4. 查询时 `followed_companies` Tab 按 `company_entities` 中的**股票代码**匹配用户关注公司（同时支持公司名称兜底，兼容历史数据）

### 存量数据重分类
若 LLM prompt 更新（如从名称改为代码格式），可通过脚本将所有已分类新闻重新传入 `classify_news_batch()` 实现存量数据格式统一。

---

## 公司画像生成 ✅（已实现）

用户提交股票代码+财报PDF → 抽取文本 → 调用大模型：

根据公司主营业务和财报附注，输出 JSON：
```json
{
  "position": "上游/中游/下游",
  "position_detail": "...",
  "materials": [
    {
      "name": "碳酸锂",
      "cost_pct": 35.0,
      "source": "财报披露 | 行业推断",
      "direction": "不利 | 有利",
      "contract": "LC主力"
    }
  ]
}
```
仅使用给定信息，成本占比未知时标注"行业推断"。

### 画像管理
- 首次添加公司时自动调用 LLM 生成画像
- 画像数据存入 `companies` 和 `company_materials` 表
- `portrait_generated=false` 表示占位数据（LLM 调用失败或 API Key 未配置）
- 用户可通过 `PUT /companies/{id}/portrait` 手动编辑
- 可通过 `POST /companies/{id}/regenerate` 强制重新生成
- 查询公司详情时若 `portrait_generated=false`，后端自动触发后台重新生成

---

### 财报数据提取 ✅（已实现）

用户上传财报PDF → 后端调用大模型提取财务指标，存入 `financial_reports` 表（`extraction_source='report_ai'`）。

#### System Prompt 核心要点（`FINANCIAL_SYSTEM_PROMPT`）

LLM 扮演中国注册会计师，从 PDF 文本中提取**扁平 JSON**：

```json
{
  "report_period": "2025Q4",
  "revenue": 423701834000.0,
  "cost": 354890000000.0,
  "net_profit": 52000000000.0,
  "gross_margin": 16.2,
  "direct_material_pct": null,
  "direct_labor_pct": null,
  "manufacturing_pct": null,
  "raw_data": {}
}
```

#### 提取规则

| 字段 | 优先级/来源 | 注意事项 |
|------|-----------|---------|
| `report_period` | 报告期/会计期间 | 格式 YYYYQN 或 YYYYHN |
| `revenue` | 合并利润表「营业收入」「营业总收入」 | 必填，通常最容易找到 |
| `cost` | 「营业成本」>「主营业务成本」>「营业总成本」 | **需区分营业成本与营业总成本**，后者含期间费用 |
| `net_profit` | 「净利润」「归属于母公司股东的净利润」 | 取合并净利润（含少数股东） |
| `gross_margin` | 报表直接给出 > 自行计算 `(revenue-cost)/revenue` | 保留1位小数 |
| `direct_material_pct` | 「营业成本构成」章节 | A股中经常缺失 → null |
| `direct_labor_pct` | 同上 | 同上 |
| `manufacturing_pct` | 同上 | 同上 |
| `raw_data` | 额外信息（供应商集中度/研发费用等），含 `net_profit` | 无则 `{}` |

#### 关键约束

1. **单位统一为元**：万元 × 10,000，亿元 × 100,000,000
2. **合并报表优先**于母公司报表
3. 只提取明确出现的数据，不确定的填 null，不编造
4. `temperature=0.1`, `max_tokens=1500`, `response_format=json_object`
5. 最多 2 次指数退避重试（2s→4s），超时 60s
6. 失败时抛出 `FinancialExtractionError`，但不阻塞画像生成（两个流程独立 try/except）
7. `net_profit` 同时写入 `raw_data.net_profit` 以供 `get_aggregated_financials` 读取

#### 数据优先级（`get_aggregated_financials`）

查询财务数据时的合并策略：

```
user_edit（用户修正）→ 东方财富 API（akshare 四大接口）→ report_ai（LLM 兜底）
```

- API 数据完整时直接返回，仅缺 `cost`/`gross_margin` 时才从 AI 报告补充
- 季度趋势 `quarters[]` 始终从 API 获取（按报告期缓存，跨公司共享）。API 来源包括：
  - `stock_lrb_em` — 利润表（营收/成本/净利润）
  - `stock_zcfz_em` — 资产负债表（总资产/总负债/股东权益）
  - `stock_xjll_em` — 现金流量表（经营性现金流净额）
  - `stock_financial_analysis_indicator` — 财务分析指标（扣非净利润等86项）
- `net_margin = net_profit / revenue × 100`，由后端自动计算
- API 完全不可用时才回退到 LLM 提取数据
- 反爬控制：连续 API 调用间隔随机 0.3~1.0s，按报告期缓存 6h，按股票代码缓存 1d

---

## AI Agent 对话 📋（Sprint 3 — 待实现）

### Agent 工具函数（计划）
- `search_risk_news(company_id, days=30)` → 从数据库查询与该公司的材料相关的风险新闻
- `get_price_trend(material, period)` → 从行情接口获取价格数据并计算趋势、分位、波动率
- `get_cost_exposure(company_id, material)` → 从 company_materials 表读取成本占比和影响方向

### Agent 对话流程（计划）
用户提问 → Planner 选择工具 → 调用工具获取实时结构化数据 → LLM 推理生成自然语言回复 + 可选 chart 参数 → 前端渲染。

### 内嵌图表 schema (ChartParam) — 计划
| type | 说明 | 参数 |
|------|------|------|
| line | 价格走势+新闻标注 | 品种名, 时间序列数据, newsMarkPoints |
| bar | 多品种/公司影响对比 | 名称列表, 影响方向, 程度标签 |
| flow | 影响路径简图 | 节点与边数据 |
| gauge | 价格分位温度计 | 当前值, 最低, 最高, 分位 |
