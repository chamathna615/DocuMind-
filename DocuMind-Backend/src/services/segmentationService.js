/**
 * Step "Text chunking / segmentation" (pure code, no AI).
 *
 * Splits the cleaned transcript into topic segments of roughly 250-1600 words.
 * Inside that size range the cut is placed where the vocabulary changes the most
 * (a light version of the TextTiling algorithm), so a segment tends to be about one topic.
 * Each segment is summarised separately by the LLM (see contentService.js), which keeps
 * quality high for very long lectures.
 */

const STOPWORDS = new Set(
  ("the and for are but not you all any can had her was one our out has have this that with they from will your what when where " +
    "which their there been were said each she how its who may then them these some into than more also very just about would " +
    "could should because so like okay yeah right going gonna know think").split(" ")
);

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const wordCount = (s) => (s.match(/\S+/g) || []).length;

// non-Latin words (Sinhala, Tamil...) are short, so the length filter only applies to Latin words
function keywords(sentence) {
  return (sentence.toLowerCase().match(WORD) || []).filter(
    (w) => !STOPWORDS.has(w) && (w.length >= 3 || /[^\u0000-\u007f]/.test(w))
  );
}

/* ------------------------------------------------------------------ */
/* sentences                                                           */
/* ------------------------------------------------------------------ */

const SENTENCE_END = /(?<=[.!?…])\s+(?=["'“‘(\[]?[\p{Lu}\p{Lo}\d])/u;
const MAX_SENTENCE_WORDS = 60;
const FORCED_PIECE_WORDS = 40;

export function splitSentences(text) {
  const out = [];
  for (const paragraph of String(text).split(/\n{2,}/)) {
    const compact = paragraph.replace(/\s+/g, " ").trim();
    if (!compact) continue;
    for (const sentence of compact.split(SENTENCE_END)) {
      const words = sentence.split(" ");
      if (words.length <= MAX_SENTENCE_WORDS) {
        out.push(sentence);
      } else {
        // speech recognition sometimes returns minutes of speech without punctuation
        for (let i = 0; i < words.length; i += FORCED_PIECE_WORDS) {
          out.push(words.slice(i, i + FORCED_PIECE_WORDS).join(" "));
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* vocabulary similarity between the text before and after a gap       */
/* ------------------------------------------------------------------ */

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [w, x] of a) {
    na += x * x;
    const y = b.get(w);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function termFrequency(tokenLists, from, to) {
  const tf = new Map();
  for (let i = Math.max(0, from); i < Math.min(tokenLists.length, to); i++) {
    for (const w of tokenLists[i]) tf.set(w, (tf.get(w) || 0) + 1);
  }
  return tf;
}

/* ------------------------------------------------------------------ */
/* public                                                              */
/* ------------------------------------------------------------------ */

/**
 * @returns {{ index:number, text:string, wordCount:number, startWord:number, approxStartSec:number|null }[]}
 */
export function segmentText(
  text,
  { durationSec = 0, minWords = 250, targetWords = 1000, maxWords = 1600, window = 5 } = {}
) {
  const sentences = splitSentences(text);
  const counts = sentences.map(wordCount);
  const prefix = [0]; // prefix[i] = words before sentence i
  counts.forEach((c, i) => prefix.push(prefix[i] + c));
  const total = prefix[sentences.length];

  const make = (boundaries) => {
    const cuts = [0, ...boundaries, sentences.length];
    return cuts.slice(0, -1).map((from, index) => {
      const to = cuts[index + 1];
      const startWord = prefix[from];
      return {
        index,
        text: sentences.slice(from, to).join(" "),
        wordCount: prefix[to] - prefix[from],
        startWord,
        approxStartSec: durationSec && total ? Math.round((durationSec * startWord) / total) : null,
      };
    });
  };

  if (!sentences.length) return [];
  if (total <= maxWords) return make([]);

  // dissimilarity at every gap between two sentences (1 = completely different vocabulary)
  const tokens = sentences.map(keywords);
  const dissimilarity = new Array(sentences.length).fill(0);
  for (let g = 1; g < sentences.length; g++) {
    dissimilarity[g] = 1 - cosine(termFrequency(tokens, g - window, g), termFrequency(tokens, g, g + window));
  }

  const boundaries = [];
  let start = 0;
  while (total - prefix[start] > maxWords) {
    let best = -1;
    let bestScore = -Infinity;

    for (let g = start + 1; g < sentences.length; g++) {
      const size = prefix[g] - prefix[start];
      if (size < minWords) continue;
      if (size > maxWords) break;
      if (total - prefix[g] < minWords) break; // would leave a tiny last segment
      // prefer large dissimilarity, but gently prefer sizes close to the target
      const score = dissimilarity[g] - 0.15 * (Math.abs(size - targetWords) / targetWords);
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }

    if (best === -1) {
      // no gap inside the allowed range (e.g. one gigantic sentence): cut at the target size
      best = start + 1;
      while (best < sentences.length - 1 && prefix[best] - prefix[start] < targetWords) best++;
      if (best <= start) break;
    }
    boundaries.push(best);
    start = best;
  }

  return make(boundaries);
}
