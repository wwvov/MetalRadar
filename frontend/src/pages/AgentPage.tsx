import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAgent, useSessions, useSessionDetail, useModels, useReport, useDashboard, useRecommended } from '@/hooks/useAgent'
import { agentService } from '@/services/agentService'
import { useWatchlist } from '@/providers'
import { useFollows } from '@/hooks/useFollows'
import ReactEChartsCore from 'echarts-for-react'
import { BASE_CHART_OPTION, CHART_COLORS } from '@/utils/echarts-config'
import type { ChartData, RiskReport, ChatSessionItem } from '@/types/agent'
import {
  Bot, Send, Zap, AlertTriangle, MessageSquare, FileText, Download,
  User, TrendingUp, TrendingDown, X,
  Loader2, Search, Plus, Trash2, Edit3, PanelRightClose, PanelRightOpen,
  BarChart3, Globe, Newspaper, ChevronRight, Maximize2,
  FileDown, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Simple Markdown Renderer ──────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm text-rose-600">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-900 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-900 mt-4 mb-2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-slate-700">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-slate-700">$1. $2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/---/g, '<hr class="my-3 border-slate-200"/>')
  return <div className="text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />
}

// ─── Chart Renderer ────────────────────────────────────────────

function ChartRenderer({ chart, onEnlarge }: { chart: ChartData; onEnlarge?: () => void }) {
  let option: any = {}
  if (chart.type === 'bar') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '8%', top: 30, bottom: 20, containLabel: true },
      xAxis: { type: 'category', data: items.map(i => i.name), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', name: '%', axisLabel: { fontSize: 10, formatter: '{value}%' } },
      series: [{
        type: 'bar', data: items.map((i: any) => ({
          value: i.change_pct,
          itemStyle: { color: (i.change_pct ?? 0) >= 0 ? CHART_COLORS.up : CHART_COLORS.down },
        })), barMaxWidth: 32,
      }],
    }
  } else if (chart.type === 'score_bar') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis', formatter: '{b}: {c}分' },
      grid: { left: '3%', right: '8%', top: 30, bottom: 30, containLabel: true },
      xAxis: { type: 'category', data: items.map(i => i.name), axisLabel: { fontSize: 10, rotate: 20 } },
      yAxis: { type: 'value', name: '分', min: 0, max: 100, axisLabel: { fontSize: 10, formatter: '{value}' } },
      series: [{
        type: 'bar', data: items.map((i: any) => ({
          value: i.score,
          itemStyle: { color: (i.score ?? 50) >= 70 ? '#dc2626' : (i.score ?? 50) >= 40 ? '#ca8a04' : '#16a34a' },
        })), barMaxWidth: 32,
      }],
    }
  } else if (chart.type === 'line') {
    const prices = (chart.data.prices as number[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '5%', top: 30, bottom: 20 },
      xAxis: { type: 'category', data: prices.map((_, i) => `D-${prices.length - i}`), show: false },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line', data: prices, smooth: true,
        lineStyle: { color: CHART_COLORS.primary, width: 2 },
        areaStyle: { color: 'rgba(124, 58, 237, 0.08)' },
        showSymbol: false,
      }],
    }
  } else if (chart.type === 'gauge') {
    const score = (chart.data.score as number) || 50
    option = {
      series: [{
        type: 'gauge', startAngle: 210, endAngle: -30, center: ['50%', '60%'], radius: '80%', min: 0, max: 100,
        axisLine: { lineStyle: { width: 10, color: [[0.4, '#22c55e'], [0.7, '#eab308'], [1, '#ef4444']] } },
        pointer: { length: '55%', width: 5, itemStyle: { color: '#334155' } },
        axisTick: { distance: -10, length: 5 },
        splitLine: { distance: -16, length: 12 },
        axisLabel: { fontSize: 10, distance: 22, color: '#64748b' },
        detail: { valueAnimation: true, formatter: '{value}', fontSize: 24, offsetCenter: [0, '70%'], color: '#0f172a' },
        data: [{ value: score }],
      }],
    }
  } else if (chart.type === 'pie') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 9 } },
      series: [{
        type: 'pie', radius: ['30%', '55%'], center: ['50%', '45%'],
        data: items.map((it, idx) => ({
          name: it.name, value: it.score,
          itemStyle: { color: CHART_COLORS.palette[idx % CHART_COLORS.palette.length] },
        })),
        label: { fontSize: 9 },
      }],
    }
  }
  return (
    <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200 p-2 relative group">
      {chart.title && <p className="text-xs font-medium text-slate-500 mb-1">{chart.title}</p>}
      <ReactEChartsCore option={option} style={{ height: 180 }} notMerge />
      {onEnlarge && (
        <button onClick={onEnlarge} className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white transition-opacity">
          <Maximize2 className="w-3 h-3 text-slate-400" />
        </button>
      )}
    </div>
  )
}

// ─── Chart Modal ───────────────────────────────────────────────

function ChartModal({ chart, onClose }: { chart: ChartData; onClose: () => void }) {
  let option: any = {}
  if (chart.type === 'bar') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '5%', right: '10%', top: 50, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: items.map(i => i.name), axisLabel: { fontSize: 12 } },
      yAxis: { type: 'value', name: '变动(%)', axisLabel: { fontSize: 12 } },
      series: [{
        type: 'bar', data: items.map((i: any) => ({
          value: i.change_pct,
          itemStyle: { color: (i.change_pct ?? 0) >= 0 ? CHART_COLORS.up : CHART_COLORS.down },
        })), barMaxWidth: 50,
      }],
    }
  } else if (chart.type === 'line') {
    const prices = (chart.data.prices as number[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '5%', right: '5%', top: 50, bottom: 40 },
      xAxis: { type: 'category', data: prices.map((_, i) => `${prices.length - i}天前`), axisLabel: { fontSize: 11, rotate: 30 } },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 11 } },
      series: [{
        type: 'line', data: prices, smooth: true,
        lineStyle: { color: CHART_COLORS.primary, width: 2 },
        areaStyle: { color: 'rgba(124, 58, 237, 0.1)' },
      }],
    }
  } else if (chart.type === 'gauge') {
    const score = (chart.data.score as number) || 50
    option = {
      series: [{
        type: 'gauge', startAngle: 210, endAngle: -30, radius: '90%',
        axisLine: { lineStyle: { width: 16, color: [[0.4, '#22c55e'], [0.7, '#eab308'], [1, '#ef4444']] } },
        detail: { fontSize: 36, offsetCenter: [0, '80%'] },
        data: [{ value: score }],
      }],
    }
  } else if (chart.type === 'pie') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } },
      series: [{
        type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
        data: items.map((it, idx) => ({
          name: it.name, value: it.score,
          itemStyle: { color: CHART_COLORS.palette[idx % CHART_COLORS.palette.length] },
        })),
        label: { fontSize: 10 },
      }],
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[700px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">{chart.title || '图表详情'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <ReactEChartsCore option={option} style={{ height: 400 }} notMerge />
      </div>
    </div>
  )
}

