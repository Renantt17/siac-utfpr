
import api from './api'

export interface ActivityGroupSummary {
  group_id: number
  group_number: number
  title: string
  approved_points: string
  required_min_points: string
  minimum_reached: boolean
}

export interface HomologationSummary {
  enrollment_id: number
  course: string
  total_approved_points: string
  required_min_total_points: string
  minimum_reached: boolean
  groups: ActivityGroupSummary[]
}

/**
 * Serviço de consulta da pontuação
 * e dos requisitos de homologação.
 */
const homologationService = {
  async getSummary(): Promise<HomologationSummary[]> {
    const response = await api.get<HomologationSummary[]>(
      '/homologation/summary/'
    )

    return response.data
  },
}

export default homologationService
