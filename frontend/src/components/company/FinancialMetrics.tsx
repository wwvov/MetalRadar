import { useState, useRef, useEffect, useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { BASE_CHART_OPTION } from '@/utils/echarts-config'
import { formatCurrency } from '@/utils/formatters'
import { DollarSign, Database, FileText, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FinancialData, FinancialQuarter } from '@/types/company'

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Database; color: string }> = {
  user_edit: { label: '用户修正', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  report_ai: { label: '财报AI提取', icon: FileText, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  api: { label: '东方财富', icon: Database, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  none: { label: '无数据', icon: Database, color: 'bg-slate-50 text-slate-500 border-slate-200' },
}

// --- 季度趋势图：指标选择器类型与配置 ---
type MetricKey = 'all' | 'revenue' | 'cost' | 'gross_profit' | 'net_profit' | 'deducted_net_profit'

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'all', label: '全部', color: '' },
  { key: 'revenue', label: '营业收入', color: '#3b82f6' },
  { key: 'cost', label: '营业成本', color: '#f59e0b' },
  { key: 'gross_profit', label: '毛利润', color: '#10b981' },
  { key: 'net_profit', label: '净利润', color: '#8b5cf6' },
  { key: 'deducted_net_profit', label: '扣非净利润', color: '#ef4444' },
]

/** 从季度数据中提取指定指标值；毛利润 = 营收 - 成本 */
function getMetricValue(q: FinancialQuarter, metric: MetricKey): number | null {
  switch (metric) {
    case 'revenue':
      return q.revenue
    case 'cost':
      return q.cost
    case 'gross_profit':
      return q.revenue != null && q.cost != null ? q.revenue - q.cost : null
    case 'net_profit':
      return q.net_profit
    case 'deducted_net_profit':
      return q.deducted_net_profit ?? null
    case 'all':
      return null // 全部模式不走单指标取值
  }
}

/** 根据容器宽度决定最多展示几个季度（上市越久 → 宽度越宽 → 展示越多） */
function getMaxQuarters(width: number): number {
  if (width === 0) return 40 // 尚未测量，默认全量（10年）
  if (width < 500) return 8   // 2年
  if (width < 700) return 16  // 4年
  if (width < 900) return 24  // 6年
  return 40                   // 10年
}

/** 计算最新季度相对于去年同期的同比增长率 */
function computeYoYGrowth(quarters: FinancialQuarter[], field: 'revenue' | 'deducted_net_profit'): number | null {
  if (!quarters || quarters.length < 5) return null
  const current = quarters[0]  // 最新在前
  const currentYear = parseInt(current.period.slice(0, 4))
  const currentQ = current.period.slice(4, 6)
  const yearAgo = quarters.find(q => {
    const y = parseInt(q.period.slice(0, 4))
    const qStr = q.period.slice(4, 6)
    return y === currentYear - 1 && qStr === currentQ
  })
  const currentVal = current[field]
  const yearAgoVal = yearAgo?.[field]
  if (currentVal != null && yearAgoVal != null && yearAgoVal !== 0) {
    return parseFloat((((currentVal - yearAgoVal) / Math.abs(yearAgoVal)) * 100).toFixed(2))
  }
  return null
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
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

      {/* ===== 盈利能力 ===== */}
      <div className="mb-3">
        <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <span className="w-1 h-3 bg-emerald-500 rounded-full" />
          盈利能力
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <MetricCard label="营业收入" value={data.revenue} format="yi" />
          <MetricCard label="营业成本" value={data.cost} format="yi" />
          <MetricCard label="毛利率" value={data.gross_margin} suffix="%" formula="(收入-成本)/收入" />
          <MetricCard label="净利率" value={data.net_margin} suffix="%" formula="净利润/收入" />
          <MetricCard
            label="扣非净利率"
            formula="扣非净利润/收入"
            value={data.revenue && data.deducted_net_profit != null
              ? parseFloat(((data.deducted_net_profit / data.revenue) * 100).toFixed(2))
              : null}
            suffix="%"
          />
        </div>
      </div>

      {/* ===== 成长能力 ===== */}
      <div className="mb-3">
        <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <span className="w-1 h-3 bg-blue-500 rounded-full" />
          成长能力
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="营收同比增速"
            value={computeYoYGrowth(data.quarters, 'revenue')}
            suffix="%"
            formula="(本期-去年同期)/|去年同期|"
          />
          <MetricCard
            label="扣非净利同比增速"
            value={computeYoYGrowth(data.quarters, 'deducted_net_profit')}
            suffix="%"
            formula="(本期-去年同期)/|去年同期|"
          />
        </div>
      </div>

      {/* ===== 财务健康 ===== */}
      <div>
        <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <span className="w-1 h-3 bg-amber-500 rounded-full" />
          财务健康
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <MetricCard
            label="资产负债率"
            value={data.total_assets != null && data.total_liabilities != null && data.total_assets !== 0
              ? parseFloat(((data.total_liabilities / data.total_assets) * 100).toFixed(2))
              : null}
            suffix="%"
            formula="总负债/总资产"
          />
          <MetricCard label="经营现金流净额" value={data.operating_cashflow} format="yi" />
          <MetricCard
            label="现金流/净利润"
            value={data.net_profit != null && data.operating_cashflow != null && data.net_profit !== 0
              ? parseFloat((data.operating_cashflow / data.net_profit).toFixed(2))
              : null}
            formula="经营现金流/净利润"
          />
        </div>
      </div>

      {/* 季度趋势图 */}
      {hasQuarters && (
        <QuarterlyTrendChart quarters={data.quarters} />
      )}
    </Card>
  )
}

