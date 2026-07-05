import { useState, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCompanyDetail } from '@/hooks/useCompany'
import { companyService } from '@/services/companyService'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorCard } from '@/components/news/ErrorCard'
import {
  Pencil,
  Save,
  RotateCcw,
  Trash2,
  Plus,
  X,
  Loader2,
} from 'lucide-react'
import { MermaidDiagram } from '@/components/watchlist/MermaidDiagram'
import { cn } from '@/lib/utils'
import type { CompanyBasic, CompanyMaterial, ChainAnalysis } from '@/types/company'

interface CompanyPortraitProps {
  company: CompanyBasic
  onRegenerate?: () => void
  onDelete?: () => void
}

const POSITION_LABELS: Record<string, string> = {
  up: '上游 (原材料开采/冶炼)',
  mid: '中游 (材料加工/零部件)',
  down: '下游 (终端产品/组装)',
}

const POSITION_COLORS: Record<string, string> = {
  up: 'bg-blue-100 text-blue-700',
  mid: 'bg-yellow-100 text-yellow-700',
  down: 'bg-green-100 text-green-700',
}

const POSITION_PRESETS: Record<string, string[]> = {
  up: ['矿产资源开采', '金属冶炼', '基础化工', '稀土开采', '盐湖提锂'],
  mid: ['正极材料', '电解液', '隔膜制造', '电池制造', '铜箔加工', '铝合金加工', '钢铁加工', '零部件制造'],
  down: ['汽车整车制造', '消费电子组装', '家电制造', '建筑', '电力设备', '储能系统集成'],
}

