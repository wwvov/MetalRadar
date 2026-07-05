import { useState, useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { BASE_CHART_OPTION, CANDLESTICK_STYLE, CHART_COLORS } from '@/utils/echarts-config'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KlineData } from '@/types/company'

type Frequency = 'daily' | 'weekly' | 'monthly'

const FREQ_LABELS: Record<Frequency, string> = { daily: '日K', weekly: '周K', monthly: '月K' }

interface StockKlineChartProps {
  data: KlineData[]
  companyName: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  frequency: Frequency
  onFrequencyChange: (freq: Frequency) => void
}

export function StockKlineChart({
  data,
  companyName,
  isLoading,
  isError,
  onRetry,
  frequency,
  onFrequencyChange,
}: StockKlineChartProps) {
  const [showMA, setShowMA] = useState(false)  // 默认不显示MA

  const option = useMemo(() => {
    if (!data || data.length === 0) return null

    const dates = data.map((d) => d.date)
    const ohlc = data.map((d) => [d.open, d.close, d.low, d.high])
    const volumes = data.map((d) => d.volume)
    const ma5 = calcMA(data.map((d) => d.close), 5)
    const ma10 = calcMA(data.map((d) => d.close), 10)
    const ma20 = calcMA(data.map((d) => d.close), 20)

    const latest = data[data.length - 1]
    const prev = data[data.length - 2]
    const changePct = prev ? ((latest.close - prev.close) / prev.close * 100) : 0

    return {
      ...BASE_CHART_OPTION,
      title: {
        text: companyName,
        subtext: `${latest.date}  收盘 ${latest.close.toFixed(2)}  ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
        left: 0,
        top: 0,
        textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
        subtextStyle: { fontSize: 12, color: changePct >= 0 ? CHART_COLORS.up : CHART_COLORS.down },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: any) => {
          const k = params.find((p: any) => p.seriesName === 'K线')
          if (!k) return ''
          const d = k.data
          return `
            <div style="font-size:12px">
              <div style="margin-bottom:4px">${k.axisValue}</div>
              <div>开: ${d[1].toFixed(2)}</div>
              <div>收: ${d[2].toFixed(2)}</div>
              <div>低: ${d[3].toFixed(2)}</div>
              <div>高: ${d[4].toFixed(2)}</div>
              <div>量: ${(d[5] / 10000).toFixed(0)}万手</div>
            </div>
          `
        },
      },
      grid: [
        { left: '3%', right: '3%', top: 60, height: '55%' },
        { left: '3%', right: '3%', top: '80%', height: '15%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          axisTick: { show: false },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          scale: true,
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLabel: { color: '#94a3b8', fontSize: 9, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: ohlc,
          xAxisIndex: 0,
          yAxisIndex: 0,
          ...CANDLESTICK_STYLE,
        },
        ...(showMA
          ? [
              {
                name: 'MA5',
                type: 'line',
                data: ma5,
                xAxisIndex: 0,
                yAxisIndex: 0,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 1, color: '#f59e0b' },
              },
              {
                name: 'MA10',
                type: 'line',
                data: ma10,
                xAxisIndex: 0,
                yAxisIndex: 0,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 1, color: '#3b82f6' },
              },
              {
                name: 'MA20',
                type: 'line',
                data: ma20,
                xAxisIndex: 0,
                yAxisIndex: 0,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 1, color: '#a855f7' },
              },
            ]
          : []),
        {
          name: '成交量',
          type: 'bar',
          data: volumes,
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: {
            color: (params: any) => {
              const idx = params.dataIndex
              if (idx === 0) return CHART_COLORS.down
              return data[idx].close >= data[idx].open ? CHART_COLORS.up : CHART_COLORS.down
            },
          },
        },
      ],
    }
  }, [data, companyName, showMA])

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          市值走势
        </h3>
        <ErrorCard onRetry={onRetry} />
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          市值走势
        </h3>
        <div className="text-center py-12 text-sm text-slate-400">
          <TrendingUp className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          暂无K线数据
        </div>
      </Card>
    )
  }

  if (!option) return null

  const latest = data[data.length - 1]
  const prev = data[data.length - 2]
  const changePct = prev ? ((latest.close - prev.close) / prev.close * 100) : 0
  const changeAmt = prev ? (latest.close - prev.close) : 0

  return (
    <Card className="p-5">
      {/* 标题栏 + 控制按钮 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          市值走势
        </h3>
        <div className="flex items-center gap-2">
          {/* 最新价摘要 */}
          <div className="hidden sm:flex items-center gap-2 mr-3 text-xs">
            <span className="text-slate-500">最新价</span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {latest.close.toFixed(2)}
            </span>
            <span
              className={cn(
                'tabular-nums font-medium',
                changePct >= 0 ? 'text-red-500' : 'text-green-500'
              )}
            >
              {changePct >= 0 ? (
                <TrendingUp className="w-3 h-3 inline" />
              ) : (
                <TrendingDown className="w-3 h-3 inline" />
              )}{' '}
              {changeAmt >= 0 ? '+' : ''}
              {changeAmt.toFixed(2)} ({changePct >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%)
            </span>
          </div>
          {/* MA 切换 */}
          <Button
            variant={showMA ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 text-[11px] px-2"
            onClick={() => setShowMA(!showMA)}
          >
            MA
          </Button>
          {/* 周期切换 */}
          <div className="flex rounded-md border overflow-hidden">
            {(Object.entries(FREQ_LABELS) as [Frequency, string][]).map(([key, label]) => (
              <button
                key={key}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium transition-colors',
                  frequency === key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                )}
                onClick={() => onFrequencyChange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* K线图 */}
      <ReactEChartsCore
        option={option}
        style={{ height: '420px' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
      />
    </Card>
  )
}

/** 计算移动平均线 */
function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j]
      }
      result.push(Number((sum / period).toFixed(2)))
    }
  }
  return result
}