function MetricCard({
  label,
  value,
  suffix,
  format,
  formula,
}: {
  label: string
  value: number | null
  suffix?: string
  format?: 'yi' | 'wan'
  formula?: string
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
      {formula && (
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{formula}</p>
      )}
    </div>
  )
}

// ============================================================================
// 季度趋势柱状图 — 指标筛选器 + 全部模式 + 宽度自适应
// ============================================================================
function QuarterlyTrendChart({ quarters }: { quarters: FinancialQuarter[] }) {
  const [metric, setMetric] = useState<MetricKey>('all')
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // ResizeObserver 监听容器宽度
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const isAll = metric === 'all'
  const activeMetrics = isAll
    ? METRICS.filter((m) => m.key !== 'all')
    : [METRICS.find((m) => m.key === metric)!]

  // 按时间顺序排列（旧→新），根据宽度裁剪
  const chartData = useMemo(() => {
    const chronological = [...quarters].reverse() // DB 返回新→旧，翻转为旧→新
    const maxQ = getMaxQuarters(containerWidth)
    return chronological.slice(-maxQ) // 取最近 N 个季度
  }, [quarters, containerWidth])

  const periods = chartData.map((d) => d.period)

  // 仅在单指标 + 季度不多时显示柱顶数值标签
  const showLabel = !isAll && chartData.length <= 8

  // 为每个活跃指标提取一列数据
  function getSeriesData(key: MetricKey): (number | null)[] {
    return chartData.map((q) => getMetricValue(q, key))
  }

  // 计算 Y 轴最大值（为标签留 15% 余量）
  function calcYMax(): number | undefined {
    if (!showLabel) return undefined
    const allValues = activeMetrics.flatMap((m) => getSeriesData(m.key))
    const valid = allValues.filter((v) => v != null) as number[]
    if (valid.length === 0) return undefined
    return Math.max(...valid) * 1.18
  }

  const option = useMemo(() => {
    const yMax = calcYMax()

    return {
      ...BASE_CHART_OPTION,
      tooltip: {
        ...BASE_CHART_OPTION.tooltip,
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          const lines = items.map((p: any) => {
            const val = p.value != null ? `${(p.value / 1e8).toFixed(2)}亿` : '—'
            return `${p.marker} ${p.seriesName}: ${val}`
          })
          return `<div style="font-size:12px"><b>${items[0]?.axisValue || ''}</b><br/>${lines.join('<br/>')}</div>`
        },
      },
      legend: isAll
        ? {
            data: activeMetrics.map((m) => m.label),
            bottom: 0,
            textStyle: { fontSize: 11, color: '#94a3b8' },
            itemWidth: 12,
            itemHeight: 8,
          }
        : undefined,
      // grid.top 为柱顶标签留出足够空间，避免截断
      grid: {
        left: '3%',
        right: '4%',
        top: showLabel ? '12%' : '8%',
        bottom: isAll ? 40 : 30,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: periods,
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        max: yMax,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (v: number) => `${(v / 1e8).toFixed(0)}亿`,
        },
      },
      series: activeMetrics.map((m) => ({
        name: m.label,
        type: 'bar',
        data: getSeriesData(m.key),
        itemStyle: {
          color: m.color,
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: isAll ? 28 : 52,
        barGap: isAll ? '30%' : undefined,
        label: showLabel
          ? {
              show: true,
              position: 'top',
              color: '#64748b',
              fontSize: 10,
              formatter: (p: any) => (p.value != null ? `${(p.value / 1e8).toFixed(1)}亿` : ''),
            }
          : undefined,
      })),
    }
  }, [periods, isAll, showLabel, activeMetrics, chartData]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef}>
      {/* 标题 + 指标筛选器 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">季度趋势</p>
        <div className="flex rounded-md border overflow-hidden">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap',
                metric === m.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ReactEChartsCore
        option={option}
        style={{ height: isAll ? '300px' : '260px' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
