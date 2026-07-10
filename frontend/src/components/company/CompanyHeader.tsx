import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Building2,
  ChevronDown,
  Search,
  TrendingUp,
  Newspaper,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompanyDetail, CompanyBasic, StockInfo, FinancialData } from '@/types/company'

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

interface CompanyHeaderProps {
  company: CompanyDetail
  follows: CompanyBasic[]
  onSwitchCompany: (companyId: string) => void
  loading?: boolean
  stockInfo?: StockInfo
  financialData?: FinancialData
}

export function CompanyHeader({ company, follows, onSwitchCompany, loading, stockInfo, financialData }: CompanyHeaderProps) {
  const navigate = useNavigate()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [switcherSearch, setSwitcherSearch] = useState('')

  // 计算估值指标（后端akshare数据优先，客户端计算兜底）
  const marketCap = stockInfo?.total_market_cap
  const latestQuarter = financialData?.quarters?.[0]
  // 净资产: 优先取 equity 字段, 其次用 总资产-总负债 推算
  const equity = latestQuarter?.equity
    ?? ((latestQuarter?.total_assets != null && latestQuarter?.total_liabilities != null)
      ? latestQuarter.total_assets - latestQuarter.total_liabilities
      : null)
  const revenue = financialData?.revenue  // 最新季度营业收入

  // 近4个季度净利润合计（用于PE兜底计算）
  const ttmNetProfit = (financialData?.quarters || [])
    .slice(0, 4)
    .reduce((sum, q) => sum + (q.net_profit ?? 0), 0)

  // 市盈率 PE = 总市值 / 近4季度净利润合计（优先用后端 akshare 直接返回的数据）
  const pe = stockInfo?.pe != null
    ? stockInfo.pe.toFixed(2)
    : (marketCap != null && ttmNetProfit > 0 ? (marketCap / ttmNetProfit).toFixed(2) : null)

  // 市净率 PB = 总市值 / 净资产（优先用后端 akshare 直接返回的数据）
  const pb = stockInfo?.pb != null
    ? stockInfo.pb.toFixed(2)
    : (marketCap != null && equity != null && equity > 0 ? (marketCap / equity).toFixed(2) : null)

  // 市销率 PS = 总市值 / 年化营业收入 (单季×4)
  const ps = (marketCap != null && revenue != null && revenue > 0)
    ? (marketCap / (revenue * 4)).toFixed(2)
    : null

  const filteredFollows = switcherSearch
    ? follows.filter(
        (c) =>
          c.name.includes(switcherSearch) ||
          c.code.includes(switcherSearch)
      )
    : follows

  const handleTagClick = (materialName: string) => {
    navigate(`/?tab=sensitive_metals&metal=${encodeURIComponent(materialName)}`)
  }

  if (loading) {
    return (
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </Card>
    )
  }

  const { portrait } = company

  return (
    <Card className="p-5 overflow-visible">
      {/* 第一行：公司名称 + 切换器 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            {company.name}
            <span className="text-sm font-mono text-slate-400 font-normal">
              {company.code || company.id}
            </span>
            {company.industry && (
              <Badge variant="secondary" className="text-[11px] bg-slate-100 text-slate-600 border-0">
                {company.industry}
              </Badge>
            )}
            {/* 估值指标：市盈率 PE */}
            {pe != null && (
              <span className="text-xs text-slate-500 font-normal" title="市盈率 = 总市值 / 近4季度净利润合计">
                <span className="text-slate-400">PE</span>{' '}
                <span className="font-semibold text-slate-700">{pe}</span>
              </span>
            )}
            {/* 估值指标：市净率 PB */}
            {pb != null && (
              <span className="text-xs text-slate-500 font-normal" title="市净率 = 总市值 / 净资产">
                <span className="text-slate-400">PB</span>{' '}
                <span className="font-semibold text-slate-700">{pb}</span>
              </span>
            )}
            {/* 估值指标：市销率 PS */}
            {ps != null && (
              <span className="text-xs text-slate-500 font-normal" title="市销率 = 总市值 / 年化营业收入">
                <span className="text-slate-400">PS</span>{' '}
                <span className="font-semibold text-slate-700">{ps}</span>
              </span>
            )}
          </h1>
          {company.business_desc && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{company.business_desc}</p>
          )}
        </div>

        {/* 公司切换器 */}
        {follows.length > 1 && (
          <div className="relative ml-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => setShowSwitcher(!showSwitcher)}
            >
              <Building2 className="w-3.5 h-3.5" />
              切换公司
              <ChevronDown className={cn('w-3 h-3 transition-transform', showSwitcher && 'rotate-180')} />
            </Button>

            {showSwitcher && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSwitcher(false)} />
                <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border shadow-lg z-20 max-h-80 overflow-hidden">
                  {/* 搜索 */}
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="搜索关注公司..."
                        value={switcherSearch}
                        onChange={(e) => setSwitcherSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  {/* 列表 */}
                  <div className="overflow-y-auto max-h-60">
                    {filteredFollows.map((c) => (
                      <button
                        key={c.id}
                        className={cn(
                          'w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between',
                          c.id === company.id && 'bg-emerald-50'
                        )}
                        onClick={() => {
                          onSwitchCompany(c.id)
                          setShowSwitcher(false)
                          setSwitcherSearch('')
                        }}
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-800">{c.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{c.code}</div>
                        </div>
                        {c.id === company.id && (
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    ))}
                    {filteredFollows.length === 0 && (
                      <div className="px-3 py-4 text-xs text-slate-400 text-center">
                        无匹配公司
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 第二行：产业链位置 + 敏感品种标签 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 产业链位置 */}
        {portrait.position && (
          <Badge
            variant="outline"
            className={cn(
              'text-[11px] px-2.5 py-0.5 gap-1',
              POSITION_COLORS[portrait.position] || 'bg-slate-50 text-slate-600'
            )}
          >
            <TrendingUp className="w-3 h-3" />
            {POSITION_LABELS[portrait.position] || portrait.position}
            {portrait.position_detail && ` · ${portrait.position_detail}`}
          </Badge>
        )}

        {/* 敏感品种标签 */}
        {portrait.materials.slice(0, 6).map((m) => (
          <Badge
            key={m.material_name}
            variant="secondary"
            className="text-[11px] bg-amber-50 text-amber-700 border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors gap-1"
            onClick={() => handleTagClick(m.material_name)}
            title={`点击查看「${m.material_name}」相关新闻`}
          >
            <Newspaper className="w-3 h-3" />
            {m.material_name}
            {m.cost_pct != null && (
              <span className="text-[10px] text-amber-500 ml-0.5">{m.cost_pct}%</span>
            )}
          </Badge>
        ))}
        {portrait.materials.length > 6 && (
          <Badge variant="secondary" className="text-[11px] bg-slate-50 text-slate-500 border-0">
            +{portrait.materials.length - 6} 更多
          </Badge>
        )}
        {portrait.materials.length === 0 && (
          <span className="text-xs text-slate-400">暂无敏感品种数据</span>
        )}
      </div>

      {/* 画像更新时间 */}
      {company.portrait_updated_at && (
        <p className="text-[11px] text-slate-400 mt-2">
          画像更新于 {new Date(company.portrait_updated_at).toLocaleDateString('zh-CN')}
        </p>
      )}
    </Card>
  )
}
