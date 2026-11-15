import Lecture from "../models/Lecture.js";
import QuizAttempt from "../models/QuizAttempt.js";
import CodeGeneration from "../models/CodeGeneration.js";
import Diagram from "../models/Diagram.js";

const round = (n, digits = 2) => Math.round((n || 0) * 10 ** digits) / 10 ** digits;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Platform-wide numbers for the admin dashboard: AI usage and estimated cost,
 * processing time, what the cleaning / segmentation steps did, and quiz results.
 *
 * Only the few small number fields are loaded (never transcripts or notes) and added up in
 * JavaScript. That is plenty fast for thousands of lectures and works on every MongoDB version.
 */
export async function getAiUsageStats() {
  const [lectures, attempts, codeRequests, diagramRequests] = await Promise.all([
    Lecture.find({})
      .select("status processingMs durationSec createdAt usage pipelineStats")
      .lean(),
    QuizAttempt.find({}).select("score total").lean(),
    // "Generate code" and "Generate diagram" also cost money, so they belong in the totals
    CodeGeneration.find({}).select("createdAt usage").lean(),
    Diagram.find({}).select("createdAt usage").lean(),
  ]);

  const t = {
    sttMinutes: 0, llmInputTokens: 0, llmOutputTokens: 0, estimatedCostUsd: 0, recordingSeconds: 0,
    segments: 0, fillersRemoved: 0, repeatsRemoved: 0, overlapWordsRemoved: 0, wordsBefore: 0, wordsAfter: 0,
  };
  let processedMs = 0;
  let processedCount = 0;
  const costPerDay = new Map();
  // requests, tokens and estimated cost per feature (for the admin "cost by feature" card)
  const feature = {
    lectures: { requests: 0, tokens: 0, costUsd: 0 },
    code: { requests: 0, tokens: 0, costUsd: 0 },
    diagrams: { requests: 0, tokens: 0, costUsd: 0 },
  };

  for (const l of lectures) {
    t.sttMinutes += num(l.usage?.sttMinutes);
    t.llmInputTokens += num(l.usage?.llmInputTokens);
    t.llmOutputTokens += num(l.usage?.llmOutputTokens);
    t.estimatedCostUsd += num(l.usage?.estimatedCostUsd);
    t.recordingSeconds += num(l.durationSec);
    feature.lectures.requests += 1;
    feature.lectures.tokens += num(l.usage?.llmInputTokens) + num(l.usage?.llmOutputTokens);
    feature.lectures.costUsd += num(l.usage?.estimatedCostUsd);
    t.segments += num(l.pipelineStats?.segmentCount);
    const c = l.pipelineStats?.cleaning ?? {};
    t.fillersRemoved += num(c.fillersRemoved);
    t.repeatsRemoved += num(c.repeatsRemoved);
    t.overlapWordsRemoved += num(c.overlapWordsRemoved);
    t.wordsBefore += num(c.wordsBefore);
    t.wordsAfter += num(c.wordsAfter);

    if (l.status === "completed" && num(l.processingMs) > 0) {
      processedMs += l.processingMs;
      processedCount += 1;
    }
    if (num(l.usage?.estimatedCostUsd) > 0) {
      const day = new Date(l.createdAt).toISOString().slice(0, 10);
      costPerDay.set(day, (costPerDay.get(day) ?? 0) + l.usage.estimatedCostUsd);
    }
  }

  // code + diagram requests: only tokens and cost (they have no audio or cleaning steps)
  const addRequest = (r, key) => {
    t.llmInputTokens += num(r.usage?.llmInputTokens);
    t.llmOutputTokens += num(r.usage?.llmOutputTokens);
    t.estimatedCostUsd += num(r.usage?.estimatedCostUsd);
    feature[key].requests += 1;
    feature[key].tokens += num(r.usage?.llmInputTokens) + num(r.usage?.llmOutputTokens);
    feature[key].costUsd += num(r.usage?.estimatedCostUsd);
    if (num(r.usage?.estimatedCostUsd) > 0) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      costPerDay.set(day, (costPerDay.get(day) ?? 0) + r.usage.estimatedCostUsd);
    }
  };
  codeRequests.forEach((r) => addRequest(r, "code"));
  diagramRequests.forEach((r) => addRequest(r, "diagrams"));

  const score = attempts.reduce((sum, a) => sum + num(a.score), 0);
  const total = attempts.reduce((sum, a) => sum + num(a.total), 0);

  return {
    averageProcessingMs: processedCount ? processedMs / processedCount : 0,
    usage: {
      sttMinutes: round(t.sttMinutes),
      recordingMinutes: round(t.recordingSeconds / 60, 1),
      llmInputTokens: t.llmInputTokens,
      llmOutputTokens: t.llmOutputTokens,
      estimatedCostUsd: round(t.estimatedCostUsd, 4),
    },
    pipeline: {
      segments: t.segments,
      fillersRemoved: t.fillersRemoved,
      repeatsRemoved: t.repeatsRemoved,
      overlapWordsRemoved: t.overlapWordsRemoved,
      wordsBefore: t.wordsBefore,
      wordsAfter: t.wordsAfter,
      cleaningReductionPercent: t.wordsBefore ? round((1 - t.wordsAfter / t.wordsBefore) * 100, 1) : 0,
    },
    byFeature: Object.fromEntries(
      Object.entries(feature).map(([key, value]) => [key, { ...value, costUsd: round(value.costUsd, 4) }])
    ),
    costOverTime: [...costPerDay]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([day, value]) => ({ day, value: round(value, 4) })),
    quizAttempts: attempts.length,
    // points scored / points possible, over all attempts
    averageQuizPercent: total ? Math.round((score / total) * 100) : null,
  };
}
