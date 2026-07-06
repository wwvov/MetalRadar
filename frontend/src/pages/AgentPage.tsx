import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgent, useSessions, useSessionDetail, useModels, useReport, useDashboard, useRecommended } from '@/hooks/useAgent'
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
  Printer,
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
    <div className="w-[260px] shrink-0 h-full bg-white border-r border-slate-200 flex flex-col">
      <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">历史会话</span>
        <div className="flex items-center gap-1">
          <button onClick={onCreate} className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600" title="新建会话">
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
                'group mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                s.id === activeId ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-50 border border-transparent'
              )}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={() => { onRename(s.id, editTitle); setEditingId(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { onRename(s.id, editTitle); setEditingId(null) } }}
                  className="w-full text-sm bg-white border border-purple-200 rounded px-2 py-1 focus:outline-none"
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

function DashboardPanel({
  companyId, follows, onCompanyChange, className
}: {
  companyId: string
  follows: { id: string; name: string; code: string }[]
  onCompanyChange: (id: string) => void
  className?: string
}) {
  const [tab, setTab] = useState<'company' | 'metal' | 'sentiment'>('company')
  const { data: dashData } = useDashboard(companyId, tab)
  const { data: recommended } = useRecommended(companyId)

  const tabs = [
    { key: 'company' as const, label: '公司', icon: BarChart3 },
    { key: 'metal' as const, label: '金属', icon: Globe },
    { key: 'sentiment' as const, label: '舆情', icon: Newspaper },
  ]

  return (
    <div className={cn('w-[300px] shrink-0 h-full bg-white border-l border-slate-200 flex flex-col overflow-auto', className)}>
      {/* Company selector */}
      <div className="px-3 py-3 border-b border-slate-100">
        <select value={companyId} onChange={e => onCompanyChange(e.target.value)}
          className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30">
          <option value="">选择公司...</option>
          {follows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium border-b-2 transition-colors',
              tab === t.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === 'company' && dashData?.data && (
          <div className="space-y-3">
            <CompanyCard data={dashData.data as any} />
          </div>
        )}
        {tab === 'metal' && dashData?.data && (
          <MetalCard data={dashData.data as any} />
        )}
        {tab === 'sentiment' && dashData?.data && (
          <SentimentCard data={dashData.data as any} />
        )}
      </div>

      {/* Recommended */}
      {recommended?.questions && recommended.questions.length > 0 && (
        <div className="border-t border-slate-100 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">推荐提问</p>
          <div className="space-y-1.5">
            {recommended.questions.map((q, i) => (
              <button key={i}
                className="w-full text-left text-xs text-slate-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg px-2 py-1.5 transition-colors flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-purple-400" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompanyCard({ data }: { data: { name?: string; code?: string; industry?: string; position?: string; position_detail?: string; materials?: any[] } }) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-200 p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
          <Bot className="w-4 h-4 text-purple-100" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{data.name}</p>
          <p className="text-[10px] text-slate-500">{data.code}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">行业</span>
          <span className="text-slate-700 font-medium">{data.industry}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">产业链</span>
          <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium',
            data.position === 'up' ? 'bg-blue-50 text-blue-700' : data.position === 'mid' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
            {{ 'up': '上游', 'mid': '中游', 'down': '下游' }[data.position as string] || data.position}
          </span>
        </div>
        {data.position_detail && (
          <div className="flex justify-between">
            <span className="text-slate-500">细分</span>
            <span className="text-slate-700">{data.position_detail}</span>
          </div>
        )}
      </div>
      {data.materials && data.materials.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-100">
          <p className="text-[10px] text-slate-500 mb-1.5 uppercase">原材料成本结构</p>
          <div className="space-y-1.5">
            {data.materials.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-slate-600">{m.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, m.cost_pct || 0)}%` }} />
                  </div>
                  <span className="text-xs font-medium text-slate-700 w-10 text-right">{m.cost_pct || 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetalCard({ data }: { data: { materials?: any[] } }) {
  const materials = data.materials || []
  if (materials.length === 0) return <p className="text-xs text-slate-400 text-center py-8">暂无金属数据</p>
  return (
    <div className="space-y-2">
      {materials.map((m: any, i: number) => (
        <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-800">{m.name}</span>
            <span className={cn('text-xs font-medium', (m.change_24h ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {m.change_24h != null ? `${(m.change_24h) >= 0 ? '+' : ''}${(m.change_24h).toFixed(2)}%` : '--'}
            </span>
          </div>
          {m.price != null && <p className="text-lg font-bold text-slate-900">{typeof m.price === 'number' ? m.price.toLocaleString() : m.price}</p>}
          <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
            <span>成本占比</span>
            <span className="font-medium text-slate-700">{m.cost_pct}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function SentimentCard({ data }: { data: { news?: any[]; count?: number } }) {
  const news = data.news || []
  if (news.length === 0) return <p className="text-xs text-slate-400 text-center py-8">暂无舆情数据</p>
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">近72h 共 {data.count || news.length} 条相关新闻</p>
      {news.slice(0, 10).map((n: any, i: number) => (
        <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-2">
          <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">{n.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('text-[10px] px-1 py-0.5 rounded',
              n.emotion === 'negative' ? 'bg-rose-50 text-rose-600' : n.emotion === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
              {{ 'negative': '利空', 'positive': '利多', 'neutral': '中性' }[n.emotion as string] || n.emotion}
            </span>
            <span className="text-[10px] text-slate-400">{n.source}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Report Panel (Overlay) ────────────────────────────────────

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
          <FileText className="w-5 h-5 text-purple-600" />
          <div>
            <h2 className="font-semibold text-slate-900">MRI 风险分析报告</h2>
            <p className="text-xs text-slate-500">ID: {report.report_id} · {report.generated_at} · MRI Agent v1</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExportHTML} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> HTML
          </button>
          <button onClick={onExportPDF} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
        {/* Summary */}
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-3">Executive Summary</h3>
          <div className="bg-gradient-to-r from-purple-50 to-slate-50 rounded-xl border border-purple-200 p-5">
            <h4 className="font-semibold text-slate-900 mb-2">
              风险判定：{report.material_name}
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: levelColor + '18', color: levelColor, border: `1px solid ${levelColor}40` }}>
                {report.risk_level} · {report.risk_score}分
              </span>
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">{report.summary}</p>
          </div>
        </section>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '当前价格', value: report.current_price ? `${report.current_price.toLocaleString()} USD/t` : '--' },
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

        {/* Reasoning */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">推理过程</h3>
          <div className="space-y-2">
            {report.reasoning.map((s, i) => (
              <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">{s.step}</div>
                <div><p className="text-sm font-medium text-slate-800">{s.title}</p><p className="text-xs text-slate-500 mt-0.5">{s.detail}</p></div>
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
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{s.source}</span>
                  <span className="text-sm text-slate-700 truncate">{s.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Factors */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">因子贡献</h3>
          <div className="space-y-3">
            {report.factors.map((f, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-700">{f.name}</span>
                  <span className="text-xs text-slate-500">{(f.weight * 100).toFixed(0)}% · {f.score}分</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${f.score}%`,
                    background: ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'][i] || '#94a3b8'
                  }} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

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
              <div key={i} className="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-white rounded-lg border border-purple-100">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{r.priority}</div>
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState('glm-5.2')
  const [activeScenario, setActiveScenario] = useState<string>('free_qa')
  const [inputValue, setInputValue] = useState('')
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showReport, setShowReport] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, setMessages, isProcessing, sendMessage } = useAgent(
    selectedCompanyId || undefined, activeSessionId || undefined, selectedModel
  )
  const { report, generateReport, isGenerating, setReport } = useReport()
  const { data: models } = useModels()
  const { data: sessionDetail } = useSessionDetail(activeSessionId || undefined)

  // enlarged chart state
  const [enlargedChart, setEnlargedChart] = useState<ChartData | null>(null)

  // Auto scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load session messages
  useEffect(() => {
    if (sessionDetail?.messages) {
      setMessages(sessionDetail.messages)
    }
  }, [sessionDetail, setMessages])

  // Default company
  useEffect(() => {
    if (follows.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(follows[0].id)
    }
  }, [follows, selectedCompanyId])

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
    await sendMessage(msg, activeScenario as any)
  }, [inputValue, isProcessing, sendMessage, activeScenario])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleNewSession = async () => {
    const title = selectedCompanyId
      ? `${follows.find(f => f.id === selectedCompanyId)?.name || '新对话'} - ${new Date().toLocaleTimeString()}`
      : '新对话'
    createMut.mutate(title)
    setMessages([])
    setReport(null)
    setShowReport(false)
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
    if (!selectedCompanyId) return
    generateReport({ companyId: selectedCompanyId })
    setShowReport(true)
  }

  const handleExportHTML = () => {
    if (!report) return
    const html = buildReportHTML(report)
    downloadFile(`${report.report_id}.html`, html, 'text/html')
  }

  const handleExportPDF = () => window.print()

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
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-100" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">AI Agent · MRI 投研助手</h1>
              <p className="text-[10px] text-slate-400">多源数据 · 四层推理 · 量化评分</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30">
            {models?.map(m => <option key={m.id} value={m.id}>{m.name}</option>) || <option value="glm-5.2">GLM-5.2</option>}
          </select>

          <button onClick={handleGenerateReport} disabled={!selectedCompanyId || isGenerating}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            生成报告
          </button>

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
          <SessionSidebar
            sessions={sessions} activeId={activeSessionId}
            onSelect={handleSelectSession}
            onCreate={handleNewSession}
            onDelete={(id) => { deleteMut.mutate(id); if (id === activeSessionId) { setActiveSessionId(''); setMessages([]) } }}
            onRename={(id, title) => renameMut.mutate({ id, title })}
            onClose={() => setShowLeftPanel(false)}
          />
        )}

        {/* Center chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scenario buttons */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
            <span className="text-[10px] text-slate-400 mr-1 uppercase tracking-wider">快捷分析</span>
            {SCENARIOS.map(s => (
              <button key={s.key} onClick={() => handleScenarioClick(s.key)}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                  activeScenario === s.key ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}>
                <s.icon className="w-3 h-3" />{s.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                  <Bot className="w-7 h-7 text-purple-600" />
                </div>
                <h2 className="text-base font-semibold text-slate-800 mb-1">MRI Agent · 原材料风险智能分析</h2>
                <p className="text-xs text-slate-500 max-w-sm mb-4">
                  基于多源数据融合与四层推理引擎，深度分析企业原材料风险
                </p>
                {!selectedCompanyId ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-sm">
                    <p className="text-xs text-slate-500">请先在右侧面板选择一家公司，或从顶部下拉菜单选择。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                    {SCENARIOS.map(s => (
                      <button key={s.key} onClick={() => handleScenarioClick(s.key)}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-200 transition-colors">
                        <s.icon className="w-5 h-5 text-purple-600" />
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
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                    )}
                    <div className={cn('max-w-[72%] rounded-2xl px-3.5 py-2.5',
                      msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 shadow-sm')}>
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
                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><Bot className="w-3.5 h-3.5 text-purple-600" /></div>
                    <div className="bg-white border rounded-2xl px-3.5 py-2.5 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
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
                placeholder="输入问题，Enter 发送..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50"
                disabled={isProcessing} />
              <button onClick={handleSend} disabled={!inputValue.trim() || isProcessing}
                className="shrink-0 w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:opacity-40">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-1.5">MRI Agent 基于多源数据与LLM推理 · 仅供参考，不构成投资建议</p>
          </div>
        </div>

        {/* Right dashboard */}
        {showRightPanel && (
          <DashboardPanel
            companyId={selectedCompanyId}
            follows={follows.map(f => ({ id: f.id, name: f.name, code: f.code }))}
            onCompanyChange={setSelectedCompanyId}
          />
        )}
      </div>

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
  return `<!DOCTYPE html><html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MRI报告·${report.company_name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#1e293b;line-height:1.6;background:#f8fafc}
.container{max-width:900px;margin:0 auto;padding:32px 24px}
.header{background:#fff;border-bottom:3px solid #7c3aed;padding:20px 0;margin-bottom:32px}
.header h1{font-size:22px;color:#1e293b}.header p{font-size:12px;color:#94a3b8}
.summary{background:linear-gradient(135deg,#f5f3ff,#f8fafc);border:1px solid #e9d5ff;border-radius:12px;padding:20px;margin-bottom:24px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.metric{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
.metric .l{font-size:11px;color:#94a3b8}.metric .v{font-size:16px;font-weight:700;margin-top:4px}
section{margin-bottom:28px}section h3{font-size:15px;font-weight:600;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
.step{display:flex;gap:10px;padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:6px;border:1px solid #f1f5f9}
.sn{width:28px;height:28px;background:#f5f3ff;color:#7c3aed;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.rec{display:flex;gap:10px;padding:12px;background:linear-gradient(135deg,#f5f3ff,#fff);border-radius:8px;border:1px solid #e9d5ff;margin-bottom:6px}
.rn{width:24px;height:24px;background:#7c3aed;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.ev{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:4px;border:1px solid #f1f5f9}
.badge{font-size:11px;font-weight:600;color:#7c3aed;background:#f5f3ff;padding:2px 6px;border-radius:4px}
.discount{text-align:center;font-size:11px;color:#94a3b8;padding-top:20px;border-top:1px solid #e2e8f0;margin-top:20px}
.factor{margin-bottom:12px}.factor-bar{height:8px;background:#f1f5f9;border-radius:4px;margin:4px 0}
.factor-fill{height:100%;background:${color};border-radius:4px}
</style></head><body><div class="container">
<div class="header"><h1>MRI Agent·物料风险分析报告</h1><p>ID:${report.report_id}·${report.generated_at}·MRI Agent v1</p></div>
<section><h3>Executive Summary</h3><div class="summary"><p style="font-weight:600;margin-bottom:4px">${report.material_name}·<span style="color:${color}">${report.risk_level}(${report.risk_score}分)</span></p><p style="font-size:13px;color:#475569">${report.summary}</p></div></section>
<div class="metrics">
<div class="metric"><span class="l">当前价格</span><span class="v">${report.current_price?.toLocaleString()||'--'} USD/t</span></div>
<div class="metric"><span class="l">24H变动</span><span class="v" style="color:${(report.price_change_24h||0)>=0?'#dc2626':'#16a34a'}">${report.price_change_24h!=null?`${report.price_change_24h>=0?'+':''}${report.price_change_24h.toFixed(1)}%`:'--'}</span></div>
<div class="metric"><span class="l">风险等级</span><span class="v" style="color:${color}">${report.risk_level}</span></div>
<div class="metric"><span class="l">风险评分</span><span class="v" style="color:${color}">${report.risk_score}</span></div></div>
<section><h3>推理过程</h3>${report.reasoning.map(r=>`<div class="step"><div class="sn">${r.step}</div><div><strong style="font-size:13px">${r.title}</strong><p style="font-size:12px;color:#64748b">${r.detail}</p></div></div>`).join('')}</section>
<section><h3>数据依据</h3>${report.sources.map(s=>`<div class="ev"><span class="badge">${s.source}</span><span style="font-size:13px">${s.content}</span></div>`).join('')}</section>
<section><h3>因子贡献</h3>${report.factors.map(f=>`<div class="factor"><div style="display:flex;justify-content:space-between"><span style="font-size:13px">${f.name}</span><span style="font-size:11px;color:#94a3b8">${(f.weight*100).toFixed(0)}%·${f.score}分</span></div><div class="factor-bar"><div class="factor-fill" style="width:${f.score}%"></div></div><p style="font-size:11px;color:#94a3b8">${f.description}</p></div>`).join('')}</section>
<section><h3>后续建议</h3>${report.recommendations.map(r=>`<div class="rec"><div class="rn">${r.priority}</div><div><strong style="font-size:13px">${r.action}</strong><p style="font-size:12px;color:#64748b">${r.detail}</p></div></div>`).join('')}</section>
<div class="disclaimer"><p>本报告由 MetalRadar MRI Agent 自动生成，仅供研究参考，不构成投资建议。</p></div>
</div></body></html>`
}
