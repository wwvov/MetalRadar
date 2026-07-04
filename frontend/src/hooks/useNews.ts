import { useQuery } from '@tanstack/react-query'
import { newsService } from '@/services/newsService'
import type { NewsTab, NewsFilters } from '@/types/news'

export function useNews(tab: NewsTab, filters?: NewsFilters) {
  return useQuery({
    queryKey: ['news', tab, filters],
    queryFn: () => newsService.getNews(tab, filters),
    staleTime: 60 * 1000,
  })
}
