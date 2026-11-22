import api from './api'

export interface Opportunity {
  public_id: string
  title: string
  description: string
  campus: number | null
  campus_name: string
  campus_acronym: string
  suggested_group_number: number | null
  suggested_item_code: string | null
  start_date: string
  end_date: string
  estimated_hours: string | null
  modality: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO'
  is_external: boolean
  organizer_name: string
  certification_rules: string
  is_active: boolean
  created_at: string
}

export type OpportunityInput = {
  title: string
  description: string
  campus: number | null
  suggested_group_number: number | null
  suggested_item_code: string | null
  start_date: string
  end_date: string
  estimated_hours: string | null
  modality: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO'
  is_external: boolean
  organizer_name: string
  certification_rules: string
}

const opportunityService = {
  async list(params?: {
    include_expired?: boolean
    group_number?: string
    modality?: string
  }): Promise<Opportunity[]> {
    const { data } = await api.get<Opportunity[]>('/opportunities/', { params })
    return data
  },

  async create(input: OpportunityInput): Promise<Opportunity> {
    const { data } = await api.post<Opportunity>('/opportunities/', input)
    return data
  },

  async update(publicId: string, input: Partial<OpportunityInput> & { is_active?: boolean }): Promise<Opportunity> {
    const { data } = await api.patch<Opportunity>(
      `/opportunities/${encodeURIComponent(publicId)}/`,
      input
    )
    return data
  },

  async deactivate(publicId: string): Promise<Opportunity> {
    const { data } = await api.delete<Opportunity>(`/opportunities/${encodeURIComponent(publicId)}/`)
    return data
  },
}

export default opportunityService
