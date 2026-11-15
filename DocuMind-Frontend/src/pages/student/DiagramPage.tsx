import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Download, FileText, History, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  cancelDiagram,
  createDiagram,
  getDiagram,
  repairDiagram,
  retryDiagram,
  type DiagramOptions,
  type DiagramRequest,
} from "@/api/diagramApi";
import { Button } from "@/components/ui";
import { DiagramContext, MermaidBlock } from "@/components/common/MermaidBlock";
import { useAuth } from "@/contexts/AuthContext";
import { useClearOnLeave } from "@/utils/useClearOnLeave";
import { fileSlug, saveTextFile, splitSections } from "@/utils/codeFiles";
import { findMermaidBlocks } from "@/utils/mermaidBlocks";
import { CodeBlock, markdownComponents, textOf } from "@/pages/student/CodePage";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

interface TurnData {
  id: string; // diagram request id
  prompt: string; // what the student asked
}

// Keep this list in sync with DIAGRAM_TYPES in the backend (diagramService.js).
export const DIAGRAM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "flowchart", label: "Flowchart" },
  { value: "sequence", label: "Sequence diagram" },
  { value: "class", label: "Class diagram" },
  { value: "state", label: "State diagram" },
  { value: "er", label: "ER diagram" },
  { value: "gantt", label: "Gantt chart" },
  { value: "mindmap", label: "Mind map" },
  { value: "timeline", label: "Timeline" },
  { value: "pie", label: "Pie chart" },
  { value: "journey", label: "User journey" },
];

export const diagramTypeLabel = (value: string) =>
  value === "auto" ? "Auto-detect" : (DIAGRAM_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value);

