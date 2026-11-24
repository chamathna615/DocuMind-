const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
export const API_BASE_URL = configuredBase
  ? configuredBase.endsWith('/api') ? configuredBase : `${configuredBase}/api`
  : '/api'

export function apiUrl(path: string) {
  const normalizedPath = path.replace(/^\/+/, '')
  const route = normalizedPath === 'api'
    ? ''
    : normalizedPath.startsWith('api/')
      ? normalizedPath.slice('api/'.length)
      : normalizedPath
  return route ? `${API_BASE_URL}/${route}` : API_BASE_URL
}

// An error answered by the server. `code` is a machine-readable reason when the server sends one
// (for example EMAIL_NOT_VERIFIED), so screens can offer the right next step.
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
  })
  const data = await response.json().catch(() => null) as { message?: string; code?: string } | null

  if (!response.ok) {
    throw new ApiError(data?.message || `Request failed (${response.status})`, response.status, data?.code)
  }

  return data as T
}
