// AI Agent & Report 类型

export interface ChatMessageItem {
  id: string | number
  role: 'user' | 'assistant'
  content: string
  charts?: ChartData[]
  riskScore?: number
  riskLevel?: string
  sources?: SourceItem[]
  timestamp: string
}

export interface ChatRequest {
  company_id?: string
  company_ids?: string[]
  message: string
  scenario?: 'risk_scan' | 'event_impact' | 'free_qa'
  history?: { role: string; content: string }[]
  session_id?: string
  model?: string
}

export interface ChatResponse {
  reply: string
  charts?: ChartData[]
  risk_score?: number
  risk_level?: string
  sources?: SourceItem[]
}

export interface SourceItem { source: string; content: string }

// Charts
export interface ChartData {
  type: 'line' | 'bar' | 'gauge' | 'pie' | 'flow' | 'score_bar'
  title?: string
  data: Record<string, unknown>
}

// Session
export interface ChatSessionItem {
  id: string
  title: string
  model: string
  created_at: string
  updated_at: string
  company_id?: string
  message_count: number
}

export interface ChatSessionDetail extends ChatSessionItem {
  messages: ChatMessageItem[]
}

export interface ModelInfo { id: string; name: string }

// Report
export interface RiskReport {
  report_id: string; generated_at: string
  company_name: string; company_code: string
  material_name: string
  material_names?: string[]
  metal_quotes?: { name: string; contract?: string; price?: number; change_pct_24h?: number; volatility_30d_pct?: number }[]
  metal_exposures?: { metal: string; company: string; company_code: string; cost_pct: number; direction: string }[]
  company_names?: string[]
  company_profiles?: { name: string; code: string; profile: string }[]
  risk_score: number; risk_level: string
  summary: string
  current_price?: number; price_change_24h?: number
  company_profile?: string
  cost_structure?: any[]
  reasoning: ReasoningStep[]
  sources: SourceItem[]
  factors: RiskFactor[]
  risk_events?: any[]
  recommendations: Recommendation[]
  charts?: ChartData[]
  conversation_insights?: string
}

export interface ReasoningStep { step: number; title: string; detail: string }
export interface RiskFactor { name: string; score: number; weight: number; description: string }
export interface Recommendation { priority: number; action: string; detail: string }

export interface MultiReport {
  company_name: string; company_code: string
  generated_at: string
  material_count: number
  comparisons: { material: string; risk_score: number; risk_level: string; price_change_24h?: number }[]
  details: RiskReport[]
}

// Dashboard
export interface DashboardData {
  tab: string
  data: Record<string, unknown>
}

export interface RecommendedQuestions { questions: string[] }
