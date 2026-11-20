import api from './api'
import type { Submission } from './submissionService'

export type EvaluationDecision =
  | 'APPROVED'
  | 'APPROVED_WITH_ADJUSTMENTS'
  | 'CORRECTION_REQUESTED'
  | 'REJECTED'

export interface EvaluateSubmissionData {
  decision: EvaluationDecision
  validated_quantity?: number
  adjusted_activity_item?: number
  adjusted_semester?: string
  feedback: string
  row_version?: number
}

const evaluationService = {
  async listByStatus(statusFilter = 'PENDING'): Promise<Submission[]> {
    const response = await api.get<Submission[]>('/submissions/pending/', {
      params: { status: statusFilter },
    })
    return response.data
  },

  async evaluate(publicId: string, data: EvaluateSubmissionData): Promise<Submission> {
    const response = await api.post<Submission>(
      `/submissions/${encodeURIComponent(publicId)}/evaluate/`,
      data
    )
    return response.data
  },
}

export default evaluationService
