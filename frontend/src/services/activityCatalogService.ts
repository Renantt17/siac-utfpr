import api from './api'

export interface Enrollment {
  id: number
  student: number
  student_name: string
  student_institutional_id: string
  course: number
  course_name: string
  course_code: string
  campus_acronym: string
  enrollment_date: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED'
}

export interface ActivityItem {
  id: number
  code: string
  description: string
  group_id: number
  group_number: number
  group_title: string
  course_id: number
  points_per_unit: string | null
  unit_name: string | null
  max_points_semester: string | null
  effective_max_points_semester: string | null
  required_proof_description: string | null
  is_selectable: boolean
  is_active: boolean
  parent_item: number | null
  parent_code: string | null
}

export interface ActivityGroup {
  id: number
  group_number: number
  title: string
  min_points: string
  is_active: boolean
  activities: ActivityItem[]
}

const activityCatalogService = {
  async enrollments(): Promise<Enrollment[]> {
    const response = await api.get<Enrollment[]>('/enrollments/me/')
    return response.data
  },

  async scoringTable(courseId: number, includeInactive = false): Promise<ActivityGroup[]> {
    const response = await api.get<ActivityGroup[]>(`/courses/${courseId}/scoring-table/`, {
      params: includeInactive ? { include_inactive: 'true' } : undefined,
    })
    return response.data
  },
}

export default activityCatalogService
