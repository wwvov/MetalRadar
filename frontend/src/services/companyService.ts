import api from './api'
import type { CompanySearchResult, CompanyDetail, PortraitUpdatePayload, FinancialData, CostPressure, DivergenceAnalysis, ChainAnalysis, ApiResponse } from '@/types/company'

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
      timeout: 180000,  // 3分钟 — 公司初始化+画像生成需要较长时间
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
      timeout: 180000,  // 3分钟 — 财报AI提取需要较长时间
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
      timeout: 180000,  // 3分钟 — 画像重新生成需要较长时间
    })
    return data
  },

  /** 获取聚合财务数据 */
  getFinancials: async (companyId: string): Promise<FinancialData> => {
    const { data } = await api.get<ApiResponse<FinancialData>>(`/companies/${companyId}/financials`)
    return data.data
  },

  /** 获取材料成本压力 */
  getCostPressure: async (companyId: string): Promise<CostPressure> => {
    const { data } = await api.get<ApiResponse<CostPressure>>(`/companies/${companyId}/cost-pressure`)
    return data.data
  },

  /** 获取股票vs期货背离分析 */
  getDivergence: async (companyId: string, material?: string): Promise<DivergenceAnalysis> => {
    const { data } = await api.get<ApiResponse<DivergenceAnalysis>>(`/companies/${companyId}/divergence`, {
      params: material ? { material } : {},
    })
    return data.data
  },

  /** 使用LLM分析公司在产业链中的完整位置 */
  analyzeChain: async (companyId: string): Promise<ChainAnalysis> => {
    const { data } = await api.post<{ ok: boolean; data: ChainAnalysis }>(`/companies/${companyId}/analyze-chain`)
    return data.data
  },
}
