export interface MyAnalytics {
  totals: {
    lectures: number
    completed: number
    failed: number
    inProgress: number
    minutesOfRecordings: number
  }
  quiz: {
    attempts: number
    lecturesAttempted: number
    averagePercent: number | null
    bestPercent: number | null
  }
  /** newest first */
  recentAttempts: Array<{
    lectureId: string | null
    title: string
    percent: number
    score: number
    total: number
    takenAt: string
  }>
}

// GET /api/analytics/me
export async function getMyAnalytics(): Promise<MyAnalytics> {
  const response = await fetch('/api/analytics/me', { credentials: 'include' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { message?: string }).message || 'Unable to load analytics.')
  return (data as { analytics: MyAnalytics }).analytics
}
