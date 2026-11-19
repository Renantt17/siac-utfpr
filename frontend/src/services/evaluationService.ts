
import api from './api'

export interface PendingSubmission {
  public_id: string
  student: string
  course: string
  activity: string
  activity_code: string
  description: string
  semester: string
  declared_quantity: number
  activity_start_date: string
  activity_end_date: string
  file_path: string
  created_at: string
  status: string
}

export type EvaluationDecision = 'APPROVED' | 'REJECTED'

export interface EvaluateSubmissionData {
  decision: EvaluationDecision
  validated_quantity: number
  feedback: string
}

export interface EvaluationResult {
  message: string
  public_id: string
  status: string
  validated_quantity: number
  approved_points: string
  evaluator: string
  feedback: string
}

const evaluationService = {
  async listPending(): Promise<PendingSubmission[]> {
    const response = await api.get<PendingSubmission[]>(
      '/submissions/pending/'
    )

    return response.data
  },

  async evaluate(
    publicId: string,
    data: EvaluateSubmissionData
  ): Promise<EvaluationResult> {
    const response = await api.post<EvaluationResult>(
      `/submissions/${publicId}/evaluate/`,
      data
    )

    return response.data
  },
}

export default evaluationService
