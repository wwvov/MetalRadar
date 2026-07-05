import { useQuery } from '@tanstack/react-query'
import { futuresService } from '@/services/futuresService'

export function useFuturesDashboard(companyId: string | null) {
  return useQuery({
    queryKey: ['futures-dashboard', companyId],
    queryFn: () => futuresService.getDashboard(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5分钟缓存（对齐后端期货缓存TTL）
    refetchInterval: 5 * 60 * 1000, // 每5分钟自动刷新
  })
}

export function useFuturesOverview() {
  return useQuery({
    queryKey: ['futures-overview'],
    queryFn: () => futuresService.getOverview(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useCompaniesWithMaterials() {
  return useQuery({
    queryKey: ['companies-with-materials'],
    queryFn: () => futuresService.getCompaniesWithMaterials(),
    staleTime: 10 * 60 * 1000, // 公司列表不频繁变化
  })
}
