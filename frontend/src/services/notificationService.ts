import api from './api'

export interface Notification {
  public_id: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  submission_public_id: string | null
}

const notificationService = {
  async list(): Promise<Notification[]> {
    const { data } = await api.get<Notification[] | { results: Notification[] }>('/notifications/')
    return Array.isArray(data) ? data : data.results
  },
  async markRead(publicId: string): Promise<void> {
    await api.patch(`/notifications/${publicId}/read/`)
  },
}
export default notificationService
