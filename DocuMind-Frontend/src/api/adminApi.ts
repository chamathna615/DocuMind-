import type { ActivityLog, Role, UserStatus } from '@/types'

async function adminRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  // An error page (proxy, crashed server) is not JSON: that must not hide the real problem.
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || `Unable to complete the request (${response.status}).`)
  }

  return data as T
}

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalUploads: number
  completedJobs: number
  failedJobs: number
  averageTime: string

  uploadsOverTime: Array<{ day: string; value: number }>
  statusDistribution: Array<{ name: string; value: number; color: string }>
  fileTypeDistribution: Array<{ type: string; value: number }>
  quizAttemptTrend: Array<{ day: string; value: number }>

  // AI usage and quiz analytics (estimates, USD)
  usage?: {
    sttMinutes: number
    recordingMinutes: number
    llmInputTokens: number
    llmOutputTokens: number
    estimatedCostUsd: number
  }
  pipeline?: {
    segments: number
    fillersRemoved: number
    repeatsRemoved: number
    overlapWordsRemoved: number
    wordsBefore: number
    wordsAfter: number
    cleaningReductionPercent: number
  }
  costOverTime?: Array<{ day: string; value: number }>
  quizAttempts?: number
  averageQuizPercent?: number | null

  // "Generate code" and "Generate diagram"
  codeRequests?: number
  failedCodeRequests?: number
  diagramRequests?: number
  failedDiagramRequests?: number
  codeOverTime?: Array<{ day: string; value: number }>
  diagramOverTime?: Array<{ day: string; value: number }>
  byFeature?: Record<'lectures' | 'code' | 'diagrams', { requests: number; tokens: number; costUsd: number }>
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  provider: 'local' | 'google'
  uploadCount: number
  codeCount?: number
  diagramCount?: number
  joinedAt: string
  // time of the last sign-in; null when the account has not signed in since this was tracked
  lastActive: string | null
}

export interface AdminUpload {
  id: string
  title: string
  filename: string
  fileType: string
  fileSize: number
  // queued/processing/... as stored by the server
  status: string
  stage: string
  progress: number
  errorMessage: string
  uploadedAt: string
  costUsd: number
  active: boolean
  owner: { id: string; name: string; email: string } | null
}

/** One "Generate code" or "Generate diagram" request, as the admin sees it (never the prompt or the answer). */
export interface AdminGeneration {
  id: string
  title: string
  language: string
  // queued | processing | completed | failed | cancelled
  status: string
  stage: string
  progress: number
  errorMessage: string
  createdAt: string
  processingMs: number
  tokens: number
  costUsd: number
  active: boolean
  owner: { id: string; name: string; email: string } | null
  // code requests
  programmingLanguage?: string
  // diagram requests
  diagramType?: string
  detail?: string
}

export async function getAdminDashboardStats() {
  const data = await adminRequest<{ stats: AdminStats }>('/stats')
  return data.stats
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const data = await adminRequest<{ users: AdminUser[] }>('/users')
  return data.users
}

export async function updateAdminUser(id: string, changes: { status?: UserStatus; role?: Role }): Promise<AdminUser> {
  const data = await adminRequest<{ user: AdminUser }>(`/users/${id}`, { method: 'PATCH', body: changes })
  return data.user
}

export async function deleteAdminUser(id: string): Promise<void> {
  await adminRequest(`/users/${id}`, { method: 'DELETE' })
}

export async function getAdminUploads(): Promise<AdminUpload[]> {
  const data = await adminRequest<{ uploads: AdminUpload[] }>('/uploads')
  return data.uploads
}

export async function cancelAdminUpload(id: string): Promise<void> {
  await adminRequest(`/uploads/${id}/cancel`, { method: 'POST' })
}

export async function deleteAdminUpload(id: string): Promise<void> {
  await adminRequest(`/uploads/${id}`, { method: 'DELETE' })
}

export async function getAdminCode(): Promise<AdminGeneration[]> {
  const data = await adminRequest<{ items: AdminGeneration[] }>('/code')
  return data.items
}

export async function cancelAdminCode(id: string): Promise<void> {
  await adminRequest(`/code/${id}/cancel`, { method: 'POST' })
}

export async function deleteAdminCode(id: string): Promise<void> {
  await adminRequest(`/code/${id}`, { method: 'DELETE' })
}

export async function getAdminDiagrams(): Promise<AdminGeneration[]> {
  const data = await adminRequest<{ items: AdminGeneration[] }>('/diagrams')
  return data.items
}

export async function cancelAdminDiagram(id: string): Promise<void> {
  await adminRequest(`/diagrams/${id}/cancel`, { method: 'POST' })
}

export async function deleteAdminDiagram(id: string): Promise<void> {
  await adminRequest(`/diagrams/${id}`, { method: 'DELETE' })
}

export async function getAdminLogs(): Promise<ActivityLog[]> {
  const data = await adminRequest<{ logs: ActivityLog[] }>('/logs')
  return data.logs
}
