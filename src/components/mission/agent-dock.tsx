"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Crown,
  Activity,
  FileText,
  TrendingUp,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AGENTS, type AgentMeta, resolveAgent } from "./agent-meta";
import type {
  AgentStatus,
  MissionEvent,
} from "@/lib/mission-store";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentDockProps {
  agentStatuses: Record<string, AgentStatus>;
  events: MissionEvent[];
  className?: string;
}

type DockStatus = AgentStatus["status"];

const STATUS_COLOR: Record<DockStatus, string> = {
  idle: "#64748b",
  thinking: "#fbbf24",
  acting: "#22d3ee",
  waiting: "#a78bfa",
  done: "#34d399",
  error: "#f472b6",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AgentDock({
  agentStatuses,
  events,
  className,
}: AgentDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  return (
    <>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 56, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className={cn(
              "hidden shrink-0 overflow-hidden md:flex md:flex-col",
              className
            )}
          >
            <AgentDockInner
              agentStatuses={agentStatuses}
              onSelect={(id) => setSelectedAgent(id)}
              onCollapse={() => setCollapsed(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapse toggle — always rendered as a thin sliver when collapsed */}
      <AnimatePresence initial={false}>
        {collapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 28, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="hidden shrink-0 md:flex md:items-center md:justify-center"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCollapsed(false)}
              className="h-7 w-7 p-0 text-muted-foreground"
              title="Show agent dock"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDrawer
            agentId={selectedAgent}
            events={events}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AgentDockInner({
  agentStatuses,
  onSelect,
  onCollapse,
}: {
  agentStatuses: Record<string, AgentStatus>;
  onSelect: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full w-14 flex-col items-center gap-1 border-r border-white/5 bg-white/[0.02] py-2">
      {/* Collapse affordance */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onCollapse}
            className="mb-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            aria-label="Hide agent dock"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Hide dock</TooltipContent>
      </Tooltip>
      <div className="mb-1 h-px w-6 bg-white/5" />

      {/* Agent buttons */}
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {AGENTS.map((agent) => {
          const status = agentStatuses[agent.name]?.status ?? "idle";
          const detail = agentStatuses[agent.name]?.detail;
          return (
            <AgentButton
              key={agent.id}
              agent={agent}
              status={status}
              detail={detail}
              onClick={() => onSelect(agent.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AgentButton({
  agent,
  status,
  detail,
  onClick,
}: {
  agent: AgentMeta;
  status: DockStatus;
  detail?: string;
  onClick: () => void;
}) {
  const Icon = agent.icon;
  const color = STATUS_COLOR[status];
  const isActive = status === "thinking" || status === "acting";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "group relative flex h-10 w-10 items-center justify-center rounded-xl border transition",
            "border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10"
          )}
          style={
            isActive
              ? {
                  boxShadow: `0 0 0 1px ${color}55, 0 0 12px ${color}33`,
                  borderColor: `${color}55`,
                }
              : undefined
          }
        >
          <Icon
            className="h-4 w-4 transition-transform group-hover:scale-110"
            style={{ color: agent.color }}
          />
          {/* Status dot */}
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-black/40",
              status === "thinking" && "animate-pulse",
              status === "acting" && "animate-pulse"
            )}
            style={{
              background: color,
              boxShadow:
                status === "acting"
                  ? `0 0 6px ${color}, 0 0 12px ${color}`
                  : status === "thinking"
                  ? `0 0 4px ${color}`
                  : undefined,
            }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span className="text-[10px] capitalize text-muted-foreground">
            {status}
          </span>
          {detail && (
            <span className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
              {detail}
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function AgentDrawer({
  agentId,
  events,
  onClose,
}: {
  agentId: string;
  events: MissionEvent[];
  onClose: () => void;
}) {
  // Find the agent meta — if not found, this is an unknown agent, skip rendering.
  const agent = AGENTS.find((a) => a.id === agentId);

  // Filter events to those belonging to this agent (by name match via resolveAgent).
  // Hooks must run unconditionally even when `agent` is undefined.
  const agentEvents = useMemo(() => {
    return events.filter((e) => {
      if (!e.agent) return false;
      const r = resolveAgent(e.agent);
      return r.id === agentId;
    });
  }, [events, agentId]);

  const confidenceTrend = useMemo(() => {
    return events
      .filter(
        (e) =>
          e.type === "confidence:update" &&
          typeof e.confidence === "number" &&
          (e.agent ? resolveAgent(e.agent).id === agentId : true)
      )
      .map((e) => e.confidence as number)
      .slice(-12);
  }, [events, agentId]);

  const artifacts = useMemo(() => {
    return events.filter(
      (e) =>
        e.type === "file:change" &&
        (e.agent ? resolveAgent(e.agent).id === agentId : true) &&
        e.path
    );
  }, [events, agentId]);

  // Now safe to short-circuit — all hooks above have been called.
  if (!agent) {
    return null;
  }
  const Icon = agent.icon;
  const lastUpdate = agentEvents[agentEvents.length - 1]?.timestamp;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-full w-full max-w-md flex-col border-r border-white/10 bg-background/95 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border"
            style={{
              background: `${agent.color}1a`,
              borderColor: `${agent.color}33`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: agent.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" style={{ color: agent.color }}>
              {agent.name}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {agentEvents.length} events
              {lastUpdate && (
                <>
                  {" · "}
                  <span>
                    last: {new Date(lastUpdate).toLocaleTimeString()}
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 p-0 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          {/* Description */}
          <section className="mb-4">
            <SectionLabel icon={FileText}>Role</SectionLabel>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
              {AGENT_DESCRIPTIONS[agent.id] ??
                "Specialist agent in the CodeInsight AI multi-agent system."}
            </p>
          </section>

          {/* Confidence trend (Executive only) */}
          {agentId === "executive" && (
            <section className="mb-4">
              <SectionLabel icon={TrendingUp}>Confidence Trend</SectionLabel>
              <ConfidenceSparkline values={confidenceTrend} />
            </section>
          )}

          {/* Artifacts */}
          {artifacts.length > 0 && (
            <section className="mb-4">
              <SectionLabel icon={Activity}>
                Artifacts ({artifacts.length})
              </SectionLabel>
              <div className="mt-2 space-y-1">
                {artifacts.slice(-8).reverse().map((a, i) => (
                  <div
                    key={`${a.id}-${i}`}
                    className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2 py-1"
                  >
                    <FileText className="h-3 w-3 shrink-0 text-violet-300" />
                    <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
                      {a.path}
                    </code>
                    {a.additions !== undefined && (
                      <span className="font-mono text-[9px] text-emerald-400">
                        +{a.additions}
                      </span>
                    )}
                    {a.deletions !== undefined && a.deletions > 0 && (
                      <span className="font-mono text-[9px] text-rose-400">
                        −{a.deletions}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Full event history */}
          <section>
            <SectionLabel icon={Clock3}>Event History</SectionLabel>
            <div className="mt-2 space-y-2">
              {agentEvents.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No events from this agent yet.
                </p>
              ) : (
                agentEvents
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <AgentEventRow key={`${e.id}-${i}`} event={e} />
                  ))
              )}
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Crown;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </div>
  );
}

function AgentEventRow({ event }: { event: MissionEvent }) {
  const accent =
    event.type === "error"
      ? "#f472b6"
      : event.type === "agent:result"
      ? event.success === false
        ? "#f472b6"
        : "#34d399"
      : event.type === "agent:acting"
      ? "#22d3ee"
      : event.type === "agent:thinking"
      ? "#fbbf24"
      : event.type === "file:change"
      ? "#a78bfa"
      : event.type === "tool:call" || event.type === "tool:result"
      ? "#64748b"
      : "#94a3b8";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
      style={{ boxShadow: `inset 2px 0 0 ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: accent }}
        >
          {event.type}
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-foreground/80">
        {event.message && <p>{event.message}</p>}
        {event.action && (
          <p>
            <span className="text-muted-foreground">action:</span>{" "}
            <span className="font-mono">{event.action}</span>
          </p>
        )}
        {event.detail && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {event.detail}
          </p>
        )}
        {event.tool && (
          <p>
            <span className="text-muted-foreground">tool:</span>{" "}
            <span className="font-mono">{event.tool}</span>
            {event.args && (
              <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">
                ({event.args})
              </span>
            )}
          </p>
        )}
        {event.path && (
          <p className="truncate font-mono text-[10px] text-violet-300">
            {event.path}
          </p>
        )}
        {event.reasoning && (
          <p className="text-[10px] italic text-muted-foreground">
            “{event.reasoning}”
          </p>
        )}
        {event.success !== undefined && (
          <Badge
            variant="outline"
            className="text-[9px]"
            style={{
              color: event.success ? "#34d399" : "#f472b6",
              borderColor: event.success ? "#34d39933" : "#f472b633",
            }}
          >
            {event.success ? "success" : "failed"}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

function ConfidenceSparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <p className="mt-2 py-2 text-center text-xs text-muted-foreground">
        No confidence readings yet.
      </p>
    );
  }
  const w = 240;
  const h = 60;
  const pad = 4;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const path = `M ${points.join(" L ")}`;
  const lastV = values[values.length - 1];
  const color = lastV < 50 ? "#f472b6" : lastV < 75 ? "#fbbf24" : "#34d399";

  return (
    <div className="mt-2">
      <svg width={w} height={h} className="w-full">
        <defs>
          <linearGradient id="conf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill under the curve */}
        <path
          d={`${path} L ${pad + (values.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`}
          fill="url(#conf-grad)"
          stroke="none"
        />
        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
        {/* Last point */}
        <circle
          cx={pad + (values.length - 1) * step}
          cy={h - pad - ((lastV - min) / range) * (h - pad * 2)}
          r="3"
          fill={color}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>start: {values[0]}%</span>
        <span style={{ color }}>latest: {lastV}%</span>
      </div>
    </div>
  );
}

// ── Static agent descriptions ────────────────────────────────────────────────

const AGENT_DESCRIPTIONS: Record<string, string> = {
  executive:
    "The Executive orchestrates the mission: it observes state, reasons about next steps, decides which specialist agent or tool to invoke, and verifies the outcome. Confidence and decisions flow from here.",
  planner:
    "Breaks the mission goal into ordered sub-tasks, identifies dependencies, and emits a phased plan that the Executive dispatches.",
  "repo-analyst":
    "Clones (if needed) and walks the repository: extracts structure, language stats, frameworks, entry points, and architectural notes.",
  "code-reviewer":
    "Reviews diffs and existing code for quality, conventions, complexity, and anti-patterns. Emits severity-tagged issues.",
  "bug-fixer":
    "Investigates reported bugs, locates root causes, and applies minimal patches with regression coverage.",
  refactoring:
    "Proposes and applies structural refactors (extract function, rename, move module) while preserving behaviour.",
  documentation:
    "Generates and updates README, API docs, ADRs, and inline JSDoc/TSDoc.",
  test:
    "Writes unit, integration, and e2e tests; runs the suite; surfaces failing cases for the Bug Fixer.",
  security:
    "Audits dependencies and code for vulnerabilities (OWASP Top 10), suggests mitigations.",
  performance:
    "Profiles hot paths, identifies bottlenecks, and proposes/validates optimizations.",
  devops:
    "Handles CI/CD pipelines, containerisation, deployment configs, and observability hooks.",
};
