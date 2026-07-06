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
  createSession(title = '新对话', model = 'glm-5.2'): Promise<ChatSessionItem> {
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
  renameSession(id: string, title: string): Promise<ChatSessionItem> {
    return api.patch(`/chat/sessions/${id}`, { title }).then(r => r.data)
  },

  // Models
  getModels(): Promise<{ models: ModelInfo[] }> {
    return api.get('/chat/models').then(r => r.data)
  },

  // Reports
  generateReport(companyId: string, material?: string): Promise<RiskReport> {
    return api.post<RiskReport>('/chat/report', { company_id: companyId, material }).then(r => r.data)
  },
  generateMultiReport(companyId: string, materials: string[]): Promise<MultiReport> {
    return api.post<MultiReport>('/chat/report/multi', { company_id: companyId, materials }).then(r => r.data)
  },
  shareReport(reportData: unknown): Promise<{ share_id: string; url: string }> {
    return api.post('/chat/report/share', { report_data: reportData }).then(r => r.data)
  },

  // Dashboard
  getDashboard(companyId?: string, tab = 'company'): Promise<DashboardData> {
    return api.get('/chat/dashboard', { params: { company_id: companyId, tab } }).then(r => r.data)
  },
  getRecommended(companyId?: string): Promise<RecommendedQuestions> {
    return api.get('/chat/recommended', { params: { company_id: companyId } }).then(r => r.data)
  },
}
