import api from './api'
import type { CompanySearchResult, CompanyDetail } from '@/types/company'

export const companyService = {
  searchCompanies: async (keyword: string): Promise<CompanySearchResult> => {
    const { data } = await api.get<CompanySearchResult>('/companies/search', {
      params: { keyword },
    })
    return data
  },

  getCompanyDetail: async (id: string): Promise<CompanyDetail> => {
    const { data } = await api.get<CompanyDetail>(`/companies/${id}`)
    return data
  },

  initCompany: async (companyCode: string, reportPdf?: File): Promise<CompanyDetail> => {
    const formData = new FormData()
    formData.append('company_code', companyCode)
    if (reportPdf) {
      formData.append('report_pdf', reportPdf)
    }
    const { data } = await api.post<CompanyDetail>('/companies/init', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
