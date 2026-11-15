import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Download, FolderOpen, Loader2, RotateCcw } from "lucide-react";
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

// Every "## " section is its own block, so each new section can slide in on its own.
const splitBlocks = (markdown: string) => markdown.split(/\n(?=## )/).filter((block) => block.trim());

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mt-8 text-3xl font-bold first:mt-0">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mt-8 text-2xl font-bold first:mt-0">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mt-6 text-xl font-semibold">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mt-4 leading-7 muted">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mt-4 list-disc space-y-2 pl-6 muted">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mt-4 list-decimal space-y-2 pl-6 muted">{children}</ol>,
};

const popDownCss = `
@keyframes pop-down {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-pop-down { animation: pop-down 0.5s ease-out both; }
@media (prefers-reduced-motion: reduce) { .animate-pop-down { animation: none; } }
`;

// Opened by "Write a prompt": shows the content while it is being written, then the finished notes.
// The content sits in the same max-w-5xl column as the Text workspace page, so both pages have the same width.
export default function GeneratedPage() {
  const { uploadId = "" } = useParams();
  const client = useQueryClient();
  const shown = useRef("");
  useClearOnLeave();
  const [downloading, setDownloading] = useState(false);

  const queryKey = ["lecture", uploadId];
  const cached = client.getQueryData<AppLecture>(queryKey);
  const shouldPoll = !cached || Boolean(cached.active);

  // Poll every 1.5 s while the server writes, so new sections appear almost immediately.
  const { data: lecture, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getLecture(uploadId),
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
    queryKey: ["content", uploadId, contentKind],
    queryFn: () => (contentKind === "notes" ? getGeneratedNotes(uploadId) : getTutorial(uploadId)),
    enabled: isCompleted && contentKind !== null,
    gcTime: 0,
  });

  const incoming = isCompleted && finalContent.data ? finalContent.data : lecture?.preview ?? "";
  if (incoming) shown.current = incoming;
  const blocks = splitBlocks(incoming || shown.current);

  useEffect(() => {
    if (lecture && !lecture.active) {
      void client.invalidateQueries({ queryKey: ["lectures"] });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    }
  }, [lecture?.active, lecture?.status, client]);

  const cancel = async () => {
    try {
      client.setQueryData(queryKey, await cancelLecture(uploadId));
      toast.info("Cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel");
    }
  };

  const retry = async () => {
    try {
      client.setQueryData(queryKey, await retryLecture(uploadId));
      toast.success("Started again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    }
  };

  const pdfKind = wanted.includes("notes") ? "notes" : wanted.includes("tutorial") ? "tutorial" : wanted.includes("quiz") ? "quiz" : null;
  const downloadPdf = async () => {
    if (!pdfKind || !lecture) return;
    setDownloading(true);
    try {
      await downloadLectureFile(lecture.id, pdfKind, `${lecture.title}-${pdfKind === "tutorial" ? "study-guide" : pdfKind}.pdf`);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (isError)
    return (
      <>
        <PageHeader title="Generated content" />
        <div className="max-w-5xl">
          <EmptyState
            title="Lecture not found"
            description="This lecture may have been deleted."
            action={<Link to="/write-prompt"><Button>Write a prompt</Button></Link>}
          />
        </div>
      </>
    );

  if (isLoading || !lecture)
    return (
      <>
        <PageHeader title="Generated content" />
        <div className="max-w-5xl">
          <Skeleton className="h-[320px]" />
        </div>
      </>
    );

  return (
    <>
      <style>{popDownCss}</style>
      <PageHeader
        eyebrow="Generated content"
        title={lecture.title}
        action={
          <Link to="/write-prompt">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Write another prompt
            </Button>
          </Link>
        }
      />
      <div className="max-w-5xl">
        <Card className="min-w-0 p-5 sm:p-7">
          <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            {isCompleted ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">Ready · saved to your Lecture History</p>
                <div className="flex flex-wrap gap-2">
                  {wanted.includes("quiz") && (
                    <Link to={`/quiz/${uploadId}`}>
                      <Button>Take Quiz</Button>
                    </Link>
                  )}
                  {pdfKind && (
                    <Button variant="secondary" loading={downloading} onClick={downloadPdf}>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  )}
                  <Link to={`/downloads/${uploadId}`}>
                    <Button variant="secondary">
                      <FolderOpen className="h-4 w-4" />
                      Open Downloads
                    </Button>
                  </Link>
                </div>
              </>
            ) : isStopped ? (
              <>
                <p className="text-sm font-semibold text-red-700">
                  {lecture.status === "cancelled" ? "Cancelled" : "Generation did not finish"}
                </p>
                <Button onClick={retry}>
                  <RotateCcw className="h-4 w-4" />
                  {lecture.status === "cancelled" ? "Start again" : "Try again"}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-3 text-sm muted" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                {blocks.length ? "Writing your content…" : "Planning your content…"}
                <Button variant="ghost" className="min-h-9 px-3" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {isStopped && lecture.status !== "cancelled" && (
            <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {lecture.errorMessage || "Generation did not finish."}
            </p>
          )}

          {blocks.map((block, index) => (
            <div key={index} className="animate-pop-down">
              <ReactMarkdown components={markdownComponents}>{block}</ReactMarkdown>
            </div>
          ))}

          {isCompleted && contentKind === null && (
            <p className="text-sm muted">Your quiz is ready. Use “Take Quiz” to start.</p>
          )}
        </Card>
      </div>
    </>
  );
}
