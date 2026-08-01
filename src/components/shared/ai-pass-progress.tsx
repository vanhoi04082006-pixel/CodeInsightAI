"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  MinusCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { ANALYSIS_PASSES, type PassStatus } from "@/lib/analysis-manifest";
import { useAnalysisManifest } from "@/hooks/use-analysis-manifest";
import { useT } from "@/lib/i18n";
import { GlassCard } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<string, typeof Circle> = {
  completed: CheckCircle2,
  running: Loader2,
  failed: XCircle,
  skipped: MinusCircle,
  not_applicable: MinusCircle,
  pending: Circle,
};

const STATUS_COLOR: Record<PassStatus, string> = {
  completed: "text-emerald-400",
  running: "text-violet-400 animate-spin",
  failed: "text-rose-400",
  skipped: "text-muted-foreground/40",
  not_applicable: "text-muted-foreground/40",
  pending: "text-muted-foreground/30",
};

export function AiPassProgress() {
  const aiPending = useAppStore((s) => s.aiPending);
  const aiPassProgress = useAppStore((s) => s.aiPassProgress);
  const setView = useAppStore((s) => s.setView);
  const hasReport = useAppStore((s) => s.activeReport) !== null;
  const manifest = useAnalysisManifest();
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  if (!aiPending) return null;

  const currentPassType = aiPassProgress?.passType;
  const currentPassName = aiPassProgress?.passName ?? "";
  const total = aiPassProgress?.total ?? manifest.totalPassCount;
  const current = aiPassProgress?.current ?? manifest.completedPassCount + 1;
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  const statusFor = (type: string): PassStatus => {
    const pass = manifest.passes.find((p) => p.type === type);
    if (aiPassProgress && type === currentPassType && pass?.status !== "completed") {
      return "running";
    }
    return pass?.status ?? "pending";
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-72 flex-col items-end sm:w-80">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
          >
            <GlassCard className="w-72 border-violet-400/25 bg-violet-950/70 p-4 backdrop-blur-xl sm:w-80">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                  <Sparkles className="h-4 w-4" />
                  {t("reports", "aiProgress.title")}
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("reports", "aiProgress.collapse")}
                >
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                <span className="text-sm font-medium">
                  {t("reports", "aiProgress.pass", { current, total })}
                </span>
              </div>
              {currentPassName && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentPassName}</p>
              )}

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                {t("reports", "aiProgress.percent", { percent })}
              </p>

              <ul className="mt-3 space-y-1.5">
                {ANALYSIS_PASSES.map((def) => {
                  const status = statusFor(def.type);
                  const Icon = STATUS_ICON[status] ?? Circle;
                  const running = status === "running";
                  return (
                    <li key={def.type} className="flex items-center gap-2 text-xs">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", STATUS_COLOR[status])} />
                      <span className={cn("truncate", running ? "text-violet-300" : "text-foreground/80")}>
                        {t("analysis", def.labelKey)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {t("reports", `aiProgress.status.${status}`)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {hasReport && (
                <Button
                  onClick={() => setView("project")}
                  size="sm"
                  className="mt-3 w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
                >
                  {t("reports", "aiProgress.viewReport")}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </GlassCard>
          </motion.div>
        ) : (
          <motion.button
            key="pill"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-950/80 px-3 py-2 text-sm font-medium text-violet-300 backdrop-blur-xl transition-colors hover:border-violet-400/50 hover:text-violet-200"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("reports", "aiProgress.pass", { current, total })}
            {currentPassName && <span className="max-w-[10rem] truncate text-xs text-muted-foreground">— {currentPassName}</span>}
            <ChevronDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
