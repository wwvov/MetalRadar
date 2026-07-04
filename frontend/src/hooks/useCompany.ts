import { useQuery } from '@tanstack/react-query'
import { companyService } from '@/services/companyService'

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
