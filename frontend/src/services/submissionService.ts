import api from './api'

export type SubmissionStatus =
  | 'PENDING'
  | 'CORRECTION_REQUESTED'
  | 'APPROVED'
  | 'APPROVED_WITH_ADJUSTMENTS'
  | 'REJECTED'
  | 'CANCELED'

export interface Submission {
  public_id: string
  enrollment: number
  course_id: number
  course: string
  student: string
  student_institutional_id: string
  group_id: number
  group_number: number
  group_title: string
  activity_item: number
  activity_code: string
  activity: string
  description: string
  activity_start_date: string
  activity_end_date: string
  semester: string
  declared_quantity: string
  validated_quantity: string | null
  original_activity_item_id: number
  original_activity_code: string
  original_activity_description: string
  original_semester: string
  original_declared_quantity: string
  applied_points_per_unit: string
  applied_unit_name: string
  applied_max_points_semester: string | null
  calculated_points: string
  approved_points: string | null
  status: SubmissionStatus
  was_adjusted: boolean
  evaluator_name: string | null
  evaluator_feedback: string | null
  row_version: number
  created_at: string
  updated_at: string
  evaluated_at: string | null
  file_url: string
}

export interface CreateSubmissionData {
  enrollment: number
  activity_item: number
  description: string
  activity_start_date: string
  activity_end_date: string
  declared_quantity: number | string
  file: File
}

export interface UpdateSubmissionData {
  activity_item?: number
  description?: string
  activity_start_date?: string
  activity_end_date?: string
  declared_quantity?: number | string
  row_version?: number
  file?: File | null
}

export async function openSubmissionFile(publicId: string): Promise<void> {
  const response = await api.get<Blob>(`/submissions/${encodeURIComponent(publicId)}/file/`, {
    responseType: 'blob',
  })
  const contentType = response.headers['content-type'] || 'application/octet-stream'
  const blob = new Blob([response.data], {
    type: typeof contentType === 'string' ? contentType : 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function buildSubmissionFormData(data: UpdateSubmissionData | CreateSubmissionData): FormData {
  const formData = new FormData()
  if ('enrollment' in data) formData.append('enrollment', String(data.enrollment))
  if (data.activity_item !== undefined) formData.append('activity_item', String(data.activity_item))
  if (data.description !== undefined) formData.append('description', data.description)
  if (data.activity_start_date !== undefined) {
    formData.append('activity_start_date', data.activity_start_date)
  }
  if (data.activity_end_date !== undefined) {
    formData.append('activity_end_date', data.activity_end_date)
  }
  if (data.declared_quantity !== undefined) {
    formData.append('declared_quantity', String(data.declared_quantity))
  }
  if ('row_version' in data && data.row_version !== undefined) {
    formData.append('row_version', String(data.row_version))
  }
  if (data.file) formData.append('file', data.file)
  return formData
}

const submissionService = {
  async list(filters?: { status?: string; group_id?: string; semester?: string }): Promise<Submission[]> {
    const response = await api.get<Submission[]>('/submissions/', { params: filters })
    return response.data
  },

  async create(data: CreateSubmissionData): Promise<Submission> {
    const response = await api.post<Submission>('/submissions/', buildSubmissionFormData(data))
    return response.data
  },

  async updatePending(publicId: string, data: UpdateSubmissionData): Promise<Submission> {
    const response = await api.patch<Submission>(
      `/submissions/${encodeURIComponent(publicId)}/`,
      buildSubmissionFormData(data)
    )
    return response.data
  },

  async resubmit(publicId: string, data: UpdateSubmissionData): Promise<Submission> {
    const response = await api.put<Submission>(
      `/submissions/${encodeURIComponent(publicId)}/resubmit/`,
      buildSubmissionFormData(data)
    )
    return response.data
  },

  async cancel(publicId: string): Promise<Submission> {
    const response = await api.delete<Submission>(`/submissions/${encodeURIComponent(publicId)}/`)
    return response.data
  },
}

export default submissionService
