import { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { BASE_CHART_OPTION } from '@/utils/echarts-config'
import { Activity, AlertTriangle, Info } from 'lucide-react'
import type { DivergenceAnalysis } from '@/types/company'

interface DivergenceCardProps {
  data: DivergenceAnalysis | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function DivergenceCard({ data, isLoading, isError, onRetry }: DivergenceCardProps) {
  const option = useMemo(() => {
    if (!data?.correlation_series?.length) return null

    const dates = data.correlation_series.map((d) => d.date)
    const corrs = data.correlation_series.map((d) => d.correlation)

    return {
      ...BASE_CHART_OPTION,
      title: {
        text: `滚动相关系数 (60日) — ${data.material || ''}`,
        left: 0,
        top: 0,
        textStyle: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
      },
      grid: { left: '3%', right: '5%', top: 45, bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#94a3b8', fontSize: 10, rotate: 30 },
      },
      yAxis: {
        type: 'value',
        min: -1,
        max: 1,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}' },
      },
      visualMap: {
        show: false,
        pieces: [
          { gt: 0.5, color: '#ef4444' },
          { gt: 0, lte: 0.5, color: '#f59e0b' },
          { gt: -0.5, lte: 0, color: '#94a3b8' },
          { lte: -0.5, color: '#22c55e' },
        ],
      },
      series: [
        {
          type: 'line',
          data: corrs,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#6366f1' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99, 102, 241, 0.15)' },
                { offset: 1, color: 'rgba(99, 102, 241, 0.02)' },
              ],
            },
          },
          markLine: {
            silent: true,
            data: [
              { yAxis: 0, lineStyle: { color: '#94a3b8', type: 'dashed' } },
            ],
          },
        },
      ],
    }
  }, [data])

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-[250px] w-full rounded-lg" />
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-600" />
          价格背离分析
        </h3>
        <ErrorCard onRetry={onRetry} />
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-600" />
        价格背离分析
        {data?.material && (
          <Badge variant="secondary" className="text-[10px] bg-purple-50 text-purple-700 border-0">
            vs {data.material}
          </Badge>
        )}
      </h3>

      {data?.analysis_text && (
        <div className="mb-3 p-3 rounded-lg bg-slate-50 text-sm text-slate-700 leading-relaxed flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <span>{data.analysis_text}</span>
        </div>
      )}

      {data?.events && data.events.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {data.events.map((evt, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-slate-500 font-mono">{evt.date}</span>
                <span className="text-slate-600 ml-2">{evt.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {option ? (
        <ReactEChartsCore
          option={option}
          style={{ height: '250px' }}
          notMerge
          lazyUpdate
          opts={{ renderer: 'canvas' }}
        />
      ) : !isLoading && (
        <p className="text-xs text-slate-400 text-center py-8">
          {data?.analysis_text || '暂无背离分析数据'}
        </p>
      )}
    </Card>
  )
}
