"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Gauge,
  Network,
  Wrench,
  Code2,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  FolderGit2,
  Activity,
  Clock,
  FileCode,
  Cpu,
} from "lucide-react";
import { GlassCard, ScoreGauge, GradientText, NeonDivider, StatPill } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { AnalysisReport } from "@/lib/types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export function DashboardView() {
  const { t } = useT();
  const activeReport = useAppStore((s) => s.activeReport);
  const setView = useAppStore((s) => s.setView);

  if (!activeReport) {
    return <EmptyDashboard />;
  }

  const r = activeReport;
  const scoreCards = [
    { label: "Security", value: r.scores.security, icon: ShieldCheck, color: "#f472b6", delta: "+4" },
    { label: "Performance", value: r.scores.performance, icon: Gauge, color: "#34d399", delta: "+2" },
    { label: "Architecture", value: r.scores.architecture, icon: Network, color: "#a78bfa", delta: "+6" },
    { label: "Maintainability", value: r.scores.maintainability, icon: Wrench, color: "#fbbf24", delta: "-1" },
    { label: "Code Quality", value: r.scores.codeQuality, icon: Code2, color: "#60a5fa", delta: "+3" },
  ];

  const breakdownData = r.scoreBreakdown.map((b) => ({
    name: b.label,
    value: b.score,
    fill: ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"][r.scoreBreakdown.indexOf(b) % 5],
  }));

  const languageData = r.languages.slice(0, 6).map((l) => ({ name: l.name, value: l.percentage, color: l.color }));
  const complexityData = r.complexityTrend.map((c) => ({ name: c.label, value: c.value }));
  const activityData = r.activity.map((a) => ({ name: a.label, value: a.value }));
  const maintainabilityData = (r.maintainabilityTrend ?? []).map((m) => ({ name: m.label, value: m.value }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderGit2 className="h-4 w-4 text-cyan-300" />
            <span>{r.repoOwner}/{r.repoName}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px]">{r.repoBranch}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            Repository <GradientText>Intelligence</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">{r.summary}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setView("project")}
            className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> {t("dashboard", "fullReport")}
          </Button>
          <Button onClick={() => setView("chat")} variant="outline">
            <Cpu className="mr-1.5 h-4 w-4" /> {t("dashboard", "askAI")}
          </Button>
        </div>
      </motion.div>

      {/* top row: overall gauge + score cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard strong className="p-6 lg:col-span-1">
          <div className="flex flex-col items-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("dashboard", "overallHealth")}</p>
            <div className="mt-3">
              <ScoreGauge value={r.scores.overall} size={160} stroke={12} label="Score" color="#22d3ee" />
            </div>
            <div className="mt-4 flex gap-2">
              <StatPill label="Files" value={r.totalFiles} />
              <StatPill label="Lines" value={r.totalLines.toLocaleString()} />
              <StatPill label="Lang" value={r.primaryLanguage} accent="#22d3ee" />
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2">
          {scoreCards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard hover className="group h-full p-4">
                  <div className="flex items-start justify-between">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: `${c.color}1a`, border: `1px solid ${c.color}33` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: c.color }} />
                    </div>
                    <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-400">
                      <TrendingUp className="h-3 w-3" /> {c.delta}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums" style={{ color: c.color }}>
                    {c.value}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: c.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${c.value}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                    />
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard className="flex h-full flex-col justify-center p-4">
              <Activity className="h-5 w-5 text-cyan-300" />
              <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">{t("dashboard", "techDebt")}</p>
              <p className="text-3xl font-bold tabular-nums text-amber-400">{r.technicalDebt.score}</p>
              <p className="text-[10px] text-muted-foreground">{r.technicalDebt.items.length} items logged</p>
            </GlassCard>
          </motion.div>
        </div>
      </div>

      {/* charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Score breakdown radar */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard", "scoreBreakdown")}</h3>
            <span className="text-[11px] text-muted-foreground">weighted</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="30%" outerRadius="100%" data={breakdownData} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={8} />
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {breakdownData.map((b) => (
              <div key={b.name} className="text-center">
                <span className="mx-auto block h-2 w-2 rounded-full" style={{ background: b.fill }} />
                <span className="text-[9px] text-muted-foreground">{b.name.slice(0, 4)}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Languages */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard", "languages")}</h3>
            <span className="text-[11px] text-muted-foreground">{r.languages.length} detected</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={languageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {languageData.map((l) => (
                      <Cell key={l.name} fill={l.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {languageData.map((l) => (
                <div key={l.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                    {l.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{l.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Complexity trend */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard", "complexityTrend")}</h3>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> last 8 months
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={complexityData}>
                <defs>
                  <linearGradient id="cpx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} fill="url(#cpx)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Activity */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard", "commitActivity")}</h3>
            <span className="text-[11px] text-muted-foreground">this week</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(34,211,238,0.06)" }}
                  contentStyle={{ background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {activityData.map((_, i) => (
                    <Cell key={i} fill={i === activityData.length - 1 ? "#22d3ee" : "rgba(34,211,238,0.5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Maintainability trend + dead code summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard", "maintainabilityTrend")}</h3>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> last 8 months
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={maintainabilityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  dot={{ fill: "#34d399", r: 3 }}
                  activeDot={{ r: 5, fill: "#6ee7b7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-sm font-semibold">{t("dashboard", "codeHygiene")}</h3>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3">
              <div>
                <p className="text-xs font-medium text-rose-300">{t("dashboard", "deadCodeFiles")}</p>
                <p className="text-[10px] text-muted-foreground">{r.deadCode?.length ?? 0} removable</p>
              </div>
              <span className="text-2xl font-bold tabular-nums text-rose-400">{r.deadCode?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div>
                <p className="text-xs font-medium text-amber-300">{t("dashboard", "duplicateClusters")}</p>
                <p className="text-[10px] text-muted-foreground">{r.duplicates?.length ?? 0} groups found</p>
              </div>
              <span className="text-2xl font-bold tabular-nums text-amber-400">{r.duplicates?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
              <div>
                <p className="text-xs font-medium text-cyan-300">{t("dashboard", "circularDeps")}</p>
                <p className="text-[10px] text-muted-foreground">{r.dependencies.circular.length} detected</p>
              </div>
              <span className="text-2xl font-bold tabular-nums text-cyan-400">{r.dependencies.circular.length}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tags + frameworks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="mb-3 text-sm font-semibold">{t("dashboard", "frameworks")}</h3>
          <div className="space-y-2">
            {r.frameworks.map((f) => (
              <div key={f.name} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400/10 text-xs font-bold text-cyan-300">
                  {f.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{f.name} <span className="text-muted-foreground">{f.version}</span></p>
                  <p className="text-[11px] text-muted-foreground">{f.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-emerald-400">{f.confidence}%</p>
                  <p className="text-[10px] text-muted-foreground">{t("dashboard", "confidence")}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="mb-3 text-sm font-semibold">{t("dashboard", "topIssues")}</h3>
          <div className="space-y-2">
            {[...r.issues.security, ...r.issues.bugs, ...r.issues.performance].slice(0, 5).map((iss) => (
              <button
                key={iss.id}
                onClick={() => setView("project")}
                className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: iss.severity === "critical" ? "#ff5470" : iss.severity === "high" ? "#ff9f43" : "#fbbf24",
                    boxShadow: `0 0 8px ${iss.severity === "critical" ? "#ff5470" : iss.severity === "high" ? "#ff9f43" : "#fbbf24"}`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{iss.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{iss.file}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function EmptyDashboard() {
  const { t } = useT();
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <GlassCard strong className="p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
            <FileCode className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold">{t("dashboard", "noRepo")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t("dashboard", "noRepoDesc")}
          </p>
          <Button
            onClick={() => setView("analyze")}
            className="mt-6 bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {t("dashboard", "fullReport")}
          </Button>
        </GlassCard>
      </motion.div>
    </div>
  );
}
