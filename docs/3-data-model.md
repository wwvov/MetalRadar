# 数据库核心表结构 (SQLite)

> **环境说明**: 开发环境使用 SQLite 3（WAL模式），生产环境可切换 PostgreSQL。所有 JSON 字段以 TEXT 类型存储，通过 SQLAlchemy JSON 类型自动序列化/反序列化。

## 数据动态性声明

以下所有表结构中的每一个字段，仅定义其**数据类型**和**数据来源/生成机制**，不存在任何预设的固定值或枚举选项。

- 所有 JSON 字段的数组内容完全取决于运行时实际数据。
- 所有 VARCHAR 字段的值取决于用户输入、外部数据源返回或 AI 处理结果。
- 所有 BOOLEAN、TIMESTAMP、DECIMAL 字段为系统根据实际数据计算或记录得出。

AI 在生成数据库操作代码时，必须将每个字段的值视为**从运行时数据中获取**，禁止将任何示例值硬编码为默认值或枚举项。

---

## companies
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | VARCHAR(20) PK | 股票代码，由用户搜索并确认后从第三方接口获取 |
| name | VARCHAR(100) | 公司全称，从数据接口动态获取 |
| short_name | VARCHAR(50) | 公司简称，从数据接口动态获取 |
| industry | VARCHAR(50) | 所属行业，从数据接口动态获取 |
| business_desc | TEXT | 主营业务描述，从数据接口或 AI 提取生成 |
| position | VARCHAR(20) | 由大模型根据主营业务和财报分析后动态输出，可能为 'up', 'mid', 'down' 之一，但值由 AI 决定 |
| position_detail | VARCHAR(100) | 由大模型动态生成的细分环节描述，如"锂矿采选""电池制造" |
| portrait_generated | BOOLEAN | 系统自动设置：画像数据完整时为 true，占位数据时为 false |
| portrait_updated_at | TIMESTAMP | 画像最后生成/更新时间为系统当前时间 |

## company_materials
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | SERIAL PK | 自增主键 |
| company_id | VARCHAR(20) FK | 关联的公司ID |
| material_name | VARCHAR(50) | 由大模型从公司业务和财报中识别出的原材料品种名，如"碳酸锂" |
| cost_pct | DECIMAL(5,2) | 该原材料成本占比，由大模型根据财报附注提取或行业推断估算，不同公司差异巨大 |
| source | VARCHAR(20) | 数据来源，由大模型标注：'report'（财报直接披露）或 'inferred'（行业推断） |
| direction | VARCHAR(10) | 影响方向，由大模型根据产业链位置判断：'negative'（成本上升不利）或 'positive'（产品涨价有利） |
| contract | VARCHAR(20) | 对应的期货合约代码，由系统根据 material_name 在合约映射表中查找得到 |
| base_price | DECIMAL(15,4) | 基准价格（用于成本压力计算），取自财报报告期对应的期货均价，由系统自动计算 |

## news
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | VARCHAR(50) PK | 系统自动生成，如 'news_20260703_001' |
| title | VARCHAR(200) | 新闻原始标题，来自外部数据源 |
| summary | TEXT | 新闻原始摘要，或由大模型根据全文生成 |
| source | VARCHAR(50) | 记录该新闻的抓取来源（东方财富、新浪、上海金属网等），非枚举 |
| pub_time | TIMESTAMP | 新闻发布时间，取自原始数据 |
| tags | JSON | 由新闻实体识别AI处理文本后动态生成的标签数组。包含该公司名、金属品种名、事件类型短语。每条新闻的标签完全取决于其内容和AI分析结果 |
| company_entities | JSON | 由新闻分类AI提取的A股公司6位数字股票代码数组（如 ["601899"]）。注意：统一使用代码格式，非公司名称。内容取决于新闻实际提及的公司 |
| metal_entities | JSON | 由新闻分类AI提取的金属品种数组，仅限白名单品种，但具体出现哪些品种由新闻内容决定 |
| relevance_level | VARCHAR(10) | 由新闻分类AI标注的关联等级。可能为 'red','yellow','blue','gray'，但值由AI根据实体内容判断 |
| emotion | VARCHAR(10) | 由新闻分类AI对每条新闻做情绪分析后输出的标签，值为 'positive','negative','neutral' 之一，但每条新闻独立判断 |
| is_relevant | BOOLEAN | 由新闻分类AI判断该新闻是否与商品市场相关，若是则为 true，否则 false |
| event_type | VARCHAR(30) | 由新闻分类AI选择的事件类型（10类之一）：supply_disruption, price_surge, price_drop, policy_favorable, monetary_policy, macro_economy, industry_trend, demand_change, inventory_change, geopolitical。空字符串表示未分类 |
| raw_url | VARCHAR(500) | 新闻原文链接，来自数据源 |

## user_favorites
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | SERIAL PK | 自增主键 |
| user_id | VARCHAR(50) | 当前操作用户的标识 |
| news_id | VARCHAR(50) FK | 被收藏的新闻ID |
| linked_company_id | VARCHAR(20) | 用户收藏时手动选择的关联公司ID，可为空 |

## user_follows
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| user_id | VARCHAR(50) | 用户标识 |
| company_id | VARCHAR(20) | 被关注的公司的股票代码 |

## user_reads
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | SERIAL PK | 自增主键 |
| user_id | VARCHAR(50) | 用户标识 |
| news_id | VARCHAR(50) FK | 被标记为已读的新闻ID |

## financial_reports
| 字段 | 类型 | 动态属性 |
|------|------|----------|
| id | SERIAL PK | 自增主键 |
| company_id | VARCHAR(20) FK | 公司ID |
| report_period | VARCHAR(10) | 报告期，如 '2025Q4'，由用户上传或系统解析 |
| revenue | DECIMAL(15,2) | 营业收入，由大模型从财报提取 |
| cost | DECIMAL(15,2) | 营业成本，由大模型提取 |
| gross_margin | DECIMAL(5,2) | 毛利率，可由计算得出 |
| direct_material_pct | DECIMAL(5,2) | 直接材料占成本比例，由大模型从附注提取或估算 |
| direct_labor_pct | DECIMAL(5,2) | 直接人工占成本比例 |
| manufacturing_pct | DECIMAL(5,2) | 制造费用占成本比例 |
| raw_data | JSON | 大模型从财报中提取的完整结构化数据，内容取决于财报原文 |
| report_type | VARCHAR(10) | 'annual' 或 'quarterly'，由用户上传时标注或AI自动识别 |
| extraction_source | VARCHAR(20) | 'api'（外部接口）、'report_ai'（财报AI提取）、'user_edit'（用户修正） |