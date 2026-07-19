"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import type { MissionEvent } from "@/lib/mission-store";

interface ExecutiveDecisionCardProps {
  event: MissionEvent;
}

export function ExecutiveDecisionCard({ event }: ExecutiveDecisionCardProps) {
  const conf = event.confidence ?? 0;
  const confColor = conf < 50 ? "#f472b6" : conf < 75 ? "#fbbf24" : "#34d399";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative overflow-hidden rounded-xl p-[1px]"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.7 0.22 300 / 0.6), oklch(0.82 0.16 195 / 0.6), oklch(0.65 0.24 145 / 0.4))",
      }}
    >
      <div className="rounded-[11px] bg-background/95 p-4 backdrop-blur">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
            <Crown className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">
              Executive Decision
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(event.timestamp).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
          </div>
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: `${confColor}1a`,
              color: confColor,
              border: `1px solid ${confColor}33`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: confColor, boxShadow: `0 0 6px ${confColor}` }}
            />
            {conf}% confidence
          </span>
        </div>

        {/* Action chosen */}
        <div className="mt-3 flex items-start gap-2">
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Action
          </span>
          <span className="flex-1 text-sm font-semibold text-foreground">
            {event.action}
          </span>
        </div>

        {/* Reasoning */}
        {event.reasoning && (
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reasoning
            </span>
            <span className="flex-1 text-xs leading-relaxed text-muted-foreground">
              {event.reasoning}
            </span>
          </div>
        )}

        {/* Confidence bar */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${conf}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${confColor}, ${confColor}aa)`,
              boxShadow: `0 0 8px ${confColor}80`,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
