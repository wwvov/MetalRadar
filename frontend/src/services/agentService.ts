import api from './api'
import type {
  ChatRequest, ChatResponse,
  RiskReport, PressureTestScenario, ScenarioInput,
  AgentCompanyContext,
} from '@/types/agent'

export const agentService = {
  /** 发送对话消息 */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { data } = await api.post<ChatResponse>('/chat', request)
    return data
  },

  /** 生成风险分析报告 */
  async generateReport(companyId: string, material?: string): Promise<RiskReport> {
    const { data } = await api.post<RiskReport>('/chat/report', {
      company_id: companyId,
      material,
    })
    return data
  },

  /** 运行压力测试 */
  async runPressureTest(
    companyId: string,
    scenarios: ScenarioInput[]
  ): Promise<PressureTestScenario[]> {
    const { data } = await api.post<PressureTestScenario[]>('/chat/pressure-test', {
      company_id: companyId,
      scenarios,
    })
    return data
  },

  /** 获取公司Agent分析上下文 */
  async getCompanyContext(companyId: string): Promise<AgentCompanyContext> {
    const { data } = await api.get<AgentCompanyContext>(`/chat/context/${companyId}`)
    return data
  },
}
