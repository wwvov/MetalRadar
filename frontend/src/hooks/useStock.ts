import { useQuery } from '@tanstack/react-query'
import { stockService } from '@/services/stockService'
import { companyService } from '@/services/companyService'

export function useStockKline(
  code: string | undefined,
  frequency: 'daily' | 'weekly' | 'monthly' = 'daily',
) {
  return useQuery({
    queryKey: ['stock-kline', code, frequency],
    queryFn: () => stockService.getKline(code!, frequency),
    enabled: !!code,
    staleTime: 60 * 60 * 1000, // 1小时缓存（日线每天只更新一次）
    refetchInterval: 15 * 60 * 1000, // 每15分钟自动刷新（盘中可能有新交易日数据）
  })
}

export function useStockInfo(code: string | undefined) {
  return useQuery({
    queryKey: ['stock-info', code],
    queryFn: () => stockService.getStockInfo(code!),
    enabled: !!code,
    staleTime: 5 * 60 * 1000, // 5分钟缓存（市值/PE/PB盘中实时变化）
    refetchInterval: 5 * 60 * 1000, // 每5分钟自动刷新
  })
}

export function useCompanyFinancials(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-financials', companyId],
    queryFn: () => companyService.getFinancials(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 60 * 1000, // 1小时缓存
  })
}

export function useCostPressure(companyId: string | undefined) {
  return useQuery({
    queryKey: ['cost-pressure', companyId],
    queryFn: () => companyService.getCostPressure(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5分钟（期货数据对齐）
  })
}

export function useDivergence(companyId: string | undefined, material?: string) {
  return useQuery({
    queryKey: ['divergence', companyId, material],
    queryFn: () => companyService.getDivergence(companyId!, material),
    enabled: !!companyId,
    staleTime: 30 * 60 * 1000, // 30分钟缓存
  })
}
