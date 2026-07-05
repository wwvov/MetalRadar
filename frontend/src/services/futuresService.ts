import api from './api'
import type { DashboardResponse } from '@/types/futures'

export const futuresService = {
  /** 获取敏感金属价格仪表盘数据 */
  getDashboard: async (companyId: string): Promise<DashboardResponse> => {
    const { data } = await api.get<DashboardResponse>(`/futures/dashboard/${companyId}`)
    return data
  },
}
