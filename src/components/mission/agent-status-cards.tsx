"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, Brain, Eye, Circle } from "lucide-react";
import { AGENTS, type AgentMeta } from "./agent-meta";
import type { AgentStatus } from "@/lib/mission-store";
import { cn } from "@/lib/utils";

interface AgentStatusCardsProps {
  statuses: Record<string, AgentStatus>;
  className?: string;
  compact?: boolean;
}

function statusVisual(status: AgentStatus["status"]): {
  color: string;
  icon: typeof Circle;
  label: string;
  glow: boolean;
} {
  switch (status) {
    case "thinking":
      return { color: "#fbbf24", icon: Brain, label: "Thinking", glow: true };
    case "acting":
      return { color: "#22d3ee", icon: Loader2, label: "Acting", glow: true };
    case "done":
      return { color: "#34d399", icon: CheckCircle2, label: "Done", glow: false };
    case "error":
      return { color: "#f472b6", icon: AlertCircle, label: "Error", glow: true };
    case "waiting":
      return { color: "#64748b", icon: Eye, label: "Waiting", glow: false };
    default:
      return { color: "#64748b", icon: Circle, label: "Idle", glow: false };
  }
}

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function AgentCard({
  agent,
  status,
  compact,
}: {
  agent: AgentMeta;
  status?: AgentStatus;
  compact?: boolean;
}) {
  const Icon = agent.icon;
  const visual = statusVisual(status?.status ?? "idle");
  const StatusIcon = visual.icon;
  const active = visual.glow;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: active
          ? `0 0 0 1px ${visual.color}40, 0 0 24px -4px ${visual.color}80`
          : "0 0 0 1px rgba(255,255,255,0.04)",
      }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white/[0.02] p-3 transition-colors",
        active ? "border-transparent agent-glow" : "border-white/5"
      )}
      style={
        {
          "--agent-color": visual.color,
        } as React.CSSProperties
      }
    >
      {/* Glow background */}
      {active && (
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${visual.color}, transparent 70%)`,
          }}
        />
      )}

      <div className="relative flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `${agent.color}1a`,
            color: agent.color,
            border: `1px solid ${agent.color}33`,
          }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className="truncate text-xs font-semibold"
              style={{ color: agent.color }}
            >
              {agent.name}
            </p>
            <StatusIcon
              className={cn(
                "ml-auto h-3.5 w-3.5 shrink-0",
                active && visual.icon === Loader2 && "animate-spin"
              )}
              style={{ color: visual.color }}
            />
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {visual.label}
          </p>
          {!compact && status?.detail && (
            <p className="mc-line-clamp-2 mt-1 text-[11px] text-muted-foreground/80">
              {status.detail}
            </p>
          )}
          {!compact && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/50">
              {status?.lastUpdate ? timeAgo(status.lastUpdate) : "—"}
            </p>
          )}
        </div>
      </div>

      {/* Pulse dot for active states */}
      {active && (
        <span className="absolute right-2 top-2 flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: visual.color }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: visual.color }}
          />
        </span>
      )}
    </motion.div>
  );
}

export function AgentStatusCards({ statuses, className, compact }: AgentStatusCardsProps) {
  return (
    <div className={cn(
      "grid gap-2",
      // 11 agents: use responsive grid that fits nicely
      // mobile: 2 cols (6 rows), sm: 3 cols (4 rows), lg: 4 cols (3 rows), xl: 6 cols (2 rows)
      "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
      className
    )}>
      {AGENTS.map((agent) => {
        // Match by name OR by partial lowercase match.
        const status = statuses[agent.name] ??
          Object.entries(statuses).find(([name]) =>
            name.toLowerCase().includes(agent.name.toLowerCase().split(" ")[0])
          )?.[1];
        return (
          <AgentCard
            key={agent.id}
            agent={agent}
            status={status}
            compact={compact}
          />
        );
      })}
    </div>
  );
}
