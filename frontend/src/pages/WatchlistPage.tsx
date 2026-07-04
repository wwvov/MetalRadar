import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWatchlist } from '@/providers'
import { useFollows } from '@/hooks/useFollows'
import { useCompanyDetail, useCompanyDetails } from '@/hooks/useCompany'
import { CompanyCard } from '@/components/watchlist/CompanyCard'
import { CompanyPortrait } from '@/components/watchlist/CompanyPortrait'
import { AddCompanyDrawer } from '@/components/watchlist/AddCompanyDrawer'
import { FavoriteNews } from '@/components/watchlist/FavoriteNews'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus } from 'lucide-react'
import type { CompanyBasic } from '@/types/company'

/** 轻量级组件：只为选中公司加载画像 */
function PortraitLoader({
  company,
  onDelete,
}: {
  company: CompanyBasic
  onDelete: (companyId: string) => void
}) {
  const { data, isLoading, isError, refetch } = useCompanyDetail(company.id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <ErrorCard onRetry={() => refetch()} />
  }

  return (
    <CompanyPortrait
      company={company}
      onDelete={() => onDelete(company.id)}
    />
  )
}

export default function WatchlistPage() {
  const [selectedCompany, setSelectedCompany] = useState<CompanyBasic | null>(null)
  const { follows } = useWatchlist()
  const { followsQuery, unfollowMutation } = useFollows()

  const { isLoading, isError, refetch } = followsQuery

  // 批量获取所有关注公司的画像 — 触发后端自动修复无效画像
  const followsIds = follows.map((c) => c.id)
  const { data: portraitMap } = useCompanyDetails(followsIds)

  const handleRemove = async (companyId: string) => {
    await unfollowMutation.mutateAsync(companyId)
    if (selectedCompany?.id === companyId) {
      setSelectedCompany(null)
    }
  }

  /** 将 CompanyDetail 转为 CompanyCard 需要的 portraitInfo */
  const getPortraitInfo = (companyId: string) => {
    const detail = portraitMap?.get(companyId)
    if (!detail) return undefined
    return {
      position: detail.portrait.position,
      position_detail: detail.portrait.position_detail,
      materials: detail.portrait.materials,
      updatedAt: detail.portrait_updated_at,
    }
  }

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">我的关注</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            管理关注公司，查看AI生成的产业链画像
          </p>
        </div>
        <AddCompanyDrawer />
      </div>

      {/* 关注公司卡片列表 */}
      {isLoading ? (
        <div className="flex gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-44 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorCard onRetry={() => refetch()} />
      ) : follows.length === 0 ? (
        <Card className="p-10 text-center mb-6 border-dashed bg-slate-50/50">
          <div className="max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Plus className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              还没有关注任何公司
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              点击「新增关注」搜索A股上市公司，AI将自动分析其产业链画像和原材料依赖关系
            </p>
            <AddCompanyDrawer />
          </div>
        </Card>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-3 mb-6">
            {follows.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                selected={selectedCompany?.id === company.id}
                onSelect={setSelectedCompany}
                onRemove={handleRemove}
                portraitInfo={getPortraitInfo(company.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 选中公司的完整画像 */}
      {selectedCompany && (
        <div className="mb-6">
          <PortraitLoader company={selectedCompany} onDelete={handleRemove} />
        </div>
      )}

      {/* 无选中时的引导 */}
      {!selectedCompany && follows.length > 0 && (
        <Card className="p-6 text-center mb-6 bg-slate-50/50 border-dashed">
          <p className="text-sm text-slate-500">
            👆 点击上方公司卡片查看完整AI画像
          </p>
        </Card>
      )}

      <Separator className="my-6" />

      {/* 收藏新闻 */}
      <FavoriteNews />
    </div>
  )
}
