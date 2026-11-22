import api from './api'
import type { ActivityGroup, ActivityItem, Enrollment } from './activityCatalogService'

export interface Course {
  id: number
  name: string
  code: string
  campus: number
  campus_name: string
  campus_acronym: string
  coordinator: number
  coordinator_name: string
  prac_professor: number
  prac_professor_name: string
  min_total_points: string
  is_active: boolean
}

export interface StudentOption {
  id: number
  public_id: string
  full_name: string
  email: string
  institutional_id: string
  campus_id: number
  campus_acronym: string
}

export interface EnrollmentSuspension {
  id: number
  enrollment: number
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

export interface CourseAnalytics {
  course_id: number
  course_name: string
  course_code: string
  min_total_points: string
  submissions_summary: Record<string, number>
  students_count: number
  eligible_count: number
  homologated_count: number
  students: {
    enrollment_id: number
    student_name: string
    institutional_id: string
    status: string
    total_approved_points: string
    required_min_total_points: string
    pending_submissions: number
    eligible: boolean
    homologated: boolean
    groups: {
      group_id: number
      group_number: number
      approved_points: string
      required_min_points: string
      minimum_reached: boolean
    }[]
  }[]
}

const courseService = {
  async list(): Promise<Course[]> {
    const { data } = await api.get<Course[]>('/courses/')
    return data
  },

  async create(payload: {
    campus: number
    name: string
    code: string
    coordinator: number
    prac_professor: number
    min_total_points: string
    use_default_table: boolean
  }): Promise<Course> {
    const { data } = await api.post<Course>('/courses/', payload)
    return data
  },

  async updateCourse(courseId: number, payload: Partial<Course>): Promise<Course> {
    const { data } = await api.patch<Course>(`/courses/${courseId}/`, payload)
    return data
  },

  async listStudents(): Promise<StudentOption[]> {
    const { data } = await api.get<StudentOption[]>('/students/')
    return data
  },

  async listCourseEnrollments(courseId: number): Promise<Enrollment[]> {
    const { data } = await api.get<Enrollment[]>(`/courses/${courseId}/enrollments/`)
    return data
  },

  async createEnrollment(payload: {
    student_id: number
    course_id: number
    enrollment_date: string
  }): Promise<Enrollment> {
    const { data } = await api.post<Enrollment>('/enrollments/', payload)
    return data
  },

  async listSuspensions(enrollmentId: number): Promise<EnrollmentSuspension[]> {
    const { data } = await api.get<EnrollmentSuspension[]>(`/enrollments/${enrollmentId}/suspensions/`)
    return data
  },

  async createSuspension(
    enrollmentId: number,
    payload: { start_date: string; end_date: string; reason?: string }
  ): Promise<EnrollmentSuspension> {
    const { data } = await api.post<EnrollmentSuspension>(
      `/enrollments/${enrollmentId}/suspensions/`,
      payload
    )
    return data
  },

  async createGroup(
    courseId: number,
    payload: { group_number: number; title: string; min_points: string }
  ): Promise<ActivityGroup> {
    const { data } = await api.post<ActivityGroup>(`/courses/${courseId}/groups/`, payload)
    return data
  },

  async updateGroup(
    courseId: number,
    groupId: number,
    payload: { group_number?: number; title?: string; min_points?: string; is_active?: boolean }
  ): Promise<ActivityGroup> {
    const { data } = await api.patch<ActivityGroup>(`/courses/${courseId}/groups/${groupId}/`, payload)
    return data
  },

  async deleteGroup(courseId: number, groupId: number): Promise<{ outcome: string }> {
    const { data } = await api.delete<{ outcome: string }>(`/courses/${courseId}/groups/${groupId}/`)
    return data
  },

  async createItem(
    courseId: number,
    groupId: number,
    payload: Record<string, unknown>
  ): Promise<ActivityItem> {
    const { data } = await api.post<ActivityItem>(
      `/courses/${courseId}/groups/${groupId}/items/`,
      payload
    )
    return data
  },

  async updateItem(
    courseId: number,
    itemId: number,
    payload: Record<string, unknown>
  ): Promise<ActivityItem> {
    const { data } = await api.patch<ActivityItem>(`/courses/${courseId}/items/${itemId}/`, payload)
    return data
  },

  async getAnalytics(courseId: number): Promise<CourseAnalytics> {
    const { data } = await api.get<CourseAnalytics>(`/courses/${courseId}/analytics/`)
    return data
  },
}

export default courseService
