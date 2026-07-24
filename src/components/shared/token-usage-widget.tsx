"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins, TrendingUp, TrendingDown, Infinity as InfinityIcon } from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

type TokenUsage = {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  breakdown?: {
    chatMessages: number;
    analyses: number;
    estimatedPerChat: number;
    estimatedPerAnalysis: number;
  };
};

/**
 * TokenUsageWidget — Shows token usage for current month.
 * Displays: used / limit, remaining, progress bar, breakdown.
 */
export function TokenUsageWidget({ compact = false }: { compact?: boolean }) {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/usage/tokens", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUsage(data);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Refresh every 30s
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-muted-foreground")}>
        <Coins className="h-3.5 w-3.5 animate-pulse" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!usage) return null;

  // Unlimited (admin/enterprise)
  if (usage.unlimited) {
    return (
      <div className={cn("flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300")}>
        <InfinityIcon className="h-3.5 w-3.5" />
        <span className="font-medium">Unlimited</span>
        <span className="text-[9px] text-emerald-300/70">{usage.plan}</span>
      </div>
    );
  }

  const percent = usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const isLow = percent > 80;
  const isMedium = percent > 50;
  const color = isLow ? "#ff5470" : isMedium ? "#fbbf24" : "#10b981";

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };

  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition")}
        style={{
          borderColor: `${color}40`,
          background: `${color}10`,
          color,
        }}
        title={`${formatNum(usage.used)} / ${formatNum(usage.limit)} tokens used this month`}
      >
        <Coins className="h-3.5 w-3.5" />
        <span className="font-medium tabular-nums">{formatNum(usage.remaining)}</span>
        <span className="text-[9px] opacity-70">left</span>
      </div>
    );
  }

  return (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Coins className="h-4 w-4" style={{ color }} />
          <span className="text-xs font-semibold">Token Usage</span>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
          {usage.plan}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="tabular-nums">{formatNum(usage.used)} used</span>
          <span className="tabular-nums">{formatNum(usage.limit)} total</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="tabular-nums font-semibold" style={{ color }}>
            {formatNum(usage.remaining)} remaining
          </span>
          <span className="text-muted-foreground">{percent.toFixed(0)}%</span>
        </div>
      </div>

      {/* Breakdown */}
      {usage.breakdown && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-muted-foreground">
          <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1">
            <span className="block">Chat messages</span>
            <span className="font-semibold text-foreground">{usage.breakdown.chatMessages}</span>
            <span className="ml-1">× ~{usage.breakdown.estimatedPerChat} tok</span>
          </div>
          <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1">
            <span className="block">Analyses</span>
            <span className="font-semibold text-foreground">{usage.breakdown.analyses}</span>
            <span className="ml-1">× ~{usage.breakdown.estimatedPerAnalysis} tok</span>
          </div>
        </div>
      )}

      {isLow && (
        <p className="mt-2 text-[9px] text-rose-400">
          ⚠ Running low — upgrade to Pro for 10M tokens/month
        </p>
      )}
    </GlassCard>
  );
}
