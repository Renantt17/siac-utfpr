import api from './api'
import type { UserRole } from './userService'

export interface AdminUser {
  id: number
  public_id: string
  institutional_id: string
  email: string
  full_name: string
  primary_role: UserRole
  campus_id: number
  campus_name: string
  campus_acronym: string
  is_active: boolean
  roles: UserRole[]
}

export interface AuditLogEntry {
  id: number
  entity_type: string
  entity_id: number
  action: string
  actor_id: number | null
  actor_name: string | null
  actor_institutional_id: string | null
  ip_address: string | null
  previous_status: string | null
  new_status: string | null
  before_snapshot: Record<string, unknown> | null
  after_snapshot: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export const adminService = {
  async listUsers(params?: { role?: string; q?: string }): Promise<AdminUser[]> {
    const { data } = await api.get<AdminUser[]>('/users/', { params })
    return data
  },

  async grantRole(publicId: string, role: UserRole): Promise<{ roles: UserRole[] }> {
    const { data } = await api.post<{ roles: UserRole[] }>(
      `/users/${encodeURIComponent(publicId)}/roles/`,
      { role }
    )
    return data
  },

  async revokeRole(publicId: string, role: UserRole): Promise<{ roles: UserRole[] }> {
    const { data } = await api.delete<{ roles: UserRole[] }>(
      `/users/${encodeURIComponent(publicId)}/roles/`,
      { params: { role } }
    )
    return data
  },

  async listAuditLogs(entityType?: string): Promise<AuditLogEntry[]> {
    const { data } = await api.get<AuditLogEntry[]>('/audit/logs/', {
      params: entityType ? { entity_type: entityType } : undefined,
    })
    return data
  },
}
