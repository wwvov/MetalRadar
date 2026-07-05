import { useQuery } from '@tanstack/react-query'
import { futuresService } from '@/services/futuresService'

export function useFuturesDashboard(companyId: string | null) {
  return useQuery({
    queryKey: ['futures-dashboard', companyId],
    queryFn: () => futuresService.getDashboard(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000, // 1分钟缓存
    refetchInterval: 60 * 1000, // 每分钟自动刷新
  })
}
