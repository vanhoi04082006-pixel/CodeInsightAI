"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { MissionEvent } from "@/lib/mission-store";
import { cn } from "@/lib/utils";

interface MissionTimelineProps {
  events: MissionEvent[];
  className?: string;
}

function eventColor(type: MissionEvent["type"]): string {
  switch (type) {
    case "agent:thinking":
    case "phase:change":
      return "#fbbf24";
    case "agent:acting":
    case "tool:call":
      return "#22d3ee";
    case "agent:result":
      return "#34d399";
    case "tool:result":
      return "#94a3b8";
    case "error":
      return "#f472b6";
    case "file:change":
      return "#a78bfa";
    case "decision":
      return "#a78bfa";
    case "mission:start":
      return "#34d399";
    case "mission:end":
      return "#22d3ee";
    case "iteration:start":
      return "#fbbf24";
    case "confidence:update":
      return "#34d399";
    default:
      return "#64748b";
  }
}

function eventLabel(event: MissionEvent): string {
  switch (event.type) {
    case "agent:thinking":
      return `💭 ${event.agent}: ${event.message?.slice(0, 50) ?? ""}`;
    case "agent:acting":
      return `⚡ ${event.agent}: ${event.action ?? ""} ${event.detail ?? ""}`;
    case "agent:result":
      return `${event.success === false ? "❌" : "✅"} ${event.agent}: ${event.summary ?? ""}`;
    case "tool:call":
      return `🔧 ${event.tool}(${event.args ?? ""})`;
    case "tool:result":
      return `← ${event.success === false ? "✗" : "✓"} ${event.durationMs}ms`;
    case "file:change":
      return `📝 ${event.path} ${event.fileAction ?? ""}`;
    case "decision":
      return `🎯 ${event.action}`;
    case "error":
      return `⚠️ ${event.message?.slice(0, 60) ?? ""}`;
    case "phase:change":
      return `🔄 → ${event.phase}`;
    case "iteration:start":
      return `🔁 Iteration ${event.iteration}`;
    case "mission:start":
      return `🚀 Start`;
    case "mission:end":
      return `🏁 End`;
    default:
      return event.message ?? event.type;
  }
}

export function MissionTimeline({ events, className }: MissionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [events.length]);

  // Only show events that have a meaningful "phase" or are key markers.
  // Filter to a max of 50 timeline items.
  const timelineEvents = events
    .filter((e) =>
      [
        "agent:thinking",
        "agent:acting",
        "agent:result",
        "decision",
        "file:change",
        "error",
        "phase:change",
        "iteration:start",
        "mission:start",
        "mission:end",
      ].includes(e.type)
    )
    .slice(-50);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-2",
        className
      )}
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mission Timeline
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {timelineEvents.length} events
        </span>
      </div>

      {timelineEvents.length === 0 ? (
        <div className="flex h-12 items-center justify-center text-xs text-muted-foreground/60">
          Timeline will populate as the mission progresses.
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="scrollbar-thin flex items-center gap-1 overflow-x-auto pb-1"
          style={{ minHeight: 56 }}
        >
          {/* Timeline base line */}
          <div className="pointer-events-none absolute left-2 right-2 top-[34px] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {timelineEvents.map((event, idx) => {
            const color = eventColor(event.type);
            return (
              <motion.div
                key={`${event.id}-${idx}`}
                initial={{ opacity: 0, scale: 0.4, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="group relative flex shrink-0 flex-col items-center gap-1"
                title={eventLabel(event)}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-background/60 transition-transform group-hover:scale-150"
                  style={{
                    background: color,
                    boxShadow: `0 0 6px ${color}, 0 0 12px ${color}80`,
                  }}
                />
                <div className="invisible absolute top-full z-10 mt-1 w-max max-w-[220px] rounded-lg border border-white/10 bg-background/95 px-2 py-1 text-[10px] leading-snug text-foreground shadow-xl backdrop-blur group-hover:visible">
                  <div className="font-semibold" style={{ color }}>
                    {event.type}
                  </div>
                  <div className="text-muted-foreground">
                    {eventLabel(event)}
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">
                    {new Date(event.timestamp).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
