/**
 * Step "Transcript preprocessing & cleaning" (pure code, no AI).
 *
 *  - normalises unicode / whitespace / control characters (keeps the joiners Sinhala needs)
 *  - removes English filler words (um, uh, erm, hmm ...)
 *  - collapses stutters ("the the the") and repeated phrases / ASR loops ("Thank you. Thank you.")
 *  - removes the duplicated words where two audio chunks overlap
 *  - for PDFs: repairs hyphenation and line breaks, removes page numbers and repeating headers/footers
 *
 * Fillers in Sinhala/Tamil are NOT removed by code - the LLM prompts tell the model to ignore them.
 */

const WORD_CHARS = "\\p{L}\\p{M}\\p{N}";

const FILLER = "(?:[Uu]m+|[Uu]h+|[Uu]hm+|[Ee]rm+|[Ee]r|[Hh]m+|[Mm]hm+|[Mm]m+-?[Hh]m+|[Aa]h+)";
const FILLER_RE = new RegExp(
  `(?:,\\s*)?(?<![${WORD_CHARS}'’-])${FILLER}(?![${WORD_CHARS}'’-])(?:\\s*[,…]+)?`,
  "gu"
);

// Two identical words in a row are only collapsed for these (e.g. "the the").
// Other words need 3+ repeats, because "very very" or "had had" can be correct.
const FUNCTION_WORDS = new Set(
  "the a an and of to in is it i we you so but or this they he she on at for with as be are was".split(" ")
);

const NON_WORD_EDGES = new RegExp(`^[^${WORD_CHARS}]+|[^${WORD_CHARS}]+$`, "gu");
const TRAILING_PUNCT = new RegExp(`[^${WORD_CHARS}]+$`, "u");

export const countWords = (text) => (String(text).match(/\S+/g) || []).length;
const norm = (token) => token.toLowerCase().replace(NON_WORD_EDGES, "");

export const newStats = () => ({
  fillersRemoved: 0,
  repeatsRemoved: 0,
  overlapWordsRemoved: 0,
  headerFooterLinesRemoved: 0,
  wordsBefore: 0,
  wordsAfter: 0,
  charsBefore: 0,
  charsAfter: 0,
});

/* ------------------------------------------------------------------ */
/* basic normalisation                                                 */
/* ------------------------------------------------------------------ */

