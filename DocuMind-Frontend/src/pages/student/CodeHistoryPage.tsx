import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Download, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCode, getCode, listCode, type CodeRequest } from "@/api/codeApi";
import { Button, Card, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/common/shared";
import { markdownComponents } from "@/pages/student/CodePage";
import { extensionFor, extractCodeBlocks, fileSlug, saveTextFile, splitSections } from "@/utils/codeFiles";

const STATUS_LABELS: Record<CodeRequest["status"], { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  processing: { label: "Writing", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  queued: { label: "Queued", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300" },
};

export function StatusBadge({ status }: { status: CodeRequest["status"] }) {
  const { label, className } = STATUS_LABELS[status] ?? STATUS_LABELS.failed;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

export const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const languageLabel = (value: string) => (value === "auto" ? "Auto-detect" : value);

/* ------------------------------------------------------------------ */
/* List of earlier code requests                                       */
/* ------------------------------------------------------------------ */

export default function CodeHistoryPage() {
  const client = useQueryClient();
  const [deleting, setDeleting] = useState("");
  const { data, isLoading, isError } = useQuery({ queryKey: ["code-list"], queryFn: listCode });

  const remove = async (item: CodeRequest) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      await deleteCode(item.id);
      await client.invalidateQueries({ queryKey: ["code-list"] });
      toast.success("Deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    } finally {
      setDeleting("");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Generate code"
        title="Code history"
        description="Code you generated earlier. Open a request to read it again, copy it or download it."
        action={
          <Link to="/generate-code">
            <Button>
              <Plus className="h-4 w-4" />
              New code
            </Button>
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {isError && <p className="text-sm text-red-600">Your code history could not be loaded. Please try again.</p>}

      {data && data.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm muted">Code you generate will be listed here.</p>
          <Link to="/generate-code" className="mt-4 inline-block text-sm font-semibold text-primary">
            Generate your first code
          </Link>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map((item) => (
          <Card key={item.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">{item.title}</h2>
                <p className="mt-1 line-clamp-2 break-words text-sm muted">{item.prompt}</p>
                <p className="mt-2 text-xs muted">
                  {languageLabel(item.programmingLanguage)} · {item.language} · {formatDate(item.createdAt)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link to={`/generate-code/history/${item.id}`}>
                <Button variant="secondary" className="min-h-10">
                  Open
                </Button>
              </Link>
              <Button
                variant="ghost"
                className="min-h-10"
                loading={deleting === item.id}
                disabled={item.active}
                onClick={() => void remove(item)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One saved request                                                   */
/* ------------------------------------------------------------------ */

export function CodeDetailPage() {
  const { codeId = "" } = useParams();
  const nav = useNavigate();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const { data: job, isLoading, isError } = useQuery({
    queryKey: ["code", codeId],
    queryFn: () => getCode(codeId),
    // keeps updating while the server is still writing this request
    refetchInterval: (query) => (query.state.data?.active ? 1500 : false),
    gcTime: 0,
  });

  if (isLoading) return <Skeleton className="h-[500px]" />;

  if (isError || !job) {
    return (
      <>
        <p className="text-sm text-red-600">This code request could not be found.</p>
        <Link to="/generate-code/history" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Back to code history
        </Link>
      </>
    );
  }

  const text = job.status === "completed" ? job.result : job.preview || job.result;
  const sections = splitSections(text);
  const blocks = job.status === "completed" ? extractCodeBlocks(text) : [];

  const downloadCode = () => {
    const main = blocks[0];
    if (!main) return;
    saveTextFile(`${fileSlug(job.title)}.${extensionFor(main.language)}`, `${main.code}\n`);
    toast.success("Code downloaded");
  };
  const downloadMarkdown = () => {
    saveTextFile(`${fileSlug(job.title)}.md`, `${text}\n`, "text/markdown");
    toast.success("Markdown downloaded");
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${job.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteCode(job.id);
      await client.invalidateQueries({ queryKey: ["code-list"] });
      toast.success("Deleted");
      nav("/generate-code/history");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/generate-code/history" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to code history
      </Link>

      <div className="mt-6 space-y-6">
        <div className="flex justify-end">
          <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-primary-soft px-5 py-3 text-sm leading-6 dark:bg-purple-950">
            {job.prompt}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs muted">
          <StatusBadge status={job.status} />
          <span>
            {languageLabel(job.programmingLanguage)} · {job.language} · {formatDate(job.createdAt)}
          </span>
        </div>

        <div className="min-w-0">
          {sections.map((section, index) => (
            <ReactMarkdown key={index} components={markdownComponents}>
              {section}
            </ReactMarkdown>
          ))}

          {job.active && <p className="mt-6 text-sm muted">Still writing… this page updates by itself.</p>}

          {(job.status === "failed" || job.status === "cancelled") && (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {job.status === "cancelled" ? "Cancelled." : job.errorMessage || "Generation did not finish."}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
          {blocks.length > 0 && (
            <Button onClick={downloadCode}>
              <Download className="h-4 w-4" />
              Download code
            </Button>
          )}
          {job.status === "completed" && (
            <Button variant="secondary" onClick={downloadMarkdown}>
              <FileText className="h-4 w-4" />
              Download Markdown
            </Button>
          )}
          <Button variant="ghost" loading={deleting} disabled={job.active} onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
