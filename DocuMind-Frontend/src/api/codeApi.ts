export interface CodeOptions {
  explanation: boolean
  example: boolean
  tests: boolean
}

export interface CodeRequest {
  id: string
  title: string
  prompt: string
  /** "auto" = the model chooses the most suitable language */
  programmingLanguage: string
  language: string
  options: CodeOptions
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  stage: string
  progress: number
  errorMessage?: string
  /** true while the server is queued/working on this request */
  active: boolean
  /** Markdown written so far (empty once the request is completed) */
  preview: string
  /** The finished answer (Markdown) */
  result: string
  createdAt: string
}

interface BackendCode {
  _id: string
  title: string
  prompt: string
  programmingLanguage?: string
  language?: string
  options?: Partial<CodeOptions>
  status: CodeRequest['status']
  stage?: string
  progress?: number
  errorMessage?: string
  active?: boolean
  preview?: string
  result?: string
  createdAt: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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

function toFrontendCode(item: BackendCode): CodeRequest {
  return {
    id: item._id,
    title: item.title,
    prompt: item.prompt,
    programmingLanguage: item.programmingLanguage ?? 'auto',
    language: item.language ?? 'English',
    options: {
      explanation: item.options?.explanation !== false,
      example: item.options?.example !== false,
      tests: item.options?.tests === true,
    },
    status: item.status,
    stage: item.stage ?? '',
    progress: item.status === 'completed' ? 100 : Math.round(item.progress ?? 0),
    errorMessage: item.errorMessage || undefined,
    active: Boolean(item.active),
    preview: item.preview ?? '',
    result: item.result ?? '',
    createdAt: item.createdAt,
  }
}

// POST /api/code  - the server writes the code with the language model in the background;
// the page then polls getCode() and shows the text while it is being written.
export async function createCode(input: {
  prompt: string
  programmingLanguage: string
  language: string
  options: CodeOptions
}): Promise<CodeRequest> {
  const data = await postJson<{ code: BackendCode }>('/api/code', input)
  return toFrontendCode(data.code)
}

// GET /api/code/:id
export async function getCode(id: string): Promise<CodeRequest> {
  const data = await request<{ code: BackendCode }>(`/api/code/${id}`)
  return toFrontendCode(data.code)
}

// GET /api/code  (newest first, without the long text)
export async function listCode(): Promise<CodeRequest[]> {
  const data = await request<{ items: BackendCode[] }>('/api/code')
  return data.items.map(toFrontendCode)
}

export async function cancelCode(id: string): Promise<CodeRequest> {
  const data = await postJson<{ code: BackendCode }>(`/api/code/${id}/cancel`)
  return toFrontendCode(data.code)
}

/** Starts the same request again (after a failure or a cancel). */
export async function retryCode(id: string): Promise<CodeRequest> {
  const data = await postJson<{ code: BackendCode }>(`/api/code/${id}/retry`)
  return toFrontendCode(data.code)
}

// DELETE /api/code/:id
export async function deleteCode(id: string): Promise<void> {
  await request(`/api/code/${id}`, { method: 'DELETE' })
}
