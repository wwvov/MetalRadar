// 期货相关类型 — 字段对齐 api-spec.md

export interface FuturesKline {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  hold: number
}

export interface FuturesQuote {
  contract: string
  date: string
  price: number
  change_pct: number
  open: number
  high: number
  low: number
  volume: number
  open_interest: number
}

export interface VolatilityCone {
  periods: number[]
  current_volatility: number
  distribution: Record<number, { min: number; p25: number; p50: number; p75: number; max: number }>
}

export interface PricePercentile {
  current_price: number
  year_high: number
  year_low: number
  percentile: number
}

export interface PressureData {
  base_price: number | null
  current_price: number
  change_pct: number
  pressure_level: 'low' | 'medium' | 'high'
}

export interface DashboardMaterial {
  material_name: string
  cost_pct: number | null
  direction: 'negative' | 'positive'
  contract: string
  quote: FuturesQuote | null
  percentile_1y: PricePercentile | null
  percentile_2y: PricePercentile | null
  history_3m: { date: string; close: number }[]
  pressure: PressureData | null
}

export interface DashboardData {
  company: {
    id: string
    name: string
    code: string
    industry: string
  }
  materials: DashboardMaterial[]
}

export interface DashboardResponse {
  ok: boolean
  data: DashboardData
}

// ---- 跨公司概览 ----

export interface OverviewMetal {
  material_name: string
  contract: string
  quote: FuturesQuote | null
  percentile_1y: PricePercentile | null
  percentile_2y: PricePercentile | null
  history_3m: { date: string; close: number }[]
  companies: {
    company_id: string
    company_name: string
    cost_pct: number | null
    direction: string
  }[]
  total_companies: number
}

export interface OverviewData {
  metals: OverviewMetal[]
  total_metals: number
  total_companies: number
}

export interface OverviewResponse {
  ok: boolean
  data: OverviewData
}

// ---- 有材料数据的公司列表 ----

export interface CompanyWithMaterials {
  id: string
  name: string
  code: string
  industry: string
}
