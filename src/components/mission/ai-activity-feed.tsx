"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MissionEvent } from "@/lib/mission-store";
import { resolveAgent } from "./agent-meta";
import { ExecutiveDecisionCard } from "./executive-decision-card";
import { cn } from "@/lib/utils";

interface AIActivityFeedProps {
  events: MissionEvent[];
  className?: string;
}

function timeStr(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function EventRow({ event }: { event: MissionEvent }) {
  // Decision events get a special highlighted card.
  if (event.type === "decision") {
    return <ExecutiveDecisionCard event={event} />;
  }

  const agent = resolveAgent(event.agent);
  const Icon = agent.icon;

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
      : event.type === "mission:start" || event.type === "mission:end"
      ? "#34d399"
      : "#94a3b8";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-3 transition-colors",
        "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
      )}
      style={{
        boxShadow: event.type === "error" ? `inset 0 0 0 1px ${accent}33` : undefined,
      }}
    >
      {/* Agent avatar */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
        style={{
          background: `${agent.color}1a`,
          color: agent.color,
          border: `1px solid ${agent.color}33`,
        }}
        title={agent.name}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground/90">
            {agent.name}
          </span>
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: accent }}
          >
            {labelForType(event.type)}
          </span>
          {typeof event.confidence === "number" && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: `${accent}1a`,
                color: accent,
                border: `1px solid ${accent}33`,
              }}
            >
              {event.confidence}%
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            {timeStr(event.timestamp)}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <EventBody event={event} accent={accent} />
        </div>
      </div>
    </motion.div>
  );
}

function labelForType(type: MissionEvent["type"]): string {
  switch (type) {
    case "agent:thinking":
      return "💭 Thinking";
    case "agent:acting":
      return "⚡ Acting";
    case "agent:status":
      return "📊 Status";
    case "agent:result":
      return "✓ Result";
    case "tool:call":
      return "🔧 Tool";
    case "tool:result":
      return "← Tool Result";
    case "file:change":
      return "📝 File";
    case "terminal:output":
      return "🖥 Terminal";
    case "confidence:update":
      return "📈 Confidence";
    case "error":
      return "⚠️ Error";
    case "phase:change":
      return "🔄 Phase";
    case "iteration:start":
      return "🔁 Iteration";
    case "mission:start":
      return "🚀 Start";
    case "mission:end":
      return "🏁 End";
    default:
      return "• Event";
  }
}

function EventBody({ event, accent }: { event: MissionEvent; accent: string }) {
  switch (event.type) {
    case "agent:thinking":
      return <span>{event.message}</span>;
    case "agent:acting":
      return (
        <span>
          <span className="font-medium text-foreground/80">{event.action}</span>
          {event.detail && (
            <>
              {" — "}
              <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[11px]" style={{ color: accent }}>
                {event.detail}
              </code>
            </>
          )}
        </span>
      );
    case "agent:status":
      return <span>{event.detail}</span>;
    case "agent:result":
      return (
        <span>
          {event.success === false ? "❌ " : "✅ "}
          {event.summary ?? event.message ?? "Done"}
        </span>
      );
    case "tool:call":
      return (
        <span className="font-mono text-[11px]">
          <span style={{ color: accent }}>{event.tool}</span>
          <span className="text-muted-foreground">({event.args ?? ""})</span>
        </span>
      );
    case "tool:result":
      return (
        <span className="font-mono text-[11px]">
          <span style={{ color: event.success === false ? "#f472b6" : "#34d399" }}>
            {event.success === false ? "✗" : "✓"}
          </span>
          <span className="ml-2 text-muted-foreground">{event.durationMs}ms</span>
        </span>
      );
    case "file:change":
      return (
        <span className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <code style={{ color: accent }} className="rounded bg-white/[0.04] px-1.5 py-0.5">
            {event.path}
          </code>
          <span className="text-muted-foreground">{event.fileAction}</span>
          {typeof event.additions === "number" && (
            <span className="text-emerald-400">+{event.additions}</span>
          )}
          {typeof event.deletions === "number" && event.deletions > 0 && (
            <span className="text-rose-400">-{event.deletions}</span>
          )}
        </span>
      );
    case "terminal:output":
      return (
        <span className="font-mono text-[11px]">
          <span className="text-muted-foreground">[{event.stream ?? "stdout"}]</span>{" "}
          {(event.data ?? "").slice(0, 120)}
          {(event.data ?? "").length > 120 ? "…" : ""}
        </span>
      );
    case "confidence:update":
      return (
        <span>
          Confidence updated to{" "}
          <span className="font-semibold" style={{ color: accent }}>
            {event.confidence}%
          </span>
        </span>
      );
    case "error":
      return <span className="text-rose-300">{event.message}</span>;
    case "phase:change":
      return (
        <span>
          Phase: <span className="font-medium capitalize">{event.phase}</span>
        </span>
      );
    case "iteration:start":
      return (
        <span>
          Iteration <span className="font-semibold">#{event.iteration}</span> started
        </span>
      );
    case "mission:start":
    case "mission:end":
      return <span>{event.message}</span>;
    default:
      return <span>{event.message ?? event.summary ?? JSON.stringify(event).slice(0, 80)}</span>;
  }
}

export function AIActivityFeed({ events, className }: AIActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  // Auto-scroll to bottom on new events unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScroll.current = atBottom;
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl",
        className
      )}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto px-1 py-2"
      >
        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="h-10 w-10 rounded-full border border-white/5 bg-white/[0.02]" />
            <p className="text-sm text-muted-foreground">No activity yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Start a mission to see live agent events stream in here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {events.map((evt) => (
                <EventRow key={evt.id} event={evt} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
