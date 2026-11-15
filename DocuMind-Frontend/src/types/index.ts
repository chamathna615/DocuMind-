export type Role = 'student' | 'admin'
export type UserStatus = 'active' | 'inactive'
export type LectureStatus = 'uploaded' | 'validating' | 'preparing' | 'transcribing' | 'generating' | 'completed' | 'failed' | 'cancelled'

export interface UserPreferences {
  quizSize: number
  outputs: { notes: boolean; quiz: boolean; tutorial: boolean }
  notifications: { ready: boolean; failed: boolean; weekly: boolean }
}
export interface User {
  id: string; name: string; email: string; role: Role; status: UserStatus; programme?: string
  preferredLanguage: string; joinedAt: string; lastActive: string; uploadCount: number
  photoUrl?: string
  provider?: 'local' | 'google'
  emailVerified?: boolean
  preferences?: UserPreferences
}
export interface Session { userId: string; createdAt: string; remember: boolean }
export interface Lecture {
  id: string; title: string; course: string; filename: string; fileType: 'MP3' | 'MP4' | 'M4A' | 'WAV' | 'WEBM' | 'PDF' | 'TEXT'; fileSize: number
  uploadedAt: string; status: LectureStatus; progress: number; duration: string; userId: string
  outputs: Array<'notes' | 'quiz' | 'tutorial' | 'transcript'>; quizScore?: number; jobId: string
  studyKeywords?: Array<{ term: string; definition: string }>
  mainTopics?: Array<{ title: string; summary: string }>
  processingError?: string
}
export interface QuizQuestion {
  id: string; type: 'mcq' | 'short'; prompt: string; options?: string[]; answer: string; keywords?: string[]; explanation: string
}
export interface QuizPrompt {
  id: string; type: 'mcq' | 'short'; prompt: string; options?: string[]; explanation?: string
}
export interface QuizAttempt { id: string; lectureId: string; userId: string; answers: Record<string, string>; score: number; total: number; submittedAt: string }
export interface ActivityLog { id: string; timestamp: string; user: string; action: string; entity: string; result: 'Success' | 'Failed'; details: string }
export interface DownloadItem { id: string; name: string; type: string; size: string; available: boolean }
