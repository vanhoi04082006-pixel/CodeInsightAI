"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  GitBranch,
  FileCode,
  Layers,
  Activity,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { GlassCard, GradientText } from "@/components/shared/ui";

type TrendPoint = {
  date: string;
  overall: number;
  security: number;
  performance: number;
  architecture: number;
  count: number;
};

type TrendsData = {
  windowDays: number;
  totalAnalyses: number;
  uniqueRepos: number;
  trendSeries: TrendPoint[];
  topLanguages: { name: string; count: number }[];
  deltas: { overall: number; security: number; performance: number; architecture: number } | null;
  avgOverall: number;
  totalFiles: number;
  totalLines: number;
};

type LangColors = Record<string, string>;
const LANGUAGE_COLORS: LangColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3776ab",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#ed8b00",
  "C++": "#00599c",
  Ruby: "#cc342d",
  PHP: "#777bb4",
  Swift: "#fa7343",
  Kotlin: "#7f52ff",
  Vue: "#41b883",
  Shell: "#89e051",
};

function DeltaBadge({ value, label }: { value: number; label: string }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = value > 0 ? "#34d399" : value < 0 ? "#ff5470" : "#64748b";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {sign}
          {value}
        </span>
      </div>
    </div>
  );
}

/**
 * TrendsCard
 *
 * Fetches the user's 30-day analysis trends from /api/usage/trends and
 * displays a line chart of score progression, top languages analyzed,
 * and score deltas (first vs last analysis in window).
 *
 * Shows an empty state when the user has no analyses yet.
 */
export function TrendsCard() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/usage/trends", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as TrendsData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <GlassCard className="flex h-64 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
          <span className="text-xs">Loading trends…</span>
        </div>
      </GlassCard>
    );
  }

  if (error || !data) {
    return (
      <GlassCard className="flex h-64 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Activity className="h-5 w-5 text-amber-400" />
          <span className="text-xs">Trends unavailable</span>
          {error && <span className="text-[10px] text-muted-foreground/60">{error}</span>}
        </div>
      </GlassCard>
    );
  }

  // Empty state — no analyses in the window
  if (data.totalAnalyses === 0) {
    return (
      <GlassCard className="flex h-64 flex-col items-center justify-center p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10">
          <TrendingUp className="h-6 w-6 text-cyan-300" />
        </div>
        <p className="mt-3 text-sm font-medium">No analyses yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Run your first repository analysis to start tracking score trends over time.
        </p>
      </GlassCard>
    );
  }

  // Format dates for the chart (MM/DD)
  const chartData = data.trendSeries.map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
  }));

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-cyan-300" />
            <span>
              30-Day <GradientText>Trends</GradientText>
            </span>
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {data.totalAnalyses} {data.totalAnalyses === 1 ? "analysis" : "analyses"} ·{" "}
            {data.uniqueRepos} {data.uniqueRepos === 1 ? "repo" : "repos"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
            <FileCode className="h-3.5 w-3.5 text-violet-300" />
            <span className="text-xs font-semibold tabular-nums">{data.totalFiles.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
            <GitBranch className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-xs font-semibold tabular-nums">{data.uniqueRepos}</span>
          </div>
        </div>
      </div>

      {/* Score deltas */}
      {data.deltas && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <DeltaBadge value={data.deltas.overall} label="Overall" />
          <DeltaBadge value={data.deltas.security} label="Security" />
          <DeltaBadge value={data.deltas.performance} label="Performance" />
          <DeltaBadge value={data.deltas.architecture} label="Architecture" />
        </motion.div>
      )}

      {/* Line chart */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(20,20,30,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 11,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.6)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              iconType="circle"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="overall"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 2, fill: "#22d3ee" }}
              activeDot={{ r: 4 }}
              name="Overall"
            />
            <Line
              type="monotone"
              dataKey="security"
              stroke="#f472b6"
              strokeWidth={1.5}
              dot={false}
              name="Security"
            />
            <Line
              type="monotone"
              dataKey="performance"
              stroke="#34d399"
              strokeWidth={1.5}
              dot={false}
              name="Performance"
            />
            <Line
              type="monotone"
              dataKey="architecture"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              name="Architecture"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top languages */}
      {data.topLanguages.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3 w-3" />
            Top Languages Analyzed
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.topLanguages.map((lang) => {
              const color = LANGUAGE_COLORS[lang.name] ?? "#64748b";
              const maxCount = data.topLanguages[0]?.count ?? 1;
              const intensity = 0.15 + (lang.count / maxCount) * 0.35;
              return (
                <span
                  key={lang.name}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    color,
                    background: `${color}${Math.round(intensity * 255)
                      .toString(16)
                      .padStart(2, "0")}`,
                    border: `1px solid ${color}33`,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  {lang.name}
                  <span className="text-[9px] opacity-60">×{lang.count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Average score footer */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Overall Score</span>
        <span className="text-lg font-bold tabular-nums text-cyan-300" style={{ textShadow: "0 0 12px #22d3ee80" }}>
          {data.avgOverall}
        </span>
      </div>
    </GlassCard>
  );
}
