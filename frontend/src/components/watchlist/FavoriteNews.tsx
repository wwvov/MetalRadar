import { useState, useMemo, useCallback } from 'react'
import { useNews } from '@/hooks/useNews'
import { newsService } from '@/services/newsService'
import { NewsCard } from '@/components/news/NewsCard'
import { NewsSkeleton } from '@/components/news/NewsSkeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWatchlist } from '@/providers'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function FavoriteNews() {
  const queryClient = useQueryClient()
  const { follows } = useWatchlist()
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useNews('all')

  const handleFavorite = useCallback(
    async (newsId: string, _linkedCompanyId?: string | null) => {
      try {
        await newsService.favoriteNews(newsId)
        queryClient.invalidateQueries({ queryKey: ['news'] })
      } catch {}
    },
    [queryClient]
  )

  const handleMarkRead = useCallback(async (newsId: string) => {
    try {
      await newsService.markAsRead(newsId)
    } catch {}
  }, [])

  // 过滤已收藏新闻
  const favoritedNews = useMemo(() => {
    let news = data?.news.filter((n) => n.is_favorited) || []
    if (companyFilter) {
      news = news.filter((n) => (n.company_entities || []).includes(companyFilter))
    }
    return news
  }, [data, companyFilter])

  // 提取已收藏新闻中涉及的公司（用于筛选）
  const availableCompanies = useMemo(() => {
    const companies = new Map<string, { name: string; count: number }>()
    favoritedNews.forEach((n) => {
      (n.company_entities || []).forEach((code) => {
        const prev = companies.get(code)
        companies.set(code, {
          name: follows.find((f) => f.id === code)?.name || code,
          count: (prev?.count || 0) + 1,
        })
      })
    })
    return Array.from(companies.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [favoritedNews, follows])

  if (isLoading) return <NewsSkeleton />
  if (isError) return <ErrorCard onRetry={() => refetch()} />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900">
          已收藏新闻
          {favoritedNews.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({favoritedNews.length})
            </span>
          )}
        </h3>
      </div>

      {/* 按公司筛选 */}
      {availableCompanies.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="text-[11px] text-slate-400 shrink-0">筛选:</span>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 text-[11px] px-2 rounded-full',
              !companyFilter
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            )}
            onClick={() => setCompanyFilter(null)}
          >
            全部
          </Button>
          {availableCompanies.map(([code, { name, count }]) => (
            <Button
              key={code}
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 text-[11px] px-2 rounded-full',
                companyFilter === code
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              )}
              onClick={() => setCompanyFilter(companyFilter === code ? null : code)}
            >
              {name.length > 6 ? name.slice(0, 6) + '…' : name} ({count})
            </Button>
          ))}
          {companyFilter && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-slate-400 hover:text-slate-600"
              onClick={() => setCompanyFilter(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {favoritedNews.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {companyFilter
            ? '该筛选条件下暂无收藏新闻'
            : '还没有收藏任何新闻，去首页点击星标收藏吧'}
        </p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {favoritedNews.map((item) => (
            <NewsCard
              key={item.id}
              news={item}
              onFavorite={handleFavorite}
              onMarkRead={handleMarkRead}
              onTagClick={() => {}}
              followedCompanyNames={new Map(follows.map((c) => [c.id, c.name]))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
