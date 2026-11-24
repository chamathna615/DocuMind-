import type { Lecture } from '@/types'
import { apiUrl } from '@/api/http'

export type LectureOutput = 'notes' | 'quiz' | 'tutorial'
export type DownloadKind = 'notes' | 'tutorial' | 'quiz' | 'answer-key' | 'json' | 'pack'

// The Lecture type from '@/types' plus the fields the real backend adds.
// (Use AppLecture instead of Lecture in the pages that read these fields.)
export type AppLecture = Lecture & {
  stage?: string
  errorMessage?: string
  quizPercent?: number | null
  language?: string
  questionCount?: number
  processingSeconds?: number
  startedAt?: string
  /** true while the server is queued/working on this lecture */
  active?: boolean
  /** text written so far for a prompt lecture (empty once it is completed) */
  preview?: string
}

interface BackendLecture {
  _id: string
  user: string
  title: string
  course: string
  filename: string
  fileType: 'MP3' | 'MP4' | 'PDF' | 'TEXT'
  fileSize: number
  status: 'uploaded' | 'processing' | 'completed' | 'failed' | 'cancelled'
  stage?: string
  progress?: number
  errorMessage?: string
  outputs?: LectureOutput[]
  language?: string
  questionCount?: number
  durationSec?: number
  processingMs?: number
  processingStartedAt?: string | null
  active?: boolean
  quizPercent?: number | null
  notes?: string
  tutorial?: string
  transcript?: string
  preview?: string
  createdAt: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    ...options,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error((data as { message?: string }).message || 'Request failed')
  }

  return data as T
}

const postJson = <T>(url: string, body?: unknown) =>
  request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

function formatDuration(seconds?: number): string {
  if (!seconds) return '—'
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

// The backend only knows uploaded / processing / completed / failed / cancelled.
// While processing, the current stage decides which of the frontend's finer statuses to show.
function toFrontendStatus(item: BackendLecture): Lecture['status'] {
  if (item.status !== 'processing') return item.status as Lecture['status']
  switch (item.stage) {
    case 'validating':
      return 'validating' as Lecture['status']
    case 'preparing':
      return 'preparing' as Lecture['status']
    case 'extracting':
      return 'transcribing' as Lecture['status']
    default:
      return 'generating' as Lecture['status']
  }
}

export function toFrontendLecture(item: BackendLecture): AppLecture {
  return {
    id: item._id,
    title: item.title,
    course: item.course,
    filename: item.filename,
    fileType: item.fileType,
    fileSize: item.fileSize,
    uploadedAt: item.createdAt,
    status: toFrontendStatus(item),
    progress: item.status === 'completed' ? 100 : Math.round(item.progress ?? 0),
    duration: formatDuration(item.durationSec),
    userId: item.user,
    outputs: (item.outputs ?? []) as Lecture['outputs'],
    jobId: item._id,
    stage: item.stage,
    errorMessage: item.errorMessage || undefined,
    quizPercent: item.quizPercent ?? null,
    language: item.language,
    questionCount: item.questionCount,
    processingSeconds: item.processingMs ? Math.round(item.processingMs / 1000) : undefined,
    startedAt: item.processingStartedAt ?? undefined,
    active: item.active,
    preview: item.preview ?? '',
  }
}

// GET /api/lectures
export async function getLectureHistory(): Promise<AppLecture[]> {
  const data = await request<{ lectures: BackendLecture[] }>('/api/lectures')
  return data.lectures.map(toFrontendLecture)
}

// GET /api/lectures/search?q=  - ids of the lectures whose title, course, notes, study guide or transcript contain the text
export async function searchLectureIds(query: string): Promise<string[]> {
  const data = await request<{ ids: string[] }>(`/api/lectures/search?q=${encodeURIComponent(query)}`)
  return data.ids
}

// GET /api/lectures/:id
export async function getLecture(id: string): Promise<AppLecture> {
  const data = await request<{ lecture: BackendLecture }>(`/api/lectures/${id}`)
  return toFrontendLecture(data.lecture)
}

// POST /api/lectures  - uploads the file and starts AI processing on the server.
// Uses XMLHttpRequest because fetch cannot report upload progress.
export function uploadLecture(
  input: {
    title: string
    course: string
    language: string
    questionCount: number
    outputs: LectureOutput[]
    file: File
  },
  options?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<AppLecture> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('title', input.title)
    formData.append('course', input.course)
    formData.append('language', input.language)
    formData.append('questionCount', String(input.questionCount))
    formData.append('outputs', input.outputs.join(','))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl('/lectures'))
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options?.onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      let data: { message?: string; lecture?: BackendLecture } = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.lecture) resolve(toFrontendLecture(data.lecture))
      else reject(new Error(data.message || 'Upload failed'))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))

    options?.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(formData)
  })
}

// POST /api/lectures/prompt  - "Write a prompt": the server writes the lecture text, then notes / quiz /
// study guide, saves everything in Lecture History and the PDFs are downloaded with downloadLectureFile.
export async function createPromptLecture(input: {
  prompt: string
  title?: string
  course?: string
  language: string
  questionCount: number
  outputs: LectureOutput[]
}): Promise<AppLecture> {
  const data = await postJson<{ lecture: BackendLecture }>('/api/lectures/prompt', input)
  return toFrontendLecture(data.lecture)
}

// DELETE /api/lectures/:id
export async function deleteLecture(id: string): Promise<void> {
  await request(`/api/lectures/${id}`, { method: 'DELETE' })
}

// PATCH /api/lectures/:id  (the server only accepts title, course, notes, tutorial)
export async function updateLecture(id: string, changes: Partial<Lecture>): Promise<AppLecture> {
  const data = await request<{ lecture: BackendLecture }>(`/api/lectures/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return toFrontendLecture(data.lecture)
}

// ---- processing controls ----
export async function cancelLecture(id: string): Promise<AppLecture> {
  const data = await postJson<{ lecture: BackendLecture }>(`/api/lectures/${id}/cancel`)
  return toFrontendLecture(data.lecture)
}

/** Continue after a failure: only generates what is still missing. */
export async function retryLecture(id: string): Promise<AppLecture> {
  const data = await postJson<{ lecture: BackendLecture }>(`/api/lectures/${id}/retry`)
  return toFrontendLecture(data.lecture)
}

/** Generate everything again from the saved transcript (no new upload needed). */
export async function regenerateLecture(
  id: string,
  options?: { outputs?: LectureOutput[]; language?: string; questionCount?: number },
): Promise<AppLecture> {
  const data = await postJson<{ lecture: BackendLecture }>(`/api/lectures/${id}/regenerate`, options)
  return toFrontendLecture(data.lecture)
}

// ---- generated content ----
export async function getGeneratedNotes(lectureId: string): Promise<string> {
  const data = await request<{ lecture: BackendLecture }>(`/api/lectures/${lectureId}`)
  return data.lecture.notes || ''
}

export async function getTutorial(lectureId: string): Promise<string> {
  const data = await request<{ lecture: BackendLecture }>(`/api/lectures/${lectureId}`)
  return data.lecture.tutorial || ''
}

export async function getTranscript(lectureId: string): Promise<string> {
  const data = await request<{ lecture: BackendLecture }>(`/api/lectures/${lectureId}?transcript=1`)
  return data.lecture.transcript || ''
}

// ---- downloads (real PDFs / ZIP built by the server) ----
export async function downloadLectureFile(
  lectureId: string,
  kind: DownloadKind,
  filename: string,
): Promise<void> {
  const response = await fetch(apiUrl(`/lectures/${lectureId}/download/${kind}`), { credentials: 'include' })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message || 'Download failed')
  }

  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
