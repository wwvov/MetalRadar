import api from './api'
import type { CompanySearchResult, CompanyDetail, PortraitUpdatePayload } from '@/types/company'

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

  initCompany: async (companyCode: string, reportPdf?: File, companyName?: string): Promise<CompanyDetail> => {
    const formData = new FormData()
    formData.append('company_code', companyCode)
    if (companyName) {
      formData.append('company_name', companyName)
    }
    if (reportPdf) {
      formData.append('report_pdf', reportPdf)
    }
    const { data } = await api.post<CompanyDetail>('/companies/init', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  updatePortrait: async (companyId: string, payload: PortraitUpdatePayload): Promise<CompanyDetail> => {
    const { data } = await api.put<CompanyDetail>(`/companies/${companyId}/portrait`, payload)
    return data
  },

  uploadReport: async (companyId: string, reportPdf: File): Promise<CompanyDetail> => {
    const formData = new FormData()
    formData.append('report_pdf', reportPdf)
    const { data } = await api.post<CompanyDetail>(`/companies/${companyId}/upload-report`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  regeneratePortrait: async (companyId: string, reportPdf?: File): Promise<CompanyDetail> => {
    const formData = new FormData()
    if (reportPdf) {
      formData.append('report_pdf', reportPdf)
    }
    const { data } = await api.post<CompanyDetail>(`/companies/${companyId}/regenerate`, formData, {
      headers: reportPdf ? { 'Content-Type': 'multipart/form-data' } : {},
    })
    return data
  },
}
