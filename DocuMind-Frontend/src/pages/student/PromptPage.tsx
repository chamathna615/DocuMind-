import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Download, FolderOpen, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  cancelLecture,
  createPromptLecture,
  downloadLectureFile,
  getGeneratedNotes,
  getLecture,
  getTutorial,
  retryLecture,
  type AppLecture,
  type LectureOutput,
} from "@/api/lectureApi";
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useClearOnLeave } from "@/utils/useClearOnLeave";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

interface TurnData {
  id: string; // lecture id
  prompt: string; // what the student asked
}

// Older versions kept the conversation in the browser; that copy is removed because the
// content area must start empty every time the page is opened.
const OLD_STORAGE_KEY = "documind-text-workspace";

const OUTPUT_OPTIONS: Array<{ key: LectureOutput; label: string }> = [
  { key: "notes", label: "Notes" },
  { key: "quiz", label: "Quiz" },
  { key: "tutorial", label: "Study guide" },
];

// Every "## " section is its own block, so each new section can slide in on its own.
const splitBlocks = (markdown: string) => markdown.split(/\n(?=## )/).filter((block) => block.trim());

type Children = { children?: React.ReactNode };
const markdownComponents = {
  h1: ({ children }: Children) => <h1 className="mt-8 text-3xl font-bold first:mt-0">{children}</h1>,
  h2: ({ children }: Children) => <h2 className="mt-8 text-2xl font-bold first:mt-0">{children}</h2>,
  h3: ({ children }: Children) => <h3 className="mt-6 text-xl font-semibold">{children}</h3>,
  p: ({ children }: Children) => <p className="mt-4 leading-7 muted">{children}</p>,
  ul: ({ children }: Children) => <ul className="mt-4 list-disc space-y-2 pl-6 muted">{children}</ul>,
  ol: ({ children }: Children) => <ol className="mt-4 list-decimal space-y-2 pl-6 muted">{children}</ol>,
};

const popDownCss = `
@keyframes pop-down {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-pop-down { animation: pop-down 0.5s ease-out both; }
@media (prefers-reduced-motion: reduce) { .animate-pop-down { animation: none; } }
`;

/* ------------------------------------------------------------------ */
/* One question + its generated answer                                 */
/* ------------------------------------------------------------------ */

function Turn({
  id,
  prompt,
  onActive,
}: {
  id: string;
  prompt: string;
  onActive: (id: string, active: boolean) => void;
}) {
  const client = useQueryClient();
  const shown = useRef("");
  const [downloading, setDownloading] = useState(false);

  const queryKey = ["lecture", id];
  const cached = client.getQueryData<AppLecture>(queryKey);
  const shouldPoll = !cached || Boolean(cached.active);

  // Poll every 1.5 s while the server writes, so new sections appear almost immediately.
  const { data: lecture, isError } = useQuery({
    queryKey,
    queryFn: () => getLecture(id),
    refetchInterval: shouldPoll ? 1500 : false,
    gcTime: 0, // dropped from the cache as soon as the student leaves the page
  });

  const wanted = (lecture?.outputs ?? []) as string[];
  const isActive = Boolean(lecture?.active);
  const isCompleted = lecture?.status === "completed";
  const isStopped =
    Boolean(lecture) &&
    !isActive &&
    (lecture?.status === "failed" || lecture?.status === "cancelled" || lecture?.status === "uploaded");
  const contentKind = wanted.includes("notes") ? "notes" : wanted.includes("tutorial") ? "tutorial" : null;

  // After completion the saved notes replace the live preview (the first sections are identical).
  const finalContent = useQuery({
    queryKey: ["content", id, contentKind],
    queryFn: () => (contentKind === "notes" ? getGeneratedNotes(id) : getTutorial(id)),
    enabled: isCompleted && contentKind !== null,
    gcTime: 0,
  });

  const incoming = isCompleted && finalContent.data ? finalContent.data : lecture?.preview ?? "";
  if (incoming) shown.current = incoming;
  const blocks = splitBlocks(incoming || shown.current);

  useEffect(() => {
    onActive(id, !isError && (!lecture || isActive));
  }, [id, lecture, isActive, isError, onActive]);

  useEffect(() => {
    if (lecture && !lecture.active) {
      void client.invalidateQueries({ queryKey: ["lectures"] });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    }
  }, [lecture?.active, lecture?.status, client]);

  const cancel = async () => {
    try {
      client.setQueryData(queryKey, await cancelLecture(id));
      toast.info("Cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    }
  };

  const retry = async () => {
    try {
      client.setQueryData(queryKey, await retryLecture(id));
      toast.success("Started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    }
  };

  const pdfKind = wanted.includes("notes")
    ? "notes"
    : wanted.includes("tutorial")
      ? "tutorial"
      : wanted.includes("quiz")
        ? "quiz"
        : null;
  const downloadPdf = async () => {
    if (!pdfKind || !lecture) return;
    setDownloading(true);
    try {
      await downloadLectureFile(id, pdfKind, `${lecture.title}-${pdfKind === "tutorial" ? "study-guide" : pdfKind}.pdf`);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section id={`turn-${id}`} className="scroll-mt-20 space-y-6">
      {/* the student's prompt */}
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-primary-soft px-5 py-3 text-sm leading-6 dark:bg-purple-950">
          {prompt}
        </p>
      </div>

      {/* the generated content, appearing section by section */}
      <div className="min-w-0">
        {isError && <p className="text-sm text-red-600">This content could not be loaded.</p>}

        {blocks.map((block, index) => (
          <div key={index} className="animate-pop-down" style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }}>
            <ReactMarkdown components={markdownComponents}>{block}</ReactMarkdown>
          </div>
        ))}

        {!isError && !isCompleted && !isStopped && (
          <div className="mt-6 flex items-center gap-3 text-sm muted" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            {blocks.length ? "Writing…" : "Planning your content…"}
            <Button variant="ghost" className="min-h-9 px-3" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}

        {isStopped && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <p>
              {lecture?.status === "cancelled"
                ? "Cancelled."
                : lecture?.errorMessage || "Generation did not finish."}
            </p>
            <Button className="mt-3" onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              {lecture?.status === "cancelled" ? "Start again" : "Try again"}
            </Button>
          </div>
        )}

        {isCompleted && (
          <div className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800">
            {contentKind === null && <p className="mb-4 text-sm muted">Your quiz is ready. Use “Take Quiz” to start.</p>}
            <div className="flex flex-wrap items-center gap-2">
              {wanted.includes("quiz") && (
                <Link to={`/quiz/${id}`}>
                  <Button>Take Quiz</Button>
                </Link>
              )}
              {pdfKind && (
                <Button variant="secondary" loading={downloading} onClick={downloadPdf}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              )}
              <Link to={`/downloads/${id}`}>
                <Button variant="secondary">
                  <FolderOpen className="h-4 w-4" />
                  Open Downloads
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-emerald-700">Saved to your Lecture History</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page: conversation on top, input bar at the bottom                  */
/* ------------------------------------------------------------------ */

export default function PromptPage() {
  const client = useQueryClient();
  const { user } = useAuth();
  // the Account page's saved preferences are the starting point; they can still be changed in Options
  const prefs = user?.preferences;
  const [turns, setTurns] = useState<TurnData[]>([]);
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [language, setLanguage] = useState(user?.preferredLanguage ?? "English");
  const [questionCount, setQuestionCount] = useState(String(prefs?.quizSize ?? 10));
  const [outputs, setOutputs] = useState<LectureOutput[]>(() =>
    prefs
      ? OUTPUT_OPTIONS.filter(({ key }) => prefs.outputs[key]).map(({ key }) => key)
      : ["notes", "quiz"],
  );
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const box = useRef<HTMLTextAreaElement>(null);
  const scrollTo = useRef("");
  useClearOnLeave();

  const busy = starting || Object.values(activeMap).some(Boolean);

  // The conversation only lives in this component's state, so it is cleared as soon as the student
  // leaves the page. (The generated lectures themselves stay in the Lecture History.)
  useEffect(() => {
    try {
      sessionStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      /* storage can be unavailable (private window) */
    }
  }, []);

  // the input grows with the text, up to a limit
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  // a new prompt scrolls its own block into view
  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(`turn-${scrollTo.current}`);
    scrollTo.current = "";
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [turns]);

  const onActive = useCallback((id: string, active: boolean) => {
    setActiveMap((current) => (current[id] === active ? current : { ...current, [id]: active }));
  }, []);

  const toggleOutput = (key: LectureOutput) =>
    setOutputs((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const submit = async () => {
    const text = prompt.trim();
    if (busy) return;
    if (text.length < 10) {
      toast.error("Please write a longer prompt (at least 10 characters).");
      return;
    }
    if (!outputs.length) {
      toast.error("Select at least one output (notes, quiz or study guide).");
      setShowOptions(true);
      return;
    }
    setStarting(true);
    try {
      // Server pipeline: write content -> create quiz -> save in Lecture History -> PDFs ready to download
      const created = await createPromptLecture({
        prompt: text,
        language,
        questionCount: Number(questionCount),
        outputs,
      });
      client.setQueryData(["lecture", created.id], created);
      void client.invalidateQueries({ queryKey: ["lectures"] });
      scrollTo.current = created.id;
      setTurns((current) => [...current, { id: created.id, prompt: text }]);
      setPrompt("");
      setShowOptions(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start generation");
    } finally {
      setStarting(false);
    }
  };

  const clear = () => {
    setTurns([]);
    setActiveMap({});
  };

  return (
    <>
      <style>{popDownCss}</style>
      <div className="mx-auto flex min-h-[calc(100vh-8.5rem)] max-w-3xl flex-col">
        <div className="flex-1 pb-8">
          {turns.length === 0 ? (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
              <h1 className="text-2xl font-semibold sm:text-3xl">What would you like to learn today?</h1>
              <p className="mt-3 max-w-md text-sm muted">
                Describe any topic. You get clear, concise notes and a quiz, saved to your Lecture History.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex justify-end">
                <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={clear} disabled={busy}>
                  Clear conversation
                </Button>
              </div>
              <div className="space-y-12">
                {turns.map((turn) => (
                  <Turn key={turn.id} id={turn.id} prompt={turn.prompt} onActive={onActive} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* input bar */}
        <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pb-4 pt-6 dark:from-slate-950 dark:via-slate-950 sm:-mx-6 sm:px-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {showOptions && (
              <div className="mb-3 grid gap-3 border-b border-slate-100 px-1 pb-3 dark:border-slate-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="label" htmlFor="prompt-language">
                    Language
                  </label>
                  <select
                    id="prompt-language"
                    className="field"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option>English</option>
                    <option>Sinhala</option>
                    <option>Tamil</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="prompt-questions">
                    Quiz questions
                  </label>
                  <select
                    id="prompt-questions"
                    className="field"
                    value={questionCount}
                    onChange={(event) => setQuestionCount(event.target.value)}
                  >
                    <option>5</option>
                    <option>10</option>
                    <option>15</option>
                    <option>20</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Outputs">
                  {OUTPUT_OPTIONS.map(({ key, label }) => {
                    const checked = outputs.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleOutput(key)}
                        className={`min-h-10 rounded-full border px-3 text-sm font-medium ${checked ? "border-primary bg-primary-soft text-primary dark:bg-purple-950" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <textarea
              ref={box}
              value={prompt}
              rows={1}
              maxLength={4000}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask anything"
              aria-label="What should we generate?"
              className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-slate-400"
            />

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowOptions((open) => !open)}
                aria-expanded={showOptions}
                className="flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Options
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || prompt.trim().length === 0}
                aria-label="Generate"
                title={busy ? "Please wait until the current content is finished" : "Generate (Enter)"}
                className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
