"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, FileCode, Sparkles, ChevronRight } from "lucide-react";
import type { CodeSnippet } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CodeViewer({ snippets }: { snippets: CodeSnippet[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const snippet = snippets[active];

  const copy = () => {
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCopied(false), 1500);
  };

  if (!snippet) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* file list */}
      <div className="space-y-1.5">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Files</p>
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
            {copied ? "Copied" : "Copy"}
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
        {/* AI explanation */}
        <div className="border-t border-white/10 bg-cyan-400/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" /> AI Explanation
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{snippet.explanation}</p>
        </div>
      </div>
    </div>
  );
}
