
import api from './api'

export type UserRole =
  | 'STUDENT'
  | 'PROFESSOR'
  | 'SIAC_COORDINATOR'

export interface AuthenticatedUser {
  id: number | string
  email: string
  full_name: string
  campus: string | null
  roles: UserRole[]
}

/**
 * Serviço responsável por consultar os dados
 * do usuário autenticado no backend do SIAC.
 */
const userService = {
  async getCurrentUser(): Promise<AuthenticatedUser> {
    const response = await api.get<AuthenticatedUser>('/me/')
    return response.data
  },
}

export default userService
