import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

// ===== 重试配置 =====
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 2000 // 基础延迟 2 秒
const RETRY_DELAY_MAX = 15000 // 最大延迟 15 秒

// 可重试的状态码和错误类型
function isRetryable(error: AxiosError): boolean {
  // 网络错误（无响应）
  if (!error.response) return true
  // 服务端错误
  const status = error.response.status
  return status >= 500 || status === 429
}

async function retryBackoff(retryCount: number): Promise<void> {
  // 指数退避 + 随机抖动: 2s → 4s → 8s (max 15s)
  const delay = Math.min(
    RETRY_DELAY_BASE * Math.pow(2, retryCount) + Math.random() * 1000,
    RETRY_DELAY_MAX
  )
  console.log(`[API] 重试 ${retryCount + 1}/${MAX_RETRIES}，等待 ${(delay / 1000).toFixed(1)}s ...`)
  await new Promise((resolve) => setTimeout(resolve, delay))
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 120000, // 2 分钟超时 — SCF 冷启动可能需要 60-90 秒
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use((config) => {
  return config
})

// 响应拦截器 — 统一错误处理 + 自动重试
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number }
    const retryCount = config._retryCount || 0

    // 判断是否应该重试
    if (retryCount < MAX_RETRIES && isRetryable(error)) {
      config._retryCount = retryCount + 1
      await retryBackoff(retryCount)
      return api.request(config)
    }

    // 不可重试的错误 — 记录日志
    if (error.response) {
      const { status } = error.response
      const { url } = error.response.config || {}
      console.error(`[API] ${status} ${url}`)
      if (status === 502 || status === 503 || status === 504) {
        console.warn('[API] 后端服务可能正在冷启动，请稍候重试...')
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`[API] 请求超时: ${error.config?.url}`)
      console.warn('[API] 后端冷启动中，请耐心等待...')
    } else {
      console.error('[API] 网络错误: 无法连接到服务器')
    }

    return Promise.reject(error)
  }
)

export default api
