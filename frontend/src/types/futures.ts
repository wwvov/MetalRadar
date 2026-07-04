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
  price: number
  change_pct: number
  open: number
  high: number
  low: number
  volume: number
  open_interest: number
  timestamp: string
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
  base_price: number
}
