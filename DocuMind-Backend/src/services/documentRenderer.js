/**
 * The LLM produces STRUCTURED JSON (summary, study guide, quiz).
 * This file turns that JSON into
 *   - Markdown (stored in lecture.notes / lecture.tutorial, shown in the app and turned into PDFs)
 *   - the exported JSON file ("JSON output for document generation")
 * Section headings come from the dictionary below, so Sinhala / Tamil documents get
 * headings in their own language. (Have a native speaker check them; they are easy to edit.)
 */
import { ai } from "../config/aiConfig.js";

export const LABELS = {
  English: {
    overview: "Overview",
    keyConcepts: "Key Concepts",
    terms: "Important Terms",
    takeaways: "Key Takeaways",
    objectives: "Learning Objectives",
    explanation: "Step-by-Step Explanation",
    example: "Example",
    mistakes: "Common Mistakes and Misconceptions",
    practice: "Practice Exercises",
    checklist: "Revision Checklist",
  },
  Sinhala: {
    overview: "දළ විග්‍රහය",
    keyConcepts: "ප්‍රධාන සංකල්ප",
    terms: "වැදගත් පද",
    takeaways: "ප්‍රධාන කරුණු",
    objectives: "ඉගෙනුම් අරමුණු",
    explanation: "පියවරෙන් පියවර පැහැදිලි කිරීම",
    example: "උදාහරණය",
    mistakes: "සාමාන්‍ය වැරදි සහ වැරදි අවබෝධ",
    practice: "පුහුණු ව්‍යායාම",
    checklist: "පුනරීක්ෂණ ලැයිස්තුව",
  },
  Tamil: {
    overview: "மேலோட்டம்",
    keyConcepts: "முக்கிய கருத்துகள்",
    terms: "முக்கிய சொற்கள்",
    takeaways: "முக்கிய குறிப்புகள்",
    objectives: "கற்றல் நோக்கங்கள்",
    explanation: "படிப்படியான விளக்கம்",
    example: "எடுத்துக்காட்டு",
    mistakes: "பொதுவான தவறுகள் மற்றும் தவறான புரிதல்கள்",
    practice: "பயிற்சிகள்",
    checklist: "மீள்பார்வைப் பட்டியல்",
  },
};

const labelsFor = (language) => LABELS[language] ?? LABELS.English;

// Markdown is line based, so every value is put on one line.
const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const bullets = (items) => (items ?? []).map(oneLine).filter(Boolean).map((t) => `- ${t}`);
const numbered = (items) => (items ?? []).map(oneLine).filter(Boolean).map((t, i) => `${i + 1}. ${t}`);

/* ------------------------------------------------------------------ */
/* JSON -> Markdown                                                    */
/* ------------------------------------------------------------------ */

export function renderNotesMarkdown(summary, language = "English") {
  const L = labelsFor(language);
  const out = [];

  out.push(`## ${L.overview}`, "", oneLine(summary.overview), "");

  if (summary.sections?.length) {
    out.push(`## ${L.keyConcepts}`, "");
    for (const section of summary.sections) {
      out.push(`### ${oneLine(section.title)}`, "");
      if (section.summary) out.push(oneLine(section.summary), "");
      out.push(...bullets(section.keyPoints), "");
    }
  }

  if (summary.glossary?.length) {
    out.push(`## ${L.terms}`, "");
    out.push(...summary.glossary.map((g) => `- **${oneLine(g.term)}** - ${oneLine(g.definition)}`), "");
  }

  if (summary.keyTakeaways?.length) {
    out.push(`## ${L.takeaways}`, "", ...numbered(summary.keyTakeaways), "");
  }
  return out.join("\n").trim();
}

export function renderGuideMarkdown(guide, language = "English") {
  const L = labelsFor(language);
  const out = [];

  if (guide.learningObjectives?.length) out.push(`## ${L.objectives}`, "", ...bullets(guide.learningObjectives), "");

  if (guide.topics?.length) {
    out.push(`## ${L.explanation}`, "");
    for (const topic of guide.topics) {
      out.push(`### ${oneLine(topic.title)}`, "", oneLine(topic.explanation), "");
      if (oneLine(topic.example)) out.push(`**${L.example}:** ${oneLine(topic.example)}`, "");
    }
  }

  if (guide.commonMistakes?.length) out.push(`## ${L.mistakes}`, "", ...bullets(guide.commonMistakes), "");
  if (guide.practiceQuestions?.length) out.push(`## ${L.practice}`, "", ...numbered(guide.practiceQuestions), "");
  if (guide.revisionChecklist?.length) out.push(`## ${L.checklist}`, "", ...bullets(guide.revisionChecklist), "");
  return out.join("\n").trim();
}

/* ------------------------------------------------------------------ */
/* The exported JSON file                                              */
/* ------------------------------------------------------------------ */

export function buildStructuredExport(lecture, quiz) {
  const structured = lecture.structured ?? {};
  const stats = lecture.pipelineStats ?? {};
  return {
    schemaVersion: 1,
    lecture: {
      id: String(lecture._id),
      title: lecture.title,
      course: lecture.course,
      language: lecture.language,
      sourceType: lecture.fileType,
      durationSec: lecture.durationSec || null,
      wordCount: lecture.wordCount || null,
      uploadedAt: lecture.createdAt,
    },
    summary: structured.summary ?? null,
    studyGuide: structured.studyGuide ?? null,
    quiz: (quiz?.questions ?? []).map((q) => ({
      type: q.type,
      prompt: q.prompt,
      options: q.options ?? [],
      answer: q.answer,
      keywords: q.keywords ?? [],
      explanation: q.explanation,
    })),
    processing: {
      speechToTextModel: lecture.fileType === "PDF" ? null : ai.sttModel,
      languageModel: ai.llmModel,
      segments: stats.segmentCount ?? null,
      cleaning: stats.cleaning ?? null,
      completedAt: lecture.processingCompletedAt ?? null,
    },
  };
}
