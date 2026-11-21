import api from './api'
import type { AuthenticatedUser } from './userService'

interface LoginResponse {
  access: string
  refresh: string
  user: AuthenticatedUser
}

const authService = {
  async login(identifier: string, password: string): Promise<AuthenticatedUser> {
    const response = await api.post<LoginResponse>('/auth/login/', {
      identifier,
      password,
    })
    localStorage.setItem('access', response.data.access)
    localStorage.setItem('refresh', response.data.refresh)
    return response.data.user
  },

  async refresh(): Promise<void> {
    const refresh = localStorage.getItem('refresh')
    if (!refresh) {
      throw new Error('Token de atualização não encontrado.')
    }
    const response = await api.post<{ access: string }>('/auth/refresh/', { refresh })
    localStorage.setItem('access', response.data.access)
  },

  logout(): void {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
  },
}

export default authService
