import { apiUrl } from '@/api/http'

// What the browser receives BEFORE grading (the server hides answers and keywords).
export interface QuizQuestionPublic {
  id: string
  type: 'mcq' | 'short'
  prompt: string
  options?: string[]
}

export interface QuizResultItem {
  questionId: string
  prompt: string
  givenAnswer: string
  expectedAnswer: string
  correct: boolean
  explanation: string
}

export interface QuizAttemptDto {
  score: number
  total: number
  results: QuizResultItem[]
  createdAt?: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    ...options,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error((data as { message?: string }).message || 'Quiz request failed')
  }

  return data as T
}

// GET /api/lectures/:id/quiz   -> { quiz: { questions: [{ _id, type, prompt, options }] } }
export async function getQuiz(lectureId: string): Promise<QuizQuestionPublic[]> {
  const data = await request<{
    quiz: { questions: Array<{ _id: string; type: 'mcq' | 'short'; prompt: string; options?: string[] }> }
  }>(`/api/lectures/${lectureId}/quiz`)

  return data.quiz.questions.map((q) => ({
    id: q._id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
  }))
}

// POST /api/lectures/:id/quiz-attempts  -> the server grades the answers
export async function submitQuizAttempt(
  lectureId: string,
  answers: Record<string, string>,
): Promise<QuizAttemptDto> {
  const data = await request<{ attempt: QuizAttemptDto }>(`/api/lectures/${lectureId}/quiz-attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  return data.attempt
}

// GET /api/lectures/:id/quiz-attempts/latest  -> null when the student has not taken the quiz yet
export async function getLatestQuizAttempt(lectureId: string): Promise<QuizAttemptDto | null> {
  const data = await request<{ attempt: QuizAttemptDto | null }>(
    `/api/lectures/${lectureId}/quiz-attempts/latest`,
  )
  return data.attempt
}