const DETAIL_OPTIONS: Array<{ value: DiagramRequest["detail"]; label: string }> = [
  { value: "simple", label: "Simple" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
];

export const detailLabel = (value: DiagramRequest["detail"]) =>
  DETAIL_OPTIONS.find((item) => item.value === value)?.label ?? "Standard";

type Children = { children?: ReactNode };

/**
 * Markdown components for a diagram answer: the same as the code page, except that a ```mermaid block
 * is drawn as a diagram (MermaidBlock) instead of being shown as code.
 */
export function diagramMarkdownComponents(filename: string) {
  const DiagramPre = ({ children }: Children) => {
    const child = Array.isArray(children) ? children[0] : children;
    const props: { className?: string; children?: ReactNode } = isValidElement(child)
      ? (child.props as { className?: string; children?: ReactNode })
      : {};
    if (/language-mermaid\b/i.test(props.className ?? "")) {
      return <MermaidBlock code={textOf(props.children).replace(/\n$/, "")} filename={filename} />;
    }
    return <CodeBlock>{children}</CodeBlock>;
  };
  return { ...markdownComponents, pre: DiagramPre };
}

/** The Mermaid code of a finished answer, for the "Download code" button. */
export const mermaidCodeOf = (markdown: string) => findMermaidBlocks(markdown)[0]?.code ?? "";

const popDownCss = `
@keyframes pop-down {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-pop-down { animation: pop-down 0.5s ease-out both; }
@media (prefers-reduced-motion: reduce) { .animate-pop-down { animation: none; } }
`;

/* ------------------------------------------------------------------ */
/* One request + its generated answer                                  */
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

  const queryKey = ["diagram", id];
  const cached = client.getQueryData<DiagramRequest>(queryKey);
  const shouldPoll = !cached || Boolean(cached.active);

  // Poll every second while the server writes, so the answer appears almost as it is produced.
  const { data: job, isError } = useQuery({
    queryKey,
    queryFn: () => getDiagram(id),
    refetchInterval: shouldPoll ? 1000 : false,
    gcTime: 0, // dropped from the cache as soon as the student leaves the page
  });

  const isActive = Boolean(job?.active);
  const isCompleted = job?.status === "completed";
  const isStopped =
    Boolean(job) && !isActive && (job?.status === "failed" || job?.status === "cancelled" || job?.status === "queued");

  // After completion the saved answer replaces the live preview (the first part is identical).
  const incoming = isCompleted ? job?.result ?? "" : job?.preview ?? "";
  if (incoming) shown.current = incoming;
  const text = incoming || shown.current;
  const sections = splitSections(text);
  const components = useMemo(() => diagramMarkdownComponents(fileSlug(job?.title ?? "diagram")), [job?.title]);

  useEffect(() => {
    onActive(id, !isError && (!job || isActive));
  }, [id, job, isActive, isError, onActive]);

  useEffect(() => {
    if (job && !job.active) void client.invalidateQueries({ queryKey: ["diagram-list"] });
  }, [job?.active, job?.status, client]);

  const cancel = async () => {
    try {
      client.setQueryData(queryKey, await cancelDiagram(id));
      toast.info("Cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    }
  };

  const retry = async () => {
    try {
      client.setQueryData(queryKey, await retryDiagram(id));
      toast.success("Started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    }
  };

  // "Fix with AI": the server corrects the Mermaid code and returns the updated request
  const repair = useCallback(
    async (blockIndex: number, error: string) => {
      try {
        client.setQueryData(queryKey, await repairDiagram(id, { blockIndex, error }));
        toast.success("Diagram fixed");
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Could not fix the diagram");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, id],
  );

  const code = isCompleted ? mermaidCodeOf(text) : "";
  const downloadCode = () => {
    if (!code || !job) return;
    saveTextFile(`${fileSlug(job.title)}.mmd`, `${code}\n`);
    toast.success("Mermaid code downloaded");
  };
  const downloadMarkdown = () => {
    if (!job) return;
    saveTextFile(`${fileSlug(job.title)}.md`, `${text}\n`, "text/markdown");
    toast.success("Markdown downloaded");
  };

  return (
    <section id={`turn-${id}`} className="scroll-mt-20 space-y-6">
      {/* the student's prompt */}
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-primary-soft px-5 py-3 text-sm leading-6 dark:bg-purple-950">
          {prompt}
        </p>
      </div>

      {/* the generated diagram, appearing section by section */}
      <div className="min-w-0">
        {isError && <p className="text-sm text-red-600">This diagram could not be loaded.</p>}

        <DiagramContext.Provider value={{ text, onRepair: isCompleted ? repair : undefined }}>
          {sections.map((section, index) => (
            <div key={index} className="animate-pop-down" style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }}>
              <ReactMarkdown components={components}>{section}</ReactMarkdown>
            </div>
          ))}
        </DiagramContext.Provider>

        {!isError && !isCompleted && !isStopped && (
          <div className="mt-6 flex items-center gap-3 text-sm muted" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            {sections.length ? "Drawing your diagram…" : "Planning your diagram…"}
            <Button variant="ghost" className="min-h-9 px-3" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}

        {isStopped && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <p>{job?.status === "cancelled" ? "Cancelled." : job?.errorMessage || "Generation did not finish."}</p>
            <Button className="mt-3" onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              {job?.status === "cancelled" ? "Start again" : "Try again"}
            </Button>
          </div>
        )}

        {isCompleted && (
          <div className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {code && (
                <Button onClick={downloadCode}>
                  <Download className="h-4 w-4" />
                  Download code
                </Button>
              )}
              <Button variant="secondary" onClick={downloadMarkdown}>
                <FileText className="h-4 w-4" />
                Download Markdown
              </Button>
            </div>
            <p className="mt-3 text-xs text-emerald-700">
              Saved to your{" "}
              <Link to={`/generate-diagram/history/${id}`} className="font-semibold underline">
                diagram history
              </Link>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page: conversation on top, input bar at the bottom                  */
/* ------------------------------------------------------------------ */

export default function DiagramPage() {
  const client = useQueryClient();
  const { user } = useAuth();
  const [turns, setTurns] = useState<TurnData[]>([]);
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [diagramType, setDiagramType] = useState("auto");
  const [detail, setDetail] = useState<DiagramRequest["detail"]>("standard");
  // language of the labels and the explanation; Mermaid keywords always stay in English
  const [language, setLanguage] = useState(user?.preferredLanguage ?? "English");
  const [options, setOptions] = useState<DiagramOptions>({ explanation: true });
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const box = useRef<HTMLTextAreaElement>(null);
  const scrollTo = useRef("");
  useClearOnLeave();

  const busy = starting || Object.values(activeMap).some(Boolean);

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

  const submit = async () => {
    const text = prompt.trim();
    if (busy) return;
    if (text.length < 10) {
      toast.error("Please write a longer prompt (at least 10 characters).");
      return;
    }
    setStarting(true);
    try {
      // Server: the model writes Mermaid code (streamed) -> saved -> the page draws it with mermaid.js
      const created = await createDiagram({ prompt: text, diagramType, detail, language, options });
      client.setQueryData(["diagram", created.id], created);
      void client.invalidateQueries({ queryKey: ["diagram-list"] });
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
          <div className="mb-6 flex items-center justify-end gap-2">
            {turns.length > 0 && (
              <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={clear} disabled={busy}>
                Clear conversation
              </Button>
            )}
            <Link to="/generate-diagram/history">
              <Button variant="ghost" className="min-h-9 px-3 text-xs">
                <History className="h-4 w-4" />
                History
              </Button>
            </Link>
          </div>
          {turns.length === 0 ? (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
              <h1 className="text-2xl font-semibold sm:text-3xl">What would you like to visualize today?</h1>
              <p className="mt-3 max-w-md text-sm muted">
                Describe a process, system or idea. You get a diagram you can copy or download as SVG or PNG, with a
                short explanation.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {turns.map((turn) => (
                <Turn key={turn.id} id={turn.id} prompt={turn.prompt} onActive={onActive} />
              ))}
            </div>
          )}
        </div>

        {/* input bar */}
        <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pb-4 pt-6 dark:from-slate-950 dark:via-slate-950 sm:-mx-6 sm:px-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {showOptions && (
              <div className="mb-3 grid gap-3 border-b border-slate-100 px-1 pb-3 dark:border-slate-800 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="diagram-type">
                    Diagram type
                  </label>
                  <select
                    id="diagram-type"
                    className="field"
                    value={diagramType}
                    onChange={(event) => setDiagramType(event.target.value)}
                  >
                    <option value="auto">Auto-detect</option>
                    {DIAGRAM_TYPE_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="diagram-detail">
                    Level of detail
                  </label>
                  <select
                    id="diagram-detail"
                    className="field"
                    value={detail}
                    onChange={(event) => setDetail(event.target.value as DiagramRequest["detail"])}
                  >
                    {DETAIL_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="diagram-language">
                    Language
                  </label>
                  <select
                    id="diagram-language"
                    className="field"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option>English</option>
                    <option>Sinhala</option>
                    <option>Tamil</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-3" role="group" aria-label="Extras">
                  <button
                    type="button"
                    aria-pressed={options.explanation}
                    onClick={() => setOptions((current) => ({ ...current, explanation: !current.explanation }))}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium ${options.explanation ? "border-primary bg-primary-soft text-primary dark:bg-purple-950" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}
                  >
                    Explanation
                  </button>
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
              placeholder="Describe the diagram you need"
              aria-label="What diagram should we generate?"
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
                title={busy ? "Please wait until the current diagram is finished" : "Generate (Enter)"}
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
