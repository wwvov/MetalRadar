import { useQuery, useQueries } from '@tanstack/react-query'
import { companyService } from '@/services/companyService'
import type { CompanyDetail } from '@/types/company'

export function useCompanySearch(keyword: string) {
  return useQuery({
    queryKey: ['company-search', keyword],
    queryFn: () => companyService.searchCompanies(keyword),
    enabled: keyword.length >= 2,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCompanyDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['company-detail', id],
    queryFn: () => companyService.getCompanyDetail(id!),
    enabled: !!id,
  })
}

/** 批量获取所有关注公司的画像 — 触发后端自动修复无效画像 */
export function useCompanyDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['company-detail', id],
      queryFn: () => companyService.getCompanyDetail(id),
      enabled: !!id,
      staleTime: 5 * 60 * 1000, // 5分钟缓存
    })),
    combine: (results) => {
      const data = new Map<string, CompanyDetail>()
      let isLoading = false
      results.forEach((r, i) => {
        if (r.data) data.set(ids[i], r.data)
        if (r.isLoading) isLoading = true
      })
      return { data, isLoading }
    },
  })
}
