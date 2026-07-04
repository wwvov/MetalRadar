import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { CompanyBasic } from '@/types/company'

interface CompanyCardProps {
  company: CompanyBasic
  selected?: boolean
  onSelect: (company: CompanyBasic) => void
  onRemove?: (companyId: string) => void
}

const INDUSTRY_COLORS: Record<string, string> = {
  '有色金属': 'bg-orange-100 text-orange-700',
  '新能源': 'bg-green-100 text-green-700',
  '汽车': 'bg-blue-100 text-blue-700',
  '制造业': 'bg-slate-100 text-slate-700',
}

export function CompanyCard({ company, selected, onSelect, onRemove }: CompanyCardProps) {
  return (
    <Card
      className={cn(
        'relative shrink-0 w-40 p-3 cursor-pointer transition-all hover:shadow-md',
        'border-2',
        selected
          ? 'border-metal-blue bg-blue-50/50'
          : 'border-transparent hover:border-slate-200'
      )}
      onClick={() => onSelect(company)}
    >
      {/* 移除按钮 */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-5 w-5 text-slate-400 hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(company.id)
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      )}

      {/* 公司名称 */}
      <h4 className="text-sm font-semibold text-slate-900 truncate mb-1">
        {company.name}
      </h4>

      {/* 股票代码 */}
      <p className="text-xs text-slate-500 mb-2">{company.id}</p>

      {/* 行业标签 */}
      {company.industry && (
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px]',
            INDUSTRY_COLORS[company.industry] || 'bg-slate-100 text-slate-600'
          )}
        >
          {company.industry}
        </Badge>
      )}
    </Card>
  )
}
