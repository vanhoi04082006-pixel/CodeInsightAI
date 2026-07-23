"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Activity,
  MessageSquare,
  Crown,
  Cpu,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  Sparkles,
  ArrowUpRight,
  Server,
  Database,
  Zap,
  Clock,
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
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar } from "@/components/views/admin-view";

type Stats = {
  totals: {
    users: number;
    analyses: number;
    chatMessages: number;
    proUsers: number;
    teamUsers: number;
    enterpriseUsers: number;
    activeSubs: number;
    mrr: number;
    providers: number;
    credentials: number;
  };
  deltas: {
    analyses: { value: number; percent: number };
    users: { value: number; percent: number };
    chats: { value: number; percent: number };
  };
  recentSignups: Array<{ id: string; name: string | null; email: string | null; image: string | null; plan: string; createdAt: string }>;
  topUsers: Array<{ id: string; name: string | null; email: string | null; image: string | null; plan: string; analysisCount: number }>;
  providerUsage: Array<{ providerId: string; count: number }>;
  recentAnalyses: Array<{ id?: string; repoOwner: string; repoName: string; overallScore: number; createdAt: string; user: { name: string | null; email: string | null; image: string | null } | null }>;
  trends: {
    analyses: Array<{ date: string; count: number }>;
    users: Array<{ date: string; count: number }>;
    chats: Array<{ date: string; count: number }>;
  };
};

const PROVIDER_COLORS: Record<string, string> = {
  openrouter: "#a78bfa",
  openai: "#10a37f",
  anthropic: "#d97706",
  gemini: "#4285f4",
  deepseek: "#4d6bfe",
  groq: "#f55036",
  mistral: "#ff7000",
  xai: "#ffffff",
  together: "#000000",
  fireworks: "#ef4242",
  ollama: "#ffffff",
  lmstudio: "#22d3ee",
  azure: "#0078d4",
  custom: "#64748b",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b",
  pro: "#a78bfa",
  team: "#22d3ee",
  enterprise: "#fbbf24",
};

