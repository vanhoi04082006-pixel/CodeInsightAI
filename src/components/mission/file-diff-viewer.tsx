"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileDiff as FileDiffIcon,
  FilePlus,
  FileMinus,
  Copy,
  Check,
  Eye,
  GitCompare,
  FileCode2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileDiffEntry {
  path: string;
  action: string;
  additions: number;
  deletions: number;
  content?: string;
}

interface FileDiffViewerProps {
  filesModified: FileDiffEntry[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  className?: string;
}

type ParsedLineType = "add" | "del" | "ctx" | "hunk" | "meta";

interface ParsedLine {
  type: ParsedLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_META: Record<
  string,
  { color: string; label: string; icon: typeof FileDiffIcon }
> = {
  modified: { color: "#a78bfa", label: "Modified", icon: FileDiffIcon },
  added: { color: "#34d399", label: "Added", icon: FilePlus },
  deleted: { color: "#f472b6", label: "Deleted", icon: FileMinus },
  renamed: { color: "#22d3ee", label: "Renamed", icon: FileDiffIcon },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? ACTION_META.modified;
}

/**
 * Parse a unified diff text (e.g. output of `git diff`) into structured lines,
 * filtering to just the target file's hunks.
 */
function parseUnifiedDiff(diffText: string, targetPath: string): ParsedLine[] {
  const lines = diffText.split("\n");
  const result: ParsedLine[] = [];
  let inTargetFile = false;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    if (raw.startsWith("diff --git")) {
      inTargetFile = false;
      continue;
    }
    if (raw.startsWith("--- ")) {
      const p = raw.slice(4).replace(/^a\//, "").trim();
      inTargetFile = p === targetPath || p === "/dev/null";
      continue;
    }
    if (raw.startsWith("+++ ")) {
      const p = raw.slice(4).replace(/^b\//, "").trim();
      // Stay in target if either side matches.
      inTargetFile = inTargetFile || p === targetPath || p === "/dev/null";
      if (inTargetFile) {
        result.push({ type: "meta", content: `${raw}` });
      }
      continue;
    }
    if (!inTargetFile) continue;

    if (raw.startsWith("@@")) {
      const m = raw.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      result.push({ type: "hunk", content: raw });
      continue;
    }

    if (raw.startsWith("+")) {
      result.push({ type: "add", content: raw.slice(1), newLine: newLine++ });
    } else if (raw.startsWith("-")) {
      result.push({ type: "del", content: raw.slice(1), oldLine: oldLine++ });
    } else if (raw.startsWith(" ")) {
      result.push({
        type: "ctx",
        content: raw.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    } else if (raw.trim() === "") {
      result.push({
        type: "ctx",
        content: "",
        oldLine: oldLine++,
        newLine: newLine++,
      });
    } else {
      // 'Index:', 'similarity index', etc. — treat as meta.
      result.push({ type: "meta", content: raw });
    }
  }

  return result;
}

/**
 * Build a synthetic diff preview when no real content is available.
 * Generates N green "added" lines and M red "removed" lines.
 */
function buildSyntheticDiff(file: FileDiffEntry): ParsedLine[] {
  const out: ParsedLine[] = [];
  out.push({
    type: "meta",
    content: `// Synthetic diff preview — connect a repository to fetch real content`,
  });
  out.push({
    type: "hunk",
    content: `@@ -1,${Math.max(file.deletions, 1)} +1,${Math.max(file.additions, 1)} @@`,
  });

  const maxLines = Math.min(60, Math.max(file.additions, file.deletions));
  for (let i = 0; i < Math.min(file.deletions, maxLines); i++) {
    out.push({
      type: "del",
      content: `[removed line ${i + 1}]`,
      oldLine: i + 1,
    });
  }
  for (let i = 0; i < Math.min(file.additions, maxLines); i++) {
    out.push({
      type: "add",
      content: `[added line ${i + 1}]`,
      newLine: i + 1,
    });
  }
  if (file.additions > maxLines || file.deletions > maxLines) {
    out.push({
      type: "meta",
      content: `// … ${file.additions + file.deletions - 2 * maxLines} more lines`,
    });
  }
  return out;
}

/**
 * Render raw file content (when "View full file" is on) as a list of context lines.
 */
function buildFullFileLines(content: string): ParsedLine[] {
  const lines = content.split("\n");
  return lines.map((line, i) => ({
    type: "ctx" as const,
    content: line,
    oldLine: i + 1,
    newLine: i + 1,
  }));
}

// ── Component ────────────────────────────────────────────────────────────────

export function FileDiffViewer({
  filesModified,
  selectedPath,
  onSelect,
  className,
}: FileDiffViewerProps) {
  const [viewFullFile, setViewFullFile] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [diffText, setDiffText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Effective selected file — fall back to first modified file.
  const effectivePath = selectedPath ?? filesModified[0]?.path;
  const file = useMemo(
    () => filesModified.find((f) => f.path === effectivePath),
    [filesModified, effectivePath]
  );

  // Try to fetch the real unified diff from the git API. Falls back gracefully
  // to a synthetic preview if the API is unavailable.
  useEffect(() => {
    if (!file) {
      setDiffText("");
      return;
    }
    if (file.content) {
      // Caller already supplied content — skip fetch.
      setDiffText("");
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/git/operation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "diff", staged: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { diff?: string };
        if (!cancelled) setDiffText(data.diff ?? "");
      } catch {
        if (!cancelled) setDiffText("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Compute the lines to render based on view mode + available data.
  const lines = useMemo<ParsedLine[]>(() => {
    if (!file) return [];
    if (viewFullFile && file.content) {
      return buildFullFileLines(file.content);
    }
    if (viewFullFile) {
      // No raw content available — show all parsed diff lines (including ctx).
      const parsed =
        diffText.length > 0
          ? parseUnifiedDiff(diffText, file.path)
          : buildSyntheticDiff(file);
      return parsed;
    }
    return diffText.length > 0
      ? parseUnifiedDiff(diffText, file.path)
      : buildSyntheticDiff(file);
  }, [file, viewFullFile, diffText]);

  // Auto-scroll to the latest change (first add/del line) when file changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstChange = lines.findIndex(
      (l) => l.type === "add" || l.type === "del"
    );
    if (firstChange >= 0) {
      const target = el.querySelector<HTMLElement>(
        `[data-line-idx="${firstChange}"]`
      );
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [lines]);

  const onCopyPath = useCallback(async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.path);
      setCopiedPath(true);
      toast.success("File path copied");
      setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, [file]);

  const meta = file ? actionMeta(file.action) : ACTION_META.modified;
  const ActionIcon = meta.icon;

  return (
    <div
      className={cn(
        "grid h-full grid-cols-1 md:grid-cols-[180px_1fr]",
        className
      )}
    >
      {/* LEFT: file list (mini-sidebar) */}
      <div className="hidden border-r border-white/5 md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Files
          </span>
          <Badge
            variant="outline"
            className="h-4 border-white/10 px-1.5 text-[9px] tabular-nums text-muted-foreground"
          >
            {filesModified.length}
          </Badge>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {filesModified.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/60">
              No modified files yet.
            </p>
          ) : (
            filesModified.map((f) => {
              const m = actionMeta(f.action);
              const active = f.path === effectivePath;
              return (
                <button
                  key={f.path}
                  onClick={() => onSelect(f.path)}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] transition hover:bg-white/[0.04]",
                    active && "bg-white/[0.06]"
                  )}
                >
                  <m.icon
                    className="h-3 w-3 shrink-0"
                    style={{ color: m.color }}
                  />
                  <code
                    className="min-w-0 flex-1 truncate font-mono"
                    style={{ color: active ? m.color : undefined }}
                    title={f.path}
                  >
                    {f.path.split("/").pop()}
                  </code>
                  <span className="font-mono text-[9px] text-emerald-400">
                    +{f.additions}
                  </span>
                  {f.deletions > 0 && (
                    <span className="font-mono text-[9px] text-rose-400">
                      −{f.deletions}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: diff content */}
      <div className="flex min-h-0 flex-col bg-black/40">
        {/* Header bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2">
          <ActionIcon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
          <code
            className="min-w-0 flex-1 truncate font-mono text-[11px]"
            style={{ color: meta.color }}
            title={file?.path}
          >
            {file?.path ?? "No file selected"}
          </code>
          {file && (
            <Badge
              variant="outline"
              className="shrink-0 border-transparent text-[9px] uppercase"
              style={{
                background: `${meta.color}1a`,
                color: meta.color,
              }}
            >
              {meta.label}
            </Badge>
          )}
          {file && (
            <span className="shrink-0 font-mono text-[10px] text-emerald-400">
              +{file.additions}
            </span>
          )}
          {file && file.deletions > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-rose-400">
              −{file.deletions}
            </span>
          )}
          {file && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCopyPath}
              className="h-6 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              title="Copy file path"
            >
              {copiedPath ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
          {file && (
            <Button
              size="sm"
              variant={viewFullFile ? "secondary" : "ghost"}
              onClick={() => setViewFullFile((v) => !v)}
              className="h-6 shrink-0 gap-1 px-2 text-[10px]"
              title="Toggle full-file view"
            >
              {viewFullFile ? (
                <>
                  <GitCompare className="h-3 w-3" />
                  <span className="hidden sm:inline">Diff</span>
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" />
                  <span className="hidden sm:inline">Full</span>
                </>
              )}
            </Button>
          )}
        </div>

        {/* Diff body */}
        <div
          ref={scrollRef}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-relaxed"
        >
          {!file && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground/60">
              <FileCode2 className="h-6 w-6" />
              <p className="text-xs">Select a file to view its diff.</p>
            </div>
          )}
          {file && loading && (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading diff…</span>
            </div>
          )}
          {file && !loading && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${file.path}-${viewFullFile ? "full" : "diff"}`}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                {lines.length === 0 ? (
                  <p className="px-3 py-2 text-muted-foreground/60">
                    No diff lines available.
                  </p>
                ) : (
                  lines.map((l, i) => (
                    <DiffLineRow key={i} line={l} idx={i} />
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffLineRow({ line, idx }: { line: ParsedLine; idx: number }) {
  const bg =
    line.type === "add"
      ? "bg-emerald-500/10"
      : line.type === "del"
      ? "bg-rose-500/10"
      : line.type === "hunk"
      ? "bg-cyan-500/5"
      : line.type === "meta"
      ? "bg-white/[0.02]"
      : "";
  const fg =
    line.type === "add"
      ? "text-emerald-200"
      : line.type === "del"
      ? "text-rose-200"
      : line.type === "hunk"
      ? "text-cyan-300"
      : line.type === "meta"
      ? "text-muted-foreground/70"
      : "text-foreground/80";
  const prefix =
    line.type === "add" ? "+" : line.type === "del" ? "−" : line.type === "hunk" ? "" : " ";

  return (
    <div
      data-line-idx={idx}
      className={cn("flex items-start hover:bg-white/[0.02]", bg)}
    >
      {/* Line numbers */}
      <div className="flex w-16 shrink-0 select-none border-r border-white/5 text-right">
        <span className="w-8 px-1 text-[9px] text-muted-foreground/40">
          {line.oldLine ?? ""}
        </span>
        <span className="w-8 px-1 text-[9px] text-muted-foreground/40">
          {line.newLine ?? ""}
        </span>
      </div>
      {/* Prefix */}
      <span
        className={cn(
          "w-4 shrink-0 select-none px-1 text-center",
          line.type === "add" && "text-emerald-400",
          line.type === "del" && "text-rose-400"
        )}
      >
        {prefix}
      </span>
      {/* Content */}
      <span
        className={cn(
          "whitespace-pre-wrap break-words px-1",
          fg,
          (line.type === "hunk" || line.type === "meta") && "italic"
        )}
      >
        {line.content === "" ? " " : line.content}
      </span>
    </div>
  );
}
