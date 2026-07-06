import { useState, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { agentService } from '@/services/agentService'
import type {
  ChatMessageItem, ChatRequest,
  RiskReport, PressureTestScenario, ScenarioInput,
} from '@/types/agent'

let _msgId = 0
function nextId() {
  return `msg-${Date.now()}-${++_msgId}`
}

export function useAgent(companyId?: string) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // 获取公司上下文
  const contextQuery = useQuery({
    queryKey: ['agent-context', companyId],
    queryFn: () => agentService.getCompanyContext(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  })

  // 发送消息
  const sendMessage = useCallback(async (message: string, scenario?: ChatRequest['scenario']) => {
    const userMsg: ChatMessageItem = {
      id: nextId(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsProcessing(true)

    // 构建历史
    const history = messages.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const response = await agentService.chat({
        company_id: companyId,
        message,
        scenario,
        history,
      })

      const assistantMsg: ChatMessageItem = {
        id: nextId(),
        role: 'assistant',
        content: response.reply,
        charts: response.charts,
        riskScore: response.risk_score,
        riskLevel: response.risk_level,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMsg])
      return assistantMsg
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: nextId(),
        role: 'assistant',
        content: `抱歉，分析服务暂时不可用：${err?.message || '未知错误'}。请稍后重试。`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
      return errorMsg
    } finally {
      setIsProcessing(false)
    }
  }, [companyId, messages])

  // 清空对话
  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isProcessing,
    sendMessage,
    clearChat,
    contextQuery,
    setMessages,
  }
}


export function useReport() {
  const [report, setReport] = useState<RiskReport | null>(null)

  const generateMutation = useMutation({
    mutationFn: ({ companyId, material }: { companyId: string; material?: string }) =>
      agentService.generateReport(companyId, material),
    onSuccess: (data) => {
      setReport(data)
    },
  })

  return {
    report,
    generateReport: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    error: generateMutation.error,
    setReport,
  }
}


export function usePressureTest() {
  const [results, setResults] = useState<PressureTestScenario[] | null>(null)

  const testMutation = useMutation({
    mutationFn: ({ companyId, scenarios }: { companyId: string; scenarios: ScenarioInput[] }) =>
      agentService.runPressureTest(companyId, scenarios),
    onSuccess: (data) => {
      setResults(data)
    },
  })

  return {
    results,
    runTest: testMutation.mutate,
    isRunning: testMutation.isPending,
    setResults,
  }
}