export function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<any>(null);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as Stats;
      setStats(data);
    } catch {
      if (!silent) toast.error("Failed to load stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) setHealth(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadHealth();
    // Auto-refresh every 30s
    const interval = setInterval(() => {
      loadStats(true);
      loadHealth();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadStats, loadHealth]);

  if (loading || !stats) {
    return (
      <GlassCard className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          <p className="text-xs text-muted-foreground">Loading dashboard…</p>
        </div>
      </GlassCard>
    );
  }

  const metricCards = [
    {
      label: "Total Users",
      value: stats.totals.users,
      icon: Users,
      color: "#22d3ee",
      sub: `${stats.totals.proUsers} Pro · ${stats.totals.teamUsers} Team`,
      delta: stats.deltas.users,
      spark: stats.trends.users,
    },
    {
      label: "Total Analyses",
      value: stats.totals.analyses,
      icon: Activity,
      color: "#a78bfa",
      sub: `${stats.totals.chatMessages} chat messages`,
      delta: stats.deltas.analyses,
      spark: stats.trends.analyses,
    },
    {
      label: "Chat Messages",
      value: stats.totals.chatMessages,
      icon: MessageSquare,
      color: "#f472b6",
      sub: "All-time conversations",
      delta: stats.deltas.chats,
      spark: stats.trends.chats,
    },
    {
      label: "Active Subs",
      value: stats.totals.activeSubs,
      icon: Crown,
      color: "#fbbf24",
      sub: `$${stats.totals.mrr}/mo MRR`,
      delta: null,
      spark: stats.trends.users,
    },
    {
      label: "AI Providers",
      value: stats.totals.providers,
      icon: Cpu,
      color: "#34d399",
      sub: `${stats.totals.credentials} user keys`,
      delta: null,
      spark: stats.trends.analyses,
    },
  ];

  // Merge trends for combined chart
  const combinedTrend = stats.trends.analyses.map((a, i) => ({
    date: a.date,
    label: new Date(a.date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
    analyses: a.count,
    chats: stats.trends.chats[i]?.count ?? 0,
    users: stats.trends.users[i]?.count ?? 0,
  }));

  return (
    <div className="space-y-5">
      {/* ── Header bar ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-cyan-300" />
            <GradientText>Platform Overview</GradientText>
          </h2>
          <p className="text-xs text-muted-foreground">
            Last 30 days · auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadStats(true); loadHealth(); }}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </motion.div>

      {/* ── Metric cards row ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {metricCards.map((c, i) => (
          <MetricCard key={c.label} card={c} index={i} />
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Activity trends (2/3 width) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <GlassCard hover className="h-full p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-cyan-300" />
                  Activity Trends
                </h3>
                <p className="text-[11px] text-muted-foreground">Analyses · Chats · New Users (30 days)</p>
              </div>
              <div className="flex gap-3 text-[10px]">
                <LegendDot color="#a78bfa" label="Analyses" />
                <LegendDot color="#f472b6" label="Chats" />
                <LegendDot color="#22d3ee" label="Users" />
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combinedTrend} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAnalyses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradChats" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,15,25,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      fontSize: 11,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}
                  />
                  <Area type="monotone" dataKey="analyses" stroke="#a78bfa" strokeWidth={2} fill="url(#gradAnalyses)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="chats" stroke="#f472b6" strokeWidth={2} fill="url(#gradChats)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="users" stroke="#22d3ee" strokeWidth={2} fill="url(#gradUsers)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </motion.div>

        {/* Provider usage donut (1/3 width) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard hover className="h-full p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-emerald-300" />
              Provider Usage
            </h3>
            <p className="text-[11px] text-muted-foreground">BYOK credentials by provider</p>
            {stats.providerUsage.length === 0 ? (
              <div className="flex h-48 items-center justify-center">
                <p className="text-xs text-muted-foreground">No providers yet</p>
              </div>
            ) : (
              <>
                <div className="relative mx-auto mt-4 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.providerUsage}
                        dataKey="count"
                        nameKey="providerId"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {stats.providerUsage.map((entry) => (
                          <Cell
                            key={entry.providerId}
                            fill={PROVIDER_COLORS[entry.providerId] ?? "#64748b"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,15,25,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 12,
                          fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {stats.providerUsage.reduce((s, p) => s + p.count, 0)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">total keys</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {stats.providerUsage.slice(0, 5).map((p) => (
                    <div key={p.providerId} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: PROVIDER_COLORS[p.providerId] ?? "#64748b" }}
                      />
                      <span className="flex-1 capitalize text-muted-foreground">{p.providerId}</span>
                      <span className="font-semibold tabular-nums">{p.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* ── Lists row ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent signups */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard hover className="h-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-violet-300" />
                Recent Signups
              </h3>
              <span className="text-[10px] text-muted-foreground">{stats.recentSignups.length} recent</span>
            </div>
            <div className="space-y-2">
              {stats.recentSignups.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No signups yet</p>
              ) : (
                stats.recentSignups.map((u, i) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + i * 0.04 }}
                    className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-cyan-400/20 hover:bg-white/[0.04]"
                  >
                    <Avatar name={u.name ?? u.email ?? "?"} image={u.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name ?? "Unknown"}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        background: `${PLAN_COLORS[u.plan] ?? "#64748b"}1a`,
                        color: PLAN_COLORS[u.plan] ?? "#64748b",
                        border: `1px solid ${PLAN_COLORS[u.plan] ?? "#64748b"}33`,
                      }}
                    >
                      {u.plan}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {timeAgo(u.createdAt)}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Top users */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard hover className="h-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Crown className="h-4 w-4 text-amber-300" />
                Top Users
              </h3>
              <span className="text-[10px] text-muted-foreground">by analysis count (30d)</span>
            </div>
            <div className="space-y-2">
              {stats.topUsers.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No activity yet</p>
              ) : (
                stats.topUsers.map((u, i) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + i * 0.04 }}
                    className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-amber-400/20 hover:bg-white/[0.04]"
                  >
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                      i === 0 && "bg-amber-500/20 text-amber-300",
                      i === 1 && "bg-slate-400/20 text-slate-300",
                      i === 2 && "bg-orange-700/20 text-orange-400",
                      i > 2 && "bg-white/5 text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>
                    <Avatar name={u.name ?? u.email ?? "?"} image={u.image} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name ?? "Unknown"}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-2 py-1">
                      <Activity className="h-3 w-3 text-cyan-300" />
                      <span className="text-xs font-bold tabular-nums text-cyan-300">{u.analysisCount}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* ── System health bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-300" />
              <span className="text-xs font-semibold">System Health</span>
            </div>
            <HealthChip
              icon={Database}
              label="Database"
              value={health?.services?.database ?? "—"}
              ok={health?.services?.database === "ok"}
            />
            <HealthChip
              icon={Zap}
              label="Job Queue"
              value={health?.services?.jobQueue ?? "—"}
              ok={health?.services?.jobQueue === "ok"}
            />
            <HealthChip
              icon={Activity}
              label="Active Jobs"
              value={health?.stats?.activeJobs ?? 0}
            />
            <HealthChip
              icon={Cpu}
              label="Memory"
              value={health?.stats?.memory?.used ?? "—"}
            />
            <HealthChip
              icon={Clock}
              label="Latency"
              value={health ? `${health.latencyMs}ms` : "—"}
            />
            <HealthChip
              icon={Clock}
              label="Uptime"
              value={health ? `${Math.round((health.stats?.uptime ?? 0) / 60)}m` : "—"}
            />
          </div>
        </GlassCard>
      </motion.div>

      {/* ── Recent analyses ── */}
      {stats.recentAnalyses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <GlassCard hover className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-cyan-300" />
                Recent Analyses
              </h3>
              <span className="text-[10px] text-muted-foreground">{stats.recentAnalyses.length} recent</span>
            </div>
            <div className="space-y-2">
              {stats.recentAnalyses.map((a, i) => (
                <motion.div
                  key={a.id ?? i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + i * 0.03 }}
                  className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition hover:border-cyan-400/20 hover:bg-white/[0.04]"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      background: a.overallScore >= 80 ? "#34d3991a" : a.overallScore >= 60 ? "#fbbf241a" : "#f472b61a",
                      color: a.overallScore >= 80 ? "#34d399" : a.overallScore >= 60 ? "#fbbf24" : "#f472b6",
                      border: `1px solid ${a.overallScore >= 80 ? "#34d39933" : a.overallScore >= 60 ? "#fbbf2433" : "#f472b633"}`,
                    }}
                  >
                    {a.overallScore}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.repoOwner}/{a.repoName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {a.user?.name ?? a.user?.email ?? "Anonymous"}
                    </p>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{timeAgo(a.createdAt)}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}

/* ---------- Metric Card ---------- */
function MetricCard({
  card,
  index,
}: {
  card: {
    label: string;
    value: number;
    icon: typeof Users;
    color: string;
    sub: string;
    delta: { value: number; percent: number } | null;
    spark: Array<{ date: string; count: number }>;
  };
  index: number;
}) {
  const Icon = card.icon;
  const delta = card.delta;
  const DeltaIcon = !delta || delta.percent === 0 ? Minus : delta.percent > 0 ? TrendingUp : TrendingDown;
  const deltaColor = !delta || delta.percent === 0 ? "#64748b" : delta.percent > 0 ? "#34d399" : "#ff5470";

  // Sparkline data
  const max = Math.max(...card.spark.map((s) => s.count), 1);
  const sparkPoints = card.spark.map((s, i) => ({
    x: (i / (card.spark.length - 1 || 1)) * 100,
    y: 100 - (s.count / max) * 100,
  }));
  const sparkPath = sparkPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const sparkArea = `${sparkPath} L100,100 L0,100 Z`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.05 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <GlassCard hover className="group relative h-full overflow-hidden p-5">
        {/* Glow background */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
          style={{ background: card.color }}
        />
        {/* Icon + delta */}
        <div className="relative flex items-start justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: `${card.color}1a`,
              border: `1px solid ${card.color}33`,
              boxShadow: `0 0 20px ${card.color}20`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: card.color }} />
          </div>
          {delta && (
            <span
              className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: `${deltaColor}15`, color: deltaColor, border: `1px solid ${deltaColor}30` }}
            >
              <DeltaIcon className="h-3 w-3" />
              {delta.percent > 0 ? "+" : ""}
              {delta.percent}%
            </span>
          )}
        </div>
        {/* Value */}
        <div className="relative mt-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</p>
          <p
            className="mt-0.5 text-3xl font-bold tabular-nums"
            style={{ color: card.color, textShadow: `0 0 16px ${card.color}40` }}
          >
            {card.value.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{card.sub}</p>
        </div>
        {/* Sparkline */}
        <div className="relative mt-3 h-10">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id={`spark-${card.label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={card.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={card.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={sparkArea} fill={`url(#spark-${card.label})`} />
            <path d={sparkPath} fill="none" stroke={card.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </GlassCard>
    </motion.div>
  );
}

/* ---------- Legend Dot ---------- */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ---------- Health Chip ---------- */
function HealthChip({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Server;
  label: string;
  value: string | number;
  ok?: boolean;
}) {
  const color = ok === true ? "#34d399" : ok === false ? "#ff5470" : "#a78bfa";
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span className="text-[11px] text-muted-foreground">{label}:</span>
      <span className="text-[11px] font-semibold" style={{ color }}>
        {String(value)}
      </span>
    </div>
  );
}

/* ---------- Helpers ---------- */
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return date.toLocaleDateString();
}
