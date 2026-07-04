import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanyDetail } from '@/hooks/useCompany'
import { ErrorCard } from '@/components/news/ErrorCard'
import { formatCurrency } from '@/utils/formatters'
import type { CompanyBasic } from '@/types/company'

interface CompanyPortraitProps {
  company: CompanyBasic
}

const POSITION_LABELS: Record<string, string> = {
  up: '上游',
  mid: '中游',
  down: '下游',
}

const POSITION_COLORS: Record<string, string> = {
  up: 'bg-blue-100 text-blue-700',
  mid: 'bg-yellow-100 text-yellow-700',
  down: 'bg-green-100 text-green-700',
}

export function CompanyPortrait({ company }: CompanyPortraitProps) {
  const { data, isLoading, isError, refetch } = useCompanyDetail(company.id)

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
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
      {/* 基本信息 */}
      <Card className="p-5">
        <h3 className="text-base font-semibold text-slate-900 mb-3">基本信息</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">公司全称：</span>
            <span className="text-slate-800">{data.name}</span>
          </div>
          <div>
            <span className="text-slate-500">股票代码：</span>
            <span className="text-slate-800">{data.id}</span>
          </div>
          <div>
            <span className="text-slate-500">所属行业：</span>
            <span className="text-slate-800">{data.industry}</span>
          </div>
          <div>
            <span className="text-slate-500">产业链位置：</span>
            <Badge
              variant="secondary"
              className={POSITION_COLORS[portrait.position] || 'bg-slate-100'}
            >
              {POSITION_LABELS[portrait.position] || portrait.position}
              {portrait.position_detail && ` · ${portrait.position_detail}`}
            </Badge>
          </div>
        </div>
        {data.business_desc && (
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">{data.business_desc}</p>
        )}
      </Card>

      {/* 敏感品种表格 */}
      {portrait.materials.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-3">敏感品种</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-2 font-medium">品种</th>
                  <th className="pb-2 font-medium">成本占比</th>
                  <th className="pb-2 font-medium">影响方向</th>
                  <th className="pb-2 font-medium">数据来源</th>
                  <th className="pb-2 font-medium">对应合约</th>
                </tr>
              </thead>
              <tbody>
                {portrait.materials.map((m, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium text-slate-800">{m.material_name}</td>
                    <td className="py-2 text-slate-600">
                      {m.cost_pct != null ? `${m.cost_pct}%` : '未知'}
                    </td>
                    <td className="py-2">
                      <Badge
                        variant="secondary"
                        className={
                          m.direction === 'negative'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }
                      >
                        {m.direction === 'negative' ? '成本上升不利' : '产品涨价有利'}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-500 text-xs">
                      {m.source === 'report' ? '财报披露' : '行业推断'}
                    </td>
                    <td className="py-2 text-slate-500 text-xs font-mono">{m.contract}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 财报摘要 */}
      {financial_summary && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            财报摘要 ({financial_summary.report_period})
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-500 mb-1">营业收入</p>
              <p className="text-lg font-bold text-slate-800">
                {financial_summary.revenue != null
                  ? formatCurrency(financial_summary.revenue, 'yi')
                  : '-'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-500 mb-1">毛利率</p>
              <p className="text-lg font-bold text-slate-800">
                {financial_summary.gross_margin != null
                  ? `${financial_summary.gross_margin}%`
                  : '-'}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-slate-500 mb-1">直接材料占比</p>
              <p className="text-lg font-bold text-slate-800">
                {financial_summary.direct_material_pct != null
                  ? `${financial_summary.direct_material_pct}%`
                  : '-'}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
