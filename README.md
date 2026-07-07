# MetalRadar

金属产业链智能分析平台 — 多源新闻聚合、AI 产业链画像、期货/股票行情联动分析。

## 功能概览

- **新闻资讯** — 多源新闻聚合（东方财富/上海金属网/新浪财经）+ LLM 智能分类 + 多维度筛选 + 自适应反爬退避
- **我的关注** — 公司管理 + AI 产业链全景分析（Mermaid 流程图）+ 敏感原材料品种编辑 + 收藏新闻
- **公司详情** — 财务指标三分类（盈利能力/成长能力/财务健康）、股票K线（含PE/PB估值）、期货联动、成本压力仪表
- **敏感金属仪表盘** — 跨公司实时报价 + 加权压力分析 + 价格分位温度计（过去365/730天）+ 迷你走势图 + YTD涨跌幅 + 行情新鲜度指示器
- **知识图谱** — 产业链关系网络可视化（占位页面，功能预告）
- **AI Agent** — 智能对话分析（规划中）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6 + TailwindCSS v4 + shadcn/ui |
| 后端 | Python 3.10+ / FastAPI + SQLAlchemy 2.0 + Pydantic v2 |
| 数据库 | SQLite 3 (WAL 模式) |
| AI | DeepSeek API（OpenAI 兼容接口） |
| 数据源 | akshare（东方财富/新浪财经/上海金属网） |
| 反爬 | 自适应退避冷却 + 数据源故障跟踪 + 动态缓存TTL |
| 图表 | ECharts + Mermaid |

## 快速开始

### 前置条件

- Node.js 18+
- Python 3.10+
- DeepSeek API Key（[免费注册获取](https://platform.deepseek.com)）

### 1. 克隆项目

```bash
git clone <repo-url>
cd MetalRadar
```

### 2. 配置 API Key

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑 backend/.env，填入你的 DeepSeek API Key
# LLM_API_KEY=sk-your-api-key-here
```

> ⚠️ **安全提示**：`.env` 文件已被 `.gitignore` 保护，请勿提交到 Git。

完整的 `.env` 配置项：

```env
LLM_API_KEY=sk-your-api-key-here    # 必填：DeepSeek API 密钥
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
DATABASE_URL=sqlite:///./metalradar.db
DEBUG=true
CORS_ORIGINS=["http://localhost:5173"]
```

若未配置 `LLM_API_KEY`，AI 画像生成和产业链分析功能将不可用（返回占位提示），但新闻聚合和行情数据不受影响。

### 3. 启动后端

```bash
cd backend

# 创建虚拟环境（首次）
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动后端服务（默认 http://localhost:8000）
uvicorn app.main:app --reload --port 8000
```

### 4. 启动前端

```bash
cd frontend

# 安装依赖（首次）
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

### 5. 初始化数据

```bash
# 导入开发种子数据（3家公司 + 30+条新闻）
curl -X POST http://localhost:8000/api/seed/sprint1
```

打开浏览器访问 **http://localhost:5173** 即可使用。

## 项目结构

```
MetalRadar/
├── README.md
├── .gitignore
├── docs/                         # 项目文档
│   ├── 1-overview.md             # 项目概述
│   ├── 2-architecture.md         # 技术架构与目录结构
│   ├── 3-data-model.md           # 数据模型
│   ├── 4-api-spec.md             # API 接口定义
│   ├── 5-ai-capabilities.md      # AI 能力与 Prompt 设计
│   ├── 6-pages.md                # 页面规格
│   └── 7-development-guide.md    # 开发约束与规范
├── backend/
│   ├── .env.example              # 环境变量模板
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               # FastAPI 入口
│   │   ├── api/                  # API 路由
│   │   ├── models/               # SQLAlchemy 模型
│   │   ├── schemas/              # Pydantic 模型
│   │   ├── services/             # 业务逻辑
│   │   └── core/                 # 配置/数据库
│   └── .cache/                   # 文件缓存
└── frontend/
    ├── package.json
    ├── src/
    │   ├── pages/                # 页面组件 (HomePage/WatchlistPage/CompanyPage/KnowledgeGraphPage/AgentPage)
    │   ├── components/           # UI 组件
    │   ├── hooks/                # React Query Hooks
    │   ├── services/             # API 调用
    │   ├── types/                # TypeScript 类型
    │   └── providers/            # Context Providers
    └── public/
```

## 常用命令

```bash
# 后端
cd backend
uvicorn app.main:app --reload          # 启动 (开发模式)
uvicorn app.main:app --host 0.0.0.0 --port 8000  # 局域网访问

# 前端
cd frontend
npm run dev                             # 启动开发服务器
npm run build                           # 生产构建
npx tsc --noEmit                        # TypeScript 类型检查

# 数据库
# SQLite 数据库文件位于 backend/metalradar.db
# 删除即可重置数据库（下次启动自动重建）
```

## 常见问题

**Q: 添加公司后画像显示"LLM_API_KEY 未配置"？**
A: 检查 `backend/.env` 中 `LLM_API_KEY` 是否已填入有效的 DeepSeek API Key。

**Q: 公司详情页 PE/PB 不显示？**
A: PE/PB 从 akshare 全市场行情获取，确保网络可访问东方财富接口。若仍然为空，可能是该股票数据源暂未覆盖。

**Q: 期货数据加载失败？**
A: 采用新浪财经为主数据源（futures_zh_daily_sina），失败时自动回退 futures_main_sina。若持续失败，系统会自动跳过并降频请求，成功后自动恢复。

**Q: 数据刷新太慢或被封禁？**
A: 已内置自适应反爬退避机制：请求失败时冷却时间指数增长（最多120秒），数据源连续失败5次自动跳过10分钟。非交易时段刷新频率自动降低。

**Q: 收藏新闻不显示？**
A: 已修复。现在使用专用的 `favorites` Tab 端点，不再依赖首页分页过滤。
