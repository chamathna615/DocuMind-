import { Link } from "react-router-dom";
import { AudioLines, BrainCircuit, Download, FileText, RotateCcw, Trash2, Video, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import type { AppLecture } from "@/api/lectureApi";
import { Progress } from "@/components/ui";
import { StatusBadge } from "@/components/common/shared";
import { cn, formatBytes } from "@/utils/helpers";

// Completed lectures open the notes, everything else opens the progress page.
export const lectureLink = (l: AppLecture) => (l.status === "completed" ? `/notes/${l.id}` : `/processing/${l.id}`);

export const isBusy = (l: AppLecture) =>
  Boolean(l.active) || ["uploaded", "validating", "preparing", "transcribing", "generating"].includes(l.status);
export const needsAttention = (l: AppLecture) => l.status === "failed" || l.status === "cancelled";

/** "3 Jun 2025". An invalid date shows a dash instead of crashing the whole dashboard. */
const shortDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "d MMM yyyy");
};

// Icon and colour of the tile on the left: what kind of material the lecture is made from.
function kindOf(l: AppLecture): { icon: LucideIcon; tile: string } {
  const type = String(l.fileType).toUpperCase();
  if (type === "TEXT") return { icon: FileText, tile: "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300" };
  if (/MP4|MOV|MKV|WEBM|AVI|VIDEO/.test(type))
    return { icon: Video, tile: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" };
  if (/MP3|WAV|M4A|AAC|OGG|FLAC|AUDIO/.test(type))
    return { icon: AudioLines, tile: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" };
  return { icon: FileText, tile: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

// The coloured stripe on the left edge shows the state at a glance.
function accentOf(l: AppLecture) {
  if (l.status === "completed") return "border-l-emerald-500";
  if (l.status === "failed") return "border-l-red-500";
  if (l.status === "cancelled") return "border-l-slate-300 dark:border-l-slate-600";
  return "border-l-primary";
}

const scoreTone = (percent: number) =>
  percent >= 80
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    : percent >= 60
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";

interface Props {
  lecture: AppLecture;
  /** true while a retry / cancel / delete of THIS lecture is running */
  working: boolean;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

export function LectureRow({ lecture: l, working, onRetry, onCancel, onDelete }: Props) {
  const { icon: Icon, tile } = kindOf(l);
  const busy = isBusy(l);
  const hasQuiz = l.outputs.includes("quiz");

  return (
    <article
      className={cn(
        "surface group flex flex-col gap-4 border-l-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:p-5",
        accentOf(l),
      )}
    >
      {/* what it is */}
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", tile)}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            title={l.status === "completed" ? "View notes" : "View progress"}
            to={lectureLink(l)}
            className="block truncate font-semibold text-black hover:underline dark:text-white"
          >
            {l.title}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs muted">
            {l.course && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {l.course}
              </span>
            )}
            <span>{l.fileType === "TEXT" ? "Prompt" : `${l.duration} · ${formatBytes(l.fileSize)}`}</span>
            <span aria-hidden="true">·</span>
            <span>{shortDate(l.uploadedAt)}</span>
          </p>

          {busy && (
            <div className="mt-3 flex items-center gap-3">
              <div className="max-w-xs flex-1">
                <Progress value={l.progress} label={`Progress of ${l.title}`} />
              </div>
              <span className="text-xs font-semibold muted">{l.progress}%</span>
            </div>
          )}
          {needsAttention(l) && l.errorMessage && (
            <p className="mt-2 max-w-md truncate text-xs text-red-600 dark:text-red-400" title={l.errorMessage}>
              {l.errorMessage}
            </p>
          )}
        </div>
      </div>

      {/* state, quiz result and actions */}
      <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-5">
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <StatusBadge status={l.status} />
          {l.quizPercent != null ? (
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", scoreTone(l.quizPercent))}>
              Quiz {l.quizPercent}%
            </span>
          ) : (
            l.status === "completed" && hasQuiz && <span className="text-xs muted">Quiz not taken</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {l.status === "completed" && (
            <>
              {hasQuiz && (
                <Link
                  title={l.quizPercent != null ? "Retake quiz" : "Take quiz"}
                  to={`/quiz/${l.id}`}
                  className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary dark:bg-purple-950"
                >
                  <BrainCircuit className="h-4 w-4" />
                  <span className="sr-only">Take quiz</span>
                </Link>
              )}
              <Link
                title="Downloads"
                to={`/downloads/${l.id}`}
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Downloads</span>
              </Link>
            </>
          )}
          {needsAttention(l) && (
            <button
              title="Try again"
              disabled={working}
              onClick={() => onRetry(l.id)}
              className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700 disabled:opacity-50 dark:bg-amber-950"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Try again</span>
            </button>
          )}
          {busy && (
            <button
              title="Cancel processing"
              disabled={working}
              onClick={() => onCancel(l.id)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <XCircle className="h-4 w-4" />
              <span className="sr-only">Cancel processing</span>
            </button>
          )}
          <button
            title="Delete"
            disabled={working}
            onClick={() => onDelete(l.id)}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </button>
        </div>
      </div>
    </article>
  );
}
