import api from './api'

export interface Submission {
  public_id: string
  enrollment: number
  activity_item: number
  description: string
  activity_start_date: string
  activity_end_date: string
  semester: string
  declared_quantity: number
  status?: string
  approved_points?: string | number | null
  validated_quantity?: number | null
  feedback?: string | null
  file_url?: string | null
}

export interface CreateSubmissionData {
  enrollment: number
  activity_item: number
  description: string
  activity_start_date: string
  activity_end_date: string
  semester: string
  declared_quantity: number
  file: File
}

export async function openSubmissionFile(publicId: string): Promise<void> {
  const response = await api.get<Blob>(
    `/submissions/${encodeURIComponent(publicId)}/file/`,
    { responseType: 'blob' },
  )
  const contentType = response.headers['content-type'] || 'application/octet-stream'
  const blob = new Blob([response.data], { type: typeof contentType === 'string' ? contentType : 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

const submissionService = {
  async list(): Promise<Submission[]> {
    const response = await api.get<Submission[]>('/submissions/')
    return response.data
  },

  async create(data: CreateSubmissionData): Promise<Submission> {
    const formData = new FormData()
    formData.append('enrollment', String(data.enrollment))
    formData.append('activity_item', String(data.activity_item))
    formData.append('description', data.description)
    formData.append('activity_start_date', data.activity_start_date)
    formData.append('activity_end_date', data.activity_end_date)
    formData.append('semester', data.semester)
    formData.append('declared_quantity', String(data.declared_quantity))
    formData.append('file', data.file)
    const response = await api.post<Submission>('/submissions/', formData)
    return response.data
  },
}

export default submissionService

