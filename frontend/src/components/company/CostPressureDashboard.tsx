import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Gauge, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PressureData } from '@/types/futures'

interface MaterialPressure {
  material_name: string
  unit: string
  cost_pct: number | null
  direction: string
  contract: string
  pressure: PressureData | null
  quote: { price: number; change_pct: number } | null
}

interface CostPressureDashboardProps {
  data: { materials: MaterialPressure[] } | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  hasFinancialReport: boolean
}

const PRESSURE_CONFIG = {
  low: { label: '压力较小', color: 'bg-green-100 text-green-700', barColor: '#22c55e', gradient: 'from-green-400 via-green-300 to-green-400' },
  medium: { label: '中等压力', color: 'bg-yellow-100 text-yellow-700', barColor: '#eab308', gradient: 'from-yellow-400 via-yellow-300 to-yellow-400' },
  high: { label: '压力显著', color: 'bg-red-100 text-red-700', barColor: '#ef4444', gradient: 'from-red-400 via-red-300 to-red-400' },
}

export function CostPressureDashboard({ data, isLoading, isError, onRetry, hasFinancialReport }: CostPressureDashboardProps) {
  if (isLoading) {
    return (
      <Card className="p-5 space-y-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-full rounded-full" />
          </div>
        ))}
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-rose-600" />
          材料成本压力仪表
        </h3>
        <ErrorCard onRetry={onRetry} />
      </Card>
    )
  }

  if (!hasFinancialReport) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-rose-600" />
          材料成本压力仪表
        </h3>
        <div className="text-center py-6">
          <AlertTriangle className="w-8 h-8 text-amber-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-1">上传财报以启用成本压力分析</p>
          <p className="text-xs text-slate-400">需要财报基准价来计算材料成本压力</p>
        </div>
      </Card>
    )
  }

  const materials = data?.materials || []

  if (materials.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-rose-600" />
          材料成本压力仪表
        </h3>
        <p className="text-xs text-slate-400 text-center py-6">暂无敏感品种数据</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-rose-600" />
        材料成本压力仪表
        <span className="text-[11px] font-normal text-slate-400">
          较财报基准价的涨跌幅度
        </span>
      </h3>

      <div className="space-y-4">
        {materials.map((m) => {
          const pressure = m.pressure
          if (!pressure) return null

          const config = PRESSURE_CONFIG[pressure.pressure_level] || PRESSURE_CONFIG.low
          const changePct = pressure.change_pct || 0
          const absPct = Math.min(Math.abs(changePct), 25)

          return (
            <div key={m.material_name}>
              {/* 品种名 + 压力标签 */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700">{m.material_name}</span>
                  {m.cost_pct != null && (
                    <span className="text-[10px] text-slate-400">成本占比 {m.cost_pct}%</span>
                  )}
                </div>
                <Badge variant="secondary" className={cn('text-[10px] border-0', config.color)}>
                  {config.label}
                </Badge>
              </div>

              {/* 压力条 */}
              <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden">
                {/* 三段背景 */}
                <div className="absolute inset-0 flex">
                  <div className="w-1/3 bg-green-100/50" />
                  <div className="w-1/3 bg-yellow-100/50" />
                  <div className="w-1/3 bg-red-100/50" />
                </div>
                {/* 指针 */}
                <div
                  className="absolute top-0 h-full w-1 bg-slate-800 rounded transition-all"
                  style={{ left: `${Math.min(absPct / 25 * 100, 100)}%` }}
                />
                {/* 涨跌幅标注 */}
                <div className="absolute inset-0 flex items-center px-3">
                  <span className={cn(
                    'text-[10px] font-semibold tabular-nums',
                    changePct >= 0 ? 'text-red-600' : 'text-green-600'
                  )}>
                    {changePct >= 0 ? '↑' : '↓'} {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* 说明 */}
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-400">
                  基准价：{pressure.base_price?.toLocaleString() || '—'}
                </span>
                <span className="text-[10px] text-slate-400">
                  当前价：{pressure.current_price?.toLocaleString() || '—'}
                </span>
              </div>

              <p className="text-[10px] text-slate-300 mt-1">
                原材料价格取期货主力合约收盘价，仅供参考趋势判断
              </p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
