// AI Agent 相关类型 — 字段对齐 ai-capabilities.md

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  chart?: ChartParam
  timestamp: string
}

export interface ChatRequest {
  company_id: string
  message: string
  scenario?: 'risk_scan' | 'event_impact' | 'free_qa'
}

export interface ChatResponse {
  reply: string
  chart?: ChartParam
}

// 内嵌图表参数 — 对齐 ai-capabilities.md ChartParam
export type ChartParam =
  | LineChartParam
  | BarChartParam
  | FlowChartParam
  | GaugeChartParam

export interface LineChartParam {
  type: 'line'
  material_name: string
  series_data: Array<{ date: string; value: number }>
  news_mark_points: Array<{ date: string; label: string }>
}

export interface BarChartParam {
  type: 'bar'
  items: Array<{ name: string; direction: 'negative' | 'positive'; level: string }>
}

export interface FlowChartParam {
  type: 'flow'
  nodes: Array<{ name: string }>
  edges: Array<{ source: string; target: string; label?: string }>
}

export interface GaugeChartParam {
  type: 'gauge'
  current_value: number
  min: number
  max: number
  percentile: number
}
