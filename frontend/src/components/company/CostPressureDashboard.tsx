import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Gauge, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { companyService } from '@/services/companyService'
import type { PressureData } from '@/types/futures'
import type { CompanyMaterial } from '@/types/company'

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
  data: { materials: MaterialPressure[]; company?: { id: string } } | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  hasFinancialReport: boolean
  companyId: string
  allMaterials: CompanyMaterial[]
}

const PRESSURE_CONFIG = {
  low: { label: '压力较小', color: 'bg-green-100 text-green-700', barColor: '#22c55e' },
  medium: { label: '中等压力', color: 'bg-yellow-100 text-yellow-700', barColor: '#eab308' },
  high: { label: '压力显著', color: 'bg-red-100 text-red-700', barColor: '#ef4444' },
}

export function CostPressureDashboard({
  data,
  isLoading,
  isError,
  onRetry,
  hasFinancialReport,
  companyId,
  allMaterials,
}: CostPressureDashboardProps) {
  // 本地成本占比状态 — key为material_name
  const [costPctMap, setCostPctMap] = useState<Record<string, number>>({})
  const initializedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 从后端数据初始化cost_pct
  useEffect(() => {
    if (initializedRef.current) return
    const materials = data?.materials
    if (materials && materials.length > 0) {
      const map: Record<string, number> = {}
      materials.forEach((m) => {
        map[m.material_name] = m.cost_pct ?? 0
      })
      setCostPctMap(map)
      initializedRef.current = true
    }
  }, [data])

  // 重置初始化标记（数据刷新时重新加载）
  useEffect(() => {
    initializedRef.current = false
  }, [companyId])

  // 防抖持久化到后端
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      // 合并当前所有材料：从 allMaterials 获取完整信息，cost_pct 用本地调整值
      const updatedMaterials: CompanyMaterial[] = allMaterials.map((m) => ({
        material_name: m.material_name,
        cost_pct: costPctMap[m.material_name] ?? m.cost_pct ?? 0,
        source: 'manual' as const,
        direction: m.direction,
        contract: m.contract,
      }))
      companyService.updatePortrait(companyId, { materials: updatedMaterials }).catch(() => {
        // 静默失败，不影响交互
      })
    }, 2000)
  }, [costPctMap, allMaterials, companyId])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleCostPctChange = (materialName: string, value: number) => {
    setCostPctMap((prev) => ({ ...prev, [materialName]: value }))
    debouncedSave()
  }

  // 计算加权影响
  const calcWeightedImpact = (changePct: number, costPct: number): number => {
    return Math.abs(changePct) * (costPct / 100)
  }

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
      <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-rose-600" />
        材料成本压力仪表
      </h3>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        以财报报告期内期货均价为基准价，计算当前期货价格相对基准价的涨跌幅度。
        涨幅越大，原材料成本压力越高；跌幅则表示成本改善。
        权重影响 = |涨跌幅| × 成本占比，衡量该品种对公司总成本的实际冲击。
      </p>

      <div className="space-y-5">
        {materials.map((m) => {
          const pressure = m.pressure
          if (!pressure) return null

          const config = PRESSURE_CONFIG[pressure.pressure_level] || PRESSURE_CONFIG.low
          const changePct = pressure.change_pct || 0
          const absPct = Math.min(Math.abs(changePct), 25)
          const adjustedCostPct = costPctMap[m.material_name] ?? m.cost_pct ?? 0
          const weightedImpact = calcWeightedImpact(changePct, adjustedCostPct)

          return (
            <div key={m.material_name} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
              {/* 品种名 + 压力标签 */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700">{m.material_name}</span>
                </div>
                <Badge variant="secondary" className={cn('text-[10px] border-0', config.color)}>
                  {config.label}
                </Badge>
              </div>

              {/* 压力条 */}
              <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                {/* 三段背景 */}
                <div className="absolute inset-0 flex">
                  <div className="w-1/3 bg-green-100/50 flex items-center justify-center">
                    <span className="text-[9px] text-green-600/60 font-medium">&lt;5%</span>
                  </div>
                  <div className="w-1/3 bg-yellow-100/50 flex items-center justify-center">
                    <span className="text-[9px] text-yellow-600/60 font-medium">5–15%</span>
                  </div>
                  <div className="w-1/3 bg-red-100/50 flex items-center justify-center">
                    <span className="text-[9px] text-red-600/60 font-medium">&gt;15%</span>
                  </div>
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

              {/* 基准价 / 当前价 */}
              <div className="flex justify-between mb-3">
                <span className="text-[10px] text-slate-400">
                  基准价：{pressure.base_price?.toLocaleString() || '—'}
                </span>
                <span className="text-[10px] text-slate-400">
                  当前价：{pressure.current_price?.toLocaleString() || '—'}
                </span>
              </div>

              {/* 成本占比滑块 + 加权影响 */}
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600">成本占比</span>
                  <span className="text-[11px] font-semibold text-slate-700 tabular-nums">
                    {adjustedCostPct}%
                  </span>
                </div>
                <Slider
                  value={[adjustedCostPct]}
                  onValueChange={([v]) => handleCostPctChange(m.material_name, v)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    加权影响
                  </span>
                  <span className={cn(
                    'text-[11px] font-semibold tabular-nums',
                    weightedImpact >= 5 ? 'text-red-600' : weightedImpact >= 1 ? 'text-amber-600' : 'text-slate-500'
                  )}>
                    {weightedImpact.toFixed(1)}pp
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 压力计算逻辑说明 */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-lg px-3.5 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-medium text-slate-500">压力计算逻辑</span>
          </div>
          <ol className="text-[10px] text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
            <li>基准价 = 财报报告期内期货均价（≥10个交易日）或 60日均价</li>
            <li>涨跌幅 = (当前价 − 基准价) / 基准价 × 100%</li>
            <li>压力等级：|涨跌幅| &lt; 5% → 压力较小 | 5–15% → 中等压力 | ≥ 15% → 压力显著</li>
            <li>加权影响 = |涨跌幅| × 成本占比 / 100 — 衡量该材料价格变化对公司总成本的实际冲击</li>
            <li>成本占比可通过滑块按经验调整，调整后自动保存</li>
          </ol>
        </div>
      </div>
    </Card>
  )
}
