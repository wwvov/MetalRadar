import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agentService } from '@/services/agentService'
import type {
  ChatMessageItem, ChatRequest,
  RiskReport,
} from '@/types/agent'

let _msgId = 0
function nextId() { return `msg-${Date.now()}-${++_msgId}` }

// ─── Chat Hook ─────────────────────────────────────────────────

export function useAgent(companyId?: string, companyIds?: string[], sessionId?: string, model?: string) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const qc = useQueryClient()

  const sendMessage = useCallback(async (message: string, scenario?: ChatRequest['scenario']) => {
    const userMsg: ChatMessageItem = { id: nextId(), role: 'user', content: message, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setIsProcessing(true)

    try {
      const resp = await agentService.chat({
        company_id: companyId, company_ids: companyIds,
        message, scenario, session_id: sessionId, model,
        history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
      })
      const bot: ChatMessageItem = {
        id: nextId(), role: 'assistant', content: resp.reply,
        charts: resp.charts, riskScore: resp.risk_score,
        riskLevel: resp.risk_level, sources: resp.sources,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, bot])
      qc.invalidateQueries({ queryKey: ['sessions'] })
      return bot
    } catch (err: any) {
      const errMsg: ChatMessageItem = { id: nextId(), role: 'assistant',
        content: `抱歉，服务不可用：${err?.message || '未知错误'}`, timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, errMsg])
      return errMsg
    } finally {
      setIsProcessing(false)
    }
  }, [companyId, companyIds, sessionId, model, messages, qc])

  const clearChat = useCallback(() => setMessages([]), [])

  return { messages, setMessages, isProcessing, sendMessage, clearChat }
}

// ─── Sessions Hook ─────────────────────────────────────────────

export function useSessions() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await agentService.listSessions()).sessions,
  })

  const createMut = useMutation({
    mutationFn: (title: string) => agentService.createSession(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => agentService.deleteSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const renameMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => agentService.renameSession(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return { sessions: query.data || [], sessionsLoading: query.isLoading, createMut, deleteMut, renameMut }
}

export function useSessionDetail(sessionId?: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => agentService.getSession(sessionId!),
    enabled: !!sessionId,
  })
}

// ─── Models Hook ───────────────────────────────────────────────

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => (await agentService.getModels()).models,
    staleTime: Infinity,
  })
}

// ─── Report Hook ───────────────────────────────────────────────

export function useReport(onError?: (err: Error) => void) {
  const [report, setReport] = useState<RiskReport | null>(null)
  const genMut = useMutation({
    mutationFn: ({ companyIds, material, conversation_context, materialNames }: { companyIds?: string[]; material?: string; conversation_context?: string; materialNames?: string[] }) =>
      agentService.generateReport(companyIds, material, conversation_context, materialNames),
    onSuccess: setReport,
    onError: (err) => onError?.(err as Error),
  })
  return { report, generateReport: genMut.mutate, isGenerating: genMut.isPending, setReport, reportError: genMut.error }
}

export function useMultiReport() {
  const mut = useMutation({
    mutationFn: ({ companyId, materials }: { companyId: string; materials: string[] }) =>
      agentService.generateMultiReport(companyId, materials),
  })
  return { multiReport: mut.data, generateMulti: mut.mutate, isGenerating: mut.isPending }
}

// ─── Dashboard Hook ────────────────────────────────────────────

export function useDashboard(companyId?: string, companyIds?: string[], tab = 'company', message?: string, materials?: string[]) {
  return useQuery({
    queryKey: ['dashboard', companyId, companyIds, tab, message, materials],
    queryFn: () => agentService.getDashboard(companyId, companyIds, tab, message, materials),
    enabled: !!companyId || (companyIds && companyIds.length > 0) || tab === 'sentiment' || tab === 'metal',
    staleTime: 30_000,
  })
}

export function useRecommended(companyId?: string, companyIds?: string[], message?: string) {
  return useQuery({
    queryKey: ['recommended', companyId, companyIds, message],
    queryFn: () => agentService.getRecommended(companyId, companyIds, message),
    staleTime: 60_000,
  })
}
