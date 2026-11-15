/** Small helpers for the "Generate code" page: reading the Markdown answer and saving files. */

export interface CodeBlockData {
  language: string
  code: string
}

// file extension for the label the model writes after the opening ``` of a code block
const EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  java: 'java',
  csharp: 'cs',
  'c#': 'cs',
  cs: 'cs',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  go: 'go',
  golang: 'go',
  rust: 'rs',
  rs: 'rs',
  php: 'php',
  ruby: 'rb',
  rb: 'rb',
  kotlin: 'kt',
  swift: 'swift',
  dart: 'dart',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  html: 'html',
  css: 'css',
  r: 'r',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
}

export const extensionFor = (language: string) => EXTENSIONS[language.trim().toLowerCase()] ?? 'txt'

const FENCE = /^\s*```/

/** Every complete fenced code block of a Markdown text, in order. An unfinished block is ignored. */
export function extractCodeBlocks(markdown: string): CodeBlockData[] {
  const blocks: CodeBlockData[] = []
  let open: { language: string; lines: string[] } | null = null

  for (const line of markdown.replace(/\r/g, '').split('\n')) {
    if (FENCE.test(line)) {
      if (open) {
        blocks.push({ language: open.language, code: open.lines.join('\n') })
        open = null
      } else {
        open = { language: line.replace(/^\s*```\s*/, '').split(/\s/)[0].toLowerCase(), lines: [] }
      }
      continue
    }
    if (open) open.lines.push(line)
  }
  return blocks
}

/**
 * Splits the answer into its "## " sections so each one can slide in on its own.
 * A "## " line inside a code block (a Python comment, for example) does NOT start a new section.
 */
export function splitSections(markdown: string): string[] {
  const sections: string[] = []
  let current: string[] = []
  let inFence = false

  for (const line of markdown.replace(/\r/g, '').split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    else if (!inFence && line.startsWith('## ') && current.length) {
      sections.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  sections.push(current.join('\n'))
  return sections.filter((section) => section.trim())
}

/** "Sort a list of numbers!" -> "sort-a-list-of-numbers" (safe as a file name). */
export function fileSlug(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '')
  return slug || 'code'
}

export function saveTextFile(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
