# 开发约束与规范

## 全局约束
- 禁止硬编码任何模拟数据。所有数据必须通过 React Query hooks 从 API 获取。
- 每个数据获取单元一个自定义 Hook，文件放在 `hooks/`。
- 所有组件必须处理三态：Loading（骨架屏）、Empty（空状态引导）、Error（重试按钮）。
- 字段名、类型、接口结构必须与 `api-spec.md` 100% 一致，不得捏造。
- 所有动态数据（新闻内容、公司信息、行情数值）必须在运行时通过 API 获取，不得在代码中留下任何固定的样板文本或数值。
- 不允许频繁调取数据源的API，避免反爬机制

## 股票数据接入说明
- **数据源**：BaoStock `query_history_k_data_plus` 获取K线；东方财富 `stock_individual_info_em`、雪球 `stock_individual_basic_info_xq`、同花顺 `stock_zyjs_ths` 获取基本信息。
- **复权**：K线统一使用前复权 (`adjustflag=2`)。
- **代码格式**：前端传入纯数字代码；后端需转换为 BaoStock 格式 (`sh.xxx` / `sz.xxx`)；调用东财接口时用数字代码，雪球需加前缀。
- **限频与缓存**：同花顺接口对 IP 频率敏感，只能在用户最终确认添加公司时调用一次，结果存入 Redis（Key: `business:{code}`），有效期 1 天。

## 财务报表数据接入
- **数据源**：东方财富数据中心，通过 akshare 批量获取。
  - 资产负债表：`stock_zcfz_em(date)` → 资产/负债/权益
  - 利润表：`stock_lrb_em(date)` → 营收/成本/利润
  - 现金流量表：`stock_xjll_em(date)` → 经营性现金流等
- **获取方式**：查看某公司详情时，拉取最近4个季度的全市场数据，筛选该公司记录，缓存一天。
- **字段映射**：`营业总收入`→营业收入，`营业总支出-营业支出`→营业成本，`净利润`→净利润，`经营性现金流-现金流量净额`→经营现金流。
- 所有金额单位为**元**，前端展示时转换；同比数据可直接用于卡片。

## 期货数据接入
- **数据源**：新浪财经 akshare 接口。
  - 历史K线：`futures_zh_daily_sina(symbol)`，支持连续合约（品种代码+0）和具体月份合约。
  - 实时行情：`futures_zh_realtime(symbol=品种中文名)`，获取当前交易日所有合约行情后按需筛选。
- **合约映射**：后端维护常量表，将画像中的 `contract`（如 `LC主力`）映射为连续合约代码（如 `LC0`）和品种中文名（如"碳酸锂"）。
- **主力合约**：可通过 `ak.match_main_contract(exchange)` 动态获取。
- **品种列表**：`ak.futures_symbol_mark()` 获取所有可用品种中文名。
- **无期货品种**：如钴、稀土，使用上海金属网现货快讯作为价格来源。

## 新闻数据接入与反爬
- **数据源列表**：
  - 上海金属网：`futures_news_shmet`
  - 个股新闻：`stock_news_em`
  - 财经早餐：`stock_info_cjzc_em`
  - 全球快讯：`stock_info_global_em`, `stock_info_global_sina`, `stock_info_global_futu`, `stock_info_global_ths`
  - 财联社电报：`stock_info_global_cls`
- **拉取频次与缓存**：
  - 用户手动刷新时触发一次全量聚合；禁止定时自动高频拉取。
  - 个股新闻：仅对已关注公司拉取，每个公司每天最多一次。
  - 同花顺/财联社：加入 60 秒冷却，结果缓存至少 5 分钟。
- **去重**：基于标题相似度（>0.9）去重。
- **处理管线**：拉取 → 解析 → 实体识别与情绪分析 → 关联度计算 → 入库 → 前端按 Tab 查询。

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
- 波动率锥：用多个 graphic 或 custom series 实现垂直区间 + 散点当前值。
- 桑基图：series.type: 'sankey'，数据格式 {nodes, links}。
- 文件头部注释官方文档参考链接。
- 图表的数据完全来自 props，组件内部不预设任何数据。

## UI 组件要求
- 必须使用 shadcn/ui 组件（Card, Tabs, Dialog, Drawer, Select, Badge, Skeleton, Tooltip 等）。
- 样式使用 TailwindCSS，禁止内联样式或 CSS Modules。

## 开发里程碑
- Sprint 1: 首页新闻、我的关注（新增/列表）、新闻收藏/已读。
- Sprint 2: 公司详情所有图表、财务卡片、成本压力仪表、期货深度数据。
- Sprint 3: AI Agent 三个场景、内嵌图表、新闻实体识别与画像生成。