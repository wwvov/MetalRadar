import { useNews } from '@/hooks/useNews'
import { newsService } from '@/services/newsService'
import { NewsCard } from '@/components/news/NewsCard'
import { NewsSkeleton } from '@/components/news/NewsSkeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { useWatchlist } from '@/providers'
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function FavoriteNews() {
  const queryClient = useQueryClient()
  const { follows } = useWatchlist()

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
    try { await newsService.markAsRead(newsId) } catch {}
  }, [])

  const favoritedNews = data?.news.filter((n) => n.is_favorited) || []

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

      {favoritedNews.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          还没有收藏任何新闻，去首页点击星标收藏吧
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
