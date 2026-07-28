"use client";

import { useState, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  FileCode,
  Sparkles,
  ChevronRight,
  Loader2,
  Expand,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { CodeSnippet, FileInsight, Issue, AIMode } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ExpandLevel = "snippet" | "expanded" | "full";

const SEVERITY_WEIGHT: Record<Issue["severity"], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const SEVERITY_BADGE: Record<Issue["severity"], string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
};

const SEVERITY_LABEL: Record<Issue["severity"], string> = {
  critical: "🔴 Critical",
  high: "🟠 High",
  medium: "🟡 Medium",
  low: "⚪ Low",
  info: "🔵 Info",
};

const AI_MODE_LABEL_KEY: Record<AIMode, string> = {
  explain: "codeViewer.aiModeExplain",
  security: "codeViewer.aiModeSecurity",
  performance: "codeViewer.aiModePerformance",
  refactor: "codeViewer.aiModeRefactor",
  tests: "codeViewer.aiModeTests",
  bugs: "codeViewer.aiModeBugs",
};

interface CodeViewerProps {
  snippets: CodeSnippet[];
  files: FileInsight[];
  issues: Issue[];
  onAskAI?: (snippet: CodeSnippet, mode: AIMode, sendFullFile: boolean) => void;
  aiLoading?: boolean;
  aiResponse?: string | null;
  activeAiMode?: AIMode | null;
  activeAiFile?: string | null;
}

