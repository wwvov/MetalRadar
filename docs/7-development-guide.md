# 开发约束与规范

## 技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 19 + TypeScript (strict) + Vite 6 | SPA 模式，react-router-dom v7 |
| UI | TailwindCSS v4 + shadcn/ui | 禁用 Element Plus / Ant Design |
| 图表 | ECharts (echarts-for-react) | 所有图表组件接收数据 props |
| 状态管理 | React Query v5 + React Context | 组件不直接 fetch |
| 后端框架 | Python 3.10+ / FastAPI | uvicorn ASGI 服务器 |
| ORM | SQLAlchemy 2.0 | JSON 列自动序列化 |
| 数据库 | SQLite 3 (WAL模式) | 开发环境，生产可切 PostgreSQL |
| 缓存 | JSON 文件缓存 (`.cache/`) | Redis 可选（`REDIS_ENABLED=false`） |
| AI | DeepSeek API (OpenAI 兼容) | `deepseek-chat` 模型 |
| 数据源 | akshare | 金融数据接口封装 |

## 全局约束
- 禁止硬编码任何模拟数据。所有数据必须通过 React Query hooks 从 API 获取。
- 每个数据获取单元一个自定义 Hook，文件放在 `hooks/`。
- 所有组件必须处理三态：Loading（骨架屏）、Empty（空状态引导）、Error（重试按钮）。
- 字段名、类型、接口结构必须与 `api-spec.md` 100% 一致，不得捏造。
- 所有动态数据（新闻内容、公司信息、行情数值）必须在运行时通过 API 获取，不得在代码中留下任何固定的样板文本或数值。
- 不允许频繁调取数据源的 API，避免反爬机制。
- 后端 API 层仅做参数校验和路由，业务逻辑在 `services/` 层。

## 股票数据接入说明
- **数据源**：BaoStock `query_history_k_data_plus` 获取K线；东方财富 `stock_individual_info_em`、雪球 `stock_individual_basic_info_xq`、同花顺 `stock_zyjs_ths` 获取基本信息。
- **复权**：K线统一使用前复权 (`adjustflag=2`)。
- **代码格式**：前端传入纯数字代码；后端需转换为 BaoStock 格式 (`sh.xxx` / `sz.xxx`)；调用东财接口时用数字代码，雪球需加前缀。
- **限频与缓存**：同花顺接口对 IP 频率敏感，只能在用户最终确认添加公司时调用一次，结果缓存 1 天。

## 财务报表数据接入
- **数据源**：东方财富数据中心，通过 akshare 批量获取。
  - 资产负债表：`stock_zcfz_em(date)` → 资产/负债/权益
  - 利润表：`stock_lrb_em(date)` → 营收/成本/利润
  - 现金流量表：`stock_xjll_em(date)` → 经营性现金流等
- **获取方式**：查看某公司详情时，拉取最近4个季度的全市场数据，筛选该公司记录，缓存一天。
- **字段映射**：`营业总收入`→营业收入，`营业总支出-营业支出`→营业成本，`净利润`→净利润，`经营性现金流-现金流量净额`→经营现金流。

## 期货数据接入
- **数据源**：新浪财经 akshare 接口。
  - 历史K线：`futures_zh_daily_sina(symbol)`，支持连续合约（品种代码+0）和具体月份合约。
  - 实时行情：`futures_zh_realtime(symbol=品种中文名)`，获取当前交易日所有合约行情后按需筛选。
- **合约映射**：后端维护常量表 `CONTRACT_MAP`，将画像中的 `contract`（如 `LC主力`）映射为连续合约代码（如 `LC0`）和品种中文名（如"碳酸锂"）。
- **无期货品种**：如钴、稀土，使用上海金属网现货快讯作为价格来源。
- **缓存预热**：应用启动时后台线程自动预热所有已知品种的期货数据。

## 新闻数据接入与反爬

### 已接入新闻源（3个）
| 来源 | akshare 函数 | 说明 |
|------|-------------|------|
| 上海金属网 | `futures_news_shmet(symbol)` | 遍历金属品种抓取，标题从内容前100字符截取 |
| 东方财富全球快讯 | `stock_info_global_em()` | 最近200条 |
| 新浪财经全球快讯 | `stock_info_global_sina()` | 最近20条 |