// ─── Risk Badge ────────────────────────────────────────────────

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  if (!level) return null
  const colors: Record<string, string> = {
    '低风险': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '中等风险': 'bg-amber-50 text-amber-700 border-amber-200',
    '高风险': 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', colors[level] || 'bg-slate-100')}>
      <AlertTriangle className="w-3 h-3" />{level}{score != null && ` ${score}分`}
    </span>
  )
}

// ─── Resizable Panel Hook ──────────────────────────────────────

function useResizablePanel(initialWidth: number, minWidth: number, maxWidth: number, direction: 'normal' | 'reverse' = 'normal') {
  const [width, setWidth] = useState(initialWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(width)

  const start = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const stop = useCallback(() => {
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const move = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const effectiveDelta = direction === 'reverse' ? -delta : delta
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + effectiveDelta))
    setWidth(newWidth)
  }, [minWidth, maxWidth, direction])

  useEffect(() => {
    const onMove = (e: MouseEvent) => move(e)
    const onUp = () => stop()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [move, stop])

  return { width, start, isDragging: isDragging.current }
}

function ResizeHandle({ onMouseDown, className }: { onMouseDown: (e: React.MouseEvent) => void; className?: string }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn('w-1.5 hover:w-2 cursor-col-resize bg-slate-200 hover:bg-green-400 transition-all z-20 shrink-0', className)}
    />
  )
}

// ─── LEFT: Session Sidebar ─────────────────────────────────────

