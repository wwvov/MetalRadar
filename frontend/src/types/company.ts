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
  cost_pct: number
  source: 'report' | 'inferred'
  direction: 'negative' | 'positive'
  contract: string
}

export interface CompanyPortrait {
  position: 'up' | 'mid' | 'down'
  position_detail: string
  materials: CompanyMaterial[]
}

export interface CompanyDetail extends CompanyBasic {
  short_name: string
  business_desc: string
  portrait: CompanyPortrait
  // 财报摘要
  financial_summary?: FinancialSummary
}

export interface FinancialSummary {
  report_period: string
  revenue: number
  cost: number
  gross_margin: number
  direct_material_pct: number
  direct_labor_pct: number
  manufacturing_pct: number
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
  events: Array<{ date: string; description: string }>
  analysis_text: string
}
