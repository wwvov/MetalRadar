// 新闻实体类型 — 字段对齐 api-spec.md

export interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  pub_time: string
  tags: string[]
  company_entities: string[]
  metal_entities: string[]
  relevance_level: 'red' | 'yellow' | 'blue' | 'gray'
  emotion: 'positive' | 'negative' | 'neutral'
  is_relevant: boolean
  event_type: string
  raw_url: string
  is_favorited?: boolean
  is_read?: boolean
  linked_company_id?: string
}

export interface NewsListResponse {
  news: NewsItem[]
  total: number
}

export type NewsTab = 'all' | 'followed_companies' | 'sensitive_metals' | 'macro' | 'macro_panel' | 'shmet_block'

export interface NewsFilters {
  company?: string
  companies?: string
  metal?: string
  metals?: string
  metal_category?: string
  source?: string
  page?: number
}

// 事件类型中文映射
export const EVENT_TYPE_LABELS: Record<string, string> = {
  supply_disruption: '供应中断',
  price_surge: '价格暴涨',
  price_drop: '价格下跌',
  policy_favorable: '政策利好',
  monetary_policy: '货币政策',
  macro_economy: '宏观经济',
  industry_trend: '行业趋势',
  demand_change: '需求变化',
  inventory_change: '库存变动',
  geopolitical: '地缘政治',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  supply_disruption: 'bg-red-100 text-red-700 border-red-200',
  price_surge: 'bg-orange-100 text-orange-700 border-orange-200',
  price_drop: 'bg-green-100 text-green-700 border-green-200',
  policy_favorable: 'bg-blue-100 text-blue-700 border-blue-200',
  monetary_policy: 'bg-purple-100 text-purple-700 border-purple-200',
  macro_economy: 'bg-slate-100 text-slate-600 border-slate-200',
  industry_trend: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  demand_change: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  inventory_change: 'bg-teal-100 text-teal-700 border-teal-200',
  geopolitical: 'bg-red-100 text-red-800 border-red-300',
}
