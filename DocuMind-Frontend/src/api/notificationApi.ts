import { apiRequest } from '@/api/http'

export type NotificationType = 'ready' | 'failed' | 'weekly' | 'security'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  /** the lecture the notification is about (null for the weekly summary and security notices) */
  lectureId: string | null
  read: boolean
  createdAt: string
}

export interface NotificationList {
  notifications: AppNotification[]
  unread: number
}

// GET /api/notifications - newest first, plus the unread count for the badge.
export async function getNotifications(): Promise<NotificationList> {
  const data = await apiRequest<NotificationList & { success: boolean }>('/notifications')
  return { notifications: data.notifications, unread: data.unread }
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/notifications/read-all', { method: 'POST' })
}

export async function deleteNotification(id: string): Promise<void> {
  await apiRequest(`/notifications/${id}`, { method: 'DELETE' })
}

export async function clearNotifications(): Promise<void> {
  await apiRequest('/notifications', { method: 'DELETE' })
}
