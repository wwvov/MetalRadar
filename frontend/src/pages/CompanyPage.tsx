import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWatchlist } from '@/providers'
import { useFollows } from '@/hooks/useFollows'
import { useCompanyDetail } from '@/hooks/useCompany'
import {
  useStockKline,
  useCompanyFinancials,
  useCostPressure,
  useDivergence,
} from '@/hooks/useStock'
import { useFuturesDashboard } from '@/hooks/useFutures'
import { CompanyHeader } from '@/components/company/CompanyHeader'
import { StockKlineChart } from '@/components/company/StockKlineChart'
import { FuturesMiniChart } from '@/components/company/FuturesMiniChart'
import { DivergenceCard } from '@/components/company/DivergenceCard'
import { FinancialMetrics } from '@/components/company/FinancialMetrics'
import { CostPressureDashboard } from '@/components/company/CostPressureDashboard'
import { SankeyChart } from '@/components/company/SankeyChart'
import { ReportUpload } from '@/components/company/ReportUpload'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Plus, Building2 } from 'lucide-react'

type KlineFrequency = 'daily' | 'weekly' | 'monthly'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { follows } = useWatchlist()
  const { followsQuery } = useFollows()

  const [selectedId, setSelectedId] = useState<string | null>(id || null)
  const [klineFrequency, setKlineFrequency] = useState<KlineFrequency>('daily')

  // 当URL参数变化时同步
  useEffect(() => {
    if (id) setSelectedId(id)
  }, [id])

  // 当关注列表加载完毕且无选中公司时，默认选第一个
  useEffect(() => {
    if (!selectedId && follows.length > 0) {
      const firstId = follows[0].id
      setSelectedId(firstId)
      navigate(`/company/${firstId}`, { replace: true })
    }
  }, [follows, selectedId, navigate])

  const handleSwitchCompany = (companyId: string) => {
    setSelectedId(companyId)
    navigate(`/company/${companyId}`, { replace: true })
  }

  // --- 数据查询（仅当有选中公司时启用）---
  const companyQuery = useCompanyDetail(selectedId || undefined)
  const stockKlineQuery = useStockKline(selectedId || undefined, klineFrequency)
  const financialsQuery = useCompanyFinancials(selectedId || undefined)
  const costPressureQuery = useCostPressure(selectedId || undefined)
  const divergenceQuery = useDivergence(selectedId || undefined)
  const futuresQuery = useFuturesDashboard(selectedId || null)

  const company = companyQuery.data
  const isLoading = companyQuery.isLoading
  const isError = companyQuery.isError

  // --- 无关注公司状态 ---
  if (!followsQuery.isLoading && follows.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-slate-900 mb-5">公司详情</h1>
        <Card className="p-10 text-center border-dashed bg-slate-50/50">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            还没有关注任何公司
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            请先在「我的关注」页面添加公司，AI将自动分析其产业链画像
          </p>
          <a
            href="/watchlist"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            前往添加公司
          </a>
        </Card>
      </div>
    )
  }

  // --- 加载状态 ---
  if (isLoading || followsQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-[420px] w-full rounded-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    )
  }

  // --- 错误状态 ---
  if (isError || !company) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-slate-900 mb-5">公司详情</h1>
        <ErrorCard
          onRetry={() => {
            companyQuery.refetch()
          }}
        />
      </div>
    )
  }

  // --- 正常渲染 ---
  const materialNames = company.portrait?.materials?.map((m) => m.material_name) || []
  const hasFinancialReport = !!(
    company.financial_summary && company.financial_summary.report_period
  )

  return (
    <div className="p-6 space-y-6">
      {/* ===== 头部信息栏 ===== */}
      <CompanyHeader
        company={company}
        follows={follows}
        onSwitchCompany={handleSwitchCompany}
      />

      {/* ===== 分区一：市值走势 ===== */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
          市值走势
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：股票K线图 */}
          <div className="lg:col-span-2">
            <StockKlineChart
              data={stockKlineQuery.data || []}
              companyName={company.short_name || company.name}
              isLoading={stockKlineQuery.isLoading}
              isError={stockKlineQuery.isError}
              onRetry={() => stockKlineQuery.refetch()}
              frequency={klineFrequency}
              onFrequencyChange={setKlineFrequency}
            />
          </div>

          {/* 右侧：期货走势缩略图 */}
          <div className="lg:col-span-1">
            <FuturesMiniChart
              materials={futuresQuery.data?.data?.materials || []}
              isLoading={futuresQuery.isLoading}
            />
          </div>
        </div>

        {/* 背离分析卡片 */}
        <DivergenceCard
          data={divergenceQuery.data}
          isLoading={divergenceQuery.isLoading}
          isError={divergenceQuery.isError}
          onRetry={() => divergenceQuery.refetch()}
        />
      </div>

      {/* ===== 分区二：财务数据 ===== */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-blue-500 rounded-full" />
          财务数据
        </h2>

        {/* 核心财务指标 */}
        <FinancialMetrics
          data={financialsQuery.data}
          isLoading={financialsQuery.isLoading}
          isError={financialsQuery.isError}
          onRetry={() => financialsQuery.refetch()}
        />

        {/* 财报上传区域 */}
        <ReportUpload
          companyId={company.id}
          hasExistingReport={hasFinancialReport}
          existingReportTime={company.portrait_updated_at}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 材料成本压力仪表 */}
          <CostPressureDashboard
            data={costPressureQuery.data as any}
            isLoading={costPressureQuery.isLoading}
            isError={costPressureQuery.isError}
            onRetry={() => costPressureQuery.refetch()}
            hasFinancialReport={hasFinancialReport}
          />

          {/* 营业成本结构桑基图 */}
          <SankeyChart
            financialData={financialsQuery.data}
            materialNames={materialNames}
            isLoading={financialsQuery.isLoading}
          />
        </div>
      </div>
    </div>
  )
}