export function CodeViewer({
  snippets,
  files,
  issues,
  onAskAI,
  aiLoading,
  aiResponse,
  activeAiMode,
  activeAiFile,
}: CodeViewerProps) {
  const { t } = useT();
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expandLevel, setExpandLevel] = useState<ExpandLevel>("snippet");
  const [relatedNote, setRelatedNote] = useState<string | null>(null);

  const snippet = snippets[active];

  const fileInsight = useMemo(
    () => files.find((f) => f.path === snippet?.file),
    [files, snippet],
  );

  const fileIssues = useMemo(
    () => (snippet ? issues.filter((i) => i.file === snippet.file) : []),
    [issues, snippet],
  );

  const primaryIssue = useMemo(() => {
    if (!snippet || fileIssues.length === 0) return undefined;
    if (snippet.issueId) {
      return fileIssues.find((i) => i.id === snippet.issueId) || fileIssues[0];
    }
    return fileIssues[0];
  }, [fileIssues, snippet]);

  // Compute displayed code based on expandLevel
  const { displayCode, displayStart, displayEnd, totalLines } = useMemo(() => {
    if (!snippet) {
      return { displayCode: "", displayStart: 1, displayEnd: 0, totalLines: 0 };
    }
    const rawLines = snippet.rawContent?.split("\n") ?? snippet.code.split("\n");
    const total = snippet.totalLines || rawLines.length;

    if (expandLevel === "full" && snippet.rawContent) {
      return {
        displayCode: snippet.rawContent,
        displayStart: 1,
        displayEnd: total,
        totalLines: total,
      };
    }
    if (
      expandLevel === "expanded" &&
      snippet.rawContent &&
      primaryIssue?.line &&
      primaryIssue.line > 0 &&
      primaryIssue.line <= rawLines.length
    ) {
      const lineIdx = primaryIssue.line - 1;
      const start = Math.max(0, lineIdx - 50);
      const end = Math.min(rawLines.length, lineIdx + 50);
      return {
        displayCode: rawLines.slice(start, end).join("\n"),
        displayStart: start + 1,
        displayEnd: end,
        totalLines: total,
      };
    }
    // snippet (default) — fall back to snippet.code as-is
    const start = snippet.startLine || 1;
    const end = snippet.endLine || snippet.code.split("\n").length;
    return {
      displayCode: snippet.code,
      displayStart: start,
      displayEnd: end,
      totalLines: total,
    };
  }, [snippet, expandLevel, primaryIssue]);

  // Set of absolute issue line numbers (for highlighting)
  const issueLineSet = useMemo(() => {
    const set = new Set<number>();
    fileIssues.forEach((i) => {
      if (i.line && i.line > 0) set.add(i.line);
    });
    return set;
  }, [fileIssues]);

  // Related files: imports resolved to files in `files` list
  const relatedFiles = useMemo(() => {
    if (!fileInsight?.imports || fileInsight.imports.length === 0) return [];
    const resolved: { path: string; name: string; inSnippets: boolean }[] = [];
    const seen = new Set<string>();
    const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c"];
    for (const imp of fileInsight.imports) {
      // Skip bare module imports (e.g., "react", "lodash")
      if (!imp.startsWith(".") && !imp.startsWith("@/")) continue;
      const basename = imp.split("/").pop() || imp;
      const candidates = [imp, basename];
      let match: FileInsight | undefined;
      for (const cand of candidates) {
        match = files.find((f) =>
          exts.some((ext) => f.path === cand + ext || f.path.endsWith("/" + cand + ext)),
        );
        if (match) break;
      }
      if (match && !seen.has(match.path)) {
        seen.add(match.path);
        resolved.push({
          path: match.path,
          name: match.path.split("/").pop() || match.path,
          inSnippets: snippets.some((s) => s.file === match!.path),
        });
      }
    }
    return resolved;
  }, [fileInsight, files, snippets]);

  // Severity stars (1-5) — derived from the most severe issue in the file
  const severityStars = useMemo(() => {
    if (fileIssues.length === 0) return 0;
    return Math.max(...fileIssues.map((i) => SEVERITY_WEIGHT[i.severity] || 1));
  }, [fileIssues]);

  if (!snippet) return null;

  const copy = () => {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    toast.success(t("common", "codeViewer.codeCopiedToast"));
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRelatedClick = (path: string, inSnippets: boolean) => {
    if (inSnippets) {
      const idx = snippets.findIndex((s) => s.file === path);
      if (idx >= 0) {
        setActive(idx);
        setExpandLevel("snippet");
        setRelatedNote(null);
        return;
      }
    }
    setRelatedNote(`${path} — ${t("common", "codeViewer.notInTopFiles")}`);
    setTimeout(() => setRelatedNote(null), 3000);
  };

  const handleMode = (mode: AIMode) => {
    if (!onAskAI) return;
    onAskAI(snippet, mode, false);
    toast.info(t("common", "codeViewer.snippetSent"));
  };

  const handleAnalyzeWholeFile = () => {
    if (!onAskAI) return;
    onAskAI(snippet, "explain", true);
    toast.info(t("common", "codeViewer.wholeFileSent"));
  };

  // Reset expand level when switching files
  const handleSelectFile = (idx: number) => {
    setActive(idx);
    setExpandLevel("snippet");
    setRelatedNote(null);
  };

  // lineProps callback — highlights issue lines with red bg + left border
  const getLineProps = (lineNumber: number) => {
    if (issueLineSet.has(lineNumber)) {
      return {
        style: {
          backgroundColor: "rgba(239,68,68,0.10)",
          borderLeft: "2px solid rgb(239,68,68)",
          display: "block",
          marginLeft: "-16px",
          paddingLeft: "14px",
          paddingRight: "4px",
        } as React.CSSProperties,
      };
    }
    return {};
  };

  // Stars row (1-5)
  const stars =
    severityStars > 0
      ? "★".repeat(severityStars) + "☆".repeat(5 - severityStars)
      : "☆☆☆☆☆";

  const fnCount = fileInsight?.functions?.length ?? 0;
  const clsCount = fileInsight?.classes?.length ?? 0;
  const complexity = fileInsight?.complexity ?? 0;

  const aiModeButtons: { mode: AIMode; label: string }[] = [
    { mode: "explain", label: t("common", "codeViewer.explain") },
    { mode: "security", label: t("common", "codeViewer.securityReview") },
    { mode: "performance", label: t("common", "codeViewer.performanceReview") },
    { mode: "refactor", label: t("common", "codeViewer.refactor") },
    { mode: "tests", label: t("common", "codeViewer.generateTests") },
    { mode: "bugs", label: t("common", "codeViewer.findBugs") },
  ];

  const aiResponseVisible = aiResponse && activeAiFile === snippet.file;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* file list */}
      <div className="space-y-1.5">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("common", "codeViewer.files")}
        </p>
        {snippets.map((s, i) => (
          <button
            key={s.file}
            onClick={() => handleSelectFile(i)}
            className={cn(
              "group flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition",
              i === active
                ? "border-cyan-400/40 bg-cyan-400/[0.06]"
                : "border-white/5 bg-white/[0.02] hover:border-white/15",
            )}
          >
            <FileCode
              className={cn(
                "h-4 w-4 shrink-0",
                i === active ? "text-cyan-300" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px]">{s.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{s.file}</p>
            </div>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition",
                i === active ? "text-cyan-300" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>

      {/* code panel + new sections */}
      <div className="space-y-3">
        {/* ───────── 1. File Summary header ───────── */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
              <FileCode className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold">{snippet.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {fileInsight?.description || snippet.file}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  {totalLines} {t("common", "codeViewer.lines")}
                </span>
                <span className="text-white/15">·</span>
                <span>
                  {fnCount} {t("common", "codeViewer.functions")}
                </span>
                <span className="text-white/15">·</span>
                <span>
                  {clsCount} {t("common", "codeViewer.classes")}
                </span>
                <span className="text-white/15">·</span>
                <span>
                  {t("common", "codeViewer.complexity")}:{" "}
                  <span className={complexity > 15 ? "text-amber-400" : "text-foreground"}>
                    {complexity}
                  </span>
                </span>
                <span className="text-white/15">·</span>
                <span className="text-amber-400" title={`Severity ${severityStars}/5`}>
                  {stars}
                </span>
              </div>
            </div>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? t("common", "codeViewer.copied") : t("common", "codeViewer.copy")}
            </button>
          </div>
        </div>

        {/* ───────── 2. Code block with showing label + expand controls ───────── */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              </div>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{snippet.file}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {expandLevel === "snippet" && (
                <button
                  onClick={() => setExpandLevel("expanded")}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  <Expand className="h-3 w-3" /> {t("common", "codeViewer.expandContext")}
                </button>
              )}
              {expandLevel === "expanded" && (
                <button
                  onClick={() => setExpandLevel("full")}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  <Maximize2 className="h-3 w-3" /> {t("common", "codeViewer.openFullFile")}
                </button>
              )}
              {expandLevel !== "snippet" && (
                <button
                  onClick={() => setExpandLevel("snippet")}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  <Minimize2 className="h-3 w-3" /> {t("common", "codeViewer.collapse")}
                </button>
              )}
            </div>
          </div>
          {/* showing lines label */}
          <div className="border-b border-white/5 bg-black/20 px-4 py-1.5">
            <p className="text-[10px] font-mono text-muted-foreground">
              {t("common", "codeViewer.showing", {
                from: displayStart,
                to: displayEnd,
                total: totalLines,
              })}
              {issueLineSet.size > 0 && (
                <span className="ml-2 text-red-400">
                  ● {issueLineSet.size} {t("common", "codeViewer.issueLine")}
                  {issueLineSet.size > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          {/* code — issue lines highlighted via wrapLines + lineProps */}
          <div className="max-h-[480px] overflow-auto scrollbar-thin">
            <SyntaxHighlighter
              language={snippet.language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                background: "transparent",
                padding: "16px",
                fontSize: "12.5px",
                lineHeight: "1.6",
              }}
              showLineNumbers
              startingLineNumber={displayStart}
              lineNumberStyle={{
                color: "rgba(255,255,255,0.2)",
                minWidth: "2.5em",
                paddingRight: "1em",
              }}
              wrapLongLines={false}
              wrapLines
              lineProps={getLineProps}
            >
              {displayCode}
            </SyntaxHighlighter>
          </div>
        </div>

        {/* ───────── 3. Rich static explanation (rule-based, NOT AI) ───────── */}
        {primaryIssue ? (
          <div className="rounded-xl border border-white/10 bg-cyan-400/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <FileCode className="h-3.5 w-3.5" /> {t("common", "codeViewer.explanation")}
            </p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {t("common", "codeViewer.issue")}:
                </span>
                <span className="flex-1 font-medium text-foreground">{primaryIssue.title}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {t("common", "codeViewer.severity")}:
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                    SEVERITY_BADGE[primaryIssue.severity],
                  )}
                >
                  {SEVERITY_LABEL[primaryIssue.severity]}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {t("common", "codeViewer.evidence")}:
                </span>
                <code className="flex-1 font-mono text-[11px] text-cyan-300">
                  {snippet.file}
                  {primaryIssue.line ? `:${primaryIssue.line}` : ""}
                </code>
              </div>
              {primaryIssue.description && (
                <div className="flex gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {t("common", "codeViewer.reason")}:
                  </span>
                  <span className="flex-1 leading-relaxed text-foreground/85">
                    {primaryIssue.description}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {t("common", "codeViewer.impact")}:
                </span>
                <span className="flex-1 leading-relaxed italic text-foreground/70">
                  {t("common", "codeViewer.impactFallback")}
                </span>
              </div>
              {primaryIssue.recommendation && (
                <div className="flex gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {t("common", "codeViewer.recommendation")}:
                  </span>
                  <span className="flex-1 leading-relaxed text-emerald-300">
                    {primaryIssue.recommendation}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-cyan-400/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <FileCode className="h-3.5 w-3.5" /> {t("common", "codeViewer.explanation")}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{snippet.explanation}</p>
            <p className="mt-2 text-[11px] text-emerald-400">
              ✓ {t("common", "codeViewer.noIssuesInFile")}
            </p>
          </div>
        )}

        {/* ───────── 4. AI menu (6 modes + Analyze whole file) ───────── */}
        {onAskAI && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {aiModeButtons.map(({ mode, label }) => {
                const isActiveMode =
                  aiLoading && activeAiMode === mode && activeAiFile === snippet.file;
                return (
                  <button
                    key={mode}
                    onClick={() => handleMode(mode)}
                    disabled={aiLoading}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50",
                      isActiveMode
                        ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                        : "border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20",
                    )}
                  >
                    {isActiveMode && <Loader2 className="h-3 w-3 animate-spin" />}
                    {label}
                  </button>
                );
              })}
              <div className="ml-auto">
                <button
                  onClick={handleAnalyzeWholeFile}
                  disabled={aiLoading || !snippet.rawContent}
                  className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title={t("common", "codeViewer.analyzeWholeFile")}
                >
                  <Sparkles className="h-3 w-3" />
                  {t("common", "codeViewer.analyzeWholeFile")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────── 5. Related Files ───────── */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <FileCode className="h-3 w-3" /> {t("common", "codeViewer.relatedFiles")}
          </p>
          {relatedFiles.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {t("common", "codeViewer.noRelatedFiles")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {relatedFiles.map((rf) => (
                <button
                  key={rf.path}
                  onClick={() => handleRelatedClick(rf.path, rf.inSnippets)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono transition",
                    rf.inSnippets
                      ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
                  )}
                  title={
                    rf.inSnippets ? rf.path : `${rf.path} — ${t("common", "codeViewer.notInTopFiles")}`
                  }
                >
                  {rf.name}
                  {!rf.inSnippets && <span className="text-[9px] opacity-60">⊘</span>}
                </button>
              ))}
            </div>
          )}
          {relatedNote && <p className="mt-2 text-[10px] text-amber-400">{relatedNote}</p>}
        </div>

        {/* ───────── 6. AI Response (violet card) ───────── */}
        {aiResponseVisible && (
          <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-300" />
              <h4 className="text-sm font-semibold">
                {activeAiMode ? t("common", AI_MODE_LABEL_KEY[activeAiMode]) : "AI"}
              </h4>
              <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <Sparkles className="h-3 w-3" /> AI
              </span>
              <code className="text-[10px] text-muted-foreground">{snippet.file}</code>
            </div>
            {aiLoading && activeAiFile === snippet.file ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("common", "codeViewer.aiAnalyzing")}
              </p>
            ) : (
              <pre className="mt-3 max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">
                {aiResponse}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
