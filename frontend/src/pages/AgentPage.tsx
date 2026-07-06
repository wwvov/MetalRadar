import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgent, useReport } from '@/hooks/useAgent'
import { useFollows } from '@/hooks/useFollows'
import { useWatchlist } from '@/providers'
import ReactEChartsCore from 'echarts-for-react'
import { BASE_CHART_OPTION, CHART_COLORS } from '@/utils/echarts-config'
import type { RiskReport, ChartData, RiskFactor } from '@/types/agent'
import {
  Bot, Send, Zap, AlertTriangle, MessageSquare,
  FileText, Download, RotateCcw, ChevronDown,
  User, TrendingUp, TrendingDown,
  Copy, Check, X,
  Loader2, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helper: Markdown 简单渲染 ──────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm text-rose-600">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-900 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-900 mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-900 mt-5 mb-3">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-slate-700">• $1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-slate-700">$1. $2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/---/g, '<hr class="my-3 border-slate-200"/>')
  return <div className="text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />
}

// ─── Chart Renderer ─────────────────────────────────────────────

function ChartRenderer({ chart }: { chart: ChartData }) {
  let option: any = {}

  if (chart.type === 'bar') {
    const items = (chart.data.items as any[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '8%', top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: items.map(i => i.name),
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: '变动(%)',
        axisLabel: { formatter: '{value}%', fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: items.map(i => ({
          value: i.change_pct,
          itemStyle: { color: i.change_pct >= 0 ? CHART_COLORS.up : CHART_COLORS.down },
        })),
        barMaxWidth: 40,
      }],
    }
  } else if (chart.type === 'line') {
    const prices = (chart.data.prices as number[]) || []
    option = {
      ...BASE_CHART_OPTION,
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '5%', top: 40, bottom: 30 },
      xAxis: { type: 'category', data: prices.map((_, i) => `D-${prices.length - i}`), show: false },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 11 } },
      series: [{
        type: 'line',
        data: prices,
        smooth: true,
        lineStyle: { color: CHART_COLORS.primary, width: 2 },
        areaStyle: { color: 'rgba(22, 163, 74, 0.08)' },
        itemStyle: { color: CHART_COLORS.primary },
        showSymbol: false,
      }],
    }
  } else if (chart.type === 'gauge') {
    const score = (chart.data.score as number) || 50
    option = {
      series: [{
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        center: ['50%', '60%'],
        radius: '85%',
        min: 0,
        max: 100,
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.4, '#22c55e'],
              [0.7, '#eab308'],
              [1, '#ef4444'],
            ],
          },
        },
        pointer: { length: '60%', width: 6, itemStyle: { color: '#334155' } },
        axisTick: { distance: -12, length: 6, lineStyle: { width: 1, color: '#94a3b8' } },
        splitLine: { distance: -18, length: 14, lineStyle: { width: 2, color: '#94a3b8' } },
        axisLabel: { color: '#64748b', fontSize: 11, distance: 25, formatter: '{value}' },
        detail: {
          valueAnimation: true,
          formatter: '{value}',
          color: '#0f172a',
          fontSize: 28,
          offsetCenter: [0, '70%'],
        },
        data: [{ value: score }],
      }],
    }
  }

  return (
    <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200 p-3">
      {chart.title && <p className="text-xs font-medium text-slate-500 mb-2">{chart.title}</p>}
      <ReactEChartsCore option={option} style={{ height: 200 }} notMerge />
    </div>
  )
}

// ─── Risk Badge ─────────────────────────────────────────────────

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  if (!level) return null
  const colors: Record<string, string> = {
    '低风险': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '中等风险': 'bg-amber-50 text-amber-700 border-amber-200',
    '高风险': 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', colors[level] || 'bg-slate-100')}>
      <AlertTriangle className="w-3 h-3" />
      {level}
      {score != null && <span className="ml-1 opacity-70">{score}分</span>}
    </span>
  )
}

// ─── Report Panel ───────────────────────────────────────────────

