"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/shared/ui";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-md space-y-4"
      >
        {/* Skeleton header */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-white/5" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-48 animate-pulse rounded bg-white/5" />
            </div>
          </div>
        </GlassCard>

        {/* Skeleton cards */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <GlassCard key={i} className="p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
              <div className="mt-2 h-8 w-20 animate-pulse rounded bg-white/5" />
            </GlassCard>
          ))}
        </div>

        {/* Skeleton chart */}
        <GlassCard className="p-6">
          <div className="h-3 w-24 animate-pulse rounded bg-white/5" />
          <div className="mt-3 h-40 w-full animate-pulse rounded-lg bg-white/5" />
        </GlassCard>

        {/* Loading text */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "0.2s" }} />
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "0.4s" }} />
          <span className="ml-2">Loading…</span>
        </div>
      </motion.div>
    </div>
  );
}
