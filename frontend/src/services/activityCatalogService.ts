import api from './api'

export interface Enrollment {
  id: number
  course: number
  course_name: string
  course_code: string
  campus_acronym: string
  status: string
}

export interface ActivityItem {
  id: number
  code: string
  description: string
  points_per_unit: number | string
  unit_name: string
  max_points_semester: number | string | null
  required_proof_description: string | null
  is_selectable: boolean
}

interface ActivityGroup {
  activities?: ActivityItem[]
  items?: ActivityItem[]
  activity_items?: ActivityItem[]
}

function flattenItems(value: unknown): ActivityItem[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenItems)
  }
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  if (typeof item.id === 'number' && typeof item.code === 'string') {
    return [value as ActivityItem]
  }
  const group = value as ActivityGroup
  if (Array.isArray(group.activities)) return flattenItems(group.activities)
  if (Array.isArray(group.items)) return flattenItems(group.items)
  if (Array.isArray(group.activity_items)) return flattenItems(group.activity_items)
  return Object.values(item).flatMap(flattenItems)
}

const activityCatalogService = {
  async enrollments(): Promise<Enrollment[]> {
    const response = await api.get<Enrollment[]>('/enrollments/me/')
    return response.data
  },
  async items(courseId: number): Promise<ActivityItem[]> {
    const response = await api.get<unknown>('/activity-items/', {
      params: { course_id: courseId },
    })
    return flattenItems(response.data).filter((item) => item.is_selectable !== false)
  },
}

export default activityCatalogService
