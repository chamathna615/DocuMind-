// Helpers for the ```mermaid code blocks inside the Markdown answer of the "Generate diagram" page.
// No imports on purpose: these are plain string functions.

/**
 * Finds every ```mermaid block. Returns [{ start, end, code }] where start/end are the character
 * positions of the code between the fences (end = start of the closing fence line).
 * A block that is not closed yet is ignored.
 */
export function findMermaidBlocks(markdown) {
  const text = String(markdown ?? "");
  const blocks = [];
  let offset = 0;
  let open = null;

  for (const line of text.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;

    const fence = /^\s*```(.*)$/.exec(line);
    if (!fence) continue;

    if (open) {
      if (open.isMermaid) {
        blocks.push({
          start: open.codeStart,
          end: lineStart,
          code: text.slice(open.codeStart, lineStart).replace(/\n$/, ""),
        });
      }
      open = null;
    } else {
      open = { isMermaid: /^\s*mermaid\b/i.test(fence[1]), codeStart: offset };
    }
  }
  return blocks;
}

// The page does not need (and must not follow) these: theme/init directives, click handlers and links.
export function sanitizeMermaid(code) {
  return String(code ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !/^\s*%%\{.*\}%%\s*$/.test(line) && !/^\s*click\s/i.test(line))
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

// Applies sanitizeMermaid to every mermaid block of an answer.
export function cleanMermaidBlocks(markdown) {
  let text = String(markdown ?? "");
  for (const block of findMermaidBlocks(text).reverse()) {
    const cleaned = sanitizeMermaid(block.code);
    if (cleaned !== block.code) text = `${text.slice(0, block.start)}${cleaned}\n${text.slice(block.end)}`;
  }
  return text;
}

// Replaces the code of the n-th mermaid block. Returns null when there is no such block.
export function replaceMermaidBlock(markdown, index, newCode) {
  const text = String(markdown ?? "");
  const block = findMermaidBlocks(text)[index];
  if (!block) return null;
  const code = sanitizeMermaid(newCode);
  if (!code) return null;
  return `${text.slice(0, block.start)}${code}\n${text.slice(block.end)}`;
}

// "```mermaid ... ```" or plain code -> the code only (used for the model's repair answer)
export function stripFences(raw) {
  const text = String(raw ?? "").replace(/\r/g, "").trim();
  const fenced = text.match(/^```[a-zA-Z]*[ \t]*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : text).trim();
}
