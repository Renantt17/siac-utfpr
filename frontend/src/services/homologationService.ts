
import api from './api'

export interface ActivityGroupSummary {
  group_id: number
  group_number: number
  title: string
  approved_points: string
  required_min_points: string
  minimum_reached: boolean
}

export interface HomologationRecord {
  public_id: string
  enrollment: number
  report_url: string
  homologated_at: string
  total_approved_points: string
}

export interface HomologationSummary {
  enrollment_id: number
  course: string
  total_approved_points: string
  required_min_total_points: string
  minimum_reached: boolean
  groups: ActivityGroupSummary[]
  homologation?: HomologationRecord | null
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

  async finalize(enrollmentId: number): Promise<HomologationRecord> {
    const response = await api.post<HomologationRecord>(
      `/homologation/${enrollmentId}/finalize/`
    )
    return response.data
  },

  async downloadReport(publicId: string): Promise<void> {
    const response = await api.get<Blob>(
      `/homologation/${encodeURIComponent(publicId)}/report/`,
      { responseType: 'blob' }
    )
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `homologacao-${publicId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}

export default homologationService
