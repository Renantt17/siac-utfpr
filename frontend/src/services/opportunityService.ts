import api from './api'

export interface Opportunity {
  public_id: string
  title: string
  description: string
  campus: number
  campus_name: string
  suggested_group_number: number
  suggested_item_code: string
  start_date: string
  end_date: string
  estimated_hours: string
  modality: string
  is_external: boolean
  organizer_name: string
  certification_rules: string
  is_active: boolean
  created_at: string
}
export type OpportunityInput = Pick<Opportunity, 'title' | 'description' | 'campus' | 'suggested_group_number' | 'suggested_item_code' | 'start_date' | 'end_date' | 'estimated_hours' | 'modality' | 'is_external' | 'organizer_name' | 'certification_rules'>
const opportunityService = {
  async list(): Promise<Opportunity[]> {
    const { data } = await api.get<Opportunity[] | { results: Opportunity[] }>('/opportunities/')
    return Array.isArray(data) ? data : data.results
  },
  async create(input: OpportunityInput): Promise<Opportunity> {
    const { data } = await api.post<Opportunity>('/opportunities/', input)
    return data
  },
}
export default opportunityService
