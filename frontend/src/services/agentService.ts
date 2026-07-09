import api from './api'
import type {
  ChatRequest, ChatResponse,
  RiskReport, MultiReport,
  ChatSessionItem, ChatSessionDetail,
  ModelInfo, DashboardData, RecommendedQuestions,
} from '@/types/agent'

export const agentService = {
  chat(request: ChatRequest): Promise<ChatResponse> {
    return api.post<ChatResponse>('/chat', request).then(r => r.data)
  },

  // Sessions
  createSession(title = '新对话', model = 'deepseek-v4-flash'): Promise<ChatSessionItem> {
    return api.post('/chat/sessions', { title, model }).then(r => r.data)
  },
  listSessions(): Promise<{ sessions: ChatSessionItem[] }> {
    return api.get('/chat/sessions').then(r => r.data)
  },
  getSession(id: string): Promise<ChatSessionDetail> {
    return api.get(`/chat/sessions/${id}`).then(r => r.data)
  },
  deleteSession(id: string): Promise<void> {
    return api.delete(`/chat/sessions/${id}`).then(r => r.data)
  },
  deleteMessage(sessionId: string, messageId: number): Promise<void> {
    return api.delete(`/chat/sessions/${sessionId}/messages/${messageId}`).then(r => r.data)
  },
  clearMessages(sessionId: string): Promise<{ ok: boolean; deleted: number }> {
    return api.delete(`/chat/sessions/${sessionId}/messages`).then(r => r.data)
  },
  renameSession(id: string, title: string): Promise<ChatSessionItem> {
    return api.patch(`/chat/sessions/${id}`, { title }).then(r => r.data)
  },

  // Models
  getModels(): Promise<{ models: ModelInfo[] }> {
    return api.get('/chat/models').then(r => r.data)
  },

  // Reports
  generateReport(companyIds?: string[], material?: string, conversation_context?: string, materialNames?: string[]): Promise<RiskReport> {
    return api.post<RiskReport>('/chat/report', { company_ids: companyIds, material, conversation_context, material_names: materialNames }).then(r => r.data)
  },
  generateMultiReport(companyId: string, materials: string[]): Promise<MultiReport> {
    return api.post<MultiReport>('/chat/report/multi', { company_id: companyId, materials }).then(r => r.data)
  },
  shareReport(reportData: unknown): Promise<{ share_id: string; url: string }> {
    return api.post('/chat/report/share', { report_data: reportData }).then(r => r.data)
  },

  generatePDF(companyId: string, material?: string): Promise<Blob> {
    return api.post('/chat/report/pdf', { company_id: companyId, material }, {
      responseType: 'blob',
      headers: { Accept: 'application/pdf' },
    }).then(r => r.data)
  },

  // Companies
  getAllMetalCompanies(): Promise<{ ok: boolean; data: { id: string; name: string; code: string; industry: string }[] }> {
    return api.get('/companies/with-materials').then(r => r.data)
  },
  getDashboard(companyId?: string, companyIds?: string[], tab = 'company', message?: string, materials?: string[]): Promise<DashboardData> {
    const params: Record<string, unknown> = { tab, message }
    if (companyId) params.company_id = companyId
    if (companyIds && companyIds.length > 0) params.company_ids = companyIds.join(',')
    if (materials && materials.length > 0) params.materials = materials.join(',')
    return api.get('/chat/dashboard', { params }).then(r => r.data)
  },
  getRecommended(companyId?: string, companyIds?: string[], message?: string): Promise<RecommendedQuestions> {
    const params: Record<string, unknown> = { message }
    if (companyId) params.company_id = companyId
    if (companyIds && companyIds.length > 0) params.company_ids = companyIds.join(',')
    return api.get('/chat/recommended', { params }).then(r => r.data)
  },
}
