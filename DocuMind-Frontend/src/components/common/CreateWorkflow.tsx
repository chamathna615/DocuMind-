import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Code2, FileText, History, UploadCloud, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listCode } from "@/api/codeApi";
import { listDiagrams } from "@/api/diagramApi";
import { Card } from "@/components/ui";

interface Action {
  to: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

interface Option {
  key: string;
  title: string;
  icon: LucideIcon;
  /** Colours of the icon tile and of the small option labels (same colours as the history cards below). */
  tile: string;
  chip: string;
  give: string;
  get: string;
  highlights: string[];
  actions: Action[];
  noun: string;
  historyHref: string;
  historyLabel: string;
}

const STEPS = ["Choose what to create", "Watch it generate", "Review and download"];

const primaryAction =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6245b7]";
const secondaryAction =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800";

const OPTIONS: Option[] = [
  {
    key: "lecture",
    title: "Lecture notes & quiz",
    icon: UploadCloud,
    tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    give: "An MP3, MP4 or PDF, or a written prompt",
    get: "Summary notes, a study guide, a transcript and a quiz",
    highlights: ["MP3 · MP4 · PDF", "Notes", "Quiz", "Transcript"],
    actions: [
      { to: "/upload", label: "Upload lecture", icon: UploadCloud, primary: true },
      { to: "/write-prompt", label: "Write a prompt", icon: FileText },
    ],
    noun: "lecture",
    historyHref: "#lecture-history-heading",
    historyLabel: "See lectures",
  },
  {
    key: "code",
    title: "Generate code",
    icon: Code2,
    tile: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    give: "A plain-words description of the program you need",
    get: "Working code with an explanation, example usage and optional tests",
    highlights: ["Any language", "English · Sinhala · Tamil", "Copy or download"],
    actions: [{ to: "/generate-code", label: "Generate code", icon: Code2, primary: true }],
    noun: "code request",
    historyHref: "/generate-code/history",
    historyLabel: "View history",
  },
  {
    key: "diagram",
    title: "Generate diagram",
    icon: Workflow,
    tile: "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300",
    chip: "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300",
    give: "A description of a process, system or idea",
    get: "A clean diagram with a short explanation, ready to export",
    highlights: ["10 diagram types", "Simple to detailed", "SVG · PNG · Mermaid", "Fix with AI"],
    actions: [{ to: "/generate-diagram", label: "Generate diagram", icon: Workflow, primary: true }],
    noun: "diagram",
    historyHref: "/generate-diagram/history",
    historyLabel: "View history",
  },
];

/**
 * "Start something new": the one place on the dashboard where a student chooses what to create.
 * Lectures, code and diagrams follow the same path (choose, generate, review), and each card links to its own history.
 */
export default function CreateWorkflow({ lectureCount }: { lectureCount?: number }) {
  // the same query keys as the history cards, so the numbers always match and nothing is loaded twice
  const code = useQuery({ queryKey: ["code-list"], queryFn: listCode });
  const diagrams = useQuery({ queryKey: ["diagram-list"], queryFn: listDiagrams });

  const counts: Record<string, number | undefined> = {
    lecture: lectureCount,
    code: code.isError ? undefined : code.data?.length,
    diagram: diagrams.isError ? undefined : diagrams.data?.length,
  };

  return (
    <section aria-labelledby="start-heading">
      <h2 id="start-heading" className="text-xl font-bold">
        Start something new
      </h2>
      <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm muted">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary dark:bg-purple-950 dark:text-purple-300">
              {index + 1}
            </span>
            {step}
            {index < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const count = counts[option.key];
          const countText =
            count === undefined
              ? "Loading…"
              : count === 0
                ? `No ${option.noun}s yet`
                : `${count} ${option.noun}${count === 1 ? "" : "s"} so far`;
          const historyClass = "flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline";
          return (
            <Card key={option.key} className="flex flex-col p-5">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${option.tile}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-semibold">{option.title}</h3>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide muted">You give</dt>
                  <dd className="mt-0.5">{option.give}</dd>
                </div>
                <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                  <dt className="text-xs font-semibold uppercase tracking-wide muted">You get</dt>
                  <dd className="mt-0.5">{option.get}</dd>
                </div>
              </dl>

              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${option.title} options`}>
                {option.highlights.map((item) => (
                  <li key={item} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${option.chip}`}>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                {option.actions.map(({ to, label, icon: ActionIcon, primary }) => (
                  <Link key={to} to={to} className={primary ? primaryAction : secondaryAction}>
                    <ActionIcon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <span className="flex items-center gap-1.5 muted">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {countText}
                </span>
                {option.historyHref.startsWith("#") ? (
                  <a href={option.historyHref} className={historyClass}>
                    {option.historyLabel}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <Link to={option.historyHref} className={historyClass}>
                    {option.historyLabel}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
