import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 — 可在此添加用户标识等
api.interceptors.request.use((config) => {
  return config
})

// 响应拦截器 — 统一错误处理
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error(`API Error: ${error.response.status} ${error.response.config?.url}`)
    } else if (error.request) {
      console.error('API Error: No response received')
    }
    return Promise.reject(error)
  }
)

export default api
