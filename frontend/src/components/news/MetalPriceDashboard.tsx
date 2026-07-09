import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Gauge,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Star,
  RefreshCw,
  Search,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFuturesDashboard, useCompaniesWithMaterials } from '@/hooks/useFutures'
import { ErrorCard } from './ErrorCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { CompanyBasic } from '@/types/company'
import type { DashboardMaterial, PricePercentile, FuturesQuote } from '@/types/futures'

// ===== 价格格式化 =====
function fmtPrice(v: number, unit: string): string {
  if (Math.abs(v) >= 10000) {
    return `${(v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万${unit ? ' ' + unit : ''}`
  }
  return `${v.toLocaleString('zh-CN')}${unit ? ' ' + unit : ''}`
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return v.toLocaleString('zh-CN')
}

// ===== 迷你折线图 (SVG) =====
function MiniLineChart({ data, width = 200, height = 48 }: { data: { date: string; close: number }[]; width?: number; height?: number }) {
  if (data.length < 2) return <div className="text-xs text-slate-400 text-center py-2">数据不足</div>

  const values = data.map(d => d.close)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const padding = 4
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * chartW
    const y = padding + (1 - (v - minV) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  const isUp = values[0] <= values[values.length - 1]
  const color = isUp ? '#ef4444' : '#10b981'
  const areaTop = padding
  const firstX = padding
  const lastX = padding + chartW

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`fill-${data[0].date}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${firstX},${areaTop + chartH} ${points} ${lastX},${areaTop + chartH}`}
        fill={`url(#fill-${data[0].date})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={firstX} cy={padding + (1 - (values[0] - minV) / range) * chartH} r="2" fill={color} />
      <circle cx={lastX} cy={padding + (1 - (values[values.length-1] - minV) / range) * chartH} r="2" fill={color} />
    </svg>
  )
}

// ===== 报价区 =====
function QuoteSection({ material, unit, quote }: { material: string; unit: string; quote: FuturesQuote }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-800">
          {material}
          <span className="text-[11px] text-slate-400 ml-1">· {quote.contract}</span>
        </span>
        <span className={cn(
          'flex items-center gap-0.5 text-[13px] font-semibold tabular-nums',
          quote.change_pct > 0 ? 'text-rose-600' :
          quote.change_pct < 0 ? 'text-emerald-600' :
          'text-slate-500',
        )}>
          {quote.change_pct > 0 ? <TrendingUp className="w-3.5 h-3.5" /> :
           quote.change_pct < 0 ? <TrendingDown className="w-3.5 h-3.5" /> :
           <Minus className="w-3.5 h-3.5" />}
          {quote.change_pct > 0 ? '+' : ''}{quote.change_pct}%
        </span>
      </div>
      <p className="text-[20px] font-semibold tabular-nums text-slate-900">
        {fmtPrice(quote.price, unit)}
      </p>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">今开</span>
          <span className="float-right font-medium tabular-nums">{fmtPrice(quote.open, unit)}</span>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">合约</span>
          <span className="float-right font-medium">{quote.contract}</span>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">最高</span>
          <span className="float-right font-medium tabular-nums text-rose-600">{fmtPrice(quote.high, unit)}</span>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">最低</span>
          <span className="float-right font-medium tabular-nums text-emerald-600">{fmtPrice(quote.low, unit)}</span>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">成交量</span>
          <span className="float-right font-medium tabular-nums">{fmtNum(quote.volume)}手</span>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <span className="text-slate-400">持仓量</span>
          <span className="float-right font-medium tabular-nums">{fmtNum(quote.open_interest)}手</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-right">{quote.date}</p>
    </div>
  )
}

// ===== 压力仪表条 =====
function PressureBar({ material }: { material: DashboardMaterial }) {
  const p = material.pressure
  if (!p) return <div className="text-xs text-slate-400">等待行情数据...</div>

  const levelColors: Record<string, string> = {
    low: 'bg-emerald-500',
    medium: 'bg-amber-500',
    high: 'bg-rose-500',
  }
  const levelLabels: Record<string, string> = {
    low: '压力较小',
    medium: '压力中等',
    high: '压力显著',
  }
  const levelIcons: Record<string, typeof CheckCircle2> = {
    low: CheckCircle2,
    medium: AlertTriangle,
    high: AlertTriangle,
  }
  const Icon = levelIcons[p.pressure_level]

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-700">{material.material_name}</span>
        <Badge className={cn(
          'text-[10px] py-0 px-1.5 border-0',
          p.pressure_level === 'low' && 'bg-emerald-50 text-emerald-700',
          p.pressure_level === 'medium' && 'bg-amber-50 text-amber-700',
          p.pressure_level === 'high' && 'bg-rose-50 text-rose-700',
        )}>
          <Icon className="w-3 h-3 mr-0.5" />
          {levelLabels[p.pressure_level]}
        </Badge>
      </div>

      <Tooltip>
        <TooltipTrigger>
          <div className="relative h-5 rounded-full bg-slate-100 overflow-hidden cursor-help">
            <div className="absolute left-0 top-0 h-full bg-emerald-400/60" style={{ width: '20%' }} />
            <div className="absolute left-[20%] top-0 h-full bg-amber-400/60" style={{ width: '40%' }} />
            <div className="absolute left-[60%] top-0 h-full bg-rose-400/60" style={{ width: '40%' }} />
            <div className="absolute left-1/2 top-0 h-full w-px bg-slate-400/80 z-10" />
            <div
              className="absolute top-0 h-full z-20 transition-all"
              style={{ left: `${Math.min(Math.max(50 + p.change_pct * 1.5, 3), 97)}%` }}
            >
              <div className={cn('absolute -top-0.5 -translate-x-1/2 w-2 h-2 rotate-45', levelColors[p.pressure_level])} />
            </div>
            <span className={cn(
              'absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold z-10',
              p.change_pct > 0 ? 'text-rose-600' : p.change_pct < 0 ? 'text-emerald-600' : 'text-slate-500',
            )}
              style={{ left: `${Math.min(Math.max(50 + p.change_pct * 1.5, 8), 92)}%` }}
            >
              {p.change_pct > 0 ? '+' : ''}{p.change_pct}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px] max-w-[240px]">
          <div className="space-y-1">
            <p><strong>成本占比:</strong> {material.cost_pct ?? '?'}%</p>
            <p><strong>基准价:</strong> {p.base_price ? fmtPrice(p.base_price, material.unit) : '未设定'}</p>
            <p><strong>当前价:</strong> {fmtPrice(p.current_price, material.unit)}</p>
          </div>
        </TooltipContent>
      </Tooltip>

      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{'<'}5% 较小</span>
        <span>5-15% 中等</span>
        <span>{'>'}15% 显著</span>
      </div>

      <p className="text-[11px] text-slate-500">
        较基准价{p.base_price ? fmtPrice(p.base_price, material.unit) : '(未设定)'}
        {' '}涨跌{p.change_pct > 0 ? '+' : ''}{p.change_pct}%
      </p>
    </div>
  )
}

// ===== 价格分位温度计 =====
function PercentileThermometer({
  percentile,
  period,
  onTogglePeriod,
  unit = '',
}: {
  percentile: PricePercentile | null
  period: 252 | 504
  onTogglePeriod: () => void
  unit?: string
}) {
  if (!percentile) return <div className="text-xs text-slate-400">等待行情数据...</div>

  const { year_high, year_low, percentile: pct } = percentile
  const level = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low'

  const levelText: Record<string, string> = {
    high: '⚠ 处于高位，成本端压力显著',
    medium: '● 处于中等水平，成本端中性',
    low: '✓ 处于低位，成本端改善',
  }
  const levelBg: Record<string, string> = {
    high: 'bg-rose-50 text-rose-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-emerald-50 text-emerald-700',
  }

  // 指针位置（防止溢出边界）
  const pointerPct = Math.min(Math.max(pct, 3), 97)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-700">
          当前价处于过去{period === 252 ? '365' : '730'}天 {pct}% 分位
        </span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="sm" className={cn('h-5 text-[10px] px-1.5', period === 252 && 'bg-amber-100 text-amber-700')} onClick={onTogglePeriod} disabled={period === 252}>过去365天</Button>
          <Button variant="ghost" size="sm" className={cn('h-5 text-[10px] px-1.5', period === 504 && 'bg-amber-100 text-amber-700')} onClick={onTogglePeriod} disabled={period === 504}>过去730天</Button>
        </div>
      </div>

      {/* 温度计条 + 指针：增加高度，指针用深色与所有背景色形成对比 */}
      <div className="relative pt-5 pb-1">
        {/* 梯度色条 */}
        <div className="relative h-6 rounded-full" style={{ background: 'linear-gradient(to right, #10b981, #eab308, #f97316, #ef4444)' }}>
          {/* 刻度标记：中心线 */}
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/60 z-10" />
        </div>
        {/* 指针：深色三角形 + 百分比，位于色条上方，避免被 overflow 截断 */}
        <div className="absolute top-0 -translate-x-1/2 z-20 transition-all duration-300" style={{ left: `${pointerPct}%` }}>
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-bold text-slate-800 leading-none mb-0.5 tabular-nums">{pct}%</span>
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-slate-700 drop-shadow-sm" />
          </div>
        </div>
        {/* 低/高标签 */}
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>低 {fmtPrice(year_low, unit)}</span>
          <span>高 {fmtPrice(year_high, unit)}</span>
        </div>
      </div>
      <p className={cn('text-[11px] rounded px-2 py-1', levelBg[level])}>{levelText[level]}</p>
    </div>
  )
}

// ===== 主组件 =====
interface Props {
  follows: CompanyBasic[]
  className?: string
}

export function MetalPriceDashboard({ follows, className }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [percentilePeriod, setPercentilePeriod] = useState<252 | 504>(252)
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 数据查询（始终按选中公司查询，无概览模式）
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useFuturesDashboard(selectedId)
  const companiesQuery = useCompaniesWithMaterials()

  // 所有有材料数据的公司列表
  const allCompanies = companiesQuery.data?.data || []
  const followedIds = new Set(follows.map(f => f.id))

  // 排序后的公司列表：已关注 + 星标在前
  const sortedCompanies = useMemo(() => {
    return [...allCompanies].sort((a, b) => {
      const aF = followedIds.has(a.id) ? 0 : 1
      const bF = followedIds.has(b.id) ? 0 : 1
      return aF - bF
    })
  }, [allCompanies, followedIds])

  // 搜索过滤
  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return sortedCompanies
    const q = companySearch.toLowerCase()
    return sortedCompanies.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.includes(q) || c.id.includes(q)
    )
  }, [sortedCompanies, companySearch])

  // 自动选择第一个公司
  useEffect(() => {
    if (allCompanies.length > 0) {
      setSelectedId((prev) => {
        if (prev && allCompanies.some(c => c.id === prev)) return prev
        // 优先选第一个关注的公司
        const firstFollowed = allCompanies.find(c => followedIds.has(c.id))
        return firstFollowed?.id || allCompanies[0]?.id || null
      })
    } else if (follows.length > 0) {
      // 如果还没有材料数据，回退到关注列表
      setSelectedId((prev) => {
        if (prev && follows.some(f => f.id === prev)) return prev
        return follows[0].id
      })
    }
  }, [allCompanies, follows])

  // 选中公司变化时重置材料索引
  useEffect(() => {
    setActiveIdx(0)
  }, [selectedId])

  // 外部点击关闭选择器
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setCompanyPickerOpen(false)
        setCompanySearch('')
      }
    }
    if (companyPickerOpen) {
      document.addEventListener('mousedown', handler)
      // 聚焦搜索框
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    return () => document.removeEventListener('mousedown', handler)
  }, [companyPickerOpen])

  const handleSelectCompany = useCallback((id: string) => {
    setSelectedId(id)
    setActiveIdx(0)
    setCompanyPickerOpen(false)
    setCompanySearch('')
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // 判断数据
  const noData = allCompanies.length === 0 && follows.length === 0

  // 获取材料列表
  const materials: DashboardMaterial[] = data?.data?.materials || []
  const company = data?.data?.company
  const activeMaterial = materials[activeIdx] || null

  // 格式化最后更新时间
  const lastUpdatedText = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--'

  return (
    <Card className={cn('border-amber-200 shadow-sm flex flex-col min-h-[420px]', className)}>
      {/* ===== 顶部标题 + 公司切换器 + 刷新 ===== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-5 h-5 text-amber-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800 whitespace-nowrap">
            敏感金属价格仪表盘
          </h3>
        </div>

        {noData ? (
          <span className="text-[11px] text-slate-400">请先关注公司</span>
        ) : (
          <div className="relative" ref={pickerRef}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[12px] text-slate-600 max-w-[200px]"
              onClick={() => setCompanyPickerOpen(!companyPickerOpen)}
            >
              <span className="truncate">
                {company?.name || follows[0]?.name || '选择公司'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </Button>
            {companyPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                {/* 搜索框 */}
                <div className="p-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-md px-2 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      placeholder="搜索公司名称或代码..."
                      className="bg-transparent text-[12px] outline-none flex-1 text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
                {/* 列表 */}
                <div className="max-h-64 overflow-y-auto">
                  {filteredCompanies.map((c) => {
                    const isFollowed = followedIds.has(c.id)
                    return (
                      <button
                        key={c.id}
                        className={cn(
                          'w-full text-left px-3 py-2 text-[12px] hover:bg-amber-50 transition-colors flex items-center gap-2',
                          selectedId === c.id && 'bg-amber-100 text-amber-900 font-medium',
                        )}
                        onClick={() => handleSelectCompany(c.id)}
                      >
                        {isFollowed && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="text-slate-400 ml-auto shrink-0">{c.code}</span>
                      </button>
                    )
                  })}
                  {filteredCompanies.length === 0 && (
                    <div className="text-center py-4 text-[12px] text-slate-400">
                      无匹配公司
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 刷新 + 状态 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {lastUpdatedText}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-600"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </Button>
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            实时
          </span>
        </div>
      </div>

      {/* ===== 错误/加载/空态 ===== */}
      {noData ? (
        <div className="flex-1 flex items-center justify-center py-12 text-sm text-slate-400">
          请先在「我的关注」中添加公司
        </div>
      ) : isError ? (
        <div className="p-4">
          <ErrorCard onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        // ===== 单公司模式 =====
        <>
          {materials.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-sm text-slate-400">
              该公司暂无敏感品种数据
            </div>
          ) : (
            <>
              {/* 品种切换 Tab */}
              <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto border-b border-amber-50 shrink-0 scrollbar-hide">
                {materials.map((m, i) => (
                  <Button
                    key={m.material_name}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 text-[11px] px-2 rounded-full shrink-0',
                      activeIdx === i
                        ? 'bg-amber-100 text-amber-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-100',
                    )}
                    onClick={() => setActiveIdx(i)}
                  >
                    {m.material_name}
                    {m.cost_pct != null && (
                      <span className="ml-0.5 text-[10px] opacity-60">{m.cost_pct}%</span>
                    )}
                  </Button>
                ))}
              </div>

              {/* 内容区 */}
              {activeMaterial && (
                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                  {/* 报价区 */}
                  {activeMaterial.quote ? (
                    <QuoteSection material={activeMaterial.material_name} unit={activeMaterial.unit} quote={activeMaterial.quote} />
                  ) : (
                    <div className="text-[12px] text-slate-400 py-4 text-center bg-slate-50 rounded-lg">
                      暂无 {activeMaterial.material_name} 期货报价
                      {activeMaterial.contract ? '' : '（未配置合约代码）'}
                    </div>
                  )}

                  <div className="border-t border-slate-100" />

                  {/* 压力仪表条 */}
                  <PressureBar material={activeMaterial} />

                  {/* 价格分位温度计 */}
                  {(percentilePeriod === 252 ? activeMaterial.percentile_1y : activeMaterial.percentile_2y) && (
                    <PercentileThermometer
                      percentile={percentilePeriod === 252 ? activeMaterial.percentile_1y! : activeMaterial.percentile_2y!}
                      period={percentilePeriod}
                      onTogglePeriod={() => setPercentilePeriod(p => p === 252 ? 504 : 252)}
                      unit={activeMaterial.unit}
                    />
                  )}

                  {/* 2026年以来涨跌幅 */}
                  {activeMaterial.ytd_change_pct != null && (
                    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-[12px] font-medium text-slate-600">2026年以来</span>
                      <span className={cn(
                        'text-[13px] font-semibold tabular-nums',
                        activeMaterial.ytd_change_pct > 0 ? 'text-rose-600' :
                        activeMaterial.ytd_change_pct < 0 ? 'text-emerald-600' :
                        'text-slate-500',
                      )}>
                        {activeMaterial.ytd_change_pct > 0 ? '+' : ''}{activeMaterial.ytd_change_pct}%
                      </span>
                    </div>
                  )}

                  {/* 近3月走势 */}
                  {activeMaterial.history_3m.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-slate-700">近3月走势</span>
                        <span className={cn(
                          'text-[11px] font-medium tabular-nums',
                          activeMaterial.history_3m[0].close <=
                            activeMaterial.history_3m[activeMaterial.history_3m.length - 1].close
                            ? 'text-rose-600' : 'text-emerald-600',
                        )}>
                          涨跌 {(() => {
                            const first = activeMaterial.history_3m[0].close
                            const last = activeMaterial.history_3m[activeMaterial.history_3m.length - 1].close
                            const pct = ((last - first) / first * 100).toFixed(2)
                            return `${+pct > 0 ? '+' : ''}${pct}%`
                          })()}
                        </span>
                      </div>
                      <div className="h-12 bg-slate-50 rounded">
                        <MiniLineChart data={activeMaterial.history_3m} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>3个月前</span>
                        <span>当前</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}
