# 技术架构与目录结构

## 前端技术栈
- React 19 + TypeScript (strict)
- Next.js 15 App Router 或 Vite SPA
- TailwindCSS + **shadcn/ui**（必须，禁用 Element Plus / Ant Design）
- ECharts（通过 `echarts-for-react` 或 useRef 封装）
- React Query v5（@tanstack/react-query）管理所有服务端数据
- React Context 管理全局状态（用户、关注列表）
- React Router（若用 Vite）

## 建议目录结构
```
src/
├── app/                    # 页面路由
│   ├── page.tsx            # 首页
│   ├── company/[id]/page.tsx
│   ├── agent/page.tsx
│   └── watchlist/page.tsx
├── components/
│   ├── ui/                 # shadcn/ui 组件
│   ├── news/               # NewsCard, NewsTabs, MacroPanel
│   ├── company/            # KlineChart, FuturesChart, DivergenceCard, FinancialCards, CostPressureGauge, CostSankey, FuturesQuote, VolatilityCone, PricePercentile
│   ├── agent/              # AgentChat, AgentBubble, ChartRenderer, ScenarioButtons
│   └── watchlist/          # CompanyCard, CompanyDetail, AddCompanyDrawer, FavoriteNews
├── hooks/                  # useNews, useCompany, useFutures, useAgent (每个返回 React Query 对象)
├── services/               # api.ts (axios 实例), newsService.ts, companyService.ts, futuresService.ts, agentService.ts
├── types/                  # news.ts, company.ts, futures.ts, agent.ts (类型与接口)
├── utils/                  # echarts-config.ts, formatters.ts, cn.ts
└── providers/              # query-provider.tsx
```

## 数据流原则
- 组件不直接 fetch，必须通过自定义 Hook 调用 React Query。
- 全局状态（关注公司列表）存入 React Context。
- 所有接口定义对齐 `api-spec.md`，字段名严格一致。