function ReportPanel({ report, onClose, onExport }: {
  report: RiskReport
  onClose: () => void
  onExport: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyText = () => {
    const text = `MRI风险分析报告 · ${report.material_name}
公司: ${report.company_name}(${report.company_code})
风险评分: ${report.risk_score}分 | 风险等级: ${report.risk_level}
生成时间: ${report.generated_at}

${report.summary}

推理链路:
${report.reasoning.map(r => `${r.step}. ${r.title}: ${r.detail}`).join('\n')}

风险因子:
${report.factors.map(f => `- ${f.name}(${(f.weight*100).toFixed(0)}%): ${f.score}分 - ${f.description}`).join('\n')}

建议:
${report.recommendations.map(r => `${r.priority}. ${r.action}: ${r.detail}`).join('\n')}

---
本报告由 MetalRadar MRI Agent 生成，仅供参考，不构成投资建议。`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="absolute inset-0 z-20 bg-white overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-purple-600" />
          <div>
            <h2 className="font-semibold text-slate-900">MRI 风险分析报告</h2>
            <p className="text-xs text-slate-500">
              报告ID: {report.report_id} · 生成: {report.generated_at} · 分析师: MRI Agent v1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyText} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '复制'}
          </button>
          <button onClick={onExport} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700">
            <Download className="w-3.5 h-3.5" /> 导出 HTML
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
        {/* Executive Summary */}
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-3">Executive Summary</h3>
          <div className="bg-gradient-to-r from-purple-50 to-slate-50 rounded-xl border border-purple-200 p-5">
            <h4 className="font-semibold text-slate-900 mb-2">
              风险判定：{report.material_name} {report.risk_level === '高风险' ? '短期承压，建议加速对冲与锁价' : report.risk_level === '中等风险' ? '需密切关注，适度对冲' : '当前风险可控'}
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">{report.summary}</p>
          </div>
        </section>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard label="当前价格" value={report.current_price ? `${report.current_price.toLocaleString()} USD/t` : '--'} />
          <MetricCard label="24H变动" value={report.price_change_24h != null ? `${report.price_change_24h > 0 ? '+' : ''}${report.price_change_24h.toFixed(1)}%` : '--'} trend={report.price_change_24h != null ? (report.price_change_24h >= 0 ? 'up' : 'down') : undefined} />
          <MetricCard label="风险等级" value={report.risk_level} highlight={report.risk_level === '高风险' ? 'red' : report.risk_level === '中等风险' ? 'yellow' : 'green'} />
          <MetricCard label="风险评分" value={`${report.risk_score}`} highlight={report.risk_score >= 70 ? 'red' : report.risk_score >= 40 ? 'yellow' : 'green'} />
        </div>

        {/* Risk Score Gauge */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-2">Risk Score</h3>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <ChartRenderer chart={{ type: 'gauge', title: '综合风险评分', data: { score: report.risk_score } }} />
          </div>
        </section>

        {/* Reasoning Chain */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">推理过程 · Reasoning Chain</h3>
          <div className="space-y-2">
            {report.reasoning.map((step, idx) => (
              <div key={idx} className="flex gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {step.step}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Evidence */}
        {report.sources.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">数据依据 · Evidence</h3>
            <div className="grid grid-cols-1 gap-2">
              {report.sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{s.source}</span>
                  <span className="text-sm text-slate-700">{s.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Risk Factors */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">因子贡献 · Risk Composition</h3>
          <div className="space-y-3">
            {report.factors.map((f, i) => (
              <FactorBar key={i} factor={f} />
            ))}
          </div>
        </section>

        {/* Scenarios */}
        {report.scenarios && report.scenarios.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-3">情景模拟 · Scenarios</h3>
            <div className="grid grid-cols-3 gap-3">
              {report.scenarios.map((s, i) => (
                <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{s.estimated_gross_margin.toFixed(1)}%</p>
                  <p className="text-xs text-slate-500">预估毛利率</p>
                  <div className={cn('mt-1 text-xs font-medium', s.margin_change_pp >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {s.margin_change_pp >= 0 ? '+' : ''}{s.margin_change_pp.toFixed(2)}pp
                  </div>
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
                <ChartRenderer key={i} chart={c} />
              ))}
            </div>
          </section>
        )}

        {/* Recommendations */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3">后续建议 · Recommendations</h3>
          <div className="space-y-2">
            {report.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-white rounded-lg border border-purple-100">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {r.priority}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{r.action}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Disclaimer */}
        <div className="text-center text-xs text-slate-400 py-4 border-t border-slate-100">
          <p>本报告由 MetalRadar MRI Agent 自动生成，仅供研究参考，不构成投资建议。</p>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, trend, highlight }: {
  label: string; value: string; trend?: 'up' | 'down'; highlight?: 'red' | 'yellow' | 'green'
}) {
  const hlColors = {
    red: 'bg-rose-50 border-rose-200',
    yellow: 'bg-amber-50 border-amber-200',
    green: 'bg-emerald-50 border-emerald-200',
  }
  return (
    <div className={cn('rounded-xl border p-4 text-center', highlight ? hlColors[highlight] : 'bg-white border-slate-200')}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-900 flex items-center justify-center gap-1">
        {value}
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-rose-500" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-emerald-500" />}
      </p>
    </div>
  )
}

function FactorBar({ factor }: { factor: RiskFactor }) {
  const colors: Record<string, string> = {
    '新闻情绪': 'bg-blue-500',
    '价格波动': 'bg-amber-500',
    '成本传导': 'bg-rose-500',
    '宏观环境': 'bg-purple-500',
    '汇率波动': 'bg-teal-500',
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-slate-700">{factor.name}</span>
        <span className="text-xs text-slate-500">{factor.weight * 100}% · {factor.score}分</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', colors[factor.name] || 'bg-slate-400')}
          style={{ width: `${factor.score}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{factor.description}</p>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────

const SCENARIOS = [
  { key: 'risk_scan' as const, label: '风险扫描', icon: Search, desc: '全面评估原材料风险' },
  { key: 'event_impact' as const, label: '事件传导', icon: Zap, desc: '分析事件影响路径' },
  { key: 'free_qa' as const, label: '自由问答', icon: MessageSquare, desc: '任意投研问题' },
]

export default function AgentPage() {
  useFollows()  // 全局加载关注列表
  const { follows } = useWatchlist()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [activeScenario, setActiveScenario] = useState<string>('free_qa')
  const [inputValue, setInputValue] = useState('')
  const [showReport, setShowReport] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, isProcessing, sendMessage, clearChat, contextQuery } = useAgent(
    selectedCompanyId || undefined
  )
  const { report, generateReport, isGenerating, setReport } = useReport()

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Set first company as default
  useEffect(() => {
    if (follows.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(follows[0].id)
    }
  }, [follows, selectedCompanyId])

  const handleSend = useCallback(async () => {
    const msg = inputValue.trim()
    if (!msg || isProcessing) return
    setInputValue('')
    await sendMessage(msg, activeScenario as any)
  }, [inputValue, isProcessing, sendMessage, activeScenario])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleScenarioClick = (key: string) => {
    setActiveScenario(key)
    const prompts: Record<string, string> = {
      risk_scan: '请对该公司进行全面的原材料风险扫描，包括风险评分、主要风险来源和监控建议。',
      event_impact: '请分析近期重大事件对该公司原材料成本的传导影响路径。',
      free_qa: '',
    }
    const prompt = prompts[key]
    if (prompt) {
      setInputValue(prompt)
      inputRef.current?.focus()
    }
  }

  const handleGenerateReport = async () => {
    if (!selectedCompanyId) return
    generateReport({ companyId: selectedCompanyId })
    setShowReport(true)
  }

  const handleExportHTML = () => {
    if (!report) return
    // 构建HTML报告
    const html = buildReportHTML(report)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.report_id}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-100" />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold text-slate-900">AI Agent · MRI 投研助手</h1>
              <p className="text-xs text-slate-500">多源数据驱动 · 四层推理引擎 · 量化风险评分</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 清空对话
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={!selectedCompanyId || isGenerating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              生成报告
            </button>
          </div>
        </div>

        {/* Company selector + Scenarios */}
        <div className="flex items-center gap-4 mt-3">
          {/* Company selector */}
          <div className="relative">
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value)
                setReport(null)
                setShowReport(false)
              }}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
            >
              <option value="">选择分析公司...</option>
              {follows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Scenarios */}
          <div className="flex items-center gap-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                onClick={() => handleScenarioClick(s.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  activeScenario === s.key
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {messages.length === 0 ? (
            /* Welcome */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">MRI Agent · 原材料风险智能分析</h2>
              <p className="text-sm text-slate-500 max-w-md mb-6">
                基于多源数据融合与四层推理引擎，为您提供企业原材料风险的深度分析、量化评分和行动建议。
              </p>

              {selectedCompanyId ? (
                <div className="space-y-3 w-full max-w-md">
                  {contextQuery.data && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-left">
                      <p className="text-xs font-medium text-slate-500 mb-2">当前分析对象</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {contextQuery.data.company.name} ({contextQuery.data.company.code})
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {contextQuery.data.company.industry} · {contextQuery.data.company.position}
                      </p>
                      {contextQuery.data.materials.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contextQuery.data.materials.map((m, i) => (
                            <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs border border-amber-200">
                              {m.name} {m.cost_pct}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => handleScenarioClick(s.key)}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-200 transition-colors"
                      >
                        <s.icon className="w-5 h-5 text-purple-600" />
                        <span className="text-xs font-medium text-slate-700">{s.label}</span>
                        <span className="text-[10px] text-slate-400">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md">
                  <Building2Icon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    请先在「我的关注」中添加公司，然后在上方选择一家公司开始分析。
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Messages */
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white border border-slate-200 shadow-sm'
                    )}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    ) : (
                      <div>
                        {/* Risk badge */}
                        {(msg.riskScore != null || msg.riskLevel) && (
                          <div className="mb-2">
                            <RiskBadge level={msg.riskLevel} score={msg.riskScore} />
                          </div>
                        )}
                        <SimpleMarkdown text={msg.content} />
                        {/* Charts */}
                        {msg.charts?.map((c, i) => (
                          <ChartRenderer key={i} chart={c} />
                        ))}
                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-400 mb-1">数据依据</p>
                            {msg.sources.map((s, i) => (
                              <span key={i} className="inline-flex items-center mr-1 mb-1 px-1.5 py-0.5 bg-slate-50 rounded text-[10px] text-slate-500">
                                {s.source}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-slate-500" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isProcessing && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-slate-200 px-6 py-3 shrink-0">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeScenario === 'risk_scan' ? '输入风险扫描指令，或直接按回车发送默认提示...' :
                  activeScenario === 'event_impact' ? '输入事件描述，或直接按回车分析传导影响...' :
                  '输入您的问题，我将基于多源数据进行深度分析...'
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-300"
                disabled={isProcessing}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isProcessing}
              className="shrink-0 w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-400 mt-2 max-w-4xl mx-auto">
            MRI Agent 基于多源数据与LLM推理生成分析，所有结论仅供参考，不构成投资建议。
            按 Enter 发送，Shift+Enter 换行。
          </p>
        </div>
      </div>

      {/* Report Panel Overlay */}
      {showReport && report && (
        <ReportPanel
          report={report}
          onClose={() => setShowReport(false)}
          onExport={handleExportHTML}
        />
      )}
    </div>
  )
}

// ─── Inline Icon Component ──────────────────────────────────────

function Building2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M12 6h.01" /><path d="M12 10h.01" />
      <path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" />
      <path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  )
}

// ─── HTML Report Builder ────────────────────────────────────────

function buildReportHTML(report: RiskReport): string {
  const levelColor: Record<string, string> = {
    '低风险': '#16a34a',
    '中等风险': '#ca8a04',
    '高风险': '#dc2626',
  }
  const color = levelColor[report.risk_level] || '#64748b'

  const factorsHTML = report.factors.map(f =>
    `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:13px;">${f.name}</span>
        <span style="font-size:11px;color:#94a3b8;">${(f.weight*100).toFixed(0)}% · ${f.score}分</span>
      </div>
      <div style="height:8px;background:#f1f5f9;border-radius:4px;">
        <div style="height:100%;width:${f.score}%;background:${color};border-radius:4px;"></div>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">${f.description}</p>
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MRI 风险分析报告 · ${report.company_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #1e293b; line-height: 1.6; background: #f8fafc; }
    .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
    .header { background: #fff; border-bottom: 2px solid #7c3aed; padding: 20px 0; margin-bottom: 32px; }
    .header h1 { font-size: 22px; color: #1e293b; }
    .header p { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .summary { background: linear-gradient(135deg, #f5f3ff, #f8fafc); border: 1px solid #e9d5ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .metric { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .metric .label { font-size: 11px; color: #94a3b8; }
    .metric .value { font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 4px; }
    section { margin-bottom: 28px; }
    section h3 { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    .reasoning-step { display: flex; gap: 10px; padding: 10px; background: #f8fafc; border-radius: 8px; margin-bottom: 6px; border: 1px solid #f1f5f9; }
    .step-num { width: 28px; height: 28px; background: #f5f3ff; color: #7c3aed; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .rec-item { display: flex; gap: 10px; padding: 12px; background: linear-gradient(135deg, #f5f3ff, #fff); border-radius: 8px; border: 1px solid #e9d5ff; margin-bottom: 6px; }
    .rec-num { width: 24px; height: 24px; background: #7c3aed; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .evidence-item { padding: 8px 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 4px; border: 1px solid #f1f5f9; display: flex; gap: 8px; align-items: center; }
    .source-badge { font-size: 11px; font-weight: 600; color: #7c3aed; background: #f5f3ff; padding: 2px 6px; border-radius: 4px; }
    .disclaimer { text-align: center; font-size: 11px; color: #94a3b8; padding-top: 20px; border-top: 1px solid #e2e8f0; margin-top: 20px; }
    .risk-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .risk-high { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .risk-mid { background: #fffbeb; color: #ca8a04; border: 1px solid #fde68a; }
    .risk-low { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MRI Agent · 物料风险智能分析报告</h1>
      <p>报告ID: ${report.report_id} · 生成时间: ${report.generated_at} · 分析师: MRI Agent v1</p>
    </div>

    <section>
      <h3>Executive Summary</h3>
      <div class="summary">
        <p style="font-weight:600;margin-bottom:4px;">风险判定：${report.material_name}
          <span class="risk-badge risk-${report.risk_level === '高风险' ? 'high' : report.risk_level === '中等风险' ? 'mid' : 'low'}">${report.risk_level}</span>
        </p>
        <p style="font-size:13px;color:#475569;">${report.summary}</p>
      </div>
    </section>

    <div class="metrics">
      <div class="metric"><span class="label">当前价格</span><span class="value">${report.current_price?.toLocaleString() || '--'} USD/t</span></div>
      <div class="metric"><span class="label">24H变动</span><span class="value" style="color:${(report.price_change_24h || 0) >= 0 ? '#dc2626' : '#16a34a'}">${report.price_change_24h != null ? `${(report.price_change_24h) >= 0 ? '+' : ''}${report.price_change_24h.toFixed(1)}%` : '--'}</span></div>
      <div class="metric"><span class="label">风险等级</span><span class="value" style="color:${color}">${report.risk_level}</span></div>
      <div class="metric"><span class="label">风险评分</span><span class="value" style="color:${color}">${report.risk_score}</span></div>
    </div>

    <section>
      <h3>推理过程 · Reasoning Chain</h3>
      ${report.reasoning.map(r => `
      <div class="reasoning-step">
        <div class="step-num">${r.step}</div>
        <div><strong style="font-size:13px;">${r.title}</strong><p style="font-size:12px;color:#64748b;">${r.detail}</p></div>
      </div>`).join('')}
    </section>

    ${report.sources.length > 0 ? `
    <section>
      <h3>数据依据 · Evidence</h3>
      ${report.sources.map(s => `
      <div class="evidence-item">
        <span class="source-badge">${s.source}</span>
        <span style="font-size:13px;">${s.content}</span>
      </div>`).join('')}
    </section>` : ''}

    <section>
      <h3>因子贡献 · Risk Composition</h3>
      ${factorsHTML}
    </section>

    <section>
      <h3>后续建议 · Recommendations</h3>
      ${report.recommendations.map(r => `
      <div class="rec-item">
        <div class="rec-num">${r.priority}</div>
        <div><strong style="font-size:13px;">${r.action}</strong><p style="font-size:12px;color:#64748b;">${r.detail}</p></div>
      </div>`).join('')}
    </section>

    <div class="disclaimer">
      <p>本报告由 MetalRadar MRI Agent 自动生成，仅供研究参考，不构成投资建议。</p>
    </div>
  </div>
</body>
</html>`
}