export function CompanyPortrait({ company, onRegenerate, onDelete }: CompanyPortraitProps) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useCompanyDetail(company.id)

  // 编辑状态
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [analyzingChain, setAnalyzingChain] = useState(false)
  const [chainAnalysis, setChainAnalysis] = useState<ChainAnalysis | null | undefined>(undefined)

  // 可编辑字段
  const [position, setPosition] = useState('')
  const [positionDetail, setPositionDetail] = useState('')
  const [customPositionDetail, setCustomPositionDetail] = useState('')
  const [businessDesc, setBusinessDesc] = useState('')
  const [materials, setMaterials] = useState<CompanyMaterial[]>([])

  // 进入编辑模式
  const handleStartEdit = useCallback(() => {
    if (!data) return
    setPosition(data.portrait.position || '')
    setPositionDetail(data.portrait.position_detail || '')
    setCustomPositionDetail('')
    setBusinessDesc(data.business_desc || '')
    setMaterials([...data.portrait.materials])
    setEditing(true)
  }, [data])

  // 取消编辑
  const handleCancel = useCallback(() => {
    setEditing(false)
    setReportFile(null)
    setSaveError('')
  }, [])

  // 保存修改
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError('')
    try {
      const finalDetail = customPositionDetail || positionDetail
      await companyService.updatePortrait(company.id, {
        position,
        position_detail: finalDetail,
        business_desc: businessDesc,
        materials: materials.map((m) => ({
          material_name: m.material_name,
          cost_pct: m.cost_pct,
          source: m.source || 'manual',
          direction: m.direction,
          contract: m.contract,
        })),
      })
      queryClient.invalidateQueries({ queryKey: ['company-detail', company.id] })
      setEditing(false)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setSaveError(detail || err?.message || '保存失败，请检查网络连接')
    } finally {
      setSaving(false)
    }
  }, [company.id, position, positionDetail, customPositionDetail, businessDesc, materials, queryClient])

  // 同步后端返回的 chain_analysis（公司切换时自动重置）
  useEffect(() => {
    setChainAnalysis(data?.chain_analysis ?? null)
  }, [data?.chain_analysis, company.id])

  // AI分析产业链
  const handleAnalyzeChain = useCallback(async () => {
    setAnalyzingChain(true)
    try {
      const result = await companyService.analyzeChain(company.id)
      setChainAnalysis(result)
      queryClient.invalidateQueries({ queryKey: ['company-detail', company.id] })
    } catch (err: any) {
      // 静默失败，UI 保持原样
    } finally {
      setAnalyzingChain(false)
    }
  }, [company.id, queryClient])

  // 重新生成画像
  const handleRegenerate = useCallback(async () => {
    setRegenerating(true)
    setRegenError('')
    try {
      await companyService.regeneratePortrait(company.id, reportFile || undefined)
      queryClient.invalidateQueries({ queryKey: ['company-detail', company.id] })
      setReportFile(null)
      setEditing(false)
      onRegenerate?.()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setRegenError(detail || err?.message || '重新生成失败，请稍后重试')
    } finally {
      setRegenerating(false)
    }
  }, [company.id, reportFile, queryClient, onRegenerate])

  // 品种操作
  const handleAddMaterial = () => {
    setMaterials([
      ...materials,
      { material_name: '', cost_pct: null, source: 'manual', direction: 'negative', contract: '' },
    ])
  }

  const handleRemoveMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index))
  }

  const handleMaterialChange = (index: number, field: keyof CompanyMaterial, value: unknown) => {
    setMaterials(materials.map((m, i) => (i === index ? { ...m, [field]: value } : m)))
  }

  // --- 加载状态 ---
  if (isLoading) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }

  if (isError || !data) {
    return <ErrorCard onRetry={() => refetch()} />
  }

  const { portrait } = data

  return (
    <div className="space-y-4">
      {/* ===== 操作栏 ===== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {data.name} 画像
            {data.portrait_updated_at && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                更新于 {new Date(data.portrait_updated_at).toLocaleDateString('zh-CN')}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleStartEdit}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  修改画像
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={onDelete}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                  删除关注
                </Button>
              </>
            ) : (
              <>
                {/* 重新生成区域 */}
                <div className="flex items-center gap-2 mr-2">
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                    className="h-8 text-xs w-40"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                  >
                    <RotateCcw className={cn('w-3.5 h-3.5 mr-1', regenerating && 'animate-spin')} />
                    {regenerating ? '生成中...' : '重新生成'}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleCancel}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  取消
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {saving ? '保存中...' : '保存修改'}
                </Button>
              </>
            )}
          </div>
        </div>
        {/* 错误提示 */}
        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-1.5">{saveError}</p>
        )}
        {regenError && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">{regenError}</p>
        )}
      </div>

      {/* ===== 区域一：基础信息（只读） ===== */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-emerald-500 rounded-full" />
          基础信息
          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500 border-0">只读</Badge>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">公司全称</p>
            <p className="font-medium text-slate-800">{data.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">股票代码</p>
            <p className="font-medium text-slate-800 font-mono">{data.id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">所属行业</p>
            <p className="font-medium text-slate-800">{data.industry || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">公司简称</p>
            <p className="font-medium text-slate-800">{data.short_name || data.name}</p>
          </div>
        </div>
        {data.business_desc && !editing && (
          <p className="text-sm text-slate-600 mt-3 leading-relaxed bg-slate-50 rounded-lg p-3">
            {data.business_desc}
          </p>
        )}
        {editing && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1">主营业务描述</p>
            <Input
              value={businessDesc}
              onChange={(e) => setBusinessDesc(e.target.value)}
              placeholder="公司主营业务描述"
              className="text-sm"
            />
          </div>
        )}
      </Card>

      {/* ===== 区域二：产业链位置 ===== */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-amber-500 rounded-full" />
          产业链位置
          {editing && <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 border-0">可编辑</Badge>}
          {!editing && chainAnalysis && (
            <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 border-0">AI分析</Badge>
          )}
        </h3>

        {editing ? (
          /* --- 编辑模式：保持原有简单下拉 --- */
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1.5">产业链层级</p>
              <Select value={position} onValueChange={(v) => { setPosition(v ?? ''); setPositionDetail(''); setCustomPositionDetail('') }}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="选择产业链层级" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POSITION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {position && (
              <div>
                <p className="text-xs text-slate-500 mb-1.5">细分环节（选择或自定义输入）</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(POSITION_PRESETS[position] || []).map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-7 text-xs rounded-full',
                        positionDetail === preset
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          : 'bg-white text-slate-600 hover:bg-emerald-50'
                      )}
                      onClick={() => { setPositionDetail(preset); setCustomPositionDetail('') }}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <Input
                  value={customPositionDetail || positionDetail}
                  onChange={(e) => { setCustomPositionDetail(e.target.value); setPositionDetail('') }}
                  placeholder="或自定义输入细分环节..."
                  className="text-sm max-w-md"
                />
              </div>
            )}
          </div>
        ) : chainAnalysis ? (
          /* --- 查看模式：完整AI产业链分析 --- */
          <div className="space-y-5">
            {/* 产业链位置标签 */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs px-3 py-1',
                  POSITION_COLORS[portrait.position] || 'bg-slate-100 text-slate-700'
                )}
              >
                {POSITION_LABELS[portrait.position]?.split(' ')[0] || portrait.position || '未分析'}
              </Badge>
              {chainAnalysis.summary?.full_label && (
                <Badge variant="secondary" className="text-xs px-2.5 py-1 bg-purple-100 text-purple-700 border-purple-200 font-medium">
                  {chainAnalysis.summary.full_label}
                </Badge>
              )}
              <span className="text-xs text-slate-400">基于AI分析推断</span>
            </div>

            {/* 产业链全景示意图 */}
            {chainAnalysis.mermaid && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-amber-400 rounded-full" />
                  产业链全景示意图
                </h4>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <MermaidDiagram chart={chainAnalysis.mermaid} className="text-xs" />
                </div>
              </div>
            )}

            {/* 各环节业务说明 */}
            {chainAnalysis.segments && chainAnalysis.segments.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-blue-400 rounded-full" />
                  各环节业务说明
                </h4>
                <div className="space-y-3">
                  {chainAnalysis.segments.map((seg, si) => {
                    const levelLabel = {
                      upstream: '上游 · 原材料/资源端',
                      midstream: '中游 · 制造/加工端',
                      downstream: '下游 · 终端产品/服务端',
                      auxiliary: '辅助 · 流通/配套环节',
                    }[seg.level] || seg.label

                    const levelColor = {
                      upstream: 'border-l-blue-400 bg-blue-50/50',
                      midstream: 'border-l-yellow-400 bg-yellow-50/50',
                      downstream: 'border-l-green-400 bg-green-50/50',
                      auxiliary: 'border-l-slate-400 bg-slate-50/50',
                    }[seg.level] || 'border-l-slate-300 bg-slate-50/50'

                    return (
                      <div key={si} className={`border-l-2 ${levelColor} rounded-r-lg pl-3 py-2 pr-3`}>
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">{levelLabel}</p>
                        <div className="space-y-1.5">
                          {seg.details.map((d, di) => (
                            <div key={di} className="flex items-start gap-2 text-xs">
                              {d.company_involved ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" title="公司涉足" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full border border-slate-300 mt-1.5 shrink-0" />
                              )}
                              <div>
                                <span className={cn(
                                  'font-medium',
                                  d.company_involved ? 'text-emerald-700' : 'text-slate-600'
                                )}>
                                  {d.business}
                                </span>
                                {d.description && (
                                  <span className="text-slate-400 ml-1.5">{d.description}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 产业链位置总结 */}
            {chainAnalysis.summary && (
              <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-100">
                <h4 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-amber-500 rounded-full" />
                  AI 产业链位置总结
                </h4>
                <div className="space-y-2 text-xs">
                  {chainAnalysis.summary.covered_segments && chainAnalysis.summary.covered_segments.length > 0 && (
                    <p className="text-slate-700">
                      <span className="text-slate-400">覆盖环节：</span>
                      {chainAnalysis.summary.covered_segments.join(' → ')}
                    </p>
                  )}
                  {chainAnalysis.summary.core_segment && (
                    <p className="text-slate-700">
                      <span className="text-slate-400">核心环节：</span>
                      <span className="font-medium text-slate-800">{chainAnalysis.summary.core_segment}</span>
                    </p>
                  )}
                  {chainAnalysis.summary.analysis_text && (
                    <p className="text-slate-600 leading-relaxed mt-1">
                      {chainAnalysis.summary.analysis_text}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 重新分析按钮 */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                onClick={handleAnalyzeChain}
                disabled={analyzingChain}
              >
                <RotateCcw className={cn('w-3 h-3 mr-1', analyzingChain && 'animate-spin')} />
                {analyzingChain ? '分析中...' : '重新AI分析'}
              </Button>
              <span className="text-[10px] text-slate-400">
                分析结果基于AI模型推断，仅供参考
              </span>
            </div>
          </div>
        ) : (
          /* --- 查看模式：无AI分析时显示基础信息 --- */
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs px-3 py-1',
                  POSITION_COLORS[portrait.position] || 'bg-slate-100 text-slate-700'
                )}
              >
                {POSITION_LABELS[portrait.position]?.split(' ')[0] || portrait.position || '未分析'}
              </Badge>
              <span className="text-sm text-slate-600">{portrait.position_detail}</span>
            </div>

            {/* AI分析产业链按钮 */}
            <div className="bg-purple-50/50 rounded-lg p-4 border border-purple-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Loader2 className={cn('w-4 h-4 text-purple-600', analyzingChain && 'animate-spin')} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-purple-800 mb-1">
                    AI 产业链全景分析
                  </h4>
                  <p className="text-xs text-purple-600/70 mb-3 leading-relaxed">
                    使用大模型分析该公司在产业链中的完整位置，生成全景示意图、各环节业务说明和位置总结
                  </p>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={handleAnalyzeChain}
                    disabled={analyzingChain}
                  >
                    {analyzingChain ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        AI 分析中...
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5" />
                        开始 AI 分析
                      </>
                    )}
                  </Button>
                  <span className="text-[10px] text-purple-400 ml-2">
                    预计需要 5-15 秒
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ===== 区域三：敏感原材料品种列表（可编辑，核心组件） ===== */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-rose-500 rounded-full" />
          敏感原材料品种
          {editing && <Badge variant="secondary" className="text-[10px] bg-rose-100 text-rose-700 border-0">可编辑</Badge>}
        </h3>

        {!editing && portrait.materials.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">暂无敏感品种数据</p>
        ) : editing && materials.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">暂无敏感品种数据，点击下方按钮添加</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">品种名称</th>
                  <th className="pb-2 font-medium">成本占比</th>
                  <th className="pb-2 font-medium">影响方向</th>
                  <th className="pb-2 font-medium">数据来源</th>
                  <th className="pb-2 font-medium">期货合约</th>
                  {editing && <th className="pb-2 font-medium w-10" />}
                </tr>
              </thead>
              <tbody>
                {(editing ? materials : portrait.materials).map((m, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <Input
                          value={m.material_name}
                          onChange={(e) => handleMaterialChange(i, 'material_name', e.target.value)}
                          className="h-7 text-xs w-24"
                          placeholder="品种名"
                        />
                      ) : (
                        <span className="font-medium text-slate-800">{m.material_name}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <Input
                          type="number"
                          value={m.cost_pct ?? ''}
                          onChange={(e) => handleMaterialChange(i, 'cost_pct', e.target.value ? Number(e.target.value) : null)}
                          className="h-7 text-xs w-16"
                          placeholder="%"
                        />
                      ) : (
                        <span className="text-slate-600">
                          {m.cost_pct != null ? `${m.cost_pct}%` : '未知'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <Select
                          value={m.direction}
                          onValueChange={(v) => handleMaterialChange(i, 'direction', v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="negative">成本上升不利</SelectItem>
                            <SelectItem value="positive">产品涨价有利</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] border-0',
                            m.direction === 'negative'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-green-50 text-green-700'
                          )}
                        >
                          {m.direction === 'negative' ? '成本上升不利' : '产品涨价有利'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] border-0',
                          m.source === 'report'
                            ? 'bg-emerald-50 text-emerald-700'
                            : m.source === 'manual'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                        )}
                      >
                        {m.source === 'report' ? '财报披露' : m.source === 'manual' ? '手动录入' : '行业推断'}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <Input
                          value={m.contract}
                          onChange={(e) => handleMaterialChange(i, 'contract', e.target.value)}
                          className="h-7 text-xs w-20 font-mono"
                          placeholder="合约代码"
                        />
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">{m.contract || '—'}</span>
                      )}
                    </td>
                    {editing && (
                      <td className="py-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-red-500"
                          onClick={() => handleRemoveMaterial(i)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={handleAddMaterial}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            添加品种
          </Button>
        )}
      </Card>

    </div>
  )
}
