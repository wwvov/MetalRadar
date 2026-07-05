import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { BASE_CHART_OPTION } from '@/utils/echarts-config'
import { formatCurrency } from '@/utils/formatters'
import { DollarSign, TrendingUp, TrendingDown, Database, FileText, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FinancialData } from '@/types/company'

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Database; color: string }> = {
  user_edit: { label: '用户修正', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  report_ai: { label: '财报AI提取', icon: FileText, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  api: { label: '东方财富', icon: Database, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  none: { label: '无数据', icon: Database, color: 'bg-slate-50 text-slate-500 border-slate-200' },
}

interface FinancialMetricsProps {
  data: FinancialData | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function FinancialMetrics({ data, isLoading, isError, onRetry }: FinancialMetricsProps) {
  if (isLoading) {
    return (
      <Card className="p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          核心财务指标
        </h3>
        <ErrorCard onRetry={onRetry} />
      </Card>
    )
  }

  if (!data || data.source === 'none') {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          核心财务指标
        </h3>
        <div className="text-center py-8">
          <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-1">暂无财务数据</p>
          <p className="text-xs text-slate-400">可上传财报PDF补充数据，或等待东方财富接口返回</p>
        </div>
      </Card>
    )
  }

  const sourceInfo = SOURCE_LABELS[data.source] || SOURCE_LABELS.none
  const SourceIcon = sourceInfo.icon

  // 各季度营收/净利润柱状图
  const hasQuarters = data.quarters && data.quarters.length > 0

  return (
    <Card className="p-5">
      {/* 标题 + 数据来源 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          核心财务指标
        </h3>
        <Badge variant="outline" className={cn('text-[10px] gap-1', sourceInfo.color)}>
          <SourceIcon className="w-3 h-3" />
          {sourceInfo.label}
        </Badge>
      </div>

      {/* 报告期 */}
      {data.report_period && (
        <p className="text-xs text-slate-400 mb-3">报告期：{data.report_period}</p>
      )}

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="营业收入"
          value={data.revenue}
          format="yi"
        />
        <MetricCard
          label="毛利率"
          value={data.gross_margin}
          suffix="%"
        />
        <MetricCard
          label="营业成本"
          value={data.cost}
          format="yi"
        />
        <MetricCard
          label="直接材料占比"
          value={data.direct_material_pct}
          suffix="%"
        />
      </div>

      {/* 季度趋势图 */}
      {hasQuarters && (
        <QuarterlyChart quarters={data.quarters} />
      )}
    </Card>
  )
}

function MetricCard({
  label,
  value,
  suffix,
  format,
}: {
  label: string
  value: number | null
  suffix?: string
  format?: 'yi' | 'wan'
}) {
  return (
    <div className="text-center p-3 bg-slate-50 rounded-lg">
      <p className="text-[11px] text-slate-500 mb-1">{label}</p>
      <p className="text-base font-bold text-slate-800 tabular-nums">
        {value != null
          ? format
            ? formatCurrency(value, format)
            : `${value.toLocaleString()}${suffix || ''}`
          : '—'}
      </p>
    </div>
  )
}

function QuarterlyChart({ quarters }: { quarters: FinancialData['quarters'] }) {
  const reversed = [...quarters].reverse()
  const periods = reversed.map((q) => q.period)
  const revenues = reversed.map((q) => q.revenue ? q.revenue / 1e8 : null)
  const netProfits = reversed.map((q) => q.net_profit ? q.net_profit / 1e8 : null)

  const option = {
    ...BASE_CHART_OPTION,
    tooltip: {
      ...BASE_CHART_OPTION.tooltip,
      formatter: (params: any) => {
        const names = params.map((p: any) => `${p.seriesName}: ${p.value?.toFixed(2) ?? '—'}亿`).join('<br/>')
        return `<div style="font-size:12px"><b>${params[0]?.axisValue || ''}</b><br/>${names}</div>`
      },
    },
    legend: {
      data: ['营业收入(亿)', '净利润(亿)'],
      bottom: 0,
      textStyle: { fontSize: 11, color: '#94a3b8' },
    },
    grid: { left: '3%', right: '3%', top: 10, bottom: 35, containLabel: true },
    xAxis: {
      type: 'category',
      data: periods,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}亿' },
    },
    series: [
      {
        name: '营业收入(亿)',
        type: 'bar',
        data: revenues,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 40,
      },
      {
        name: '净利润(亿)',
        type: 'bar',
        data: netProfits,
        itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 40,
      },
    ],
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">季度趋势</p>
      <ReactEChartsCore
        option={option}
        style={{ height: '220px' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
