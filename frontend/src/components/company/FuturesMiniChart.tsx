import { useMemo, useState } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BASE_CHART_OPTION } from '@/utils/echarts-config'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardMaterial } from '@/types/futures'

interface FuturesMiniChartProps {
  materials: DashboardMaterial[]
  isLoading: boolean
}

export function FuturesMiniChart({ materials, isLoading }: FuturesMiniChartProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      </Card>
    )
  }

  if (!materials || materials.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-600" />
          敏感品种期货走势
        </h3>
        <p className="text-xs text-slate-400 text-center py-8">暂无期货数据</p>
      </Card>
    )
  }

  const active = materials[selectedIdx] || materials[0]

  return (
    <Card className="p-5">
      {/* 标题 */}
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-amber-600" />
        敏感品种期货走势
        <span className="text-[11px] font-normal text-slate-400">
          (与K线X轴对齐)
        </span>
      </h3>

      {/* 品种缩略图网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        {materials.slice(0, 6).map((m, idx) => {
          const prices = m.history_3m || []
          const changePct = m.quote?.change_pct || 0
          return (
            <button
              key={m.material_name}
              className={cn(
                'text-left p-3 rounded-lg border transition-all hover:shadow-sm',
                idx === selectedIdx
                  ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
              onClick={() => setSelectedIdx(idx)}
            >
              {/* 品种名 + 涨跌 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-800 truncate max-w-[80px]">
                  {m.material_name}
                </span>
                {m.quote?.price && (
                  <span className={cn(
                    'text-[10px] font-medium tabular-nums',
                    changePct >= 0 ? 'text-red-500' : 'text-green-500'
                  )}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                  </span>
                )}
              </div>
              {/* 当前价 */}
              {m.quote?.price ? (
                <p className="text-sm font-semibold text-slate-800 tabular-nums">
                  {m.quote.price.toLocaleString()}
                  <span className="text-[10px] text-slate-400 font-normal ml-0.5">{m.unit}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-400">暂无数据</p>
              )}
              {/* 迷你折线 */}
              {prices.length > 1 && (
                <MiniSparkline prices={prices.map((p) => p.close)} changePct={changePct} />
              )}
            </button>
          )
        })}
      </div>

      {/* 选中品种的大图 */}
      {active && active.history_3m && active.history_3m.length > 0 && (
        <MainChart material={active} />
      )}
    </Card>
  )
}

/** 迷你走势线（纯SVG） */
function MiniSparkline({ prices, changePct }: { prices: number[]; changePct: number }) {
  const color = changePct >= 0 ? '#ef4444' : '#22c55e'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const w = 100
  const h = 28
  const padding = 2

  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (w - padding * 2)
    const y = h - padding - ((p - min) / range) * (h - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg width={w} height={h} className="mt-1.5 w-full">
      <defs>
        <linearGradient id={`grad-${prices[0]}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon
        points={`${padding},${h - padding} ${points.join(' ')} ${w - padding},${h - padding}`}
        fill={`url(#grad-${prices[0]})`}
      />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.2} />
    </svg>
  )
}

/** 选中品种的详细走势图 */
function MainChart({ material }: { material: DashboardMaterial }) {
  const history = material.history_3m || []
  const option = useMemo(() => {
    if (!history.length) return null
    const dates = history.map((d) => d.date)
    const closes = history.map((d) => d.close)
    const changePct = material.quote?.change_pct || 0
    const color = changePct >= 0 ? '#ef4444' : '#22c55e'

    return {
      ...BASE_CHART_OPTION,
      title: {
        text: `${material.material_name} · ${material.contract || '期货'}`,
        subtext: material.quote
          ? `${material.quote.price?.toLocaleString() || '—'} ${material.unit}  ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
          : '',
        left: 0,
        top: 0,
        textStyle: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
        subtextStyle: { fontSize: 11, color },
      },
      grid: { left: '3%', right: '3%', top: 50, bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: '#94a3b8', fontSize: 9, rotate: 30 },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          type: 'line',
          data: closes,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: color + '33' },
                { offset: 1, color: color + '05' },
              ],
            },
          },
        },
      ],
    }
  }, [history, material])

  if (!option) return null

  return (
    <ReactEChartsCore
      option={option}
      style={{ height: '220px' }}
      notMerge
      lazyUpdate
      opts={{ renderer: 'canvas' }}
    />
  )
}
