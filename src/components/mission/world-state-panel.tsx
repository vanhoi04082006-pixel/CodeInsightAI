"use client";

import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Crown, Clock3, Target, FileCode2, Gauge, CheckCircle2, XCircle, Loader2, FilePlus, FileMinus, Brain, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  FileModified,
  ExecutiveDecision,
  MissionMemoryItem,
} from "@/lib/mission-store";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface WorldStatePanelProps {
  currentTask: string;
  currentFile: string;
  confidence: number;
  buildStatus: "pass" | "fail" | "pending";
  testStatus: "pass" | "fail" | "pending";
  iteration: number;
  maxIterations: number;
  currentPhase: string;
  filesModified: FileModified[];
  decisions: ExecutiveDecision[];
  memory: MissionMemoryItem[];
  className?: string;
}

function confidenceColor(c: number): string {
  if (c < 50) return "#f472b6";
  if (c < 75) return "#fbbf24";
  return "#34d399";
}

function confidenceLabel(c: number): string {
  if (c < 30) return "Exploring";
  if (c < 60) return "Building";
  if (c < 85) return "Confident";
  return "Trusted";
}

function StatusBadge({
  status,
  label,
}: {
  status: "pass" | "fail" | "pending";
  label: string;
}) {
  const map = {
    pass: { color: "#34d399", icon: CheckCircle2, text: "Pass" },
    fail: { color: "#f472b6", icon: XCircle, text: "Fail" },
    pending: { color: "#fbbf24", icon: Loader2, text: "Pending" },
  } as const;
  const v = map[status];
  const Icon = v.icon;
  return (
    <div
      className="status-badge w-full justify-start"
      style={{
        background: `${v.color}10`,
        color: v.color,
        border: `1px solid ${v.color}33`,
      }}
    >
      <Icon
        className={cn("h-3.5 w-3.5", status === "pending" && "animate-spin")}
        style={{ color: v.color }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: v.color }}>
          {v.text}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Crown; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </div>
  );
}

// ── Animated confidence ring ──
function ConfidenceMeter({ value }: { value: number }) {
  const size = 132;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const color = confidenceColor(value);
  const offset = circ - (value / 100) * circ;

  // Smooth count animation
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 120, damping: 22 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayVal, setDisplayVal] = useState(value);
  useEffect(() => {
    mv.set(value);
    const unsub = display.on("change", (v) => setDisplayVal(v));
    return () => unsub();
  }, [value, mv, display]);

  return (
    <div className="confidence-ring" style={{ width: size, height: size }}>
      {/* Outer glow halo */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-40"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
      />
      <svg width={size} height={size} className="-rotate-90 relative">
        {/* Track */}
        <circle
          className="confidence-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        {/* Value */}
        <motion.circle
          className="confidence-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          style={{ filter: `drop-shadow(0 0 8px ${color}cc)` }}
        />
      </svg>
      <div className="confidence-ring-label">
        <motion.span
          key={displayVal}
          initial={{ opacity: 0.4, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="confidence-ring-number"
          style={{ color, textShadow: `0 0 16px ${color}80` }}
        >
          {displayVal}
          <span className="ml-0.5 text-sm">%</span>
        </motion.span>
        <span className="confidence-ring-tag" style={{ color }}>
          {confidenceLabel(value)}
        </span>
      </div>
    </div>
  );
}

export function WorldStatePanel(props: WorldStatePanelProps) {
  const confColor = confidenceColor(props.confidence);

  return (
    <div className={cn("flex h-full flex-col gap-3 overflow-y-auto mc-scroll p-2", props.className)}>
      {/* Confidence meter — large */}
      <div
        className="relative flex flex-col items-center gap-3 rounded-xl border border-white/5 p-4"
        style={{
          background: `linear-gradient(135deg, ${confColor}10, transparent)`,
        }}
      >
        <SectionLabel icon={Gauge}>Confidence</SectionLabel>
        <ConfidenceMeter value={props.confidence} />
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          The Executive&apos;s belief that the chosen path will achieve the mission goal.
        </p>
      </div>

      {/* Current Task */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <SectionLabel icon={Target}>Current Task</SectionLabel>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">
          {props.currentTask || "—"}
        </p>
      </div>

      {/* Current Phase + Iteration */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <SectionLabel icon={Clock3}>Phase</SectionLabel>
          <p className="mt-1.5 text-sm font-semibold capitalize text-cyan-300">
            {props.currentPhase}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <SectionLabel icon={Gauge}>Iteration</SectionLabel>
          <p className="mt-1.5 text-sm font-semibold tabular-nums">
            <span className="text-foreground">{props.iteration}</span>
            <span className="text-muted-foreground"> / {props.maxIterations}</span>
          </p>
        </div>
      </div>

      {/* Current File */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <SectionLabel icon={FileCode2}>Current File</SectionLabel>
        {props.currentFile ? (
          <code className="mt-1.5 block truncate rounded bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-violet-300">
            {props.currentFile}
          </code>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">—</p>
        )}
      </div>

      {/* Build + Test status */}
      <div className="grid grid-cols-2 gap-2">
        <StatusBadge status={props.buildStatus} label="Build" />
        <StatusBadge status={props.testStatus} label="Tests" />
      </div>

      {/* Files modified */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <SectionLabel icon={FilePlus}>
            Files Modified ({props.filesModified.length})
          </SectionLabel>
        </div>
        <div className="mc-scroll mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {props.filesModified.length === 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-2 text-center text-xs text-muted-foreground"
              >
                No files modified yet.
              </motion.p>
            )}
            {props.filesModified.map((f) => (
              <motion.div
                key={f.path}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2 py-1"
              >
                <FileMinus
                  className="h-3 w-3 shrink-0 text-violet-300"
                  style={{ color: f.action === "added" ? "#34d399" : f.action === "deleted" ? "#f472b6" : "#a78bfa" }}
                />
                <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
                  {f.path}
                </code>
                <span className="font-mono text-[10px] text-emerald-400">+{f.additions}</span>
                {f.deletions > 0 && (
                  <span className="font-mono text-[10px] text-rose-400">-{f.deletions}</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Executive decisions (collapsible) */}
      <Collapsible defaultOpen>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <SectionLabel icon={Crown}>
              Executive Decisions ({props.decisions.length})
            </SectionLabel>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              {props.decisions.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No decisions logged yet.
                </p>
              )}
              {props.decisions.slice(0, 3).map((d, i) => (
                <motion.div
                  key={`${d.timestamp}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-300">
                      {d.action}
                    </span>
                    <span
                      className="ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        background:
                          d.confidence < 50
                            ? "#f472b61a"
                            : d.confidence < 75
                            ? "#fbbf241a"
                            : "#34d3991a",
                        color:
                          d.confidence < 50
                            ? "#f472b6"
                            : d.confidence < 75
                            ? "#fbbf24"
                            : "#34d399",
                      }}
                    >
                      {d.confidence}%
                    </span>
                  </div>
                  {d.reasoning && (
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      {d.reasoning}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Memory (collapsible) */}
      <Collapsible>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <SectionLabel icon={Brain}>
              Memory ({props.memory.length})
            </SectionLabel>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1">
              {props.memory.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Key findings will appear here.
                </p>
              )}
              {props.memory.map((m, i) => (
                <div key={`${m.key}-${i}`} className="rounded-md bg-white/[0.02] px-2 py-1">
                  <p className="text-[10px] font-semibold text-cyan-300">{m.key}</p>
                  <p className="text-[11px] text-muted-foreground">{m.value}</p>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