export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    // control chars + BOM + zero-width space/word-joiner (ZWJ U+200D and ZWNJ U+200C are KEPT: Sinhala needs them)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\u200B\u2060]/g, "")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fixes spacing around punctuation that appears after words were removed.
function tidyPunctuation(text) {
  return text
    .replace(/([.!?])\s+[.,](?=\s|$)/g, "$1") // "Well. . The" -> "Well. The"  (must run before the next line)
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function removeFillers(text, stats) {
  const out = text.replace(FILLER_RE, () => {
    if (stats) stats.fillersRemoved += 1;
    return "";
  });
  return tidyPunctuation(out);
}

/* ------------------------------------------------------------------ */
/* stutters, repeated phrases and ASR loops                            */
/* ------------------------------------------------------------------ */

function collapseParagraph(paragraph, stats) {
  const tokens = paragraph.split(/\s+/).filter(Boolean);
  const keys = tokens.map(norm);
  const out = [];
  const MAX_PHRASE = 6;

  const sameSeq = (a, b, n) => {
    for (let k = 0; k < n; k++) if (!keys[a + k] || keys[a + k] !== keys[b + k]) return false;
    return true;
  };

  let i = 0;
  while (i < tokens.length) {
    let handled = false;

    // repeated phrases of 2..6 words, e.g. "going to be going to be"
    for (let n = 2; n <= MAX_PHRASE && !handled; n++) { // smallest period first: "thank you" x4, not "thank you thank you" x2
      if (i + 2 * n <= tokens.length && sameSeq(i, i + n, n)) {
        let j = i + n;
        while (j + n <= tokens.length && sameSeq(i, j, n)) j += n;
        out.push(...tokens.slice(i, i + n - 1), tokens[j - 1]); // keep the last copy's punctuation
        stats.repeatsRemoved += j - (i + n);
        i = j;
        handled = true;
      }
    }
    if (handled) continue;

    // repeated single word
    if (keys[i]) {
      let j = i + 1;
      while (j < tokens.length && keys[j] === keys[i]) j++;
      const run = j - i;
      if (run >= 3 || (run === 2 && FUNCTION_WORDS.has(keys[i]))) {
        const first = tokens[i].replace(TRAILING_PUNCT, "");
        const tail = tokens[j - 1].match(TRAILING_PUNCT)?.[0] ?? "";
        out.push(first + tail);
        stats.repeatsRemoved += run - 1;
        i = j;
        continue;
      }
    }

    out.push(tokens[i]);
    i++;
  }
  return out.join(" ");
}

export function collapseRepeats(text, stats) {
  return text
    .split(/\n{2,}/)
    .map((p) => collapseParagraph(p, stats))
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* removing the duplicated words where two audio chunks overlap        */
/* ------------------------------------------------------------------ */

const ANCHOR = 3; // words used to find the end of the overlap
const HEAD = 60; // overlap is a few seconds = at most ~60 words
const MAX_SKIP = 4; // the last words of chunk A may be cut in half, so a few can be ignored

const STOPWORDS = new Set("the and for are but not you all can was one our out has have this that with they from will".split(" "));
const isWeakAnchor = (anchor) => anchor.every((w) => !w || STOPWORDS.has(w) || w.length < 3);

function joinPair(a, b, stats) {
  if (a.length < ANCHOR || b.length < ANCHOR) return a.concat(b);
  const head = b.slice(0, HEAD).map(norm);

  for (let skip = 0; skip <= MAX_SKIP; skip++) {
    const end = a.length - skip;
    if (end - ANCHOR < 0) break;
    const anchor = a.slice(end - ANCHOR, end).map(norm);
    if (anchor.some((w) => !w) || isWeakAnchor(anchor)) continue;

    for (let p = 0; p + ANCHOR <= head.length; p++) {
      if (anchor.every((w, k) => head[p + k] === w)) {
        // chunk B repeats chunk A's ending: keep A up to the anchor, continue with B after the anchor
        stats.overlapWordsRemoved += p + ANCHOR + skip;
        return a.slice(0, end).concat(b.slice(p + ANCHOR));
      }
    }
  }
  return a.concat(b); // no overlap found: keep everything
}

export function mergeOverlapping(parts, stats) {
  const tokenised = parts.map((p) => p.split(/\s+/).filter(Boolean)).filter((t) => t.length);
  if (!tokenised.length) return "";
  let merged = tokenised[0];
  for (let i = 1; i < tokenised.length; i++) merged = joinPair(merged, tokenised[i], stats);
  return merged.join(" ");
}

/* ------------------------------------------------------------------ */
/* public: speech transcripts                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {string[]} parts  transcripts of the audio chunks, in order
 * @param {{overlapped?: boolean}} options  true when the chunks overlap by a few seconds
 * @returns {{ text: string, stats: object }}
 */
export function cleanTranscript(parts, { overlapped = false } = {}) {
  const stats = newStats();
  const raw = parts.join("\n\n");
  stats.charsBefore = raw.length;
  stats.wordsBefore = countWords(raw);

  const light = parts.map((p) => removeFillers(normalizeText(p), stats)).filter(Boolean);

  const joined = overlapped && light.length > 1 ? mergeOverlapping(light, stats) : light.join("\n\n");
  const text = tidyPunctuation(collapseRepeats(joined, stats)).replace(/ *\n */g, "\n");

  stats.charsAfter = text.length;
  stats.wordsAfter = countWords(text);
  return { text, stats };
}

/* ------------------------------------------------------------------ */
/* public: text extracted from a PDF                                   */
/* ------------------------------------------------------------------ */

export function cleanDocumentText(rawText) {
  const stats = newStats();
  stats.charsBefore = String(rawText).length;
  stats.wordsBefore = countWords(rawText);

  let text = normalizeText(rawText);

  // words split with a hyphen at the end of a line: "proces-\nsing" -> "processing"
  text = text.replace(new RegExp(`([\\p{L}])-\\n([\\p{Ll}])`, "gu"), "$1$2");

  const lines = text.split("\n");

  // lines that repeat many times are page headers / footers
  const frequency = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (t.length >= 6 && t.length <= 80) frequency.set(t, (frequency.get(t) || 0) + 1);
  }
  const repeating = new Set([...frequency].filter(([, n]) => n >= 5).map(([t]) => t));
  const pageNumber = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

  const kept = lines.filter((line) => {
    const t = line.trim();
    if (pageNumber.test(t) || repeating.has(t)) {
      stats.headerFooterLinesRemoved += 1;
      return false;
    }
    return true;
  });

  text = kept
    .join("\n")
    // a line break in the middle of a sentence ("... the\nnext word") becomes a space
    .replace(new RegExp(`([^.!?:;\\n])\\n(?=[\\p{Ll}])`, "gu"), "$1 ")
    .replace(/\n{3,}/g, "\n\n");

  text = text.replace(/[ \t]{2,}/g, " ").trim();

  stats.charsAfter = text.length;
  stats.wordsAfter = countWords(text);
  return { text, stats };
}