function SessionSidebar({
  sessions, activeId, onSelect, onCreate, onDelete, onRename, onClose
}: {
  sessions: ChatSessionItem[]
  activeId?: string
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onClose: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  return (
    <div className="w-full h-full bg-white border-r border-slate-200 flex flex-col">
      <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">历史会话</span>
        <div className="flex items-center gap-1">
          <button onClick={onCreate} className="p-1.5 rounded-lg hover:bg-green-50 text-green-800" title="新建会话">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 md:hidden">
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {sessions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">暂无会话</p>
        ) : (
          sessions.map(s => (
            <div key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                'group mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors relative',
                s.id === activeId ? 'bg-green-50 border border-green-200' : 'hover:bg-slate-50 border border-transparent'
              )}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={() => { onRename(s.id, editTitle); setEditingId(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { onRename(s.id, editTitle); setEditingId(null) } }}
                  className="w-full text-sm bg-white border border-green-200 rounded px-2 py-1 focus:outline-none"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <p className="text-sm text-slate-700 truncate pr-12">{s.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{s.message_count}条消息</p>
                </>
              )}
              <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditTitle(s.title) }}
                  className="p-1 rounded hover:bg-slate-200"><Edit3 className="w-3 h-3 text-slate-400" /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
                  className="p-1 rounded hover:bg-rose-50"><Trash2 className="w-3 h-3 text-rose-400" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── RIGHT: Dashboard ──────────────────────────────────────────

const METAL_OPTIONS = ['铜', '铝', '锌', '镍', '锡', '铅', '黄金', '白银', '碳酸锂', '工业硅', '铁矿石', '原油']

function DashboardPanel({
  companyId, companyIds, selectedMaterials, follows, onCompanyChange,
  onMaterialsChange, activeTab, onTabChange, lastMessage, onQuestionClick, onAnalyze
}: {
  companyId?: string
  companyIds: string[]
  selectedMaterials: string[]
  follows: { id: string; name: string; code: string }[]
  onCompanyChange: (ids: string[]) => void
  onMaterialsChange: (materials: string[]) => void
  activeTab: 'company' | 'metal' | 'sentiment'
  onTabChange: (t: 'company' | 'metal' | 'sentiment') => void
  lastMessage?: string
  onQuestionClick?: (q: string) => void
  onAnalyze?: (companies: string[], materials: string[]) => void
}) {
  const primaryId = companyIds[0] || companyId
  const { data: dashData } = useDashboard(primaryId, companyIds, activeTab, lastMessage, selectedMaterials)
  const { data: recommended } = useRecommended(primaryId, companyIds, lastMessage)
  const { data: allCompaniesResp } = useQuery({
    queryKey: ['all-metal-companies'],
    queryFn: () => agentService.getAllMetalCompanies(),
    staleTime: 300_000,
  })

  const [isExpanded, setIsExpanded] = useState(false)
  const [selectorMode, setSelectorMode] = useState<'company' | 'metal'>('company')
  const [searchQuery, setSearchQuery] = useState('')

  // 合并关注公司和所有金属公司，去重
  const allCompanies = useMemo(() => {
    const list = [...follows]
    const existing = new Set(list.map(c => c.id))
    const extra = allCompaniesResp?.data || []
    extra.forEach((c: any) => {
      if (!existing.has(c.id)) list.push(c)
    })
    return list
  }, [follows, allCompaniesResp])

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allCompanies
    return allCompanies.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    )
  }, [allCompanies, searchQuery])

  const toggleCompany = (id: string) => {
    if (companyIds.includes(id)) {
      onCompanyChange(companyIds.filter(c => c !== id))
    } else {
      onCompanyChange([...companyIds, id])
    }
  }

  const toggleMaterial = (m: string) => {
    if (selectedMaterials.includes(m)) {
      onMaterialsChange(selectedMaterials.filter(x => x !== m))
    } else {
      onMaterialsChange([...selectedMaterials, m])
    }
  }

  const selectionSummary = () => {
    const parts = []
    if (companyIds.length > 0) parts.push(`${companyIds.length}家公司`)
    if (selectedMaterials.length > 0) parts.push(`${selectedMaterials.length}个金属`)
    return parts.length > 0 ? parts.join(' + ') : '未选择（可开放提问）'
  }

  return (
    <div className="w-full h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      {/* Selector header */}
      <div className="px-3 py-3 border-b border-slate-100 space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-green-500/30 flex items-center justify-between"
        >
          <span className={cn('truncate', companyIds.length === 0 && selectedMaterials.length === 0 && 'text-slate-400')}>
            {selectionSummary()}
          </span>
          <span className="text-xs text-slate-400">{isExpanded ? '▲' : '▼'}</span>
        </button>

        {isExpanded && (
          <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
            {/* Mode toggle */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setSelectorMode('company')}
                className={cn('flex-1 py-1.5 text-xs font-medium',
                  selectorMode === 'company' ? 'bg-green-50 text-green-800' : 'text-slate-500 hover:bg-slate-50')}
              >选公司</button>
              <button
                onClick={() => setSelectorMode('metal')}
                className={cn('flex-1 py-1.5 text-xs font-medium',
                  selectorMode === 'metal' ? 'bg-amber-50 text-amber-800' : 'text-slate-500 hover:bg-slate-50')}
              >选金属</button>
            </div>

            {selectorMode === 'company' ? (
              <>
                <div className="p-2 border-b border-slate-100">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜索公司名或股票代码..."
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                  />
                </div>
                <div className="max-h-36 overflow-auto">
                  {filteredCompanies.length === 0 && <p className="text-xs text-slate-400 px-2 py-2">未找到公司</p>}
                  {filteredCompanies.map(f => (
                    <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={companyIds.includes(f.id)}
                        onChange={() => toggleCompany(f.id)}
                        className="accent-green-800"
                      />
                      <span className="text-slate-700 truncate">{f.name} ({f.code})</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div className="max-h-36 overflow-auto p-2 grid grid-cols-3 gap-1.5">
                {METAL_OPTIONS.map(m => (
                  <label key={m} className="flex items-center gap-1 px-1.5 py-1 hover:bg-slate-50 cursor-pointer text-xs rounded border border-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedMaterials.includes(m)}
                      onChange={() => toggleMaterial(m)}
                      className="accent-amber-600"
                    />
                    <span className="text-slate-700 truncate">{m}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
              <button onClick={() => { onCompanyChange([]); onMaterialsChange([]) }}
                className="text-xs text-slate-500 hover:text-green-800">清除选择</button>
              <button
                onClick={() => { onAnalyze?.(companyIds, selectedMaterials); setIsExpanded(false) }}
                disabled={companyIds.length === 0 && selectedMaterials.length === 0}
                className="text-xs px-2 py-1 rounded bg-green-800 text-white hover:bg-green-900 disabled:opacity-40"
              >分析选中项</button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {[
          { key: 'company' as const, label: '公司', icon: BarChart3 },
          { key: 'metal' as const, label: '金属', icon: Globe },
          { key: 'sentiment' as const, label: '舆情', icon: Newspaper },
        ].map(t => (
          <button key={t.key} onClick={() => onTabChange(t.key)}
            className={cn('flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === t.key ? 'border-green-800 text-green-900' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'company' && dashData?.data && (
          <div className="space-y-3">
            <CompanyCard data={dashData.data as any} />
          </div>
        )}
        {activeTab === 'metal' && dashData?.data && (
          <MetalCard data={dashData.data as any} />
        )}
        {activeTab === 'sentiment' && dashData?.data && (
          <SentimentCard data={dashData.data as any} />
        )}
      </div>

      {/* Recommended */}
      {recommended?.questions && recommended.questions.length > 0 && (
        <div className="border-t border-slate-100 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">推荐提问</p>
          <div className="space-y-1.5">
            {recommended.questions.slice(0, 4).map((q, i) => (
              <button key={i} onClick={() => onQuestionClick?.(q)}
                className="w-full text-left text-xs text-slate-600 hover:text-green-900 hover:bg-green-50 rounded-lg px-2 py-1.5 transition-colors flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-green-500" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompanyCard({ data }: { data: { companies?: any[] } }) {
  const companies = data.companies || []
  if (companies.length === 0) return <p className="text-xs text-slate-400 text-center py-8">未选择公司</p>
  return (
    <div className="space-y-3">
      {companies.map((c: any, idx: number) => (
        <div key={idx} className="bg-gradient-to-br from-green-50 to-white rounded-xl border border-green-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center">
              <Bot className="w-4 h-4 text-green-100" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{c.name}</p>
              <p className="text-[10px] text-slate-500">{c.code}</p>
            </div>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">行业</span>
              <span className="text-slate-700 font-medium">{c.industry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">产业链</span>
              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium',
                c.position === 'up' ? 'bg-blue-50 text-blue-700' : c.position === 'mid' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                {{ 'up': '上游', 'mid': '中游', 'down': '下游' }[c.position as string] || c.position}
              </span>
            </div>
            {c.position_detail && (
              <div className="flex justify-between">
                <span className="text-slate-500">细分</span>
                <span className="text-slate-700">{c.position_detail}</span>
              </div>
            )}
            {c.news_count != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">相关新闻</span>
                <span className="text-slate-700 font-medium">{c.news_count} 条</span>
              </div>
            )}
          </div>
          {(() => {
            const totalCost = (c.materials || []).reduce((sum: number, m: any) => sum + (m.cost_pct || 0), 0)
            if (!c.materials || c.materials.length === 0) {
              return (
                <div className="mt-2 pt-2 border-t border-green-100">
                  <p className="text-[10px] text-slate-400">暂无原材料成本结构数据</p>
                </div>
              )
            }
            if (totalCost === 0) {
              return (
                <div className="mt-2 pt-2 border-t border-green-100">
                  <p className="text-[10px] text-slate-500 mb-1.5">原材料成本结构</p>
                  <p className="text-[10px] text-slate-400">已录入材料但成本占比为0%，数据待完善</p>
                  <div className="space-y-1 mt-1">
                    {c.materials.slice(0, 4).map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                        <span>{m.name}</span>
                        <span>0%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <div className="mt-2 pt-2 border-t border-green-100">
                <p className="text-[10px] text-slate-500 mb-1.5 uppercase">原材料成本结构</p>
                <div className="space-y-1">
                  {c.materials.slice(0, 4).map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate max-w-[80px]">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, m.cost_pct || 0)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-700 w-8 text-right">{m.cost_pct || 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

function MetalCard({ data }: { data: { quotes?: any[]; related_companies?: any[]; related_news?: any[] } }) {
  const quotes = data.quotes || []
  const relatedCompanies = data.related_companies || []
  const relatedNews = data.related_news || []

  if (quotes.length === 0 && relatedCompanies.length === 0) return <p className="text-xs text-slate-400 text-center py-8">暂无期货数据</p>

  return (
    <div className="space-y-3">
      {/* 期货行情 */}
      {quotes.map((q: any, i: number) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-bold text-slate-800">{q.name}</span>
              <span className="text-[10px] text-slate-400 ml-1.5">主力合约 {q.contract}</span>
            </div>
            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded',
              (q.change_pct_24h ?? 0) >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
              {q.change_pct_24h != null ? `${(q.change_pct_24h) >= 0 ? '+' : ''}${(q.change_pct_24h).toFixed(2)}%` : '--'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-[10px] text-slate-500 mb-0.5">最新价</p>
              <p className="text-base font-bold text-slate-900">{q.price != null ? (typeof q.price === 'number' ? q.price.toLocaleString() : q.price) : '--'}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-[10px] text-slate-500 mb-0.5">24H 涨跌</p>
              <p className={cn('text-base font-bold', (q.change_pct_24h ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600')}>
                {q.change_pct_24h != null ? `${(q.change_pct_24h) >= 0 ? '+' : ''}${(q.change_pct_24h).toFixed(2)}%` : '--'}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* 关联公司 */}
      {relatedCompanies.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">相关企业</p>
          <div className="space-y-1.5">
            {relatedCompanies.slice(0, 5).map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-green-50/50 rounded-lg px-2.5 py-1.5 border border-green-100">
                <div>
                  <span className="text-xs font-medium text-slate-800">{c.name}</span>
                  <span className="text-[10px] text-slate-400 ml-1">({c.code})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                    {c.max_cost_pct > 0 ? `成本占比${c.max_cost_pct}%` : '关联品种'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 关联新闻 */}
      {relatedNews.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">相关资讯</p>
          <div className="space-y-1.5">
            {relatedNews.slice(0, 4).map((n: any, i: number) => (
              <div key={i} className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                <div className="flex items-start gap-2">
                  <span className={cn('text-[10px] px-1 py-0.5 rounded shrink-0 mt-0.5',
                    n.emotion === 'negative' ? 'bg-rose-50 text-rose-600' : n.emotion === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500')}>
                    {{ 'negative': '利空', 'positive': '利多', 'neutral': '中性' }[n.emotion as string] || n.emotion}
                  </span>
                  <div className="min-w-0">
                    <a href={n.raw_url || '#'} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-slate-700 hover:text-green-800 leading-snug block truncate">{n.title}</a>
                    {n.summary && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-1">{n.summary}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SentimentCard({ data }: { data: { news?: any[]; count?: number; distribution?: any; panic_greed?: number; heat_index?: number; avg_score?: number } }) {
  const news = data.news || []
  const dist = data.distribution || { positive: 0, neutral: 0, negative: 0 }
  const total = data.count || news.length || 1
  const sentiment = data.avg_score ?? 50
  const heat = data.heat_index ?? 0
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 提取热点关键词（基于事件类型和新闻标题中的金属/政策词）
  const keywords = Array.from(new Set(
    news.flatMap((n: any) => [
      ...(n.event_type ? [n.event_type] : []),
      ...(n.title?.match(/(铜|铝|锌|镍|锡|铅|金|银|锂|钴|稀土|铁矿石|原油|黄金|碳酸锂|工业硅|政策|产能|库存|罢工|制裁|关税|环保|限产)/g) || []),
    ]).filter(Boolean)
  )).slice(0, 12)

  if (news.length === 0) return <p className="text-xs text-slate-400 text-center py-8">暂无舆情数据</p>
  return (
    <div className="space-y-3">
      {/* 情绪指标 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gradient-to-br from-green-50 to-white rounded-xl border border-green-200 p-2.5 text-center">
          <p className="text-[10px] text-slate-500">市场情绪得分</p>
          <p className={cn('text-lg font-bold', sentiment > 60 ? 'text-rose-600' : sentiment < 40 ? 'text-emerald-600' : 'text-amber-600')}>
            {sentiment.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-600">{sentiment > 60 ? '偏多' : sentiment < 40 ? '偏空' : '中性'}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-200 p-2.5 text-center">
          <p className="text-[10px] text-slate-500">舆情热度</p>
          <p className="text-lg font-bold text-slate-900">{heat}</p>
          <p className="text-[10px] text-slate-600">{heat > 70 ? '高' : heat > 30 ? '中' : '低'}</p>
        </div>
      </div>

      {/* 情感分布 */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-500 uppercase">情感分布</p>
          <span className="text-[10px] text-slate-400">共 {total} 条</span>
        </div>
        <div className="flex items-center gap-1 h-4 rounded-full overflow-hidden">
          {total > 0 && (
            <>
              <div className="h-full bg-emerald-500" style={{ width: `${(dist.positive / total) * 100}%` }} />
              <div className="h-full bg-slate-300" style={{ width: `${(dist.neutral / total) * 100}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${(dist.negative / total) * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex items-center justify-between text-xs mt-2">
          <span className="text-emerald-600 font-medium">利多 {dist.positive}</span>
          <span className="text-slate-500">中性 {dist.neutral}</span>
          <span className="text-rose-600 font-medium">利空 {dist.negative}</span>
        </div>
      </div>

      {/* 热点关键词 */}
      {keywords.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] text-slate-500 mb-2 uppercase">热点关键词</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 新闻列表 */}
      <div>
        <p className="text-[10px] text-slate-500 mb-2 uppercase">近72h相关新闻</p>
        <div className="space-y-2">
          {news.slice(0, 6).map((n: any, i: number) => {
            const isExpanded = expandedId === n.id
            return (
              <div key={n.id || i} className="bg-white rounded-xl border border-slate-200 p-2.5">
                <div
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : n.id)}
                >
                  <p className="text-xs text-slate-700 leading-relaxed line-clamp-2 hover:text-green-800">{n.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                      n.emotion === 'negative' ? 'bg-rose-50 text-rose-600' : n.emotion === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                      {{ 'negative': '利空', 'positive': '利多', 'neutral': '中性' }[n.emotion as string] || n.emotion}
                    </span>
                    <span className="text-[10px] text-slate-400">{n.source}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[11px] text-slate-600 leading-relaxed mb-2">{n.summary || '暂无摘要'}</p>
                    {n.raw_url ? (
                      <a href={n.raw_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-green-700 hover:text-green-900 font-medium">
                        查看原文 ↗
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">暂无原文链接</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Report Panel (Overlay) ────────────────────────────────────

function HelpPanel({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: '界面布局',
      content: 'Agent 界面采用三栏布局：左侧是历史会话管理，中间是 AI 对话区，右侧是数据仪表盘。左右栏均可折叠，宽度可拖拽调整。'
    },
    {
      title: '选择分析对象',
      content: '在右侧面板顶部的选择器中，可切换"选公司"或"选金属"模式。支持同时勾选多家公司或多个金属品种，最多同时分析 5 家公司。'
    },
    {
      title: '快捷分析场景',
      content: '中栏上方有 3 个快捷按钮："风险扫描""事件传导""自由问答"。点击后会自动填充对应 Prompt，也可在输入框中自由提问。'
    },
    {
      title: '右侧仪表盘',
      content: '公司 Tab 显示选中公司的行业、产业链位置和成本结构；金属 Tab 显示期货行情、关联公司和新闻；舆情 Tab 显示情绪分布、热度指数和关键词云。'
    },
    {
      title: '生成报告',
      content: '选中公司或金属后，点击右上角"生成报告"按钮，系统会基于五因子风险评分模型生成结构化 MRI 风险分析报告。报告支持 HTML 和 PDF 导出。'
    },
    {
      title: '会话管理',
      content: '左栏可新建、切换、重命名和删除会话。每个会话独立保存聊天记录，方便后续回顾和继续分析。'
    },
  ]

  return (
    <div className="absolute inset-0 z-40 bg-white overflow-auto">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-5 h-5 text-green-800" />
          <div>
            <h2 className="font-semibold text-slate-900">MRI Agent 使用手册</h2>
            <p className="text-xs text-slate-500">快速上手 AI 投研助手</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-900 leading-relaxed">
            MRI Agent 是 MetalRadar 的智能原材料风险分析助手。通过选择公司/金属、与 AI 对话、查看仪表盘，
            你可以在分钟级时间内完成传统需要数小时的风险研判工作。
          </p>
        </div>

        {sections.map((s, i) => (
          <section key={i} className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-100 text-green-800 flex items-center justify-center text-xs font-bold">{i + 1}</span>
              {s.title}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">{s.content}</p>
          </section>
        ))}

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-3">三种报告模式</h3>
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <span className="font-medium text-green-800 w-24 shrink-0">单公司报告</span>
              <span className="text-slate-600">选中 1 家公司时生成，含完整五因子评分、成本结构表和压力情景。</span>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="font-medium text-green-800 w-24 shrink-0">多公司对比</span>
              <span className="text-slate-600">选中 2-5 家公司时生成，联合评分，覆盖企业卡片和风险对比图。</span>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="font-medium text-green-800 w-24 shrink-0">纯金属报告</span>
              <span className="text-slate-600">只选金属不选公司时生成，自动反查产业链关联企业并聚合分析。</span>
            </div>
          </div>
        </section>

        <div className="text-center text-xs text-slate-400 py-4">
          提示：左栏、中栏和右栏宽度均可拖拽调整；点击图表可放大查看。
        </div>
      </div>
    </div>
  )
}

function ReportPanel({ report, onClose, onExportHTML, onExportPDF }: {
  report: RiskReport
  onClose: () => void
  onExportHTML: () => void
  onExportPDF: () => void
}) {
  const [enlargedChart, setEnlargedChart] = useState<ChartData | null>(null)
  const levelColor = { '低风险': '#16a34a', '中等风险': '#ca8a04', '高风险': '#dc2626' }[report.risk_level] || '#64748b'

  return (
    <div className="absolute inset-0 z-30 bg-white overflow-auto">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-green-800" />
          <div>
            <h2 className="font-semibold text-slate-900">MRI 风险分析报告</h2>
            <p className="text-xs text-slate-500">ID: {report.report_id} · {report.generated_at} · MRI Agent v1</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExportHTML} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> HTML
          </button>
          <button onClick={onExportPDF} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-green-800 text-white hover:bg-green-900">
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
        {/* Summary */}
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-3">Executive Summary</h3>
          <div className="bg-gradient-to-r from-green-50 to-slate-50 rounded-xl border border-green-200 p-5">
            <h4 className="font-semibold text-slate-900 mb-2">
              风险判定：{report.material_name}
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: levelColor + '18', color: levelColor, border: `1px solid ${levelColor}40` }}>
                {report.risk_level} · {report.risk_score}分
              </span>
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{report.summary}</p>
          </div>
          {report.conversation_insights && (
            <div className="mt-3 bg-amber-50 rounded-xl border border-amber-200 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">对话阶段洞察</p>
              <p className="text-sm text-amber-900 leading-relaxed">{report.conversation_insights}</p>
            </div>
          )}
        </section>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '当前价格', value: report.current_price ? `${report.current_price.toLocaleString()} CNY/t` : '--' },
            { label: '24H变动', value: report.price_change_24h != null ? `${(report.price_change_24h) >= 0 ? '+' : ''}${report.price_change_24h.toFixed(1)}%` : '--', trend: report.price_change_24h != null ? (report.price_change_24h >= 0 ? 'up' : 'down') as 'up' | 'down' : undefined },
            { label: '风险等级', value: report.risk_level, hl: report.risk_level },
            { label: '风险评分', value: `${report.risk_score}`, hl: report.risk_score >= 70 ? '高' : report.risk_score >= 40 ? '中' : '低' },
          ].map((m, i) => (
            <div key={i} className={cn('bg-white border rounded-xl p-4 text-center',
              m.hl === '高风险' ? 'border-rose-200 bg-rose-50/30' : m.hl === '中等风险' ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200')}>
              <p className="text-xs text-slate-500 mb-1">{m.label}</p>
              <p className="text-lg font-bold text-slate-900 flex items-center justify-center gap-1">
                {m.value}
                {m.trend === 'up' && <TrendingUp className="w-4 h-4 text-rose-500" />}
                {m.trend === 'down' && <TrendingDown className="w-4 h-4 text-emerald-500" />}
              </p>
            </div>
          ))}
        </div>

        {/* Metal Quotes */}
        {report.metal_quotes && report.metal_quotes.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              金属行情快照{report.material_names ? `（${report.material_names.join('、')}）` : ''}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {report.metal_quotes.map((q, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">{q.name} {q.contract ? `(${q.contract})` : ''}</p>
                  <p className="text-lg font-bold text-slate-900">{q.price != null ? q.price.toLocaleString() : '--'}</p>
                  <p className={cn('text-xs font-medium mt-1',
                    (q.change_pct_24h ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {q.change_pct_24h != null ? `${q.change_pct_24h >= 0 ? '+' : ''}${q.change_pct_24h.toFixed(2)}%` : '--'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Metal Exposures */}
        {report.metal_exposures && report.metal_exposures.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">金属-企业成本暴露</h3>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">金属</th>
                    <th className="px-4 py-2 text-left">企业</th>
                    <th className="px-4 py-2 text-right">成本占比</th>
                    <th className="px-4 py-2 text-left">方向</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metal_exposures.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{e.metal}</td>
                      <td className="px-4 py-2.5 text-slate-700">{e.company} ({e.company_code})</td>
                      <td className="px-4 py-2.5 text-right">{e.cost_pct}%</td>
                      <td className="px-4 py-2.5 text-xs"><span className={cn('px-1.5 py-0.5 rounded', e.direction === '有利' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{e.direction}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {report.company_profiles && report.company_profiles.length > 0 ? (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              {report.company_profiles.length > 1 ? `覆盖企业（${report.company_profiles.length}家）` : '公司概况'}
            </h3>
            <div className="space-y-3">
              {report.company_profiles.map((cp: any, i: number) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-green-800 bg-green-50 px-2 py-0.5 rounded">{cp.code}</span>
                    <span className="text-sm font-semibold text-slate-800">{cp.name}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{cp.profile}</p>
                </div>
              ))}
            </div>
          </section>
        ) : report.company_profile ? (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">公司概况</h3>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700 leading-relaxed">{report.company_profile}</p>
            </div>
          </section>
        ) : null}

        {/* Cost Structure */}
        {report.cost_structure && report.cost_structure.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">原材料成本结构</h3>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    {(report.cost_structure[0] as any)?.company && <th className="px-4 py-2 text-left">企业</th>}
                    <th className="px-4 py-2 text-left">原材料</th>
                    <th className="px-4 py-2 text-right">成本占比</th>
                    <th className="px-4 py-2 text-right">当前价格</th>
                    <th className="px-4 py-2 text-left">影响方向</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cost_structure.map((item: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100">
                      {item.company && <td className="px-4 py-2.5 text-xs text-green-800 font-medium">{item.company}</td>}
                      <td className="px-4 py-2.5 font-medium text-slate-800">{item.name}</td>
                      <td className="px-4 py-2.5 text-right">{item.cost_pct}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{item.current_price ? item.current_price.toLocaleString() : '--'}</td>
                      <td className="px-4 py-2.5 text-xs"><span className={cn('px-1.5 py-0.5 rounded', item.direction === '有利' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{item.direction}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Reasoning */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">分析逻辑</h3>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {report.reasoning.map((s, i) => (
              <div key={i} className={cn('flex items-start gap-3 p-3', i < report.reasoning.length - 1 && 'border-b border-slate-100')}>
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                  i === 0 ? 'bg-blue-50 text-blue-700' : i === 1 ? 'bg-amber-50 text-amber-700' : i === 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700')}>
                  {s.step}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sources */}
        {report.sources.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">数据依据</h3>
            <div className="space-y-1">
              {report.sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs font-medium text-green-800 bg-green-50 px-1.5 py-0.5 rounded">{s.source}</span>
                  <span className="text-sm text-slate-700 truncate">{s.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Risk Events */}
        {report.risk_events && report.risk_events.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">风险事件监测</h3>
            <div className="space-y-2">
              {report.risk_events.map((evt: any, i: number) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800 leading-snug">{evt.title}</p>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0',
                      evt.emotion === 'negative' ? 'bg-rose-50 text-rose-600' : evt.emotion === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                      {{ 'negative': '利空', 'positive': '利多', 'neutral': '中性' }[evt.emotion as string] || evt.emotion}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{evt.event_type} · {evt.source}</p>
                  {evt.summary && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{evt.summary}</p>}
                  {evt.raw_url && (
                    <a href={evt.raw_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-green-700 hover:text-green-900 mt-1.5">
                      查看原文 ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Charts */}
        {report.charts && report.charts.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">相关图表</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.charts.map((c, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
                  <ChartRenderer chart={c} onEnlarge={() => setEnlargedChart(c)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recommendations */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">后续建议</h3>
          <div className="space-y-2">
            {report.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gradient-to-r from-green-50 to-white rounded-lg border border-green-100">
                <div className="w-6 h-6 rounded-full bg-green-800 text-white flex items-center justify-center text-xs font-bold shrink-0">{r.priority}</div>
                <div><p className="text-sm font-semibold text-slate-800">{r.action}</p><p className="text-xs text-slate-500 mt-0.5">{r.detail}</p></div>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center text-xs text-slate-400 py-4 border-t border-slate-100">
          本报告由 MetalRadar MRI Agent 生成，仅供参考，不构成投资建议。
        </div>
      </div>

      {enlargedChart && <ChartModal chart={enlargedChart} onClose={() => setEnlargedChart(null)} />}
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────

const SCENARIOS = [
  { key: 'risk_scan' as const, label: '风险扫描', icon: Search, prompt: '请对该公司进行全面的原材料风险扫描，包括风险评分、主要风险来源和监控建议。' },
  { key: 'event_impact' as const, label: '事件传导', icon: Zap, prompt: '请分析近期重大事件对该公司原材料成本的传导影响路径。' },
  { key: 'free_qa' as const, label: '自由问答', icon: MessageSquare, prompt: '' },
]

export default function AgentPage() {
  useFollows()
  const { follows } = useWatchlist()
  const { sessions, createMut, deleteMut, renameMut } = useSessions()

  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [manualCleared, setManualCleared] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<'company' | 'metal' | 'sentiment'>('company')
  const [lastMessage, setLastMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('deepseek-v4-flash')
  const [activeScenario, setActiveScenario] = useState<string>('free_qa')
  const [inputValue, setInputValue] = useState('')
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, setMessages, isProcessing, sendMessage } = useAgent(
    selectedCompanyIds[0] || undefined, selectedCompanyIds, activeSessionId || undefined, selectedModel
  )
  const { report, generateReport, isGenerating, setReport } = useReport((err: any) => {
    const axiosErr = err as any
    const detail = axiosErr?.response?.data?.detail
    const backendMsg = typeof detail === 'string' ? detail : JSON.stringify(detail || axiosErr?.response?.data)
    setReportError(backendMsg || err?.message || '报告生成失败，请检查后端服务')
  })
  const { data: models } = useModels()
  const { data: sessionDetail } = useSessionDetail(activeSessionId || undefined)

  // enlarged chart state
  const [enlargedChart, setEnlargedChart] = useState<ChartData | null>(null)

  const leftPanel = useResizablePanel(260, 200, 400)
  const rightPanel = useResizablePanel(300, 240, 520, 'reverse')

  // Auto scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load session messages
  useEffect(() => {
    if (sessionDetail?.messages) {
      setMessages(sessionDetail.messages)
    }
  }, [sessionDetail, setMessages])

  // Default company (only auto-select once, respect manual clear)
  useEffect(() => {
    if (follows.length > 0 && selectedCompanyIds.length === 0 && !manualCleared) {
      setSelectedCompanyIds([follows[0].id])
    }
  }, [follows, selectedCompanyIds, manualCleared])

  // Select first session or create one
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  const handleSend = useCallback(async () => {
    const msg = inputValue.trim()
    if (!msg || isProcessing) return
    setInputValue('')
    setLastMessage(msg)
    await sendMessage(msg, activeScenario as any)
  }, [inputValue, isProcessing, sendMessage, activeScenario])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleNewSession = async () => {
    const primaryName = selectedCompanyIds.length > 0
      ? (follows.find(f => f.id === selectedCompanyIds[0])?.name || '新对话')
      : '新对话'
    const title = `${primaryName} - ${new Date().toLocaleTimeString()}`
    createMut.mutate(title)
    setMessages([])
    setReport(null)
    setShowReport(false)
    setInputValue('')
  }

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id)
    setShowReport(false)
  }

  const handleScenarioClick = (key: string) => {
    setActiveScenario(key)
    const s = SCENARIOS.find(s => s.key === key)
    if (s?.prompt) {
      setInputValue(s.prompt)
      inputRef.current?.focus()
    }
  }

  const handleGenerateReport = () => {
    setReportError(null)
    const context = messages.length > 0
      ? messages.slice(-10).map(m => `${m.role === 'user' ? '用户' : 'Agent'}: ${m.content}`).join('\n')
      : undefined
    // 纯金属模式（无公司选择）
    if (selectedCompanyIds.length === 0 && selectedMaterials.length > 0) {
      generateReport({ materialNames: selectedMaterials, conversation_context: context })
      setShowReport(true)
      return
    }
    if (selectedCompanyIds.length === 0) return
    // 公司模式（若同时选了金属，传递 materialNames 用于金属聚焦报告）
    generateReport({
      companyIds: selectedCompanyIds,
      materialNames: selectedMaterials.length > 0 ? selectedMaterials : undefined,
      conversation_context: context,
    })
    setShowReport(true)
  }

  const handleExportHTML = () => {
    if (!report) return
    const html = buildReportHTML(report)
    downloadFile(`${report.report_id}.html`, html, 'text/html')
  }

  const handleExportPDF = async () => {
    if (!report) return
    try {
      const blob = await agentService.generatePDF(report.company_code, report.material_name)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.report_id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`PDF导出失败：${err?.message || '未知错误'}`)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowLeftPanel(!showLeftPanel)}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400" title="切换侧栏">
            {showLeftPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
              <Bot className="w-4 h-4 text-green-100" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">AI Agent · MRI 投研助手</h1>
              <p className="text-[10px] text-slate-400">多源数据 · 四层推理 · 量化评分</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Model selector */}
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/30">
            {models?.map(m => <option key={m.id} value={m.id}>{m.name}</option>) || <option value="deepseek-v4-flash">DeepSeek-V4 Flash</option>}
          </select>

          <button onClick={() => setShowHelp(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="使用手册">
            <HelpCircle className="w-4 h-4" />
          </button>

          <button onClick={handleGenerateReport} disabled={(selectedCompanyIds.length === 0 && selectedMaterials.length === 0) || isGenerating}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-green-800 text-white hover:bg-green-900 disabled:opacity-50">
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            生成报告
          </button>

          {reportError && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-1.5 max-w-xs">
              {reportError}
              <button onClick={() => setReportError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}

          <button onClick={() => setShowRightPanel(!showRightPanel)}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400" title="切换右侧">
            {showRightPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Body: 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {showLeftPanel && (
          <>
            <div style={{ width: leftPanel.width }} className="shrink-0 h-full">
              <SessionSidebar
                sessions={sessions} activeId={activeSessionId}
                onSelect={handleSelectSession}
                onCreate={handleNewSession}
                onDelete={(id) => { deleteMut.mutate(id); if (id === activeSessionId) { setActiveSessionId(''); setMessages([]) } }}
                onRename={(id, title) => renameMut.mutate({ id, title })}
                onClose={() => setShowLeftPanel(false)}
              />
            </div>
            <ResizeHandle onMouseDown={leftPanel.start} />
          </>
        )}

        {/* Center chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scenario buttons */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
            <span className="text-[10px] text-slate-400 mr-1 uppercase tracking-wider">快捷分析</span>
            {SCENARIOS.map(s => (
              <button key={s.key} onClick={() => handleScenarioClick(s.key)}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                  activeScenario === s.key ? 'bg-green-50 text-green-900 border-green-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}>
                <s.icon className="w-3 h-3" />{s.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
                  <Bot className="w-7 h-7 text-green-800" />
                </div>
                <h2 className="text-base font-semibold text-slate-800 mb-1">MRI Agent · 原材料风险智能分析</h2>
                <p className="text-xs text-slate-500 max-w-sm mb-4">
                  基于多源数据融合与四层推理引擎，深度分析企业原材料风险
                </p>
                {selectedCompanyIds.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-sm">
                    <p className="text-xs text-slate-500">可直接输入问题进行开放提问，或在右侧面板选择公司进行对比分析。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                    {SCENARIOS.map(s => (
                      <button key={s.key} onClick={() => handleScenarioClick(s.key)}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-200 bg-white hover:bg-green-50 hover:border-green-200 transition-colors">
                        <s.icon className="w-5 h-5 text-green-800" />
                        <span className="text-xs font-medium text-slate-700">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-green-800" />
                      </div>
                    )}
                    <div className={cn('max-w-[72%] rounded-2xl px-3.5 py-2.5',
                      msg.role === 'user' ? 'bg-green-800 text-white' : 'bg-white border border-slate-200 shadow-sm')}>
                      {msg.role === 'user' ? (
                        <p className="text-sm">{msg.content}</p>
                      ) : (
                        <div>
                          {(msg.riskScore != null || msg.riskLevel) && <div className="mb-2"><RiskBadge level={msg.riskLevel} score={msg.riskScore} /></div>}
                          <SimpleMarkdown text={msg.content} />
                          {msg.charts?.map((c, i) => (
                            <ChartRenderer key={i} chart={c} onEnlarge={() => setEnlargedChart(c)} />
                          ))}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 mb-1">数据依据</p>
                              {msg.sources.map((s, i) => (
                                <span key={i} className="inline-block mr-1 mb-1 px-1.5 py-0.5 bg-slate-50 rounded text-[10px] text-slate-500">{s.source}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    )}
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center"><Bot className="w-3.5 h-3.5 text-green-800" /></div>
                    <div className="bg-white border rounded-2xl px-3.5 py-2.5 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">
            <div className="max-w-3xl mx-auto flex items-center gap-2">
              <input ref={inputRef} type="text" value={inputValue}
                onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="输入问题，可自由提问或选择公司进行对比分析，Enter 发送..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 disabled:opacity-50"
                disabled={isProcessing} />
              <button onClick={handleSend} disabled={!inputValue.trim() || isProcessing}
                className="shrink-0 w-10 h-10 rounded-xl bg-green-800 text-white flex items-center justify-center hover:bg-green-900 disabled:opacity-40">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-1.5">MRI Agent 基于多源数据与LLM推理 · 仅供参考，不构成投资建议</p>
          </div>
        </div>

        {/* Right dashboard */}
        {showRightPanel && (
          <>
            <ResizeHandle onMouseDown={rightPanel.start} />
            <div style={{ width: rightPanel.width }} className="shrink-0 h-full">
              <DashboardPanel
                companyId={selectedCompanyIds[0]}
                companyIds={selectedCompanyIds}
                selectedMaterials={selectedMaterials}
                follows={follows.map(f => ({ id: f.id, name: f.name, code: f.code }))}
                onCompanyChange={(ids) => { setSelectedCompanyIds(ids); setManualCleared(ids.length === 0) }}
                onMaterialsChange={setSelectedMaterials}
                activeTab={dashboardTab}
                onTabChange={setDashboardTab}
                lastMessage={lastMessage}
                onQuestionClick={(q) => { setInputValue(q); inputRef.current?.focus() }}
                onAnalyze={(companies, materials) => {
                  const parts: string[] = []
                  if (companies.length > 0) parts.push(`公司：${companies.map(id => follows.find(f => f.id === id)?.name || id).join('、')}`)
                  if (materials.length > 0) parts.push(`金属：${materials.join('、')}`)
                  const q = `请分析 ${parts.join('，')} 的原材料风险`
                  setInputValue(q)
                  inputRef.current?.focus()
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Help overlay */}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

      {/* Report overlay */}
      {showReport && report && (
        <ReportPanel report={report} onClose={() => setShowReport(false)}
          onExportHTML={handleExportHTML} onExportPDF={handleExportPDF} />
      )}

      {/* Chart modal */}
      {enlargedChart && <ChartModal chart={enlargedChart} onClose={() => setEnlargedChart(null)} />}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function buildReportHTML(report: RiskReport): string {
  const levelColor: Record<string, string> = { '低风险': '#16a34a', '中等风险': '#ca8a04', '高风险': '#dc2626' }
  const color = levelColor[report.risk_level] || '#64748b'
  const stepColors = ['#2563eb','#d97706','#059669','#7c3aed']
  const stepBgs = ['#eff6ff','#fffbeb','#ecfdf5','#f5f3ff']
  const reasoningHTML = report.reasoning.map((r, i) => `
    <div class="step" style="border-left:3px solid ${stepColors[i]||'#166534'};background:${stepBgs[i]||'#f0fdf4'}">
      <div class="sn" style="background:${stepColors[i]||'#166534'};color:#fff">${r.step}</div>
      <div><strong style="font-size:13px">${r.title}</strong><p style="font-size:12px;color:#475569">${r.detail}</p></div>
    </div>`).join('')

  return `<!DOCTYPE html><html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MRI报告·${report.company_name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#1e293b;line-height:1.6;background:#f8fafc}
.container{max-width:900px;margin:0 auto;padding:32px 24px}
.header{background:#fff;border-bottom:3px solid #166534;padding:20px 0;margin-bottom:32px}
.header h1{font-size:22px;color:#1e293b}.header p{font-size:12px;color:#94a3b8}
.summary{background:linear-gradient(135deg,#f0fdf4,#f8fafc);border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px}
.insight{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-top:12px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.metric{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
.metric .l{font-size:11px;color:#94a3b8}.metric .v{font-size:16px;font-weight:700;margin-top:4px}
section{margin-bottom:28px}section h3{font-size:15px;font-weight:600;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
.step{display:flex;gap:10px;padding:10px 14px;border-radius:8px;margin-bottom:6px}
.sn{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.rec{display:flex;gap:10px;padding:12px;background:linear-gradient(135deg,#f0fdf4,#fff);border-radius:8px;border:1px solid #bbf7d0;margin-bottom:6px}
.rn{width:24px;height:24px;background:#166534;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.ev{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:4px;border:1px solid #f1f5f9}
.badge{font-size:11px;font-weight:600;color:#166534;background:#dcfce7;padding:2px 6px;border-radius:4px}
.evt-label{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600}
table.cost{width:100%;border-collapse:collapse;font-size:13px}
table.cost th{background:#f8fafc;color:#64748b;font-size:11px;padding:8px 12px;text-align:left;text-transform:uppercase}
table.cost td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
.disclaimer{text-align:center;font-size:11px;color:#94a3b8;padding-top:20px;border-top:1px solid #e2e8f0;margin-top:20px}
</style></head><body><div class="container">
<div class="header"><h1>MRI Agent·物料风险分析报告</h1><p>ID:${report.report_id}·${report.generated_at}·MRI Agent v1</p></div>
<section><h3>Executive Summary</h3><div class="summary"><p style="font-weight:600;margin-bottom:8px">${report.material_name}·<span style="color:${color}">${report.risk_level}(${report.risk_score}分)</span></p><p style="font-size:13px;color:#475569;line-height:1.7">${report.summary}</p></div>${report.conversation_insights?`<div class="insight"><p style="font-size:11px;color:#92400e;font-weight:600;margin-bottom:4px">对话洞察</p><p style="font-size:12px;color:#78350f;line-height:1.6;white-space:pre-line">${report.conversation_insights}</p></div>`:''}</section>
<div class="metrics">
<div class="metric"><span class="l">当前价格</span><span class="v">${report.current_price?.toLocaleString()||'--'} CNY/t</span></div>
<div class="metric"><span class="l">24H变动</span><span class="v" style="color:${(report.price_change_24h||0)>=0?'#dc2626':'#16a34a'}">${report.price_change_24h!=null?`${report.price_change_24h>=0?'+':''}${report.price_change_24h.toFixed(1)}%`:'--'}</span></div>
<div class="metric"><span class="l">风险等级</span><span class="v" style="color:${color}">${report.risk_level}</span></div>
<div class="metric"><span class="l">风险评分</span><span class="v" style="color:${color}">${report.risk_score}</span></div></div>
${report.company_profiles && report.company_profiles.length > 0? `<section><h3>覆盖企业</h3>${report.company_profiles.map((cp:any)=>`<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px"><span style="font-size:11px;color:#166534;background:#dcfce7;padding:2px 6px;border-radius:4px;font-weight:600">${cp.code}</span> <span style="font-size:13px;font-weight:600;margin-left:6px">${cp.name}</span><p style="font-size:12px;color:#475569;margin-top:4px;line-height:1.6">${cp.profile}</p></div>`).join('')}</section>`:report.company_profile?`<section><h3>公司概况</h3><div class="summary"><p style="font-size:13px;color:#475569;line-height:1.7">${report.company_profile}</p></div></section>`:''}
${report.cost_structure&&report.cost_structure.length>0?`<section><h3>原材料成本结构</h3><table class="cost"><tr>${(report.cost_structure[0] as any)?.company?'<th>企业</th>':''}<th>原材料</th><th>成本占比</th><th>当前价格</th><th>方向</th></tr>${report.cost_structure.map((i:any)=>`<tr>${i.company?`<td style="font-size:12px;color:#166534;font-weight:500">${i.company}</td>`:''}<td style="font-weight:500">${i.name}</td><td>${i.cost_pct}%</td><td>${i.current_price||'--'}</td><td><span class="evt-label" style="background:${i.direction==='有利'?'#ecfdf5':'#fff1f2'};color:${i.direction==='有利'?'#059669':'#dc2626'}">${i.direction}</span></td></tr>`).join('')}</table></section>`:''}
<section><h3>分析逻辑</h3>${reasoningHTML}</section>
${report.risk_events&&report.risk_events.length>0?`<section><h3>风险事件监测</h3>${report.risk_events.map((evt:any)=>`<div class="ev"><span class="evt-label" style="background:${evt.emotion==='negative'?'#fff1f2':evt.emotion==='positive'?'#ecfdf5':'#f1f5f9'};color:${evt.emotion==='negative'?'#dc2626':evt.emotion==='positive'?'#059669':'#64748b'}">${{negative:'利空',positive:'利多',neutral:'中性'}[evt.emotion as string]||evt.emotion}</span><span style="font-size:13px;font-weight:500">${evt.title}</span><span style="font-size:11px;color:#94a3b8;margin-left:auto">${evt.event_type}·${evt.source}</span></div>${evt.summary?`<p style="font-size:12px;color:#64748b;margin-bottom:4px;padding-left:4px">${evt.summary}</p>`:''}`).join('')}</section>`:''}
<section><h3>数据依据</h3>${report.sources.map(s=>`<div class="ev"><span class="badge">${s.source}</span><span style="font-size:13px">${s.content}</span></div>`).join('')}</section>
<section><h3>后续建议</h3>${report.recommendations.map(r=>`<div class="rec"><div class="rn">${r.priority}</div><div><strong style="font-size:13px">${r.action}</strong><p style="font-size:12px;color:#64748b">${r.detail}</p></div></div>`).join('')}</section>
<div class="disclaimer"><p>本报告由 MetalRadar MRI Agent 自动生成，仅供研究参考，不构成投资建议。</p></div>
</div></body></html>`
}
