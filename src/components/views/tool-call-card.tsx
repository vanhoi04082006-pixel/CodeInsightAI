"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Loader2, MinusCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { GlassCard } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  toolCall: {
    nodeId: string;
    tool: string;
    status: "pending" | "running" | "done" | "failed" | "skipped";
    result?: unknown;
    error?: string;
  };
}

const STATUS_CONFIG = {
  pending: { icon: Loader2, color: "text-muted-foreground/30", label: "Pending" },
  running: { icon: Loader2, color: "text-violet-400 animate-spin", label: "Running" },
  done: { icon: CheckCircle2, color: "text-emerald-400", label: "Done" },
  failed: { icon: XCircle, color: "text-rose-400", label: "Failed" },
  skipped: { icon: MinusCircle, color: "text-muted-foreground/40", label: "Skipped" },
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[toolCall.status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  const hasResult = toolCall.result !== undefined;
  const resultStr = hasResult ? JSON.stringify(toolCall.result, null, 2) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <GlassCard className={cn(
        "p-3 transition",
        toolCall.status === "running" && "border-violet-400/20 bg-violet-500/[0.03]",
        toolCall.status === "failed" && "border-rose-400/20 bg-rose-500/[0.03]",
        toolCall.status === "done" && "border-emerald-400/10",
      )}>
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
          <code className="text-xs font-medium text-foreground/90">{toolCall.tool}</code>
          <span className={cn("ml-auto text-[10px] uppercase tracking-wider", config.color)}>
            {config.label}
          </span>
          {hasResult && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground transition hover:text-foreground"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {toolCall.error && (
          <p className="mt-2 text-xs text-rose-300">{toolCall.error}</p>
        )}

        <AnimatePresence>
          {expanded && hasResult && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 overflow-auto rounded-md border border-white/5 bg-black/20 p-2 text-[10px] leading-relaxed text-foreground/70 max-h-48 scrollbar-thin"
            >
              {resultStr.slice(0, 2000)}
              {resultStr.length > 2000 && "\n... [truncated]"}
            </motion.pre>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}
