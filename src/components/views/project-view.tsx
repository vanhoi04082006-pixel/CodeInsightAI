"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  LayoutGrid,
  Network,
  Bug,
  ShieldCheck,
  Gauge,
  Boxes,
  FileText,
  Rocket,
  Download,
  Share2,
  Sparkles,
  FileCode,
  TrendingUp,
  DollarSign,
  ExternalLink,
  Copy,
  Check,
  GitBranch,
} from "lucide-react";
import { GlassCard, ScoreGauge, GradientText, NeonDivider, SeverityBadge } from "@/components/shared/ui";
import { DependencyGraph } from "@/components/shared/dependency-graph";
import { CodeViewer } from "@/components/shared/code-viewer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppStore } from "@/lib/store";
import type { AnalysisReport, Issue } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "overview" | "architecture" | "bugs" | "security" | "performance" | "dependencies" | "code" | "docs" | "roadmap";

const TABS: { id: Tab; labelKey: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", labelKey: "overview", icon: LayoutGrid },
  { id: "architecture", labelKey: "architecture", icon: Network },
  { id: "bugs", labelKey: "bugs", icon: Bug },
  { id: "security", labelKey: "security", icon: ShieldCheck },
  { id: "performance", labelKey: "performance", icon: Gauge },
  { id: "dependencies", labelKey: "dependencies", icon: Boxes },
  { id: "code", labelKey: "code", icon: FileCode },
  { id: "docs", labelKey: "docs", icon: FileText },
  { id: "roadmap", labelKey: "roadmap", icon: Rocket },
];

