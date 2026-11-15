import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Code2, Plus, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { listCode } from "@/api/codeApi";
import { listDiagrams } from "@/api/diagramApi";
import { Card, Skeleton } from "@/components/ui";
import { StatusBadge } from "@/pages/student/CodeHistoryPage";
import { detailLabel, diagramTypeLabel } from "@/pages/student/DiagramPage";

const SHOWN = 4; // how many recent requests each card lists

interface Entry {
  id: string;
  title: string;
  prompt: string;
  chips: string[];
  createdAt: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  href: string;
}

/** "3 hours ago". A missing or invalid date shows nothing instead of crashing the dashboard. */
function ago(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDistanceToNow(date, { addSuffix: true });
}

interface CardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** Colours of the icon tile, the header wash and the chips, so the two cards are easy to tell apart. */
  tone: { tile: string; wash: string; chip: string };
  allHref: string;
  newHref: string;
  newLabel: string;
  emptyTitle: string;
  emptyText: string;
  entries: Entry[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

function HistoryCard(props: CardProps) {
  const { icon: Icon, tone, entries } = props;

  let body: ReactNode;
  if (props.isLoading) {
    body = (
      <div className="space-y-3 p-4" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  } else if (props.isError) {
    body = (
      <div className="p-6 text-center text-sm">
        <p className="text-red-600">Could not load this history.</p>
        <button type="button" onClick={props.retry} className="mt-2 font-semibold text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <div className="px-6 py-10 text-center">
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${tone.tile}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-semibold">{props.emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm muted">{props.emptyText}</p>
        <Link
          to={props.newHref}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {props.newLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-1 p-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              to={entry.href}
              className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.tile}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold group-hover:text-primary">{entry.title}</span>
                <span className="mt-0.5 block truncate text-xs muted">{entry.prompt}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {entry.chips.map((chip) => (
                    <span key={chip} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
                      {chip}
                    </span>
                  ))}
                  <span className="text-[11px] muted">{ago(entry.createdAt)}</span>
                </span>
              </span>
              {entry.status === "completed" ? (
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              ) : (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={entry.status} />
                  {(entry.status === "processing" || entry.status === "queued") && entry.progress > 0 && (
                    <span className="text-[11px] muted">{entry.progress}%</span>
                  )}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className={`flex items-center gap-3 bg-gradient-to-r px-5 py-4 ${tone.wash}`}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm ${tone.tile}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{props.title}</h3>
          <p className="text-xs muted">
            {props.isLoading || props.isError
              ? props.subtitle
              : props.total
                ? `${props.total} request${props.total === 1 ? "" : "s"} · ${props.subtitle}`
                : props.subtitle}
          </p>
        </div>
        {props.total > 0 && (
          <Link
            to={props.allHref}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="flex-1 border-t border-slate-100 dark:border-slate-800">{body}</div>

      {entries.length > 0 && (
        <Link
          to={props.newHref}
          className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-primary dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {props.newLabel}
        </Link>
      )}
    </Card>
  );
}

/**
 * The newest "Generate code" and "Generate diagram" requests, side by side, for the dashboard.
 * They use the same query keys as the two history pages, so both always show the same data.
 */
export default function GenerationHistory() {
  // while something is still being written the list refreshes every few seconds
  const code = useQuery({
    queryKey: ["code-list"],
    queryFn: listCode,
    refetchInterval: (query) => (query.state.data?.some((item) => item.active) ? 3000 : false),
  });
  const diagrams = useQuery({
    queryKey: ["diagram-list"],
    queryFn: listDiagrams,
    refetchInterval: (query) => (query.state.data?.some((item) => item.active) ? 3000 : false),
  });

  const codeEntries = useMemo<Entry[]>(
    () =>
      (code.data ?? []).slice(0, SHOWN).map((item) => ({
        id: item.id,
        title: item.title,
        prompt: item.prompt,
        chips: [
          item.programmingLanguage === "auto" ? "Auto-detect" : item.programmingLanguage,
          ...(item.language !== "English" ? [item.language] : []),
        ],
        createdAt: item.createdAt,
        status: item.status,
        progress: item.progress,
        href: `/generate-code/history/${item.id}`,
      })),
    [code.data],
  );

  const diagramEntries = useMemo<Entry[]>(
    () =>
      (diagrams.data ?? []).slice(0, SHOWN).map((item) => ({
        id: item.id,
        title: item.title,
        prompt: item.prompt,
        chips: [
          diagramTypeLabel(item.diagramType),
          detailLabel(item.detail),
          ...(item.language !== "English" ? [item.language] : []),
        ],
        createdAt: item.createdAt,
        status: item.status,
        progress: item.progress,
        href: `/generate-diagram/history/${item.id}`,
      })),
    [diagrams.data],
  );

  return (
    <section className="mt-8" aria-labelledby="generations-heading">
      <h2 id="generations-heading" className="mb-4 text-xl font-bold">
        Code &amp; Diagram History
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryCard
          title="Generated code"
          subtitle="Your latest snippets"
          icon={Code2}
          tone={{
            tile: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
            wash: "from-blue-50/80 to-transparent dark:from-blue-950/40",
            chip: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
          }}
          allHref="/generate-code/history"
          newHref="/generate-code"
          newLabel="Generate new code"
          emptyTitle="No code generated yet"
          emptyText="Describe what you need and get working code with an explanation."
          entries={codeEntries}
          total={code.data?.length ?? 0}
          isLoading={code.isLoading}
          isError={code.isError}
          retry={() => void code.refetch()}
        />
        <HistoryCard
          title="Generated diagrams"
          subtitle="Your latest visuals"
          icon={Workflow}
          tone={{
            tile: "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300",
            wash: "from-purple-50/80 to-transparent dark:from-purple-950/40",
            chip: "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300",
          }}
          allHref="/generate-diagram/history"
          newHref="/generate-diagram"
          newLabel="Generate new diagram"
          emptyTitle="No diagrams generated yet"
          emptyText="Describe a process or system and get a diagram you can download."
          entries={diagramEntries}
          total={diagrams.data?.length ?? 0}
          isLoading={diagrams.isLoading}
          isError={diagrams.isError}
          retry={() => void diagrams.refetch()}
        />
      </div>
    </section>
  );
}
