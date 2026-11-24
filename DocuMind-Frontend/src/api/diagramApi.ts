import { apiUrl } from '@/api/http'

export interface DiagramOptions {
  explanation: boolean
}

export interface DiagramRequest {
  id: string
  title: string
  prompt: string
  /** "auto" = the model chooses the most suitable diagram type */
  diagramType: string
  detail: 'simple' | 'standard' | 'detailed'
  language: string
  options: DiagramOptions
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  stage: string
  progress: number
  errorMessage?: string
  /** true while the server is queued/working on this request */
  active: boolean
  /** Markdown written so far (empty once the request is completed) */
  preview: string
  /** The finished answer (Markdown with one ```mermaid block) */
  result: string
  createdAt: string
}

interface BackendDiagram {
  _id: string
  title: string
  prompt: string
  diagramType?: string
  detail?: DiagramRequest['detail']
  language?: string
  options?: Partial<DiagramOptions>
  status: DiagramRequest['status']
  stage?: string
  progress?: number
  errorMessage?: string
  active?: boolean
  preview?: string
  result?: string
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

function toFrontendDiagram(item: BackendDiagram): DiagramRequest {
  return {
    id: item._id,
    title: item.title,
    prompt: item.prompt,
    diagramType: item.diagramType ?? 'auto',
    detail: item.detail ?? 'standard',
    language: item.language ?? 'English',
    options: { explanation: item.options?.explanation !== false },
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

// POST /api/diagrams  - the server asks the language model for Mermaid code in the background;
// the page then polls getDiagram() and draws the diagram with mermaid.js when the code is complete.
export async function createDiagram(input: {
  prompt: string
  diagramType: string
  detail: DiagramRequest['detail']
  language: string
  options: DiagramOptions
}): Promise<DiagramRequest> {
  const data = await postJson<{ diagram: BackendDiagram }>('/api/diagrams', input)
  return toFrontendDiagram(data.diagram)
}

// GET /api/diagrams/:id
export async function getDiagram(id: string): Promise<DiagramRequest> {
  const data = await request<{ diagram: BackendDiagram }>(`/api/diagrams/${id}`)
  return toFrontendDiagram(data.diagram)
}

// GET /api/diagrams  (newest first, without the long text)
export async function listDiagrams(): Promise<DiagramRequest[]> {
  const data = await request<{ items: BackendDiagram[] }>('/api/diagrams')
  return data.items.map(toFrontendDiagram)
}

export async function cancelDiagram(id: string): Promise<DiagramRequest> {
  const data = await postJson<{ diagram: BackendDiagram }>(`/api/diagrams/${id}/cancel`)
  return toFrontendDiagram(data.diagram)
}

/** Starts the same request again (after a failure or a cancel). */
export async function retryDiagram(id: string): Promise<DiagramRequest> {
  const data = await postJson<{ diagram: BackendDiagram }>(`/api/diagrams/${id}/retry`)
  return toFrontendDiagram(data.diagram)
}

/**
 * "Fix with AI": mermaid.js could not draw the diagram, so the model gets the code and the error
 * message and returns corrected code. The server saves it and returns the updated request.
 */
export async function repairDiagram(
  id: string,
  input: { blockIndex: number; error: string },
): Promise<DiagramRequest> {
  const data = await postJson<{ diagram: BackendDiagram }>(`/api/diagrams/${id}/repair`, input)
  return toFrontendDiagram(data.diagram)
}

// DELETE /api/diagrams/:id
export async function deleteDiagram(id: string): Promise<void> {
  await request(`/api/diagrams/${id}`, { method: 'DELETE' })
}
