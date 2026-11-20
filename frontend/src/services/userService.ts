import api from './api'

export type UserRole = 'STUDENT' | 'PROFESSOR' | 'COURSE_COORD' | 'SIAC_COORD'

export interface AuthenticatedUser {
  id: string
  numeric_id: number
  email: string
  full_name: string
  institutional_id: string
  primary_role: UserRole
  campus: string
  campus_id: number
  campus_name: string
  roles: UserRole[]
}

export interface Campus {
  id: number
  name: string
  acronym: string
}

const userService = {
  async getCurrentUser(): Promise<AuthenticatedUser> {
    const response = await api.get<AuthenticatedUser>('/me/')
    return response.data
  },

  async listCampuses(): Promise<Campus[]> {
    const response = await api.get<Campus[]>('/campuses/')
    return response.data
  },
}

export default userService
