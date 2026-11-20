import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import api from './api'

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

let refreshPromise: Promise<string> | null = null

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined
    const status = error.response?.status

    if (
      status !== 401 ||
      !original ||
      original._retry ||
      original.url?.includes('/auth/login/') ||
      original.url?.includes('/auth/refresh/')
    ) {
      return Promise.reject(error)
    }

    const refresh = localStorage.getItem('refresh')
    if (!refresh) {
      localStorage.removeItem('access')
      return Promise.reject(error)
    }

    original._retry = true
    try {
      if (!refreshPromise) {
        refreshPromise = api
          .post<{ access: string }>('/auth/refresh/', { refresh })
          .then((res) => {
            localStorage.setItem('access', res.data.access)
            return res.data.access
          })
          .finally(() => {
            refreshPromise = null
          })
      }
      const newToken = await refreshPromise
      original.headers.set('Authorization', `Bearer ${newToken}`)
      return api(original)
    } catch (refreshErr) {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      return Promise.reject(refreshErr)
    }
  }
)

export default api