export function ProjectView() {
  const { t } = useT();
  const report = useAppStore((s) => s.activeReport);
  const setView = useAppStore((s) => s.setView);
  const [tab, setTab] = useState<Tab>("overview");

  if (!report) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <FileCode className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-4 text-xl font-bold">{t("reports", "noReport")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Analyze a repository first to view its full report.</p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            Start analysis
          </Button>
        </GlassCard>
      </div>
    );
  }

  const exportMarkdown = () => {
    const md = `# ${report.repoOwner}/${report.repoName} — AI Report\n\n${report.summary}\n\n## Scores\n- Overall: ${report.scores.overall}\n- Security: ${report.scores.security}\n- Performance: ${report.scores.performance}\n- Architecture: ${report.scores.architecture}\n- Maintainability: ${report.scores.maintainability}\n\n## Top Issues\n${[...report.issues.security, ...report.issues.bugs, ...report.issues.performance].map((i) => `- [${i.severity}] ${i.title}`).join("\n")}\n`;
    navigator.clipboard.writeText(md);
    toast.success(t("reports", "exportMarkdown"));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <a href={report.repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-cyan-300">
              {report.repoOwner}/{report.repoName} <ExternalLink className="h-3 w-3" />
            </a>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px]">{report.repoBranch}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            Project <GradientText>Report</GradientText>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{report.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from(new Set(report.tags)).map((t, i) => (
              <span key={`${t}-${i}`} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportMarkdown} variant="outline" size="sm">
            <Download className="mr-1.5 h-4 w-4" /> Markdown
          </Button>
          <Button onClick={() => toast.success(t("reports", "shareLink"))} variant="outline" size="sm">
            <Share2 className="mr-1.5 h-4 w-4" /> Share
          </Button>
          <Button onClick={() => setView("chat")} size="sm" className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Sparkles className="mr-1.5 h-4 w-4" /> Ask AI
          </Button>
        </div>
      </motion.div>

      {/* tabs */}
      <div className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <div className="overflow-x-auto scrollbar-thin">
            <TabsList className="inline-flex h-auto gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = tab.id === "bugs" ? report.issues.bugs.length : tab.id === "security" ? report.issues.security.length : tab.id === "performance" ? report.issues.performance.length : 0;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-violet-500/20 data-[state=active]:text-cyan-300"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t("reports", tab.labelKey)}
                    {count > 0 && (
                      <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{count}</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab report={report} />
          </TabsContent>
          <TabsContent value="architecture" className="mt-4">
            <ArchitectureTab report={report} />
          </TabsContent>
          <TabsContent value="bugs" className="mt-4">
            <IssuesTab issues={report.issues.bugs} title="Bug Detection" color="#fbbf24" report={report} />
          </TabsContent>
          <TabsContent value="security" className="mt-4">
            <IssuesTab issues={report.issues.security} title="Security Audit" color="#f472b6" report={report} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <IssuesTab issues={report.issues.performance} title="Performance Analysis" color="#34d399" report={report} />
          </TabsContent>
          <TabsContent value="dependencies" className="mt-4">
            <DependenciesTab report={report} />
          </TabsContent>
          <TabsContent value="code" className="mt-4">
            <CodeTab report={report} />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <DocsTab report={report} />
          </TabsContent>
          <TabsContent value="roadmap" className="mt-4">
            <RoadmapTab report={report} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function OverviewTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassCard strong className="p-6 lg:col-span-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports", "healthScore")}</p>
        <div className="mt-3 flex justify-center">
          <ScoreGauge value={report.scores.overall} size={150} stroke={11} label="Overall" color="#22d3ee" />
        </div>
        <NeonDivider className="my-4" />
        <div className="space-y-2">
          {report.scoreBreakdown.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-medium tabular-nums">{b.score}/100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${b.score}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6 lg:col-span-2">
        <h3 className="text-sm font-semibold">{t("reports", "aiSummary")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{report.summary}</p>
        <NeonDivider className="my-4" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("reports", "primaryLanguage")} value={report.primaryLanguage} />
          <Stat label={t("reports", "totalFiles")} value={report.totalFiles} />
          <Stat label={t("reports", "totalLines")} value={report.totalLines.toLocaleString()} />
          <Stat label={t("reports", "frameworks")} value={report.frameworks.length} />
          <Stat label="Languages" value={report.languages.length} />
          <Stat label={t("reports", "bugsFound")} value={report.issues.bugs.length} accent="#fbbf24" />
          <Stat label={t("reports", "securityIssues")} value={report.issues.security.length} accent="#f472b6" />
          <Stat label={t("reports", "perfIssues")} value={report.issues.performance.length} accent="#34d399" />
        </div>

        <NeonDivider className="my-4" />
        <h4 className="text-sm font-semibold">Key files</h4>
        <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
          {report.files.slice(0, 8).map((f) => (
            <div key={f.path} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <FileCode className="h-4 w-4 shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{f.path}</p>
                <p className="truncate text-[10px] text-muted-foreground">{f.description}</p>
              </div>
              <div className="flex shrink-0 gap-2 text-[10px] text-muted-foreground">
                <span>{f.lines}L</span>
                <span className={f.complexity > 15 ? "text-amber-400" : ""}>Cx {f.complexity}</span>
                {f.issues > 0 && <span className="text-rose-400">{f.issues}⚠</span>}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- Architecture ---------- */
function ArchitectureTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  const a = report.architecture;
  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Network className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">Pattern: <GradientText>{a.pattern}</GradientText></h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{a.description}</p>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-6">
          <h4 className="text-sm font-semibold text-emerald-400">{t("reports", "strengths")}</h4>
          <ul className="mt-3 space-y-2">
            {a.strengths.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 text-sm"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-foreground/85">{s}</span>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard className="p-6">
          <h4 className="text-sm font-semibold text-rose-400">{t("reports", "weaknesses")}</h4>
          <ul className="mt-3 space-y-2">
            {a.weaknesses.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                <span className="text-foreground/85">{s}</span>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <GlassCard className="p-6">
        <h4 className="text-sm font-semibold">{t("reports", "architectureLayers")}</h4>
        <div className="mt-4 space-y-2">
          {a.layers.map((l, i) => (
            <motion.div
              key={l.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                style={{ background: ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"][i % 4] + "1a", color: ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"][i % 4] }}
              >
                L{i + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{l.name}</p>
                <p className="text-[11px] text-muted-foreground">{l.responsibility}</p>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{l.files} files</span>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- Issues (shared for bugs/security/performance) ---------- */
function IssuesTab({ issues, title, color, report }: { issues: Issue[]; title: string; color: string; report: AnalysisReport }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState<string | null>(issues[0]?.id ?? null);
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}>
              {title.includes("Security") ? <ShieldCheck className="h-4 w-4" /> : title.includes("Performance") ? <Gauge className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
          <div className="flex gap-1.5">
            {["critical", "high", "medium", "low"].map((sev) => {
              const count = issues.filter((i) => i.severity === sev).length;
              if (!count) return null;
              return (
                <span key={sev} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px]">
                  {count} {sev}
                </span>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <div className="space-y-2">
        {issues.map((iss, i) => {
          const open = expanded === iss.id;
          return (
            <motion.div
              key={iss.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassCard className="overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : iss.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <SeverityBadge severity={iss.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{iss.title}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{iss.file}{iss.line ? `:${iss.line}` : ""}</p>
                  </div>
                  <span className="hidden shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] uppercase text-muted-foreground sm:block">{iss.category}</span>
                  <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{iss.effort}</span>
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/5 p-4">
                        <p className="text-sm leading-relaxed text-foreground/85">{iss.description}</p>
                        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                            <Sparkles className="h-3.5 w-3.5" /> AI Recommendation
                          </p>
                          <p className="mt-1 text-sm text-foreground/85">{iss.recommendation}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Dependencies ---------- */
function DependenciesTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">Interactive Dependency Graph</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag to pan · scroll-click a node to inspect · circular dependencies highlighted in red.
        </p>
      </GlassCard>
      <DependencyGraph report={report} />

      {/* Dead code + duplicates */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-rose-400" />
            <h4 className="text-sm font-semibold">{t("reports", "deadCode")} <span className="text-muted-foreground">({report.deadCode.length})</span></h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Files with no inbound references — safe candidates for removal.</p>
          <div className="mt-3 space-y-1.5">
            {report.deadCode.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">No dead code detected — clean codebase.</p>
            ) : (
              report.deadCode.map((d, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    <p className="truncate font-mono text-[11px]">{d.path}</p>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{d.lines}L</span>
                  </div>
                  <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">{d.reason}</p>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold">{t("reports", "duplicateCode")} <span className="text-muted-foreground">({report.duplicates.length})</span></h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Clusters of near-identical blocks — extract a shared helper.</p>
          <div className="mt-3 space-y-1.5">
            {report.duplicates.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">No significant duplication found.</p>
            ) : (
              report.duplicates.map((d, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">GROUP {d.group}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.lines} lines duplicated</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {d.files.map((f) => (
                      <p key={f} className="truncate pl-3 font-mono text-[10px] text-muted-foreground">{f}</p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h4 className="text-sm font-semibold">{t("reports", "allFiles")}</h4>
        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
          {report.files.map((f) => (
            <div key={f.path} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="truncate font-mono text-xs">{f.path}</p>
              <div className="ml-auto flex shrink-0 gap-3 text-[10px] text-muted-foreground">
                <span>{f.language}</span>
                <span>{f.lines}L</span>
                <span className={f.complexity > 15 ? "text-amber-400" : ""}>Cx{f.complexity}</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- Code ---------- */
function CodeTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">{t("reports", "aiCodeExplorer")}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Representative snippets parsed from the codebase, each with syntax highlighting and an AI explanation of what it does and how to improve it.
        </p>
      </GlassCard>
      <CodeViewer snippets={report.snippets} />
    </div>
  );
}

/* ---------- Docs ---------- */
function DocsTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  const [copied, setCopied] = useState<"readme" | "api" | null>(null);
  const [diagram, setDiagram] = useState<"uml" | "sequence" | "erd">("uml");
  const copy = (which: "readme" | "api") => {
    navigator.clipboard.writeText(which === "readme" ? report.documentation.readme : report.documentation.apiDocs);
    setCopied(which);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };
  const diagrams = report.diagrams;
  const diagramTab = { uml: { svg: diagrams.uml, title: "UML Class Diagram", desc: diagrams.umlExplanation, icon: Network }, sequence: { svg: diagrams.sequence, title: "Sequence Diagram", desc: diagrams.sequenceExplanation, icon: GitBranch }, erd: { svg: diagrams.erd, title: "Database ER Diagram", desc: diagrams.erdExplanation, icon: Boxes } }[diagram];
  return (
    <div className="space-y-4">
      {/* Diagrams */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-cyan-300" /> Generated Diagrams</h4>
          <div className="inline-flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([["uml", "UML"], ["sequence", "Sequence"], ["erd", "ERD"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setDiagram(id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition",
                  diagram === id ? "bg-gradient-to-r from-cyan-500/30 to-violet-500/30 text-cyan-300" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto scrollbar-thin rounded-lg border border-white/5 bg-black/30 p-3">
          <div className="mx-auto min-w-[480px]" dangerouslySetInnerHTML={{ __html: diagramTab.svg }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{diagramTab.desc}</p>
      </GlassCard>

      {/* README + API docs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-cyan-300" /> Generated README.md</h4>
            <Button size="sm" variant="ghost" onClick={() => copy("readme")}>
              {copied === "readme" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
{report.documentation.readme}
          </pre>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-violet-300" /> API Documentation</h4>
            <Button size="sm" variant="ghost" onClick={() => copy("api")}>
              {copied === "api" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
{report.documentation.apiDocs}
          </pre>
        </GlassCard>
      </div>
    </div>
  );
}

/* ---------- Roadmap ---------- */
function RoadmapTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-cyan-300" />
            <h3 className="text-lg font-semibold">{t("reports", "featureRoadmap")}</h3>
          </div>
          <div className="mt-3 space-y-2">
            {report.roadmap.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                      r.priority === "high" ? "bg-rose-400/15 text-rose-400" : r.priority === "medium" ? "bg-amber-400/15 text-amber-400" : "bg-cyan-400/15 text-cyan-300"
                    )}
                  >
                    {r.priority}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">{r.category}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <h3 className="text-lg font-semibold">{t("reports", "monetization")}</h3>
            </div>
            <div className="mt-3 space-y-2">
              {report.monetization.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{m.title}</p>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        m.potential === "high" ? "bg-emerald-400/15 text-emerald-400" : m.potential === "medium" ? "bg-amber-400/15 text-amber-400" : "bg-white/10 text-muted-foreground"
                      )}
                    >
                      {m.potential}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                </motion.div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-400" />
              <h3 className="text-lg font-semibold">Technical Debt — {report.technicalDebt.score}/100</h3>
            </div>
            <div className="mt-3 space-y-1.5">
              {report.technicalDebt.items.map((t, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="flex-1">{t.title}</span>
                  <span className="text-muted-foreground">{t.impact}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{t.estimate}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: accent }}>{value}</p>
    </div>
  );
}
