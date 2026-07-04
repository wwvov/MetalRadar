import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useWatchlist } from '@/providers'
import { useFollows } from '@/hooks/useFollows'
import { CompanyCard } from '@/components/watchlist/CompanyCard'
import { CompanyPortrait } from '@/components/watchlist/CompanyPortrait'
import { AddCompanyDrawer } from '@/components/watchlist/AddCompanyDrawer'
import { FavoriteNews } from '@/components/watchlist/FavoriteNews'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { CompanyBasic } from '@/types/company'

export default function WatchlistPage() {
  const [selectedCompany, setSelectedCompany] = useState<CompanyBasic | null>(null)
  const { follows } = useWatchlist()
  const { followsQuery, unfollowMutation } = useFollows()

  const { isLoading, isError, refetch } = followsQuery

  const handleRemove = async (companyId: string) => {
    await unfollowMutation.mutateAsync(companyId)
    if (selectedCompany?.id === companyId) {
      setSelectedCompany(null)
    }
  }

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">我的关注</h1>
        <AddCompanyDrawer />
      </div>

      {/* 关注公司卡片列表 */}
      {isLoading ? (
        <div className="flex gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-40 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorCard onRetry={() => refetch()} />
      ) : follows.length === 0 ? (
        <Card className="p-8 text-center mb-6 border-dashed bg-slate-50">
          <p className="text-slate-500 text-sm mb-3">还没有关注任何公司</p>
          <AddCompanyDrawer />
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
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 选中公司的画像 */}
      {selectedCompany && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedCompany.name} 画像
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-red-500"
              onClick={() => handleRemove(selectedCompany.id)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              取消关注
            </Button>
          </div>
          <CompanyPortrait company={selectedCompany} />
        </div>
      )}

      <Separator className="my-6" />

      {/* 收藏新闻 */}
      <FavoriteNews />
    </div>
  )
}
