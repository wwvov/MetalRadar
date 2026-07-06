// AI Agent & Report 相关类型

// ─── Chat ─────────────────────────────────────────────────────

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  charts?: ChartData[]
  riskScore?: number
  riskLevel?: string
  sources?: SourceItem[]
  timestamp: string
  isStreaming?: boolean
}

export interface ChatRequest {
  company_id?: string
  message: string
  scenario?: 'risk_scan' | 'event_impact' | 'free_qa'
  history?: { role: string; content: string }[]
}

export interface ChatResponse {
  reply: string
  charts?: ChartData[]
  risk_score?: number
  risk_level?: string
  sources?: SourceItem[]
}

export interface SourceItem {
  source: string
  content: string
}

// ─── Charts ───────────────────────────────────────────────────

export interface ChartData {
  type: 'line' | 'bar' | 'gauge' | 'pie' | 'flow'
  title?: string
  data: Record<string, unknown>
}

// ─── Report ───────────────────────────────────────────────────

export interface RiskReport {
  report_id: string
  generated_at: string
  company_name: string
  company_code: string
  material_name: string
  risk_score: number
  risk_level: string
  summary: string
  current_price?: number
  price_change_24h?: number
  reasoning: ReasoningStep[]
  sources: SourceItem[]
  factors: RiskFactor[]
  scenarios?: PressureTestScenario[]
  recommendations: Recommendation[]
  charts?: ChartData[]
}

export interface ReasoningStep {
  step: number
  title: string
  detail: string
}

export interface RiskFactor {
  name: string
  score: number
  weight: number
  description: string
}

export interface Recommendation {
  priority: number
  action: string
  detail: string
}

export interface PressureTestScenario {
  name: string
  price_change_pct: number
  fx_change_pct: number
  estimated_cost: number
  estimated_gross_margin: number
  margin_change_pp: number
  risk_score: number
}

// ─── Pressure Test ─────────────────────────────────────────────

export interface ScenarioInput {
  name: string
  price_change_pct: number
  fx_change_pct: number
}

// ─── Company Context ───────────────────────────────────────────

export interface AgentCompanyContext {
  company: {
    name: string
    code: string
    industry: string
    position: string
    position_detail?: string
    materials: { name: string; cost_pct: number; direction: string; source: string }[]
  }
  materials: {
    name: string
    cost_pct: number
    direction: string
    source: string
    contract: string
    price_info?: Record<string, unknown>
  }[]
  recent_news_count: number
  recent_news: {
    title: string
    source: string
    published_at: string
    emotion: string
    event_type: string
    summary: string
  }[]
}
