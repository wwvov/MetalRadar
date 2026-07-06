import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'

interface MarketStatusData {
  spot_market_last_refresh: string | null
  futures_last_refresh: string | null
  trading_hours: boolean
}

interface MarketStatusResponse {
  ok: boolean
  data: MarketStatusData
}

interface ForceRefreshResponse {
  ok: boolean
  data?: {
    spot_refreshed: boolean
    spot_count: number
    futures_count: number
  }
  error?: string
}

export function useMarketStatus() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['market-status'],
    queryFn: async (): Promise<MarketStatusData> => {
      const { data } = await api.get<MarketStatusResponse>('/market/status')
      return data.data
    },
    staleTime: 60 * 1000, // 1分钟缓存
    refetchInterval: 60 * 1000, // 每分钟刷新
  })

  const forceRefresh = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ForceRefreshResponse>('/market/refresh')
      return data
    },
    onSuccess: () => {
      // 刷新成功后立即更新状态
      queryClient.invalidateQueries({ queryKey: ['market-status'] })
      // 同时使股票/期货缓存失效，触发前端重新拉取
      queryClient.invalidateQueries({ queryKey: ['stock-info'] })
      queryClient.invalidateQueries({ queryKey: ['stock-kline'] })
      queryClient.invalidateQueries({ queryKey: ['futures-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['cost-pressure'] })
    },
  })

  return {
    ...statusQuery,
    forceRefresh,
  }
}
