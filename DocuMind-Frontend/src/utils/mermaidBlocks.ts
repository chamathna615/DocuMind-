/** Finds the ```mermaid blocks of a Markdown answer. A block that is not closed yet (still being written) is ignored. */
export function findMermaidBlocks(markdown: string): Array<{ code: string }> {
  const blocks: Array<{ code: string }> = []
  let open: { isMermaid: boolean; lines: string[] } | null = null

  for (const line of markdown.replace(/\r/g, '').split('\n')) {
    const fence = /^\s*```(.*)$/.exec(line)
    if (fence) {
      if (open) {
        if (open.isMermaid) blocks.push({ code: open.lines.join('\n') })
        open = null
      } else {
        open = { isMermaid: /^\s*mermaid\b/i.test(fence[1]), lines: [] }
      }
      continue
    }
    if (open) open.lines.push(line)
  }
  return blocks
}
