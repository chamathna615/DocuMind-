import type { MermaidConfig } from 'mermaid'

type Mermaid = typeof import('mermaid').default

// mermaid.js is large, so it is only downloaded when the first diagram has to be drawn.
let loading: Promise<Mermaid> | null = null
const loadMermaid = () => (loading ??= import('mermaid').then((module) => module.default))

// mermaid.render() must not run twice at the same time (it uses one shared work area), so every
// drawing waits for the one before it.
let chain: Promise<unknown> = Promise.resolve()
let counter = 0

/**
 * Draws Mermaid code and returns the SVG text. Throws an Error with mermaid's message when the code is invalid.
 * "strict" security level: mermaid sanitises the labels and disables click handlers and scripts.
 * Labels are plain SVG text (no HTML), so the SVG can also be exported as a PNG image.
 */
export function renderMermaid(code: string, theme: 'light' | 'dark'): Promise<string> {
  const run = async () => {
    const mermaid = await loadMermaid()
    const config = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
      class: { htmlLabels: false },
      fontFamily: 'ui-sans-serif, system-ui, "Noto Sans", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
    } as unknown as MermaidConfig
    mermaid.initialize(config)

    const id = `mmd-${Date.now()}-${counter++}`
    try {
      const { svg } = await mermaid.render(id, code)
      return svg
    } finally {
      // on a syntax error mermaid leaves an error drawing in the page: remove it
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  }
  const result = chain.then(run, run)
  chain = result.catch(() => undefined)
  return result
}

/** Gives the SVG a fixed width and height (taken from its viewBox) so that it also works outside the page. */
export function standaloneSvg(svg: string): { xml: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error('The diagram is not a valid SVG')

  const box = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const width = box && box.length === 4 ? box[2] : parseFloat(root.getAttribute('width') ?? '')
  const height = box && box.length === 4 ? box[3] : parseFloat(root.getAttribute('height') ?? '')
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The size of the diagram is unknown')
  }

  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.removeAttribute('style')
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return { xml: new XMLSerializer().serializeToString(root), width, height }
}

/** SVG text -> PNG image (2x for a sharp result, with a solid background so the text stays readable). */
export async function svgToPngBlob(svg: string, background: string, scale = 2): Promise<Blob> {
  const { xml, width, height } = standaloneSvg(svg)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The diagram could not be converted to an image'))
      image.src = url
    })

    const maxSide = 8000 // very large canvases fail in browsers
    const factor = Math.min(scale, maxSide / width, maxSide / height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * factor))
    canvas.height = Math.max(1, Math.round(height * factor))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image export is not supported by this browser')
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
