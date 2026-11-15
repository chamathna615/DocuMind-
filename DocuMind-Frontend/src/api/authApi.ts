import type { User, UserPreferences } from '@/types'
import { apiRequest } from '@/api/http'

// Shape actually returned by the Node/Express backend (see User.toSafeObject()).
interface BackendUser {
  id: string
  fullName: string
  email: string
  provider: 'local' | 'google'
  role: 'student' | 'admin'
  status: 'active' | 'inactive'
  emailVerified?: boolean
  createdAt: string
  programme?: string
  preferredLanguage?: string
  photoUrl?: string
  preferences?: Partial<{
    quizSize: number
    outputs: Partial<UserPreferences['outputs']>
    notifications: Partial<UserPreferences['notifications']>
  }>
}

// Translates the backend's user shape into the shape the rest of the frontend expects.
function toFrontendUser(backendUser: BackendUser): User {
  const prefs = backendUser.preferences
  return {
    id: backendUser.id,
    name: backendUser.fullName,
    email: backendUser.email,
    role: backendUser.role,
    status: backendUser.status,
    programme: backendUser.programme || undefined,
    preferredLanguage: backendUser.preferredLanguage || 'English',
    joinedAt: backendUser.createdAt,
    lastActive: new Date().toISOString(),
    uploadCount: 0,
    photoUrl: backendUser.photoUrl || undefined,
    provider: backendUser.provider,
    emailVerified: backendUser.emailVerified,
    preferences: {
      quizSize: prefs?.quizSize ?? 10,
      outputs: {
        notes: prefs?.outputs?.notes ?? true,
        quiz: prefs?.outputs?.quiz ?? true,
        tutorial: prefs?.outputs?.tutorial ?? true,
      },
      notifications: {
        ready: prefs?.notifications?.ready ?? true,
        failed: prefs?.notifications?.failed ?? true,
        weekly: prefs?.notifications?.weekly ?? false,
      },
    },
  }
}

export async function loginUser(email: string, password: string, remember = false): Promise<User> {
  const data = await apiRequest<{ user: BackendUser }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: remember }),
  })
  return toFrontendUser(data.user)
}

export async function loginWithGoogle(credential: string): Promise<User> {
  const data = await apiRequest<{ user: BackendUser }>('/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  return toFrontendUser(data.user)
}

// With email verification switched on, registering does NOT sign anyone in: the server answers
// `needsVerification` and sends a link by email. `user` is only present when verification is off.
export interface RegisterResult {
  needsVerification: boolean
  message: string
  user?: User
}

export async function registerUser(data: {
  name: string
  email: string
  password: string
  confirmPassword: string
  terms: boolean
}): Promise<RegisterResult> {
  const result = await apiRequest<{ user?: BackendUser; needsVerification?: boolean; message?: string }>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: data.name,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
      acceptedTerms: data.terms,
    }),
  })
  return {
    needsVerification: Boolean(result.needsVerification),
    message: result.message ?? '',
    user: result.user ? toFrontendUser(result.user) : undefined,
  }
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// Confirms an email address with the one-time token from the link in the email.
export async function verifyEmail(token: string): Promise<string> {
  const data = await apiRequest<{ message?: string }>('/auth/verify-email', jsonPost({ token }))
  return data.message ?? 'Your email address is verified.'
}

// Sends a new verification link. The server gives the same answer whether or not the address exists.
export async function resendVerification(email: string): Promise<string> {
  const data = await apiRequest<{ message?: string }>('/auth/resend-verification', jsonPost({ email }))
  return data.message ?? 'If that address has an unverified account, we have sent a new link.'
}

// Asks for a password-reset email. The server gives the same answer for every address.
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/auth/forgot-password', jsonPost({ email }))
}

// Sets a new password with the one-time token from the reset email.
export async function resetPassword(token: string, password: string): Promise<string> {
  const data = await apiRequest<{ message?: string }>('/auth/reset-password', jsonPost({ token, password }))
  return data.message ?? 'Your password has been updated.'
}

// Reads the current session from the httpOnly cookie the backend sets on login/register.
export async function getCurrentUser(): Promise<User> {
  const data = await apiRequest<{ user: BackendUser }>('/auth/me')
  return toFrontendUser(data.user)
}

export async function logoutUser(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' })
}

// Changes the password of an email/password account. The server also signs out every OTHER device.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

// "Sign out everywhere": every login on every device stops working immediately.
export async function logoutAllDevices(): Promise<void> {
  await apiRequest('/auth/logout-all', { method: 'POST' })
}

// Privacy: downloads a JSON copy of everything DocuMind stores about the signed-in user.
export async function downloadMyData(): Promise<void> {
  const data = await apiRequest<unknown>('/auth/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'documind-data-export.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// Permanently deletes the signed-in user's account.
// `password` is required for email/password accounts (Google accounts don't have one).
// Throws if the server refuses (e.g. wrong password) so the UI can show the error.
export async function deleteUserAccount(password?: string): Promise<void> {
  await apiRequest('/auth/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

// PATCH /api/auth/profile - saves the personal details on the server. (The email address can't be changed here.)
export async function updateUserProfile(changes: {
  name?: string
  programme?: string
  preferredLanguage?: string
  /** a small data URL, or '' to remove the photo */
  photoUrl?: string
}): Promise<User> {
  const data = await apiRequest<{ user: BackendUser }>('/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: changes.name,
      programme: changes.programme,
      preferredLanguage: changes.preferredLanguage,
      photoUrl: changes.photoUrl,
    }),
  })
  return toFrontendUser(data.user)
}

export interface PreferenceChanges {
  quizSize?: number
  outputs?: Partial<UserPreferences['outputs']>
  notifications?: Partial<UserPreferences['notifications']>
}

// PATCH /api/auth/preferences - only the keys that are sent are changed.
export async function updatePreferences(changes: PreferenceChanges): Promise<User> {
  const data = await apiRequest<{ user: BackendUser }>('/auth/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return toFrontendUser(data.user)
}
