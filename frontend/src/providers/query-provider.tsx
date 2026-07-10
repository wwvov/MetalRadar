import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

// 指数退避重试延迟（配合 axios 层面的自动重试）
function retryDelay(attemptIndex: number) {
  const base = Math.min(2000 * Math.pow(2, attemptIndex), 15000)
  const jitter = Math.random() * 1000
  return base + jitter
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,     // 2 分钟 — 减少刷新时的 API 调用
            gcTime: 10 * 60 * 1000,        // 10 分钟 — 缓存保留更久
            retry: 3,                       // 最多重试 3 次（配合 2 分钟超时覆盖冷启动）
            retryDelay,                     // 指数退避
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,       // 网络恢复后自动重试
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
