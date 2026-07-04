import api from './api'
import type { CompanyBasic } from '@/types/company'

export const userService = {
  getFollows: async (): Promise<CompanyBasic[]> => {
    const { data } = await api.get<CompanyBasic[]>('/user/follows')
    return data
  },

  followCompany: async (companyId: string): Promise<void> => {
    await api.post('/user/follows', { company_id: companyId })
  },

  unfollowCompany: async (companyId: string): Promise<void> => {
    await api.delete(`/user/follows/${companyId}`)
  },
}
