
import api from './api'

export interface Campus {
  id: number
  name: string
  acronym: string
}

export interface RegisterData {
  full_name: string
  email: string
  institutional_id: string
  campus: number
  password: string
  confirmPassword: string
}

const registerService = {
  async getCampuses(): Promise<Campus[]> {
    const response = await api.get<Campus[]>('/campuses/')
    return response.data
  },

  async register(data: RegisterData): Promise<void> {
    await api.post('/register/', data)
  },
}

export default registerService
