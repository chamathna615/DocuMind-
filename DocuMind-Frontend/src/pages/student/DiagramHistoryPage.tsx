import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Download, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDiagram, getDiagram, listDiagrams, repairDiagram, type DiagramRequest } from "@/api/diagramApi";
import { Button, Card, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/common/shared";
import { DiagramContext } from "@/components/common/MermaidBlock";
import { StatusBadge, formatDate } from "@/pages/student/CodeHistoryPage";
import {
  detailLabel,
  diagramMarkdownComponents,
  diagramTypeLabel,
  mermaidCodeOf,
} from "@/pages/student/DiagramPage";
import { fileSlug, saveTextFile, splitSections } from "@/utils/codeFiles";

/* ------------------------------------------------------------------ */
/* List of earlier diagram requests                                    */
/* ------------------------------------------------------------------ */

export default function DiagramHistoryPage() {
  const client = useQueryClient();
  const [deleting, setDeleting] = useState("");
  const { data, isLoading, isError } = useQuery({ queryKey: ["diagram-list"], queryFn: listDiagrams });

  const remove = async (item: DiagramRequest) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      await deleteDiagram(item.id);
      await client.invalidateQueries({ queryKey: ["diagram-list"] });
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
        eyebrow="Generate diagram"
        title="Diagram history"
        description="Diagrams you generated earlier. Open a request to see it again, copy the code or download it."
        action={
          <Link to="/generate-diagram">
            <Button>
              <Plus className="h-4 w-4" />
              New diagram
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

      {isError && <p className="text-sm text-red-600">Your diagram history could not be loaded. Please try again.</p>}

      {data && data.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm muted">Diagrams you generate will be listed here.</p>
          <Link to="/generate-diagram" className="mt-4 inline-block text-sm font-semibold text-primary">
            Generate your first diagram
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
                  {diagramTypeLabel(item.diagramType)} · {detailLabel(item.detail)} · {item.language} ·{" "}
                  {formatDate(item.createdAt)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link to={`/generate-diagram/history/${item.id}`}>
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

export function DiagramDetailPage() {
  const { diagramId = "" } = useParams();
  const nav = useNavigate();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const queryKey = useMemo(() => ["diagram", diagramId], [diagramId]);
  const { data: job, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getDiagram(diagramId),
    // keeps updating while the server is still writing this request
    refetchInterval: (query) => (query.state.data?.active ? 1500 : false),
    gcTime: 0,
  });

  const components = useMemo(() => diagramMarkdownComponents(fileSlug(job?.title ?? "diagram")), [job?.title]);

  // "Fix with AI": the server corrects the Mermaid code and returns the updated request
  const repair = useCallback(
    async (blockIndex: number, error: string) => {
      try {
        client.setQueryData(queryKey, await repairDiagram(diagramId, { blockIndex, error }));
        toast.success("Diagram fixed");
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Could not fix the diagram");
      }
    },
    [client, queryKey, diagramId],
  );

  if (isLoading) return <Skeleton className="h-[500px]" />;

  if (isError || !job) {
    return (
      <>
        <p className="text-sm text-red-600">This diagram request could not be found.</p>
        <Link to="/generate-diagram/history" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Back to diagram history
        </Link>
      </>
    );
  }

  const completed = job.status === "completed";
  const text = completed ? job.result : job.preview || job.result;
  const sections = splitSections(text);
  const code = completed ? mermaidCodeOf(text) : "";

  const downloadCode = () => {
    if (!code) return;
    saveTextFile(`${fileSlug(job.title)}.mmd`, `${code}\n`);
    toast.success("Mermaid code downloaded");
  };
  const downloadMarkdown = () => {
    saveTextFile(`${fileSlug(job.title)}.md`, `${text}\n`, "text/markdown");
    toast.success("Markdown downloaded");
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${job.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDiagram(job.id);
      await client.invalidateQueries({ queryKey: ["diagram-list"] });
      toast.success("Deleted");
      nav("/generate-diagram/history");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/generate-diagram/history" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to diagram history
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
            {diagramTypeLabel(job.diagramType)} · {detailLabel(job.detail)} · {job.language} ·{" "}
            {formatDate(job.createdAt)}
          </span>
        </div>

        <div className="min-w-0">
          <DiagramContext.Provider value={{ text, onRepair: completed ? repair : undefined }}>
            {sections.map((section, index) => (
              <ReactMarkdown key={index} components={components}>
                {section}
              </ReactMarkdown>
            ))}
          </DiagramContext.Provider>

          {job.active && <p className="mt-6 text-sm muted">Still drawing… this page updates by itself.</p>}

          {(job.status === "failed" || job.status === "cancelled") && (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {job.status === "cancelled" ? "Cancelled." : job.errorMessage || "Generation did not finish."}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
          {code && (
            <Button onClick={downloadCode}>
              <Download className="h-4 w-4" />
              Download code
            </Button>
          )}
          {completed && (
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