### 计划扩展（Sprint 3）
| 来源 | akshare 函数 | 条件 |
|------|-------------|------|
| 东方财富个股新闻 | `stock_news_em(symbol)` | 仅已关注公司，每公司每天1次 |
| 财联社电报 | `stock_info_global_cls(symbol)` | 冷却60秒 |

### 拉取与缓存策略
- 用户手动刷新 (`/news/refresh`) 时触发一次全量聚合；禁止定时自动高频拉取。
- 同源请求间隔 **5 秒**（`SCRAPE_COOLDOWN = 5`）。
- JSON 文件缓存 `.cache/news_raw.json`，TTL=300s（5分钟）。
- **去重**：基于 `source:title` 的 MD5 哈希。
- **处理管线**：拉取 → 解析 → 实体识别与情绪分析（LLM 批量分类）→ 关联度计算 → 入库 → 前端按 Tab 查询。

## LLM 新闻分类管线

1. 新闻入库时 `event_type = ""`（标记为未分类）
2. `/news/refresh` 后台任务分两步：抓取 → LLM 分类
3. 每批 BATCH_SIZE=15 条，调用 DeepSeek API 进行结构化标注
4. 分类结果写入 `company_entities`（6位数字股票代码）、`metal_entities`、`relevance_level`、`emotion`、`event_type`、`tags`
5. `followed_companies` 查询同时按股票代码和公司名称匹配（兜底兼容历史数据）

## React Query 使用范例
```typescript
// hooks/useNews.ts
import { useQuery } from '@tanstack/react-query';
import { newsService } from '@/services/newsService';

export function useNews(tab: string, filters?: { company?: string; metal?: string }) {
  return useQuery({
    queryKey: ['news', tab, filters],
    queryFn: () => newsService.getNews(tab, filters),
    staleTime: 60 * 1000,
  });
}
```

组件中使用：
```typescript
const { data, isLoading, error, refetch } = useNews('followed_companies', { company: '赛力斯' });
if (isLoading) return <NewsSkeleton />;
if (error) return <ErrorCard onRetry={refetch} />;
```

## ECharts 图表规范
- 封装为独立组件，接收数据 props。
- 通用配置（颜色、tooltip、grid）集中在 utils/echarts-config.ts。
- K线图：series.type: 'candlestick'，数据格式 [open, close, low, high]。
- 桑基图：series.type: 'sankey'，数据格式 {nodes, links}。
- 仪表盘：使用 ECharts 的 gauge + heatmap + line 组合。
- 图表的数据完全来自 props，组件内部不预设任何数据。

## UI 组件要求
- 必须使用 shadcn/ui 组件（Card, Tabs, Dialog, Drawer, Select, Badge, Skeleton, Tooltip 等）。
- 样式使用 TailwindCSS（v4，`@tailwindcss/vite` 插件），禁止内联样式或 CSS Modules。
- 图标使用 `lucide-react`。

## 开发里程碑（按实际完成状态）

### Sprint 1 ✅ 已完成
- 首页新闻聚合（3源 → 去重 → LLM分类 → 多Tab筛选）
- 我的关注（搜索/添加/删除公司、AI画像生成、手动编辑）
- 新闻收藏/关联公司/批量已读
- 上海金属网快讯专属区块
- 宏观跑马灯
- 种子数据（3家公司 + 30+条新闻）

### Sprint 2 🔧 进行中
- 公司详情页（占位中）
- K线图/财务卡片/成本压力仪表（后端 service 已实现，前端 API 路由待对接）
- 敏感金属仪表盘 ✅ 已完成（MetalPriceDashboard：实时报价、成本压力、价格分位热力图、迷你K线、跨公司总览）
- 期货深度数据：报价 ✅ | 分位图 ✅ | 波动率锥 📋 | 背离分析 📋
- 公司详情股票K线 📋

### Sprint 3 📋 规划中
- AI Agent 对话（三个场景：风险扫描/事件推演/自由问答）
- 内嵌图表渲染（line/bar/flow/gauge）
- 新闻源扩展（个股新闻、财联社）
- Redis 缓存切换
- PostgreSQL 生产环境迁移
