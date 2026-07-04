import { useState, useCallback } from 'react'
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
import { formatCurrency } from '@/utils/formatters'
import {
  Pencil,
  Save,
  RotateCcw,
  Trash2,
  Plus,
  X,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompanyBasic, CompanyMaterial } from '@/types/company'

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
  const [regenerating, setRegenerating] = useState(false)
  const [reportFile, setReportFile] = useState<File | null>(null)

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
  }, [])

  // 保存修改
  const handleSave = useCallback(async () => {
    setSaving(true)
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
    } catch {
      // 保存失败，保持编辑状态
    } finally {
      setSaving(false)
    }
  }, [company.id, position, positionDetail, customPositionDetail, businessDesc, materials, queryClient])

  // 重新生成画像
  const handleRegenerate = useCallback(async () => {
    setRegenerating(true)
    try {
      await companyService.regeneratePortrait(company.id, reportFile || undefined)
      queryClient.invalidateQueries({ queryKey: ['company-detail', company.id] })
      setReportFile(null)
      setEditing(false)
      onRegenerate?.()
    } catch {
      // 失败
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

  const { portrait, financial_summary } = data

  return (
    <div className="space-y-4">
      {/* ===== 操作栏 ===== */}
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

      {/* ===== 区域二：产业链位置（可编辑） ===== */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-amber-500 rounded-full" />
          产业链位置
          {editing && <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 border-0">可编辑</Badge>}
        </h3>

        {!editing ? (
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
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1.5">产业链层级</p>
              <Select value={position} onValueChange={(v) => { setPosition(v); setPositionDetail(''); setCustomPositionDetail('') }}>
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
        )}
      </Card>

      {/* ===== 区域三：敏感原材料品种列表（可编辑，核心组件） ===== */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-rose-500 rounded-full" />
          敏感原材料品种
          {editing && <Badge variant="secondary" className="text-[10px] bg-rose-100 text-rose-700 border-0">可编辑</Badge>}
        </h3>

        {materials.length === 0 && !editing ? (
          <p className="text-sm text-slate-400 text-center py-6">暂无敏感品种数据</p>
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

      {/* ===== 区域四：财报基准数据（只读） ===== */}
      {financial_summary && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded-full" />
            财报基准数据
            <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500 border-0">只读</Badge>
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            数据对应报告期：{financial_summary.report_period}
            {reportFile && (
              <span className="ml-2 text-emerald-600 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                新财报已上传
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">营业收入</p>
              <p className="text-base font-bold text-slate-800">
                {financial_summary.revenue != null
                  ? formatCurrency(financial_summary.revenue, 'yi')
                  : '—'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">毛利率</p>
              <p className="text-base font-bold text-slate-800">
                {financial_summary.gross_margin != null
                  ? `${financial_summary.gross_margin}%`
                  : '—'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">直接材料占比</p>
              <p className="text-base font-bold text-slate-800">
                {financial_summary.direct_material_pct != null
                  ? `${financial_summary.direct_material_pct}%`
                  : '—'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">直接人工占比</p>
              <p className="text-base font-bold text-slate-800">
                {financial_summary.direct_labor_pct != null
                  ? `${financial_summary.direct_labor_pct}%`
                  : '—'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">制造费用占比</p>
              <p className="text-base font-bold text-slate-800">
                {financial_summary.manufacturing_pct != null
                  ? `${financial_summary.manufacturing_pct}%`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 无财报时显示上传引导 */}
      {!financial_summary && (
        <Card className="p-5 bg-slate-50 border-dashed">
          <div className="text-center py-4">
            <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-2">暂无财报数据</p>
            <p className="text-xs text-slate-400 mb-3">
              上传财报PDF可获取更精准的成本结构分析
            </p>
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleStartEdit}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                去上传财报
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
