import api from './api'
import type { NewsListResponse, NewsTab, NewsFilters } from '@/types/news'

export const newsService = {
  getNews: async (tab: NewsTab, filters?: NewsFilters): Promise<NewsListResponse> => {
    const params: Record<string, string | number | undefined> = {
      tab,
      ...filters,
    }
    const { data } = await api.get<NewsListResponse>('/news', { params })
    return data
  },

  favoriteNews: async (newsId: string, linkedCompanyId?: string | null): Promise<void> => {
    await api.post(`/news/${newsId}/favorite`, {
      linked_company_id: linkedCompanyId ?? null,
    })
  },

  markAsRead: async (newsId: string): Promise<void> => {
    await api.post(`/news/${newsId}/read`)
  },
}
