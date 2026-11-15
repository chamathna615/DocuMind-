import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Lightbulb,
  Loader2,
  Target,
  UploadCloud,
} from "lucide-react";
import { format, isSameDay, subDays } from "date-fns";
import { toast } from "sonner";
import {
  cancelLecture,
  deleteLecture,
  getLectureHistory,
  retryLecture,
  searchLectureIds,
  type AppLecture,
} from "@/api/lectureApi";
import { getMyAnalytics } from "@/api/analyticsApi";
import { listCode } from "@/api/codeApi";
import { listDiagrams } from "@/api/diagramApi";
import { Button, Card, Skeleton } from "@/components/ui";
import GenerationHistory from "@/components/common/GenerationHistory";
import { LectureRow, isBusy, needsAttention } from "@/components/common/LectureRow";
import { EmptyState, ErrorState, LoadingCards, PageHeader, SearchInput } from "@/components/common/shared";
import { useAuth } from "@/contexts/AuthContext";

const PAGE_SIZE = 5;

type Filter = "all" | "completed" | "progress" | "attention";
type Sort = "newest" | "oldest" | "title" | "score";

const FILTERS: Array<{ key: Filter; label: string; test: (l: AppLecture) => boolean }> = [
  { key: "all", label: "All", test: () => true },
  { key: "completed", label: "Completed", test: (l) => l.status === "completed" },
  { key: "progress", label: "In progress", test: isBusy },
  { key: "attention", label: "Needs attention", test: needsAttention },
];

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
};

