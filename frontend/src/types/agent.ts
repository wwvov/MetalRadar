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
  type: 'line' | 'bar' | 'gauge' | 'pie' | 'flow'
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
  risk_score: number; risk_level: string
  summary: string
  current_price?: number; price_change_24h?: number
  reasoning: ReasoningStep[]
  sources: SourceItem[]
  factors: RiskFactor[]
  recommendations: Recommendation[]
  charts?: ChartData[]
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
