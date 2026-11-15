import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { useTheme } from "@/contexts/ThemeContext";
import { findMermaidBlocks } from "@/utils/mermaidBlocks";
import { renderMermaid, saveBlob, standaloneSvg, svgToPngBlob } from "@/utils/mermaidRender";

/**
 * What a diagram needs to know about the answer it is part of:
 * - text: the whole Markdown answer (so a block knows whether its code is complete yet)
 * - onRepair: asks the server to fix the code (not offered when it is missing)
 */
export interface DiagramContextValue {
  text: string;
  onRepair?: (blockIndex: number, error: string) => Promise<void>;
}
export const DiagramContext = createContext<DiagramContextValue>({ text: "" });

const messageOf = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text.replace(/\s+\n/g, "\n").trim().slice(0, 400) || "The diagram code is not valid.";
};

// Problems that are not caused by the diagram code (the mermaid library could not be loaded, the network failed...).
// Asking the model to "fix" the code would not help, so these are never auto-repaired.
const NOT_A_CODE_ERROR = /dynamically imported|importing a module|failed to fetch|networkerror|load failed|chunk/i;
// Automatic repairs per diagram (each one is one model request).
const MAX_AUTO_FIXES = 2;

/** A ```mermaid block of the answer: shown as text while it is being written, drawn as a diagram when complete. */
export function MermaidBlock({ code, filename = "diagram" }: { code: string; filename?: string }) {
  const { text, onRepair } = useContext(DiagramContext);
  const { theme } = useTheme();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by "Draw again" to re-run the drawing
  const autoFixed = useRef(new Set<string>()); // codes that were already repaired automatically

  const blocks = findMermaidBlocks(text);
  const blockIndex = blocks.findIndex((block) => block.code.trim() === code.trim());
  const closed = blockIndex >= 0; // the closing fence has arrived, so the code is complete

  useEffect(() => {
    if (!closed || !code.trim()) {
      setSvg("");
      setError("");
      return;
    }
    let cancelled = false;
    setError(""); // a new try (or new code) starts without the old message
    renderMermaid(code, theme)
      .then((result) => {
        if (cancelled) return;
        setSvg(result);
        setError("");
      })
      .catch((reason) => {
        if (cancelled) return;
        setSvg("");
        setError(messageOf(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [code, theme, closed, attempt]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the code and copy it manually.");
    }
  };

  const downloadSvg = () => {
    try {
      saveBlob(`${filename}.svg`, new Blob([standaloneSvg(svg).xml], { type: "image/svg+xml;charset=utf-8" }));
      toast.success("SVG downloaded");
    } catch (reason) {
      toast.error(messageOf(reason));
    }
  };

  const downloadPng = async () => {
    setExporting(true);
    try {
      saveBlob(`${filename}.png`, await svgToPngBlob(svg, theme === "dark" ? "#0f172a" : "#ffffff"));
      toast.success("PNG downloaded");
    } catch {
      toast.error("PNG export is not available for this diagram. Download the SVG instead.");
    } finally {
      setExporting(false);
    }
  };

  const fix = async () => {
    if (!onRepair) return;
    setFixing(true);
    try {
      await onRepair(Math.max(blockIndex, 0), error);
    } finally {
      setFixing(false);
    }
  };

  // The model sometimes writes Mermaid code with a small syntax mistake. Instead of leaving the student with an
  // error, the code is sent back to the model together with mermaid's error message (at most twice per diagram).
  useEffect(() => {
    if (!error || fixing || !onRepair || !closed) return;
    if (NOT_A_CODE_ERROR.test(error)) return;
    if (autoFixed.current.has(code) || autoFixed.current.size >= MAX_AUTO_FIXES) return;
    autoFixed.current.add(code);
    void fix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, fixing, onRepair, closed, code]);

  const toolButton =
    "flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800";

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <span className="font-semibold uppercase tracking-wide">Mermaid diagram</span>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={toolButton} onClick={() => void copy()} aria-label="Copy Mermaid code">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy code"}
          </button>
          <button type="button" className={toolButton} onClick={downloadSvg} disabled={!svg} aria-label="Download SVG">
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
          <button
            type="button"
            className={toolButton}
            onClick={() => void downloadPng()}
            disabled={!svg || exporting}
            aria-label="Download PNG"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PNG
          </button>
        </div>
      </div>

      {svg ? (
        <div
          role="img"
          aria-label="Generated diagram"
          className="overflow-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <div className="p-4">
          {fixing ? (
            <p className="flex items-center gap-2 text-sm muted" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              The diagram had a syntax mistake. Fixing it…
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">The diagram could not be drawn.</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                {onRepair && (
                  <Button loading={fixing} onClick={() => void fix()}>
                    <Wrench className="h-4 w-4" />
                    Fix with AI
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
                  <RefreshCw className="h-4 w-4" />
                  Draw again
                </Button>
              </div>
              <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                <code>{code}</code>
              </pre>
            </>
          )}
        </div>
      ) : closed ? (
        <div className="flex items-center gap-3 p-6 text-sm muted" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Drawing the diagram…
        </div>
      ) : (
        <div className="p-4">
          <p className="flex items-center gap-2 text-xs muted" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
            Writing the diagram code. It is drawn as soon as it is complete.
          </p>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
