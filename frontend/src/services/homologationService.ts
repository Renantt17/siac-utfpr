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
  course: string
  student: string
  total_approved_points: string
  required_min_total_points: string
  student_confirmed_at: string | null
  homologated_by_name: string
  homologated_at: string
  portal_sync_status: string
  report_url: string
}

export interface SemesterExtractItem {
  public_id: string
  group_number: number
  code: string
  description: string
  approved_points: string
  status: string
}

export interface HomologationSummary {
  enrollment_id: number
  enrollment_status: string
  course: string
  course_code: string
  total_approved_points: string
  required_min_total_points: string
  minimum_reached: boolean
  eligible_for_homologation: boolean
  progress_percentage: string
  approved_submissions: number
  pending_submissions: number
  correction_submissions: number
  rejected_submissions: number
  groups: ActivityGroupSummary[]
  semester_extract: { semester: string; items: SemesterExtractItem[] }[]
  homologation?: HomologationRecord | null
}

export interface HomologationCandidate {
  enrollment_id: number
  enrollment_status: string
  student_name: string
  student_institutional_id: string
  course_id: number
  course_name: string
  course_code: string
  can_finalize: boolean
  eligible_for_homologation: boolean
  total_approved_points: string
  required_min_total_points: string
  pending_submissions: number
  correction_submissions: number
  groups: ActivityGroupSummary[]
  homologation?: HomologationRecord | null
}

const homologationService = {
  async getSummary(): Promise<HomologationSummary[]> {
    const response = await api.get<HomologationSummary[]>('/homologation/summary/')
    return response.data
  },

  async listCandidates(): Promise<HomologationCandidate[]> {
    const response = await api.get<HomologationCandidate[]>('/homologation/candidates/')
    return response.data
  },

  async finalize(enrollmentId: number): Promise<HomologationRecord> {
    const response = await api.post<HomologationRecord>(`/homologation/${enrollmentId}/finalize/`)
    return response.data
  },

  async confirm(publicId: string): Promise<HomologationRecord> {
    const response = await api.post<HomologationRecord>(
      `/homologation/${encodeURIComponent(publicId)}/confirm/`
    )
    return response.data
  },

  async downloadReport(publicId: string): Promise<void> {
    const response = await api.get<Blob>(`/homologation/${encodeURIComponent(publicId)}/report/`, {
      responseType: 'blob',
    })
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
