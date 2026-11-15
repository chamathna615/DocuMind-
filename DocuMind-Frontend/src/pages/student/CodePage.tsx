import { isValidElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Check, Copy, Download, FileText, History, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  cancelCode,
  createCode,
  getCode,
  retryCode,
  type CodeOptions,
  type CodeRequest,
} from "@/api/codeApi";
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useClearOnLeave } from "@/utils/useClearOnLeave";
import { extensionFor, extractCodeBlocks, fileSlug, saveTextFile, splitSections } from "@/utils/codeFiles";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

interface TurnData {
  id: string; // code request id
  prompt: string; // what the student asked
}

// Keep this list in sync with PROGRAMMING_LANGUAGES in the backend (codeController.js).
const PROGRAMMING_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "C",
  "Go",
  "Rust",
  "PHP",
  "Ruby",
  "Kotlin",
  "Swift",
  "Dart",
  "SQL",
  "Bash",
  "HTML/CSS",
  "R",
];

// The code itself is always generated; these are the extra parts the student can switch on or off.
const EXTRA_OPTIONS: Array<{ key: keyof CodeOptions; label: string }> = [
  { key: "explanation", label: "Explanation" },
  { key: "example", label: "Example usage" },
  { key: "tests", label: "Unit tests" },
];

type Children = { children?: ReactNode };

// text inside a rendered <code> element (react-markdown gives a string, sometimes split in parts)
export const textOf = (node: ReactNode): string =>
  typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join("") : "";

export function CodeBlock({ children }: Children) {
  const [copied, setCopied] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const props: { className?: string; children?: ReactNode } = isValidElement(child)
    ? (child.props as { className?: string; children?: ReactNode })
    : {};
  const language = /language-(\S+)/.exec(props.className ?? "")?.[1] ?? "";
  const code = textOf(props.children).replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the code and copy it manually.");
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-300">
        <span className="font-semibold uppercase tracking-wide">{language || "code"}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex min-h-8 items-center gap-1.5 rounded-md px-2 hover:bg-slate-800"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const markdownComponents = {
  h1: ({ children }: Children) => <h1 className="mt-8 text-3xl font-bold first:mt-0">{children}</h1>,
  h2: ({ children }: Children) => <h2 className="mt-8 text-2xl font-bold first:mt-0">{children}</h2>,
  h3: ({ children }: Children) => <h3 className="mt-6 text-lg font-semibold">{children}</h3>,
  p: ({ children }: Children) => <p className="mt-4 leading-7 muted">{children}</p>,
  ul: ({ children }: Children) => <ul className="mt-4 list-disc space-y-2 pl-6 muted">{children}</ul>,
  ol: ({ children }: Children) => <ol className="mt-4 list-decimal space-y-2 pl-6 muted">{children}</ol>,
  // block code is drawn by CodeBlock (through "pre"); this one is for `inline code`
  code: ({ children }: Children) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] dark:bg-slate-800">{children}</code>
  ),
  pre: CodeBlock,
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

  const queryKey = ["code", id];
  const cached = client.getQueryData<CodeRequest>(queryKey);
  const shouldPoll = !cached || Boolean(cached.active);

  // Poll every second while the server writes, so the code appears almost as it is produced.
  const { data: job, isError } = useQuery({
    queryKey,
    queryFn: () => getCode(id),
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

  useEffect(() => {
    onActive(id, !isError && (!job || isActive));
  }, [id, job, isActive, isError, onActive]);

  const cancel = async () => {
    try {
      client.setQueryData(queryKey, await cancelCode(id));
      toast.info("Cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    }
  };

  const retry = async () => {
    try {
      client.setQueryData(queryKey, await retryCode(id));
      toast.success("Started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    }
  };

  const blocks = isCompleted ? extractCodeBlocks(text) : [];
  const downloadCode = () => {
    const main = blocks[0];
    if (!main || !job) return;
    saveTextFile(`${fileSlug(job.title)}.${extensionFor(main.language)}`, `${main.code}\n`);
    toast.success("Code downloaded");
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

      {/* the generated code, appearing section by section */}
      <div className="min-w-0">
        {isError && <p className="text-sm text-red-600">This code could not be loaded.</p>}

        {sections.map((section, index) => (
          <div key={index} className="animate-pop-down" style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }}>
            <ReactMarkdown components={markdownComponents}>{section}</ReactMarkdown>
          </div>
        ))}

        {!isError && !isCompleted && !isStopped && (
          <div className="mt-6 flex items-center gap-3 text-sm muted" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            {sections.length ? "Writing code…" : "Planning your solution…"}
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
              {blocks.length > 0 && (
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
              <Link to={`/generate-code/history/${id}`} className="font-semibold underline">
                code history
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

export default function CodePage() {
  const client = useQueryClient();
  const { user } = useAuth();
  const [turns, setTurns] = useState<TurnData[]>([]);
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [programmingLanguage, setProgrammingLanguage] = useState("auto");
  // language of the explanation; the code and its comments are always English
  const [language, setLanguage] = useState(user?.preferredLanguage ?? "English");
  const [options, setOptions] = useState<CodeOptions>({ explanation: true, example: true, tests: false });
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

  const toggleOption = (key: keyof CodeOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));

  const submit = async () => {
    const text = prompt.trim();
    if (busy) return;
    if (text.length < 10) {
      toast.error("Please write a longer prompt (at least 10 characters).");
      return;
    }
    setStarting(true);
    try {
      // Server: write the code (streamed) -> save it -> the page shows it while it is written
      const created = await createCode({ prompt: text, programmingLanguage, language, options });
      client.setQueryData(["code", created.id], created);
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
            <Link to="/generate-code/history">
              <Button variant="ghost" className="min-h-9 px-3 text-xs">
                <History className="h-4 w-4" />
                History
              </Button>
            </Link>
          </div>
          {turns.length === 0 ? (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
              <h1 className="text-2xl font-semibold sm:text-3xl">What would you like to build today?</h1>
              <p className="mt-3 max-w-md text-sm muted">
                Describe the code you need. You get working code, a short explanation and an example.
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
              <div className="mb-3 grid gap-3 border-b border-slate-100 px-1 pb-3 dark:border-slate-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="label" htmlFor="code-language">
                    Programming language
                  </label>
                  <select
                    id="code-language"
                    className="field"
                    value={programmingLanguage}
                    onChange={(event) => setProgrammingLanguage(event.target.value)}
                  >
                    <option value="auto">Auto-detect</option>
                    {PROGRAMMING_LANGUAGES.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="code-explanation-language">
                    Explanation language
                  </label>
                  <select
                    id="code-explanation-language"
                    className="field"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option>English</option>
                    <option>Sinhala</option>
                    <option>Tamil</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Extras">
                  {EXTRA_OPTIONS.map(({ key, label }) => {
                    const checked = options[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleOption(key)}
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
              placeholder="Describe the code you need"
              aria-label="What code should we generate?"
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
                title={busy ? "Please wait until the current code is finished" : "Generate (Enter)"}
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
