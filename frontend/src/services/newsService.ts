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

  /** 从 akshare 抓取最新新闻（使用缓存，除非 force=true） */
  fetchNews: async (force = false): Promise<{ ok: boolean; inserted: number; skipped: number; total: number; sources: string[] }> => {
    const { data } = await api.post('/news/fetch', null, { params: { force } })
    return data
  },

  /** 使用 LLM 对未分类新闻进行智能标注 */
  classifyNews: async (limit = 50): Promise<{ ok: boolean; classified: number; batches: number; errors: number }> => {
    const { data } = await api.post('/news/classify', null, { params: { limit } })
    return data
  },

  /** 完整刷新管道（后台异步）：抓取 + LLM 分类 */
  refreshNews: async (): Promise<{ ok: boolean; message: string }> => {
    const { data } = await api.post('/news/refresh')
    return data
  },

  /** 查询刷新任务状态 */
  getRefreshStatus: async (): Promise<{ running: boolean; message: string; result: any }> => {
    const { data } = await api.get('/news/refresh/status')
    return data
  },
}
