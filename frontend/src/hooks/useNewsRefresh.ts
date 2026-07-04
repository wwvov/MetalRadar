import { useState, useCallback, useRef, useEffect } from 'react'
import { newsService } from '@/services/newsService'

interface RefreshState {
  running: boolean
  message: string
  result: any
}

const POLL_INTERVAL = 2000 // 2 seconds

export function useNewsRefresh(onComplete?: () => void) {
  const [state, setState] = useState<RefreshState>({
    running: false,
    message: '',
    result: null,
  })
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const startRefresh = useCallback(async () => {
    // 防止重复启动
    stopPolling()
    setState({ running: true, message: '正在启动刷新任务...', result: null })

    try {
      // Step 1: Start refresh pipeline
      const { ok, message } = await newsService.refreshNews()
      if (!ok) {
        setState({ running: false, message: `启动失败: ${message}`, result: null })
        return
      }

      setState({ running: true, message: '正在从数据源获取新闻...', result: null })

      // Step 2: Poll status until done
      pollTimer.current = setInterval(async () => {
        try {
          const status = await newsService.getRefreshStatus()
          setState({
            running: status.running,
            message: status.message,
            result: status.result,
          })

          if (!status.running) {
            stopPolling()
            onCompleteRef.current?.()
          }
        } catch {
          // ignore polling errors
        }
      }, POLL_INTERVAL)
    } catch (err: any) {
      setState({
        running: false,
        message: `请求失败: ${err?.message || '网络错误'}`,
        result: null,
      })
    }
  }, [stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    ...state,
    startRefresh,
    isRefreshing: state.running,
  }
}
