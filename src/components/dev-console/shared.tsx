"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type TimelineStep = {
  label: string;
  timeMs?: number;
  status: "done" | "pending" | "error";
  icon?: typeof CheckCircle2;
};

/**
 * RequestTimeline — DevTools-style horizontal + vertical timeline.
 * Shows pipeline steps: Context → Assembly → Request → Streaming → Done
 */
export function RequestTimeline({
  steps,
  totalMs,
}: {
  steps: TimelineStep[];
  totalMs?: number;
}) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Horizontal bar */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const StepIcon = step.icon || (step.status === "done" ? CheckCircle2 : step.status === "error" ? AlertCircle : Circle);
          const color = step.status === "done" ? "#34d399" : step.status === "error" ? "#ff5470" : "#64748b";
          return (
            <div key={i} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <StepIcon className="h-4 w-4" style={{ color }} />
                <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-1 h-0.5 flex-1 rounded-full" style={{ background: step.status === "done" ? "#34d39966" : "rgba(255,255,255,0.08)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Vertical detail */}
      <div className="space-y-1.5 border-l border-white/10 pl-3">
        {steps.map((step, i) => {
          const color = step.status === "done" ? "#34d399" : step.status === "error" ? "#ff5470" : "#64748b";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="flex-1 text-foreground/80">{step.label}</span>
              {step.timeMs != null && (
                <span className="flex items-center gap-0.5 tabular-nums text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {step.timeMs}ms
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Total */}
      {totalMs != null && (
        <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[10px]">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-cyan-300">{totalMs}ms</span>
        </div>
      )}
    </div>
  );
}

/**
 * MetricCard — small metric card for Overview/Runtime dashboards.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  color = "#22d3ee",
  sub,
  index = 0,
}: {
  label: string;
  value: string | number;
  icon?: typeof Clock;
  color?: string;
  sub?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/10 hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

/**
 * EmptyState — consistent empty state for all tabs.
 */
export function EmptyState({ icon: Icon, title, description }: { icon: typeof Clock; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03]">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{title}</p>
      {description && <p className="mt-1 max-w-[200px] text-[10px] text-muted-foreground/60">{description}</p>}
    </div>
  );
}

/**
 * LoadingSkeleton — pulse animation skeleton for loading state.
 */
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.03]" style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}
