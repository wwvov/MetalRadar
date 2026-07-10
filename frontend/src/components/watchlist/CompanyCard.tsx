import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Pencil, Trash2, ChevronDown, Clock } from 'lucide-react'
import type { CompanyBasic } from '@/types/company'

interface CompanyCardProps {
  company: CompanyBasic
  selected?: boolean
  onSelect: (company: CompanyBasic) => void
  onEdit?: (company: CompanyBasic) => void
  onRemove?: (companyId: string) => void
  /** 公司完整画像数据（含品种列表等） */
  portraitInfo?: {
    position?: string
    position_detail?: string
    materials?: Array<{ material_name: string; cost_pct?: number | null }>
    updatedAt?: string
  }
}

const POSITION_LABELS: Record<string, string> = {
  up: '上游',
  mid: '中游',
  down: '下游',
}

const POSITION_COLORS: Record<string, string> = {
  up: 'bg-blue-100 text-blue-700 border-blue-200',
  mid: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  down: 'bg-green-100 text-green-700 border-green-200',
}

const INDUSTRY_COLORS: Record<string, string> = {
  '有色金属': 'bg-orange-100 text-orange-700',
  '新能源': 'bg-emerald-100 text-emerald-700',
  '新能源汽车': 'bg-emerald-100 text-emerald-700',
  '汽车': 'bg-blue-100 text-blue-700',
  '制造业': 'bg-slate-100 text-slate-700',
  '消费电子': 'bg-purple-100 text-purple-700',
  '钢铁': 'bg-gray-200 text-gray-700',
  '化工': 'bg-cyan-100 text-cyan-700',
  '矿业': 'bg-amber-100 text-amber-700',
}

export function CompanyCard({ company, selected, onSelect, onEdit, onRemove, portraitInfo }: CompanyCardProps) {
  const [hovered, setHovered] = useState(false)
  const [materialsExpanded, setMaterialsExpanded] = useState(false)

  const position = portraitInfo?.position || ''
  const positionDetail = portraitInfo?.position_detail || ''
  const materials = portraitInfo?.materials || []
  const displayMaterials = materialsExpanded ? materials : materials.slice(0, 3)
  const hasMore = materials.length > 3

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <Card
      className={cn(
        'relative shrink-0 w-44 p-3.5 cursor-pointer transition-all',
        'border-2',
        selected
          ? 'border-emerald-500 bg-emerald-50/60 shadow-md'
          : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm'
      )}
      onClick={() => onSelect(company)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 悬停操作按钮 */}
      {hovered && (
        <div className="absolute top-1.5 right-1.5 flex gap-0.5 z-10">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
              onClick={(e) => { e.stopPropagation(); onEdit(company) }}
            >
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); onRemove(company.id) }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {/* 公司名称 */}
      <h4 className="text-sm font-semibold text-slate-900 truncate pr-8 mb-0.5">
        {company.name}
      </h4>

      {/* 股票代码 */}
      <p className="text-[11px] text-slate-400 font-mono mb-1.5">{company.id}</p>

      {/* 主营业务简述 */}
      {company.business_desc && (
        <p className="text-[10px] text-slate-500 leading-tight mb-1.5 line-clamp-2" title={company.business_desc}>
          {company.business_desc}
        </p>
      )}

      {/* 标签行 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {/* 行业 */}
        {company.industry && (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] py-0 px-1.5 border-0',
              INDUSTRY_COLORS[company.industry] || 'bg-slate-100 text-slate-600'
            )}
          >
            {company.industry}
          </Badge>
        )}

        {/* 产业链位置 */}
        {position && (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] py-0 px-1.5 border',
              POSITION_COLORS[position] || 'bg-slate-100 text-slate-600'
            )}
            title={positionDetail}
          >
            {POSITION_LABELS[position] || position}
          </Badge>
        )}
      </div>

      {/* 敏感品种列表 */}
      {displayMaterials.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] text-slate-400 font-medium">敏感品种</p>
          <div className="flex flex-wrap gap-0.5">
            {displayMaterials.map((m, i) => (
              <span
                key={i}
                className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0 rounded border border-amber-100"
                title={m.cost_pct != null ? `预估成本占比: ${m.cost_pct}%` : undefined}
              >
                {m.material_name}
              </span>
            ))}
            {hasMore && !materialsExpanded && (
              <button
                className="text-[10px] text-amber-500 hover:text-amber-700 px-0.5"
                onClick={(e) => { e.stopPropagation(); setMaterialsExpanded(true) }}
              >
                +{materials.length - 3}
              </button>
            )}
          </div>
          {hasMore && materialsExpanded && (
            <button
              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
              onClick={(e) => { e.stopPropagation(); setMaterialsExpanded(false) }}
            >
              <ChevronDown className="w-3 h-3 rotate-180" />
              收起
            </button>
          )}
        </div>
      )}

      {/* 更新时间 */}
      {portraitInfo?.updatedAt && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
          <Clock className="w-2.5 h-2.5 text-slate-300" />
          <span className="text-[10px] text-slate-400">{formatDate(portraitInfo.updatedAt)}</span>
        </div>
      )}
    </Card>
  )
}
