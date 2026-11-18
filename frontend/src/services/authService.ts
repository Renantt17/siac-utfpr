import api from './api'

interface LoginCredentials {
  email: string
  password: string
}

interface AuthTokens {
  access: string
  refresh: string
}

const authService = {
  async login(credentials: LoginCredentials): Promise<void> {
    const response = await api.post<AuthTokens>(
      '/token/',
      credentials,
    )

    localStorage.setItem('access', response.data.access)
    localStorage.setItem('refresh', response.data.refresh)
  },

  async refresh(): Promise<void> {
    const refresh = localStorage.getItem('refresh')

    if (!refresh) {
      throw new Error('Token de atualização não encontrado.')
    }

    const response = await api.post<{ access: string }>(
      '/token/refresh/',
      { refresh },
    )

    localStorage.setItem('access', response.data.access)
  },

  logout(): void {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
  },
}

export default authService