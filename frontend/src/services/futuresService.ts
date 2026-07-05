import api from './api'
import type { DashboardResponse, OverviewResponse, CompanyWithMaterials } from '@/types/futures'

export const futuresService = {
  /** 获取单公司敏感金属价格仪表盘数据 */
  getDashboard: async (companyId: string): Promise<DashboardResponse> => {
    const { data } = await api.get<DashboardResponse>(`/futures/dashboard/${companyId}`)
    return data
  },

  /** 获取跨公司聚合视图 — 所有金属品种 + 受影响公司 */
  getOverview: async (): Promise<OverviewResponse> => {
    const { data } = await api.get<OverviewResponse>('/futures/overview')
    return data
  },

  /** 获取所有有材料数据的公司列表 */
  getCompaniesWithMaterials: async (): Promise<{ ok: boolean; data: CompanyWithMaterials[] }> => {
    const { data } = await api.get<{ ok: boolean; data: CompanyWithMaterials[] }>('/companies/with-materials')
    return data
  },
}
