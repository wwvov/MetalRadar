import api from './api'
import type { KlineData, StockInfo, ApiResponse } from '@/types/company'

export const stockService = {
  /** 获取A股历史K线数据 */
  getKline: async (
    code: string,
    frequency: 'daily' | 'weekly' | 'monthly' = 'daily',
    startDate?: string,
    endDate?: string,
  ): Promise<KlineData[]> => {
    const { data } = await api.get<ApiResponse<KlineData[]>>(`/stocks/${code}/kline`, {
      params: {
        frequency,
        start_date: startDate || '',
        end_date: endDate || '',
        adjust: 'qfq',
      },
    })
    return data.data
  },

  /** 获取A股公司基本信息 */
  getStockInfo: async (code: string): Promise<StockInfo> => {
    const { data } = await api.get<ApiResponse<StockInfo>>(`/stocks/${code}/info`)
    return data.data
  },
}
