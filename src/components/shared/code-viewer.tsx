"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, FileCode, Sparkles, ChevronRight, Loader2 } from "lucide-react";
import type { CodeSnippet } from "@/lib/types";
import { useT, useI18nStore } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CodeViewer({ snippets, analysisId }: { snippets: CodeSnippet[]; analysisId?: string }) {
  const { t } = useT();
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [aiExplain, setAiExplain] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const snippet = snippets[active];

  const copy = () => {
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    toast.success(t("common", "codeViewer.codeCopiedToast"));
    setTimeout(() => setCopied(false), 1500);
  };

  const askAI = async (snippet: CodeSnippet) => {
    setAiLoading(true);
    setAiExplain(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Analyze the file ${snippet.file}. Explain: 1) What this file does 2) Main risks 3) Patterns used 4) Refactor suggestions. Code:\n\`\`\`\n${snippet.code}\n\`\`\``,
          language: useI18nStore.getState().locale,
          ...(analysisId ? { analysisId } : {}),
        }),
      });
      const data = await res.json();
      setAiExplain(data.reply || data.message || t("common", "codeViewer.aiFailed"));
    } catch {
      setAiExplain(t("common", "codeViewer.aiFailed"));
    } finally {
      setAiLoading(false);
    }
  };

  if (!snippet) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* file list */}
      <div className="space-y-1.5">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t("common", "codeViewer.files")}</p>
        {snippets.map((s, i) => (
          <button
            key={s.file}
            onClick={() => setActive(i)}
            className={cn(
              "group flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition",
              i === active
                ? "border-cyan-400/40 bg-cyan-400/[0.06]"
                : "border-white/5 bg-white/[0.02] hover:border-white/15"
            )}
          >
            <FileCode className={cn("h-4 w-4 shrink-0", i === active ? "text-cyan-300" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px]">{s.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{s.file}</p>
            </div>
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition", i === active ? "text-cyan-300" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>

      {/* code panel */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {/* title bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <span className="ml-2 font-mono text-xs text-muted-foreground">{snippet.file}</span>
          </div>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? t("common", "codeViewer.copied") : t("common", "codeViewer.copy")}
          </button>
        </div>
        {/* code */}
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
            lineNumberStyle={{ color: "rgba(255,255,255,0.2)", minWidth: "2.5em", paddingRight: "1em" }}
            wrapLongLines={false}
          >
            {snippet.code}
          </SyntaxHighlighter>
        </div>
        {/* Static analysis explanation (honest — NOT AI, just rule-based) */}
        <div className="border-t border-white/10 bg-cyan-400/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <FileCode className="h-3.5 w-3.5" /> {t("common", "codeViewer.explanation")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{snippet.explanation}</p>
          
          {/* Ask AI button — calls AI on-demand for real AI analysis */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => askAI(snippet)}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-60"
            >
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {aiLoading ? t("common", "codeViewer.aiAnalyzing") : t("common", "codeViewer.askAI")}
            </button>
          </div>
          
          {/* AI response (real AI — on-demand) */}
          {(aiExplain || aiLoading) && (
            <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <Sparkles className="h-3.5 w-3.5" /> {t("common", "codeViewer.aiExplanation")}
                <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px]">✨ AI</span>
              </p>
              {aiLoading ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{t("common", "codeViewer.aiAnalyzing")}</p>
              ) : (
                <pre className="mt-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">{aiExplain}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
