"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Maximize2, Minimize2, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * CodeBlock — code/prompt display with line numbers, copy, fullscreen, word wrap.
 */
export function CodeBlock({
  content,
  language = "text",
  maxLines = 10,
  maxHeight = "200px",
  label,
}: {
  content: string;
  language?: string;
  maxLines?: number;
  maxHeight?: string;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = content.split("\n");
  const visibleLines = expanded ? lines : lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const renderLine = (line: string, idx: number) => {
    if (line.trim().startsWith("[") && line.includes("]")) {
      const match = line.match(/^\s*\[(\w+)\]/);
      if (match) {
        const role = match[1];
        const rest = line.slice(match[0].length);
        const roleColor =
          role === "system" ? "#a78bfa" :
          role === "user" ? "#22d3ee" :
          role === "assistant" ? "#34d399" :
          "#fbbf24";
        return (
          <>
            <span style={{ color: roleColor, fontWeight: 600 }}>[{role}]</span>
            <span className="text-foreground/80">{rest}</span>
          </>
        );
      }
    }
    return <span className="text-foreground/80">{line || " "}</span>;
  };

  const codeContent = (
    <div
      ref={containerRef}
      className={cn("relative overflow-auto scrollbar-thin")}
      style={{ maxHeight: fullscreen ? "80vh" : expanded ? "400px" : maxHeight }}
    >
      <div className="flex font-mono text-[11px] leading-relaxed">
        <div className="sticky left-0 shrink-0 select-none border-r border-white/5 bg-white/[0.02] px-2 py-2 text-right text-muted-foreground/40">
          {visibleLines.map((_, i) => (
            <div key={i} className="tabular-nums">{i + 1}</div>
          ))}
          {hasMore && !expanded && <div className="text-muted-foreground/30">…</div>}
        </div>
        <div className={cn("flex-1 px-3 py-2", !wrap && "whitespace-pre")}>
          {visibleLines.map((line, i) => (
            <div key={i} className="min-h-[1.4em]">{renderLine(line, i)}</div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="group relative rounded-lg border border-white/10 bg-black/30">
        {label && (
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setWrap((w) => !w)} className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-white/5 hover:text-foreground group-hover:opacity-100" title="Toggle word wrap">
                <WrapText className={cn("h-3 w-3", wrap && "text-cyan-300")} />
              </button>
              <button onClick={() => setFullscreen(true)} className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-white/5 hover:text-foreground group-hover:opacity-100" title="Fullscreen">
                <Maximize2 className="h-3 w-3" />
              </button>
              <button onClick={handleCopy} className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-white/5 hover:text-foreground group-hover:opacity-100" title="Copy">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        )}
        {codeContent}
        {hasMore && (
          <button onClick={() => setExpanded((e) => !e)} className="w-full border-t border-white/5 py-1.5 text-center text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
            {expanded ? "▲ Show less" : `▼ Show all ${lines.length} lines`}
          </button>
        )}
      </div>

      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-background"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-sm font-semibold">{label || "Code"}</span>
                <div className="flex items-center gap-2">
                  <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs transition hover:bg-white/5">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </button>
                  <button onClick={() => setFullscreen(false)} className="rounded-lg border border-white/10 p-1.5 transition hover:bg-white/5">
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                <div className="h-full overflow-auto scrollbar-thin rounded-lg border border-white/10 bg-black/30">
                  <div className="flex font-mono text-xs leading-relaxed">
                    <div className="sticky left-0 shrink-0 select-none border-r border-white/5 bg-white/[0.02] px-3 py-2 text-right text-muted-foreground/40">
                      {lines.map((_, i) => (<div key={i} className="tabular-nums">{i + 1}</div>))}
                    </div>
                    <div className={cn("flex-1 px-3 py-2", !wrap && "whitespace-pre")}>
                      {lines.map((line, i) => (<div key={i} className="min-h-[1.4em]">{renderLine(line, i)}</div>))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