export default function DashboardPage() {
  const { user } = useAuth();
  const client = useQueryClient();

  // While any lecture is still being processed, refresh the list every 5 seconds.
  const cached = client.getQueryData<AppLecture[]>(["lectures"]);
  const polling = cached?.some(isBusy) ? 5000 : false;
  const {
    data = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["lectures"],
    queryFn: getLectureHistory,
    refetchInterval: polling,
  });
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: getMyAnalytics, refetchInterval: polling });
  // Code and diagram requests (same query keys as the history cards, so they share one cache).
  const codeList = useQuery({ queryKey: ["code-list"], queryFn: listCode });
  const diagramList = useQuery({ queryKey: ["diagram-list"], queryFn: listDiagrams });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [course, setCourse] = useState("all");
  const [page, setPage] = useState(1);
  const [working, setWorking] = useState<string | null>(null);

  // Typing is matched at once against the titles in the list. After a short pause the server also looks
  // inside the generated notes, study guides and transcripts, so a word from the content finds the lecture too.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const contentSearch = useQuery({
    queryKey: ["lecture-search", debounced],
    queryFn: () => searchLectureIds(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const contentIds = useMemo(
    // only used while it belongs to what is typed right now (not to an earlier, half-typed word)
    () => new Set(debounced.length >= 2 && debounced === search.trim() ? (contentSearch.data ?? []) : []),
    [contentSearch.data, debounced, search],
  );

  const courses = useMemo(() => [...new Set(data.map((l) => l.course).filter(Boolean))].sort(), [data]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, data.filter(f.test).length])) as Record<Filter, number>,
    [data],
  );

  const filtered = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)?.test ?? (() => true);
    // every word typed must appear somewhere in the lecture's details (any order, ignoring case and punctuation)
    const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
    const words = normalise(search).split(" ").filter(Boolean);
    const list = data.filter((l) => {
      if (!test(l) || (course !== "all" && l.course !== course)) return false;
      if (!words.length) return true;
      const text = normalise(`${l.title} ${l.course} ${l.filename} ${l.fileType} ${l.status} ${l.language ?? ""}`);
      return words.every((w) => text.includes(w)) || contentIds.has(l.id);
    });
    const time = (l: AppLecture) => new Date(l.uploadedAt).getTime();
    return [...list].sort((a, b) => {
      if (sort === "oldest") return time(a) - time(b);
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "score") return (b.quizPercent ?? -1) - (a.quizPercent ?? -1);
      return time(b) - time(a);
    });
  }, [data, filter, course, search, sort, contentIds]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // Last 7 days: how many lectures, code requests and diagrams were created each day.
  const week = useMemo(() => {
    const today = new Date();
    const created = [
      ...data.map((l) => new Date(l.uploadedAt)),
      ...(codeList.data ?? []).map((c) => new Date(c.createdAt)),
      ...(diagramList.data ?? []).map((d) => new Date(d.createdAt)),
    ];
    return Array.from({ length: 7 }, (_, i) => {
      const day = subDays(today, 6 - i);
      return {
        day,
        count: created.filter((date) => isSameDay(date, day)).length,
      };
    });
  }, [data, codeList.data, diagramList.data]);
  const weekTotal = week.reduce((sum, d) => sum + d.count, 0);
  const weekMax = Math.max(1, ...week.map((d) => d.count));

  // "What to do next": real suggestions based on the student's own lectures.
  const suggestions = useMemo(() => {
    const items: Array<{ key: string; icon: typeof Lightbulb; text: string; to: string; cta: string }> = [];
    data.filter(needsAttention).slice(0, 1).forEach((l) =>
      items.push({
        key: `fix-${l.id}`,
        icon: AlertTriangle,
        text: `“${l.title}” did not finish processing.`,
        to: `/processing/${l.id}`,
        cta: "Open and retry",
      }),
    );
    data
      .filter((l) => isBusy(l))
      .slice(0, 1)
      .forEach((l) =>
        items.push({
          key: `busy-${l.id}`,
          icon: Loader2,
          text: `“${l.title}” is being generated (${l.progress}%).`,
          to: `/processing/${l.id}`,
          cta: "View progress",
        }),
      );
    // code and diagram requests that are being written right now, or that did not finish
    type Slim = { id: string; title: string; active: boolean; status: string; progress: number };
    const generations: Array<{ kind: string; noun: string; list: Slim[]; base: string }> = [
      { kind: "code", noun: "Code", list: codeList.data ?? [], base: "/generate-code/history" },
      { kind: "diagram", noun: "Diagram", list: diagramList.data ?? [], base: "/generate-diagram/history" },
    ];
    for (const { kind, noun, list, base } of generations) {
      list
        .filter((g) => g.active)
        .slice(0, 1)
        .forEach((g) =>
          items.push({
            key: `${kind}-busy-${g.id}`,
            icon: Loader2,
            text: `${noun} request “${g.title}” is being written (${g.progress}%).`,
            to: `${base}/${g.id}`,
            cta: "Watch progress",
          }),
        );
      list
        .filter((g) => g.status === "failed")
        .slice(0, 1)
        .forEach((g) =>
          items.push({
            key: `${kind}-fix-${g.id}`,
            icon: AlertTriangle,
            text: `${noun} request “${g.title}” did not finish.`,
            to: `${base}/${g.id}`,
            cta: "Open and retry",
          }),
        );
    }
    data
      .filter((l) => l.status === "completed" && l.outputs.includes("quiz") && l.quizPercent == null)
      .slice(0, 2)
      .forEach((l) =>
        items.push({
          key: `quiz-${l.id}`,
          icon: BrainCircuit,
          text: `Test yourself on “${l.title}”. You have not taken its quiz yet.`,
          to: `/quiz/${l.id}`,
          cta: "Take quiz",
        }),
      );
    data
      .filter((l) => l.quizPercent != null && l.quizPercent < 60)
      .slice(0, 1)
      .forEach((l) =>
        items.push({
          key: `review-${l.id}`,
          icon: Lightbulb,
          text: `You scored ${l.quizPercent}% on “${l.title}”. Review the notes, then try again.`,
          to: `/notes/${l.id}`,
          cta: "Review notes",
        }),
      );
    return items.slice(0, 5);
  }, [data, codeList.data, diagramList.data]);
  const hasGenerations = (codeList.data?.length ?? 0) + (diagramList.data?.length ?? 0) > 0;

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["lectures"] });
    void client.invalidateQueries({ queryKey: ["analytics"] });
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this lecture and all its generated notes, quizzes and results?")) return;
    setWorking(id);
    try {
      await deleteLecture(id);
      invalidate();
      toast.success("Lecture deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the lecture");
    } finally {
      setWorking(null);
    }
  };

  const retry = async (id: string) => {
    setWorking(id);
    try {
      await retryLecture(id);
      invalidate();
      toast.success("Processing started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart the lecture");
    } finally {
      setWorking(null);
    }
  };

  const cancel = async (id: string) => {
    setWorking(id);
    try {
      await cancelLecture(id);
      invalidate();
      toast.success("Processing cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the lecture");
    } finally {
      setWorking(null);
    }
  };

  if (isError) return <ErrorState retry={refetch} />;

  const quiz = analytics.data?.quiz;
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        eyebrow={format(new Date(), "EEEE, d MMMM yyyy")}
        title={`Good ${greeting()}, ${firstName}`}
        description="Create notes, code and diagrams in one place, and pick up where you left off."
      />
      <h2 className="mb-4 text-xl font-bold">Your progress</h2>
      {isLoading ? (
        <LoadingCards />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total lectures"
            value={data.length}
            note={
              analytics.data?.totals.minutesOfRecordings
                ? `${analytics.data.totals.minutesOfRecordings} min of recordings`
                : "Uploads and prompts"
            }
            icon={UploadCloud}
          />
          <Stat
            label="Completed lectures"
            value={counts.completed}
            note={
              counts.progress
                ? `${counts.progress} in progress`
                : counts.attention
                  ? `${counts.attention} need attention`
                  : "Ready to study"
            }
            icon={BookOpenCheck}
          />
          <Stat
            label="Quizzes attempted"
            value={quiz?.attempts ?? 0}
            note={quiz?.lecturesAttempted ? `Across ${quiz.lecturesAttempted} lecture(s)` : "Keep it going"}
            icon={BrainCircuit}
          />
          <Stat
            label="Average quiz score"
            value={quiz?.averagePercent != null ? `${quiz.averagePercent}%` : "—"}
            note={quiz?.bestPercent != null ? `Best: ${quiz.bestPercent}%` : "Take a quiz to see this"}
            icon={Target}
          />
        </div>
      )}

      {!isLoading && (data.length > 0 || hasGenerations) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
              What to do next
            </h2>
            {suggestions.length ? (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {suggestions.map(({ key, icon: Icon, text, to, cta }) => (
                  <li key={key} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                    <Icon
                      className={`h-5 w-5 shrink-0 text-primary ${Icon === Loader2 ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{text}</span>
                    <Link to={to} className="flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">
                      {cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm muted">
                You&apos;re all caught up. Start something new above, or open anything from your history below.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Last 7 days</h2>
            <p className="mt-1 text-xs muted">
              {weekTotal ? `${weekTotal} item${weekTotal === 1 ? "" : "s"} created` : "Nothing created yet this week"}
            </p>
            <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label={`${weekTotal} lectures, code requests and diagrams created in the last 7 days`}>
              {week.map(({ day, count }) => (
                <div key={day.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold muted">{count || ""}</span>
                  <span
                    className={`w-full rounded-t-md ${count ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"}`}
                    style={{ height: `${count ? Math.max(12, (count / weekMax) * 64) : 4}px` }}
                  />
                  <span className="text-[10px] muted">{format(day, "EEEEE")}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!!analytics.data?.recentAttempts.length && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Recent quiz scores</h2>
          <ul className="mt-4 space-y-3">
            {analytics.data.recentAttempts.slice(0, 5).map((a, i) => (
              <li key={`${a.takenAt}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
                {a.lectureId ? (
                  <Link to={`/quiz/${a.lectureId}/results`} className="truncate hover:text-primary hover:underline">
                    {a.title}
                  </Link>
                ) : (
                  <span className="truncate">{a.title}</span>
                )}
                <span className="font-semibold">{a.percent}%</span>
                <span className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span
                    className={`block h-full rounded-full ${a.percent >= 80 ? "bg-emerald-500" : a.percent >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${a.percent}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GenerationHistory />

      {/* ---------------------------- Lecture History ---------------------------- */}
      <section className="mt-8" aria-labelledby="lecture-history-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="lecture-history-heading" className="text-xl font-bold">
              Lecture History
            </h2>
            <p className="mt-1 text-sm muted">
              {data.length
                ? `${data.length} lecture${data.length === 1 ? "" : "s"} · newest and most relevant first`
                : "Everything you upload or write will be listed here."}
            </p>
          </div>
        </div>

        {/* search + sorting */}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search titles, notes and topics"
            />
          </div>
          {courses.length > 1 && (
            <select
              aria-label="Filter by course"
              className="field sm:w-44"
              value={course}
              onChange={(event) => {
                setCourse(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Sort lectures"
            className="field sm:w-40"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as Sort);
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="score">Best quiz score</option>
          </select>
        </div>

        {/* status tabs (a segmented control that scrolls sideways on small screens) */}
        <div className="mb-5 overflow-x-auto pb-1">
          <div
            className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
            role="group"
            aria-label="Filter by status"
          >
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  filter === key
                    ? "bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-purple-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    filter === key
                      ? "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No lectures found"
            description={
              data.length
                ? "Try adjusting your search or filters."
                : "No lectures yet. Upload your first lecture recording or write a prompt to generate notes and quizzes."
            }
            action={
              <Link to="/upload">
                <Button>Upload lecture</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-3">
              {rows.map((l) => (
                <LectureRow
                  key={l.id}
                  lecture={l}
                  working={working === l.id}
                  onRetry={(id) => void retry(id)}
                  onCancel={(id) => void cancel(id)}
                  onDelete={(id) => void remove(id)}
                />
              ))}
            </div>

            {filtered.length > PAGE_SIZE && (
              <nav
                aria-label="Lecture pages"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="muted">
                  Page {current} of {pages}
                  <span className="ml-2 text-xs">
                    ({(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length})
                  </span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="min-h-9"
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    className="min-h-9"
                    disabled={current >= pages}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof UploadCloud;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium muted">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary dark:bg-purple-950">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs muted">{note}</p>
    </Card>
  );
}
