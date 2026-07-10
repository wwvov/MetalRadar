import { useEffect, useState, useRef } from 'react'
import { WifiOff, Loader2 } from 'lucide-react'
import api from '@/services/api'

type BackendState = 'connecting' | 'warming' | 'connected'

/**
 * 后端冷启动检测 Hook
 *
 * SCF 冷启动可能需要 60-90 秒。此 hook 定期 ping /api/health，
 * 在连接成功前显示友好等待提示，避免用户看到空白页面就以为出错了。
 */
export function useBackendStatus() {
  const [state, setState] = useState<BackendState>('connecting')
  const attemptsRef = useRef(0)
  const maxAttempts = 30 // 最多检测 30 次（约 5 分钟）

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function check() {
      if (cancelled) return

      try {
        await api.get('/health', { timeout: 10000 }) // health check 用短超时
        if (!cancelled) {
          setState('connected')
        }
      } catch {
        if (!cancelled) {
          attemptsRef.current++
          if (attemptsRef.current <= 2) {
            setState('connecting')
          } else {
            setState('warming') // 超过 2 次失败 → 显示冷启动提示
          }

          if (attemptsRef.current < maxAttempts) {
            // 退避策略: 3s → 5s → 10s → 15s → 20s...
            const delay = Math.min(
              3000 + attemptsRef.current * 2000,
              20000
            )
            timer = setTimeout(check, delay)
          }
        }
      }
    }

    // 首次检查延迟 1 秒（给页面渲染时间）
    timer = setTimeout(check, 1000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return { state }
}

/**
 * 后端连接状态横幅
 * 冷启动时在页面顶部显示友好提示
 */
export function BackendStatusBanner() {
  const { state } = useBackendStatus()

  if (state === 'connected') return null

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium
        bg-amber-50 border-b border-amber-200 text-amber-800"
    >
      {state === 'connecting' ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>正在连接服务器...</span>
          <span className="text-amber-600 text-xs ml-auto">首次启动约需 60 秒</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>后端冷启动中，请耐心等待（约 60 秒）...</span>
          <span className="text-amber-600 text-xs ml-auto">数据将在就绪后自动加载</span>
        </>
      )}
    </div>
  )
}
