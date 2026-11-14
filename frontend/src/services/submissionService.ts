
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

    const response = await api.post<Submission>(
      '/submissions/',
      formData,
      {
        headers: {
          'Content-Type': undefined,
        },
      }
    )

    return response.data
  },
}

export default submissionService
