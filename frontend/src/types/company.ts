// 公司相关类型 — 字段对齐 api-spec.md 与 data-model.md

export interface CompanyBasic {
  id: string
  name: string
  code: string
  industry: string
}

export interface CompanySearchResult {
  companies: CompanyBasic[]
}

export interface CompanyMaterial {
  id?: number
  material_name: string
  cost_pct: number | null
  source: 'report' | 'inferred' | 'manual'
  direction: 'negative' | 'positive'
  contract: string
}

export interface CompanyPortrait {
  position: 'up' | 'mid' | 'down'
  position_detail: string
  materials: CompanyMaterial[]
}

// 产业链分析
export interface ChainSegmentDetail {
  business: string
  description: string
  company_involved: boolean
}

export interface ChainSegment {
  level: 'upstream' | 'midstream' | 'downstream' | 'auxiliary'
  label: string
  details: ChainSegmentDetail[]
}

export interface ChainSummary {
  covered_segments: string[]
  core_segment: string
  full_label: string
  analysis_text: string
}

export interface ChainAnalysis {
  mermaid: string
  segments: ChainSegment[]
  summary: ChainSummary
}

export interface CompanyDetail extends CompanyBasic {
  short_name: string
  business_desc: string
  portrait: CompanyPortrait
  financial_summary?: FinancialSummary
  portrait_generated: boolean
  portrait_updated_at?: string
  chain_analysis?: ChainAnalysis | null
}

export interface FinancialSummary {
  report_period: string
  revenue: number | null
  cost: number | null
  gross_margin: number | null
  direct_material_pct: number | null
  direct_labor_pct: number | null
  manufacturing_pct: number | null
}

// 画像更新请求
export interface PortraitUpdatePayload {
  position?: string
  position_detail?: string
  business_desc?: string
  materials?: CompanyMaterial[]
}

// 股票K线
export interface KlineData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
  turn?: number
  pctChg?: number
}

// 成本压力
export interface CostPressure {
  materials: Array<{
    name: string
    cost_pct: number
    base_price: number
    current_price: number
    change_pct: number
    pressure_level: 'low' | 'medium' | 'high'
    estimated_margin_impact: number
  }>
}

// 背离分析
export interface DivergenceAnalysis {
  correlation_series: Array<{ date: string; correlation: number }>
  events: Array<{ date: string; type: string; description: string }>
  analysis_text: string
  stock_code: string
  material: string
}

// 财务季度数据
export interface FinancialQuarter {
  period: string
  report_date: string
  revenue: number | null
  cost: number | null
  net_profit: number | null
  operating_profit: number | null
  deducted_net_profit?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  equity?: number | null
  operating_cashflow?: number | null
}

// 聚合财务数据
export interface FinancialData {
  company_id: string
  company_name: string
  source: 'user_edit' | 'report_ai' | 'api' | 'none'
  quarters: FinancialQuarter[]
  direct_material_pct: number | null
  direct_labor_pct: number | null
  manufacturing_pct: number | null
  gross_margin: number | null
  net_margin: number | null
  revenue: number | null
  cost: number | null
  net_profit: number | null
  deducted_net_profit: number | null
  total_assets: number | null
  total_liabilities: number | null
  operating_cashflow: number | null
  report_period: string
}

// 股票基本信息
export interface StockInfo {
  code: string
  total_market_cap: number | null
  circulating_market_cap: number | null
  industry: string
  total_shares: number | null
  circulating_shares: number | null
  pe: number | null   // 市盈率(动态)
  pb: number | null   // 市净率
}

// API 响应包装
export interface ApiResponse<T> {
  ok: boolean
  data: T
}
