# 技术架构与目录结构

## 整体架构

- **前端**: React 19 + TypeScript (strict) + Vite SPA
- **后端**: Python FastAPI + SQLAlchemy ORM + Pydantic v2
- **数据库**: SQLite 3（开发环境，WAL模式）
- **缓存**: JSON 文件缓存（`.cache/` 目录），生产环境可切换 Redis
- **AI**: DeepSeek API（OpenAI 兼容接口）

## 前端技术栈
- React 19 + TypeScript (strict)
- Vite 6 (rolldown 打包)
- TailwindCSS v4 + `@tailwindcss/vite`
- **shadcn/ui**（必须，禁用 Element Plus / Ant Design）
- ECharts（通过 `echarts-for-react` 封装）
- Mermaid（产业链流程图渲染）
- React Query v5 (`@tanstack/react-query`) 管理所有服务端数据
- React Context 管理全局状态（用户、关注列表）
- React Router v7（`react-router-dom`）
- `lucide-react` 图标库
- oxlint（替代 ESLint）

## 后端技术栈
- Python 3.10+, FastAPI
- SQLAlchemy 2.0 ORM + SQLite
- Pydantic v2 (pydantic_settings)
- OpenAI Python SDK（对接 DeepSeek API）
- akshare（金融数据源）
- uvicorn（ASGI 服务器）

## 实际目录结构

### 前端
```
frontend/src/
├── App.tsx                 # 路由配置 (BrowserRouter)
├── main.tsx                # 应用入口
├── index.css               # 全局样式 (TailwindCSS)
├── pages/
│   ├── HomePage.tsx        # 首页：新闻聚合+仪表盘
│   ├── WatchlistPage.tsx   # 我的关注：公司管理+画像
│   ├── CompanyPage.tsx     # 公司详情（财务指标/市值走势/成本压力）
│   └── AgentPage.tsx       # AI Agent（Sprint 3 待实现）
├── components/
│   ├── ui/                 # shadcn/ui 组件 (Button, Card, Tabs, Dialog, Drawer, Badge, Skeleton, Tooltip, Slider 等)
│   ├── news/               # NewsCard, NewsSkeleton, MacroPanel, MacroTicker, ShmetBlock, MetalPriceDashboard, FavoritePopover, EmptyGuide, ErrorCard
│   ├── watchlist/          # CompanyCard, CompanyPortrait, AddCompanyDrawer, FavoriteNews, MermaidDiagram
│   └── company/            # CompanyHeader, StockKlineChart, FuturesMiniChart, DivergenceCard, FinancialMetrics, CostPressureDashboard, ReportUpload
├── hooks/                  # useNews, useCompany, useFutures, useStock, useFollows, useNewsRefresh (每个返回 React Query 对象)
├── services/               # api.ts (axios 实例), newsService.ts, companyService.ts, futuresService.ts, stockService.ts, userService.ts
├── types/                  # news.ts, company.ts, futures.ts, agent.ts (类型与接口)
├── providers/              # query-provider.tsx, watchlist-context.tsx
└── lib/                    # utils.ts (cn 工具函数)
```

### 后端
```
backend/
├── main.py                 # FastAPI 应用入口，路由注册，CORS，启动事件
├── requirements.txt        # Python 依赖
├── .env.example            # 环境变量模板 (复制为 .env 后填入实际值)
├── .cache/                 # 文件缓存 (news_raw.json, futures_*.json, stock_*.json)
├── app/
│   ├── api/                # API 路由层
│   │   ├── news.py         # 新闻 CRUD, 抓取/分类/刷新
│   │   ├── companies.py    # 公司搜索/初始化/画像管理/产业链分析/财报
│   │   ├── stocks.py       # 股票K线/公司信息(市值/PE/PB/行业)
│   │   ├── futures.py      # 期货行情/仪表盘/总览
│   │   ├── user.py         # 用户关注/收藏管理
│   │   └── seed.py         # 开发种子数据
│   ├── models/             # SQLAlchemy 模型
│   │   ├── news.py         # News
│   │   ├── company.py      # Company (含 chain_analysis JSON 列), CompanyMaterial
│   │   ├── financial.py    # FinancialReport
│   │   └── user.py         # UserFollow, UserFavorite, UserRead
│   ├── schemas/            # Pydantic 请求/响应模型
│   │   ├── news.py
│   │   ├── company.py
│   │   ├── futures.py
│   │   └── user.py
│   ├── services/           # 业务逻辑层
│   │   ├── news_fetcher.py    # 多源新闻抓取 (3个源) + 去重入库
│   │   ├── news_classifier.py # LLM 新闻批量分类 (事件/情绪/实体)
│   │   ├── news_service.py    # 新闻查询/过滤/关联度计算/收藏
│   │   ├── company_service.py # 公司搜索/画像生成/材料管理/财务数据聚合/产业链分析
│   │   ├── stock_service.py   # 股票K线/公司信息(PE/PB/市值)/财务数据/反爬控制
│   │   ├── futures_service.py # 期货K线/报价/分位/波动率锥
│   │   ├── llm_service.py     # LLM 调用封装 (画像生成/财报提取/产业链分析)
│   │   └── _scrape_control.py # 反爬控制 (冷却/重试/锁)
│   └── core/
│       ├── config.py       # 配置管理 (Settings, 从 .env 加载)
│       └── database.py     # 数据库引擎 + 会话工厂 + SQLite 迁移
```

## 数据流原则
- 组件不直接 fetch，必须通过自定义 Hook 调用 React Query。
- 全局状态（关注公司列表）存入 React Context。
- 所有接口定义对齐 `api-spec.md`，字段名严格一致。
- 后端 API 层仅做参数校验和路由，业务逻辑在 services 层。
- `.env` 文件已被 gitignore 保护，API 密钥不得提交到仓库。
