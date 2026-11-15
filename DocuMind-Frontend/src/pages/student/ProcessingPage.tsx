import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Download, FolderOpen, Loader2, PauseCircle, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelLecture,
  downloadLectureFile,
  getGeneratedNotes,
  getLecture,
  getTutorial,
  retryLecture,
  type AppLecture,
} from "@/api/lectureApi";
import { Button, Card, Skeleton } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/common/shared";
import { useClearOnLeave } from "@/utils/useClearOnLeave";

export default function ProcessingPage() {
  const { uploadId = "" } = useParams();
  const client = useQueryClient();
  const queryKey = ["lecture", uploadId];
  const [downloading, setDownloading] = useState(false);
  useClearOnLeave();

  // Keep polling every 2 seconds while the server is still working on this lecture.
  const cached = client.getQueryData<AppLecture>(queryKey);
  const shouldPoll = !cached || Boolean(cached.active);

  const { data: lecture, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getLecture(uploadId),
    refetchInterval: shouldPoll ? 2000 : false,
    gcTime: 0, // dropped from the cache as soon as the student leaves the page
  });

  const wanted = ((lecture?.outputs ?? []) as string[]);
  const isCompleted = lecture?.status === "completed";
  // Summary notes and the study guide are shown as two tabs on this page when both were requested.
  const [tab, setTab] = useState<"notes" | "tutorial" | null>(null);
  const hasNotes = wanted.includes("notes");
  const hasTutorial = wanted.includes("tutorial");
  const contentKind: "notes" | "tutorial" | null =
    tab && wanted.includes(tab) ? tab : hasNotes ? "notes" : hasTutorial ? "tutorial" : null;

  // The generated text is loaded only once everything is finished.
  const content = useQuery({
    queryKey: ["content", uploadId, contentKind],
    queryFn: () => (contentKind === "notes" ? getGeneratedNotes(uploadId) : getTutorial(uploadId)),
    enabled: isCompleted && contentKind !== null,
    gcTime: 0,
  });

  // when the job finishes, refresh the dashboard data
  useEffect(() => {
    if (lecture && !lecture.active) {
      void client.invalidateQueries({ queryKey: ["lectures"] });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    }
  }, [lecture?.active, lecture?.status, client]);

  if (isError)
    return (
      <>
        <PageHeader title="Lecture" />
        <EmptyState
          title="Lecture not found"
          description="This lecture may have been deleted."
          action={<Link to="/dashboard"><Button>Back to dashboard</Button></Link>}
        />
      </>
    );

  if (isLoading || !lecture)
    return (
      <>
        <PageHeader title="Preparing your learning kit" />
        <Skeleton className="h-[320px]" />
      </>
    );

  const isCancelled = lecture.status === "cancelled";
  const isFailed = lecture.status === "failed" || (lecture.status === "uploaded" && !lecture.active);

  const cancel = async () => {
    try {
      client.setQueryData(queryKey, await cancelLecture(lecture.id));
      toast.info("Cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    }
  };

  const retry = async () => {
    try {
      client.setQueryData(queryKey, await retryLecture(lecture.id));
      toast.success("Started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    }
  };

  // PDF of the main content (notes, else study guide, else the quiz)
  const pdfKind = contentKind ?? (wanted.includes("quiz") ? "quiz" : null);
  const pdfName = pdfKind === "tutorial" ? "study-guide" : pdfKind ?? "notes";
  const downloadPdf = async () => {
    if (!pdfKind) return;
    setDownloading(true);
    try {
      await downloadLectureFile(lecture.id, pdfKind, `${lecture.title}-${pdfName}.pdf`);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  /* ---------- failed / cancelled ---------- */
  if (isFailed || isCancelled) {
    return (
      <>
        <PageHeader
          title={lecture.title}
          action={<Link to="/dashboard"><Button variant="secondary">Back to dashboard</Button></Link>}
        />
        <Card className="p-5 sm:p-7">
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950">
              {isCancelled ? <PauseCircle /> : <XCircle />}
            </div>
            <h2 className="text-xl font-bold">
              {isCancelled ? "Cancelled" : lecture.status === "uploaded" ? "Not started" : "Something went wrong"}
            </h2>
            <p className="mx-auto mb-6 mt-2 max-w-md text-sm muted">
              {isCancelled
                ? "Nothing more will be generated unless you start it again."
                : lecture.errorMessage || "Processing did not start. Press the button to start it now."}
            </p>
            <Button onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              {isCancelled ? "Start again" : lecture.status === "uploaded" ? "Start" : "Try again"}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  /* ---------- still working: loading state only ---------- */
  if (!isCompleted) {
    return (
      <>
        <PageHeader
          title={lecture.title}
          description="Your content is being generated. This page updates automatically, and you can safely leave it."
          action={<Link to="/dashboard"><Button variant="secondary">Back to dashboard</Button></Link>}
        />
        <Card className="p-5 sm:p-7" aria-live="polite">
          <div className="flex flex-col items-center py-16 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-lg font-semibold">Generating your content…</h2>
            <p className="mt-2 max-w-md text-sm muted">This usually takes a minute or two. Longer recordings take more time.</p>
            <Button variant="ghost" className="mt-6" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </Card>
      </>
    );
  }

  /* ---------- finished: show the content directly ---------- */
  return (
    <>
      <PageHeader
        eyebrow={lecture.course || "Learning materials"}
        title={lecture.title}
        action={
          <div className="flex flex-wrap gap-2">
            {wanted.includes("quiz") && (
              <Link to={`/quiz/${lecture.id}`}>
                <Button>Take Quiz</Button>
              </Link>
            )}
            {pdfKind && (
              <Button variant="secondary" loading={downloading} onClick={downloadPdf}>
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            )}
            <Link to={`/downloads/${lecture.id}`}>
              <Button variant="secondary">
                <FolderOpen className="h-4 w-4" />
                Open Downloads
              </Button>
            </Link>
          </div>
        }
      />
      {hasNotes && hasTutorial && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          {([["notes", "Summary notes"], ["tutorial", "Tutorial / study guide"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={contentKind === id}
              onClick={() => setTab(id)}
              className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${contentKind === id ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Card className="min-w-0 p-5 sm:p-8">
        {contentKind === null ? (
          <p className="text-sm muted">Your quiz is ready. Use “Take Quiz” to start.</p>
        ) : content.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : content.data ? (
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h1 className="mt-8 text-3xl font-bold first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="mt-8 text-2xl font-bold first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="mt-6 text-xl font-semibold">{children}</h3>,
              p: ({ children }) => <p className="mt-4 leading-7 muted">{children}</p>,
              ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 muted">{children}</ul>,
              ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 muted">{children}</ol>,
            }}
          >
            {content.data}
          </ReactMarkdown>
        ) : (
          <p className="text-sm muted">No content is available for this lecture.</p>
        )}
      </Card>
    </>
  );
}
