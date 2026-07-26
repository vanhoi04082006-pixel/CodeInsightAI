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
  Activity,
  Loader2,
  Zap,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { GlassCard, ScoreGauge, GradientText, NeonDivider, SeverityBadge } from "@/components/shared/ui";
import { DependencyGraph } from "@/components/shared/dependency-graph";
import { CodeGraphView } from "@/components/shared/codegraph-view";
import { CodeViewer } from "@/components/shared/code-viewer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppStore } from "@/lib/store";
import type { AnalysisReport, Issue, CodeSnippet } from "@/lib/types";
import { toast } from "sonner";
import { useT, useI18nStore } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "overview" | "architecture" | "bugs" | "security" | "performance" | "dependencies" | "code" | "docs" | "roadmap" | "codegraph";

const TABS: { id: Tab; labelKey: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", labelKey: "overview", icon: LayoutGrid },
  { id: "architecture", labelKey: "architecture", icon: Network },
  { id: "bugs", labelKey: "bugs", icon: Bug },
  { id: "security", labelKey: "security", icon: ShieldCheck },
  { id: "performance", labelKey: "performance", icon: Gauge },
  { id: "dependencies", labelKey: "dependencies", icon: Boxes },
  { id: "codegraph", labelKey: "codegraph", icon: Network },
  { id: "code", labelKey: "code", icon: FileCode },
  { id: "docs", labelKey: "docs", icon: FileText },
  { id: "roadmap", labelKey: "roadmap", icon: Rocket },
];

export function ProjectView({ isShared = false }: { isShared?: boolean }) {
  const { t } = useT();
  const report = useAppStore((s) => s.activeReport);
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const setView = useAppStore((s) => s.setView);
  const aiPending = useAppStore((s) => s.aiPending);
  const [tab, setTab] = useState<Tab>("overview");
  const [sharing, setSharing] = useState(false);

  if (!report) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <FileCode className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-4 text-xl font-bold">{t("reports", "noReport")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("reports", "noReportDesc")}</p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            {t("reports", "startAnalysis")}
          </Button>
        </GlassCard>
      </div>
    );
  }

  const shareReport = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const analysisId = activeAnalysisId || (report as any).id;
      if (!analysisId) {
        toast.error(t("reports", "project.cannotShareNotSaved"));
        return;
      }
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        toast.success(t("reports", "project.shareLinkCopied"), {
          description: t("reports", "project.shareLinkExpires"),
        });
      } else {
        toast.error(data.error || t("reports", "project.shareFailed"));
      }
    } catch (e) {
      toast.error(t("reports", "project.shareError"));
    } finally {
      setSharing(false);
    }
  };

  const exportMarkdown = () => {
    const md = `# ${report.repoOwner}/${report.repoName} — AI Report\n\n${report.summary}\n\n## Scores\n- Overall: ${report.scores.overall}\n- Security: ${report.scores.security}\n- Performance: ${report.scores.performance}\n- Architecture: ${report.scores.architecture}\n- Maintainability: ${report.scores.maintainability}\n\n## Top Issues\n${[...report.issues.security, ...report.issues.bugs, ...report.issues.performance].map((i) => `- [${i.severity}] ${i.title}`).join("\n")}\n`;
    navigator.clipboard.writeText(md);
    toast.success(t("reports", "exportMarkdown"));
  };

  const downloadMarkdown = () => {
    const md = `# ${report.repoOwner}/${report.repoName} — AI Report\n\n${report.summary}\n\n## Scores\n- Overall: ${report.scores.overall}\n- Security: ${report.scores.security}\n- Performance: ${report.scores.performance}\n- Architecture: ${report.scores.architecture}\n- Maintainability: ${report.scores.maintainability}\n- Code Quality: ${report.scores.codeQuality}\n\n## Languages\n${report.languages.map(l => `- ${l.name}: ${l.percentage}%`).join("\n")}\n\n## Frameworks\n${report.frameworks.map(f => `- ${f.name} ${f.version}`).join("\n")}\n\n## Security Issues\n${report.issues.security.map(i => `- [${i.severity}] ${i.title} (${i.file})\n  ${i.recommendation}`).join("\n")}\n\n## Bug Issues\n${report.issues.bugs.map(i => `- [${i.severity}] ${i.title} (${i.file})\n  ${i.recommendation}`).join("\n")}\n\n## Performance Issues\n${report.issues.performance.map(i => `- [${i.severity}] ${i.title} (${i.file})\n  ${i.recommendation}`).join("\n")}\n\n## Architecture\n- Pattern: ${report.architecture.pattern}\n- Strengths: ${report.architecture.strengths.join("; ")}\n- Weaknesses: ${report.architecture.weaknesses.join("; ")}\n\n## Technical Debt\n- Score: ${report.technicalDebt.score}/100\n${report.technicalDebt.items.map(item => `- ${item.title} (${item.impact}) — ${item.estimate}`).join("\n")}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.repoOwner}-${report.repoName}-report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("reports", "project.downloadedMarkdown"));
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.repoOwner}-${report.repoName}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("reports", "project.downloadedJson"));
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
            {(report as any).aiEnhancement?.aiBadge === "ai-enhanced" ? (
              <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                <Activity className="h-3 w-3" /> {t("reports", "project.staticAnalysis")}
              </span>
            )}
            {/* AI status indicator */}
            {aiPending && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("reports", "project.aiAnalyzing")}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            {t("reports", "project.titleProject")} <GradientText>{t("reports", "project.titleReport")}</GradientText>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {(report as any).aiEnhancement?.aiSummary || report.summary}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from(new Set(report.tags)).map((t, i) => (
              <span key={`${t}-${i}`} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-muted-foreground">{String(t)}</span>
            ))}
          </div>
        </div>
        {/* Action buttons — hidden in shared (read-only) mode */}
        {!isShared && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportMarkdown} variant="outline" size="sm">
              <Copy className="mr-1.5 h-4 w-4" /> {t("reports", "project.copyMd")}
            </Button>
            <Button onClick={downloadMarkdown} variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" /> .md
            </Button>
            <Button onClick={downloadJSON} variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" /> .json
            </Button>
            <Button onClick={shareReport} variant="outline" size="sm" disabled={sharing}>
              {sharing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Share2 className="mr-1.5 h-4 w-4" />} {t("reports", "share")}
            </Button>
            <Button onClick={() => setView("chat")} size="sm" className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
              <Sparkles className="mr-1.5 h-4 w-4" /> {t("reports", "askAI")}
            </Button>
          </div>
        )}
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
            <IssuesTab id="bugs" issues={report.issues.bugs} title={t("reports", "project.bugDetection")} color="#fbbf24" report={report} />
          </TabsContent>
          <TabsContent value="security" className="mt-4">
            <IssuesTab id="security" issues={report.issues.security} title={t("reports", "project.securityAudit")} color="#f472b6" report={report} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <IssuesTab id="performance" issues={report.issues.performance} title={t("reports", "project.performanceAnalysis")} color="#34d399" report={report} />
          </TabsContent>
          <TabsContent value="dependencies" className="mt-4">
            <DependenciesTab report={report} />
          </TabsContent>
          <TabsContent value="codegraph" className="mt-4">
            <CodeGraphView analysisId={activeAnalysisId} />
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
  const aiPending = useAppStore((s) => s.aiPending);
  const deep = (report as any).deepAnalysis as any;
  const aiEnh = (report as any).aiEnhancement as any;
  const aiExecSummary: string | undefined = deep?.executiveSummary || aiEnh?.aiSummary;
  const hasAiExec = !!aiExecSummary;
  const aiOverview = deep?.aiOverview;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* AI Overview — top of the tab when AI deep analysis is available */}
      {aiOverview && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-6 lg:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-300" />
            <h3 className="text-sm font-semibold">{t("reports", "aiOverview.title")}</h3>
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">✨ AI</span>
          </div>

          {/* Health Assessment */}
          {aiOverview.healthAssessment && (
            <div className="mb-4">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-violet-300">{t("reports", "aiOverview.healthAssessment")}</p>
              <p className="text-sm leading-relaxed text-foreground/85">{aiOverview.healthAssessment}</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Risks */}
            {aiOverview.topRisks?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wider text-rose-400">{t("reports", "aiOverview.topRisks")}</h4>
                {(aiOverview.topRisks || []).slice(0, 3).map((risk: any, i: number) => (
                  <div key={i} className="mb-2 rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{risk.title}</span>
                      {risk.severity && <SeverityBadge severity={risk.severity} />}
                    </div>
                    {risk.description && <p className="mt-1 text-xs text-muted-foreground">{risk.description}</p>}
                    {risk.evidence && risk.evidence.length > 0 && <EvidenceChips evidence={risk.evidence} />}
                  </div>
                ))}
              </div>
            )}

            {/* Quick Wins */}
            {aiOverview.quickWins?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wider text-emerald-400">{t("reports", "aiOverview.quickWins")}</h4>
                {(aiOverview.quickWins || []).slice(0, 3).map((win: any, i: number) => (
                  <div key={i} className="mb-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{win.title}</span>
                      {win.effort && <span className="text-[10px] text-muted-foreground">{win.effort}</span>}
                    </div>
                    {win.description && <p className="mt-1 text-xs text-muted-foreground">{win.description}</p>}
                    {win.evidence && win.evidence.length > 0 && <EvidenceChips evidence={win.evidence} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fix First + Fastest Score Gain */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {aiOverview.fixFirst && (
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-400">{t("reports", "aiOverview.fixFirst")}</p>
                <p className="mt-1 text-sm text-foreground/85">{aiOverview.fixFirst}</p>
              </div>
            )}
            {aiOverview.fastestScoreGain && (
              <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wider text-cyan-300">{t("reports", "aiOverview.fastestScoreGain")}</p>
                <p className="mt-1 text-sm text-foreground/85">{aiOverview.fastestScoreGain}</p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <GlassCard strong className="p-6 lg:col-span-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports", "healthScore")}</p>
        <div className="mt-3 flex justify-center">
          <ScoreGauge value={report.scores.overall} size={150} stroke={11} label={t("reports", "project.scoreOverall")} color="#22d3ee" />
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t("reports", "aiSummary")}</h3>
          {hasAiExec && (
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{aiExecSummary || report.summary}</p>
        {aiPending && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("reports", "project.aiAnalyzing")}
          </p>
        )}
        <NeonDivider className="my-4" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("reports", "primaryLanguage")} value={report.primaryLanguage} />
          <Stat label={t("reports", "totalFiles")} value={report.totalFiles} />
          <Stat label={t("reports", "totalLines")} value={report.totalLines.toLocaleString()} />
          <Stat label={t("reports", "frameworks")} value={report.frameworks.length} />
          <Stat label={t("reports", "languages")} value={report.languages.length} />
          <Stat label={t("reports", "bugsFound")} value={report.issues.bugs.length} accent="#fbbf24" />
          <Stat label={t("reports", "securityIssues")} value={report.issues.security.length} accent="#f472b6" />
          <Stat label={t("reports", "perfIssues")} value={report.issues.performance.length} accent="#34d399" />
        </div>

        <NeonDivider className="my-4" />
        <h4 className="text-sm font-semibold">{t("reports", "keyFiles")}</h4>
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
  const deep = (report as any).deepAnalysis as any;
  const archReview = deep?.architectureReview;
  const bestPractices = deep?.bestPracticesAudit;
  return (
    <div className="space-y-4">
      {/* AI Architecture Review — deep analysis (shown above static content when AI is available) */}
      {archReview && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-5 w-5 text-violet-300" />
            <h3 className="text-lg font-semibold">{t("reports", "aiInsights.archReview")}</h3>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-400">{t("reports", "aiInsights.strengths")}</p>
              <ul className="mt-1 space-y-1">
                {archReview.strengths?.map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/85">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" /> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-rose-400">{t("reports", "aiInsights.weaknesses")}</p>
              <ul className="mt-1 space-y-1">
                {archReview.weaknesses?.map((w: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/85">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rose-400" /> {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {archReview.suggestions?.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-violet-300">{t("reports", "aiInsights.suggestions")}</p>
              {archReview.suggestions.map((s: any, i: number) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <p className="text-xs font-medium">{s.title} <span className="ml-1 text-[9px] text-muted-foreground">({s.effort})</span></p>
                  <p className="text-[11px] text-muted-foreground">{s.description}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Network className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">{t("reports", "pattern")}: <GradientText>{a.pattern}</GradientText></h3>
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
              <span className="text-xs tabular-nums text-muted-foreground">{l.files} {t("reports", "files")}</span>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Architecture Metrics — deep metrics from the import graph */}
      {a.metrics && (
        <GlassCard className="p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-300" />
            <h4 className="text-sm font-semibold">{t("reports", "architectureMetrics")}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "metricsDesc")}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard label={t("reports", "metricAvgCoupling")} value={a.metrics.avgCoupling.toFixed(2)} hint={t("reports", "project.metricHintAvgCoupling")} tone={a.metrics.avgCoupling > 8 ? "bad" : a.metrics.avgCoupling < 3 ? "good" : "neutral"} />
            <MetricCard label={t("reports", "metricAvgCohesion")} value={`${(a.metrics.avgCohesion * 100).toFixed(0)}%`} hint={t("reports", "project.metricHintAvgCohesion")} tone={a.metrics.avgCohesion > 0.5 ? "good" : a.metrics.avgCohesion < 0.2 ? "bad" : "neutral"} />
            <MetricCard label={t("reports", "metricInstability")} value={a.metrics.instability.toFixed(2)} hint={t("reports", "project.metricHintInstability")} tone={a.metrics.instability > 0.7 ? "bad" : a.metrics.instability < 0.3 ? "good" : "neutral"} />
            <MetricCard label={t("reports", "metricAbstractness")} value={a.metrics.abstractness.toFixed(2)} hint={t("reports", "project.metricHintAbstractness")} tone="neutral" />
            <MetricCard label={t("reports", "metricDistanceMain")} value={a.metrics.distanceFromMain.toFixed(2)} hint={t("reports", "project.metricHintDistanceMain")} tone={a.metrics.distanceFromMain > 0.5 ? "bad" : a.metrics.distanceFromMain < 0.2 ? "good" : "neutral"} />
            <MetricCard label={t("reports", "metricFanIn")} value={a.metrics.fanInAvg.toFixed(1)} hint={t("reports", "project.metricHintFanIn")} tone="neutral" />
            <MetricCard label={t("reports", "metricFanOut")} value={a.metrics.fanOutAvg.toFixed(1)} hint={t("reports", "project.metricHintFanOut")} tone="neutral" />
            <MetricCard label={t("reports", "metricFileCycles")} value={String(a.metrics.fileCircularDeps)} hint={t("reports", "project.metricHintFileCycles")} tone={a.metrics.fileCircularDeps > 0 ? "bad" : "good"} />
            <MetricCard label={t("reports", "metricDirCycles")} value={String(a.metrics.dirCircularDeps.length)} hint={t("reports", "project.metricHintDirCycles")} tone={a.metrics.dirCircularDeps.length > 0 ? "bad" : "good"} />
            <MetricCard label={t("reports", "metricLayerViolations")} value={String(a.metrics.layerViolations.length)} hint={t("reports", "project.metricHintLayerViolations")} tone={a.metrics.layerViolations.length > 0 ? "bad" : "good"} />
            <MetricCard label={t("reports", "metricGodModules")} value={String(a.metrics.godModules.length)} hint={t("reports", "project.metricHintGodModules")} tone={a.metrics.godModules.length > 0 ? "bad" : "good"} />
          </div>
        </GlassCard>
      )}

      {/* AI Best Practices Audit — deep analysis (Architecture tab) */}
      {bestPractices && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-violet-300" />
            <h4 className="text-sm font-semibold">{t("reports", "aiInsights.bestPractices")} — {bestPractices.framework}</h4>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-3xl font-bold" style={{ color: bestPractices.score >= 70 ? "#34d399" : bestPractices.score >= 40 ? "#fbbf24" : "#fb7185" }}>
              {bestPractices.score}
            </div>
            <span className="text-xs text-muted-foreground">{t("reports", "aiInsights.scoreMax")}</span>
          </div>
          {bestPractices.passed?.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">{t("reports", "aiInsights.passed")}</p>
              <div className="flex flex-wrap gap-1">
                {bestPractices.passed.map((p: string, i: number) => (
                  <span key={i} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">✓ {p}</span>
                ))}
              </div>
            </div>
          )}
          {bestPractices.failed?.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-rose-400">{t("reports", "aiInsights.needsImprovement")}</p>
              {bestPractices.failed.map((f: any, i: number) => (
                <div key={i} className="rounded border border-rose-500/10 bg-rose-500/[0.02] p-2">
                  <p className="text-xs font-medium text-rose-200">{f.practice}</p>
                  <p className="text-[11px] text-muted-foreground">{f.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

/* ---------- Architecture Metric Card ---------- */
function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "good" | "bad" | "neutral" }) {
  const toneColor = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-cyan-300";
  const borderColor = tone === "good" ? "border-emerald-400/20" : tone === "bad" ? "border-rose-400/20" : "border-white/5";
  return (
    <div className={`rounded-lg border ${borderColor} bg-white/[0.02] p-3`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${toneColor}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ---------- Issues (shared for bugs/security/performance) ---------- */
function IssuesTab({ issues, title, color, report, id }: { issues: Issue[]; title: string; color: string; report: AnalysisReport; id: "bugs" | "security" | "performance" }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState<string | null>(issues[0]?.id ?? null);
  const deep = (report as any).deepAnalysis as any;
  // Pick the matching AI deep review list based on the tab id.
  const aiReviews: any[] | undefined =
    id === "security" ? deep?.securityReview :
    id === "performance" ? deep?.performanceReview :
    deep?.codeQualityReview;
  const aiTitle =
    id === "security" ? t("reports", "aiInsights.securityReview") :
    id === "performance" ? t("reports", "aiInsights.perfReview") :
    t("reports", "aiInsights.codeQualityReview");
  const [actionLoading, setActionLoading] = useState(false);
  const handleAgentAction = async (kind: string, issue: Issue) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: `${issue.title} — ${issue.file}${issue.line ? `:${issue.line}` : ""}`,
          input: {
            issue: issue.title,
            file: issue.file,
            line: issue.line,
            description: issue.description,
            recommendation: issue.recommendation,
            severity: issue.severity,
            category: issue.category,
          },
        }),
      });
      const data = await res.json();
      if (data.taskId || data.status) {
        toast.success(t("reports", "action.agentStarted"));
      } else {
        toast.error(data.error || t("reports", "action.agentFailed"));
      }
    } catch {
      toast.error(t("reports", "action.agentFailed"));
    } finally {
      setActionLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}>
              {id === "security" ? <ShieldCheck className="h-4 w-4" /> : id === "performance" ? <Gauge className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
          <div className="flex gap-1.5">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const count = issues.filter((i) => i.severity === sev).length;
              if (!count) return null;
              const sevKey = sev === "critical" ? "critical" : `${sev}_sev`;
              return (
                <span key={sev} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px]">
                  {count} {t("reports", sevKey)}
                </span>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* AI Deep Review — enriches the top issues with root cause + fix code + impact */}
      {aiReviews && aiReviews.length > 0 && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <h4 className="text-sm font-semibold">{aiTitle}</h4>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {aiReviews.map((r: any, i: number) => (
              <div key={i} className="rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-violet-100">{r.issue}</p>
                  {r.severity && <SeverityBadge severity={r.severity} />}
                  <ConfidenceBadge confidence={r.confidence} />
                </div>
                {r.rootCause && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t("reports", "aiInsights.rootCause")}:</span> {r.rootCause}
                  </p>
                )}
                {r.impact && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t("reports", "aiInsights.impact")}:</span> {r.impact}
                  </p>
                )}
                {r.expectedImprovement && (
                  <p className="mt-1 text-xs text-emerald-300">
                    <span className="font-medium">{t("reports", "aiInsights.expected")}:</span> {r.expectedImprovement}
                  </p>
                )}
                {r.evidence && r.evidence.length > 0 && <EvidenceChips evidence={r.evidence} />}
                {r.fixPlan && r.fixPlan.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300">{t("reports", "aiInsights.fixPlan")}</p>
                    <ol className="list-decimal space-y-0.5 pl-5 text-xs text-foreground/85">
                      {r.fixPlan.map((step: string, j: number) => (
                        <li key={j}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {r.fixCode && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300">{t("reports", "aiInsights.fixCode")}</p>
                    <pre className="overflow-x-auto rounded-md bg-black/40 p-2 text-[10px] font-mono text-emerald-300"><code>{r.fixCode}</code></pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* If no issues and this is Performance tab, show positive findings */}
      {issues.length === 0 && id === "performance" && report.perfPositiveFindings && report.perfPositiveFindings.length > 0 && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check className="h-4 w-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-emerald-400">{t("reports", "noPerfIssues")}</h4>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t("reports", "noPerfIssuesDesc")}</p>
          <div className="space-y-1.5">
            {report.perfPositiveFindings.map((f, i) => (
              <p key={i} className="text-xs text-foreground/80">{f}</p>
            ))}
          </div>
        </GlassCard>
      )}

      {/* If no issues at all */}
      {issues.length === 0 && !(id === "performance" && report.perfPositiveFindings?.length) && (
        <GlassCard className="p-8 text-center">
          <Check className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm font-medium">{t("reports", "noIssuesInCategory")}</p>
        </GlassCard>
      )}

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
                            <Sparkles className="h-3.5 w-3.5" /> {t("reports", "aiRecommendation")}
                          </p>
                          <p className="mt-1 text-sm text-foreground/85">{iss.recommendation}</p>
                        </div>

                        {/* Action buttons — invoke agents to fix / test / refactor this issue.
                            Wrapped in AlertDialog for confirmation before running. */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" disabled={actionLoading}>
                                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />} {t("reports", "action.fixNow")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("reports", "action.confirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("reports", "action.confirmDescFix")}
                                  <br /><br />
                                  <span className="font-medium text-foreground">{t("reports", "action.targetIssue")}:</span> {iss.title}
                                  <br />
                                  <code className="text-[10px] text-muted-foreground">{iss.file}{iss.line ? `:${iss.line}` : ""}</code>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("reports", "action.confirmCancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleAgentAction("fix-bug", iss)}>
                                  {t("reports", "action.confirmRun")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" disabled={actionLoading}>
                                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} {t("reports", "action.generateTest")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("reports", "action.confirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("reports", "action.confirmDescTest")}
                                  <br /><br />
                                  <span className="font-medium text-foreground">{t("reports", "action.targetIssue")}:</span> {iss.title}
                                  <br />
                                  <code className="text-[10px] text-muted-foreground">{iss.file}{iss.line ? `:${iss.line}` : ""}</code>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("reports", "action.confirmCancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleAgentAction("test", iss)}>
                                  {t("reports", "action.confirmRun")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" disabled={actionLoading}>
                                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {t("reports", "action.refactor")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("reports", "action.confirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("reports", "action.confirmDescRefactor")}
                                  <br /><br />
                                  <span className="font-medium text-foreground">{t("reports", "action.targetIssue")}:</span> {iss.title}
                                  <br />
                                  <code className="text-[10px] text-muted-foreground">{iss.file}{iss.line ? `:${iss.line}` : ""}</code>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("reports", "action.confirmCancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleAgentAction("refactor", iss)}>
                                  {t("reports", "action.confirmRun")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
  const deep = (report as any).deepAnalysis as any;
  const aiDuplicates: any[] | undefined = deep?.duplicateAnalysis;
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">{t("reports", "interactiveDepGraph")}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reports", "depGraphHint")}
        </p>
      </GlassCard>
      <DependencyGraph report={report} />

      {/* AI Duplicate Analysis — deep analysis (enriches the static duplicate detection) */}
      {aiDuplicates && aiDuplicates.length > 0 && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Copy className="h-4 w-4 text-violet-300" />
            <h4 className="text-sm font-semibold">{t("reports", "aiInsights.duplicateAnalysis")}</h4>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {aiDuplicates.map((d: any, i: number) => (
              <div key={i} className="rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-300">{d.type}</span>
                  {d.estimatedLinesSaved ? (
                    <span className="ml-auto text-[10px] text-emerald-300">{t("reports", "aiInsights.estimatedLinesSaved")}: {d.estimatedLinesSaved}</span>
                  ) : null}
                </div>
                {d.files?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {d.files.map((f: string, j: number) => (
                      <p key={j} className="truncate pl-3 font-mono text-[10px] text-muted-foreground">{f}</p>
                    ))}
                  </div>
                )}
                {d.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                )}
                {d.recommendation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t("reports", "aiInsights.recommendation")}:</span> {d.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Dead code + duplicates */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-rose-400" />
            <h4 className="text-sm font-semibold">{t("reports", "deadCode")} <span className="text-muted-foreground">({report.deadCode.length})</span></h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "deadCodeDesc")}</p>
          <div className="mt-3 space-y-1.5">
            {report.deadCode.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">{t("reports", "noDeadCode")}</p>
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
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "duplicateCodeDesc")}</p>
          <div className="mt-3 space-y-1.5">
            {report.duplicates.length === 0 ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-300">{t("reports", "noDuplicates")}</p>
            ) : (
              report.duplicates.map((d, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">{t("reports", "group")} {d.group}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.lines} {t("reports", "linesDuplicated")}</span>
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
  const [aiExplain, setAiExplain] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const askAI = async (snippet: CodeSnippet) => {
    setExplainLoading(true);
    setAiExplain(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Analyze the file ${snippet.file}. Explain: 1) What this file does 2) Main risks 3) Patterns used 4) Refactor suggestions. Code:\n\`\`\`\n${snippet.code}\n\`\`\``,
          language: useI18nStore.getState().locale,
        }),
      });
      const data = await res.json();
      setAiExplain(data.reply || data.message?.content || "No response");
    } catch {
      setAiExplain("AI explanation unavailable");
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">{t("reports", "aiCodeExplorer")}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reports", "aiCodeExplorerDesc")}
        </p>
      </GlassCard>
      <CodeViewer
        snippets={report.snippets}
        onAskAI={askAI}
        aiLoading={explainLoading}
      />
      {(aiExplain || explainLoading) && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <h4 className="text-sm font-semibold">{t("reports", "action.aiExplain")}</h4>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> AI
            </span>
          </div>
          {explainLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-amber-300">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("reports", "project.aiAnalyzing")}
            </p>
          ) : (
            <pre className="mt-3 max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">{aiExplain}</pre>
          )}
        </GlassCard>
      )}
    </div>
  );
}

/* ---------- Docs ---------- */
function DocsTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const [diagram, setDiagram] = useState<"uml" | "sequence" | "erd">("uml");
  const [docTab, setDocTab] = useState<string>("readme");

  const copy = (which: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(which);
    toast.success(t("reports", "copiedToClipboard"));
    setTimeout(() => setCopied(null), 1500);
  };

  const docs = [
    { id: "readme", label: "README.md", content: report.documentation.readme, color: "#22d3ee" },
    { id: "apiDocs", label: "API.md", content: report.documentation.apiDocs, color: "#a78bfa" },
    { id: "architectureMd", label: "Architecture.md", content: report.documentation.architectureMd || "", color: "#f472b6" },
    { id: "folderGuide", label: t("reports", "project.docTabFolderGuide"), content: report.documentation.folderGuide || "", color: "#34d399" },
    { id: "componentGuide", label: t("reports", "project.docTabComponentGuide"), content: report.documentation.componentGuide || "", color: "#fbbf24" },
    { id: "deploymentGuide", label: t("reports", "project.docTabDeploymentGuide"), content: report.documentation.deploymentGuide || "", color: "#60a5fa" },
  ].filter(d => d.content);

  const diagrams = report.diagrams;
  // Build diagram tabs dynamically — hide empty ones
  const allDiagrams = [
    { id: "uml" as const, label: t("reports", "uml"), svg: diagrams.uml, desc: diagrams.umlExplanation, show: diagrams.hasUml !== false && !!diagrams.uml },
    { id: "sequence" as const, label: t("reports", "sequence"), svg: diagrams.sequence, desc: diagrams.sequenceExplanation, show: diagrams.hasSequence !== false && !!diagrams.sequence },
    { id: "erd" as const, label: t("reports", "erd"), svg: diagrams.erd, desc: diagrams.erdExplanation, show: diagrams.hasErd !== false && !!diagrams.erd },
  ].filter(d => d.show);

  // If current diagram tab is hidden, switch to first available
  const activeDiagram = allDiagrams.find(d => d.id === diagram) || allDiagrams[0];
  const activeDoc = docs.find(d => d.id === docTab) || docs[0];

  return (
    <div className="space-y-4">
      {/* Diagrams — only show if at least one has content */}
      {allDiagrams.length > 0 && (
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-cyan-300" /> {t("reports", "generatedDiagrams")}</h4>
          <div className="inline-flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {allDiagrams.map((d) => (
              <button
                key={d.id}
                onClick={() => setDiagram(d.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition",
                  diagram === d.id ? "bg-gradient-to-r from-cyan-500/30 to-violet-500/30 text-cyan-300" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto scrollbar-thin rounded-lg border border-white/5 bg-black/30 p-3">
          {activeDiagram && <div className="mx-auto min-w-[480px]" dangerouslySetInnerHTML={{ __html: activeDiagram.svg }} />}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeDiagram?.desc}</p>
      </GlassCard>
      )}

      {/* Documentation tabs */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-cyan-300" /> {t("reports", "autoGeneratedDocs")}</h4>
          <div className="flex flex-wrap gap-1">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => setDocTab(d.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition",
                  docTab === d.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                style={docTab === d.id ? { background: `${d.color}20`, color: d.color } : {}}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {activeDoc && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{activeDoc.label}</span>
              <Button size="sm" variant="ghost" onClick={() => copy(activeDoc.id, activeDoc.content)}>
                {copied === activeDoc.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
{activeDoc.content}
            </pre>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/* ---------- Roadmap ---------- */
function RoadmapTab({ report }: { report: AnalysisReport }) {
  const { t } = useT();
  const deep = (report as any).deepAnalysis as any;
  const aiRoadmap: any[] | undefined = deep?.roadmap;
  const aiPriorities: any[] | undefined = deep?.priorities;
  const hasAi = !!aiRoadmap || !!aiPriorities;
  return (
    <div className="space-y-4">
      {/* AI Priorities — deep analysis (full width, shown above the roadmap grid) */}
      {aiPriorities && aiPriorities.length > 0 && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className="h-4 w-4 text-violet-300" />
            <h3 className="text-lg font-semibold">{t("reports", "aiInsights.priorities")}</h3>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {aiPriorities.map((p: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-3"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-300">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.issue}</p>
                  {p.businessImpact && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">{t("reports", "aiInsights.businessImpact")}:</span> {p.businessImpact}
                    </p>
                  )}
                  {p.recommendation && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">{t("reports", "aiInsights.recommendation")}:</span> {p.recommendation}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* AI Roadmap (replaces static when available) / Feature Roadmap (static fallback) */}
        <GlassCard className={hasAi && aiRoadmap?.length ? "border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5" : "p-5"}>
          <div className="flex flex-wrap items-center gap-2">
            <Rocket className="h-5 w-5 text-cyan-300" />
            <h3 className="text-lg font-semibold">{aiRoadmap?.length ? t("reports", "aiInsights.roadmap") : t("reports", "featureRoadmap")}</h3>
            {aiRoadmap?.length ? (
              <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
              </span>
            ) : null}
          </div>
          {aiRoadmap && aiRoadmap.length > 0 ? (
            <div className="mt-3 space-y-3">
              {aiRoadmap.map((phase: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.03] p-3"
                >
                  <p className="text-xs font-semibold text-cyan-200">{phase.phase}</p>
                  <ul className="mt-1 space-y-0.5">
                    {phase.tasks?.map((task: string, j: number) => (
                      <li key={j} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                        <span className="mt-0.5 text-cyan-300">→</span> {task}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          ) : (
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
          )}
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
              <h3 className="text-lg font-semibold">{t("reports", "techDebt")} — {report.technicalDebt.score}/100</h3>
            </div>
            <div className="mt-3 space-y-1.5">
              {report.technicalDebt.items.map((debt, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="flex-1">{debt.title}</span>
                  <span className="text-muted-foreground">{debt.impact}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{debt.estimate}</span>
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

/* ---------- AI helper components — shared across OverviewTab and IssuesTab ---------- */
function EvidenceChips({ evidence }: { evidence: string[] }) {
  if (!evidence || evidence.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {evidence.map((e, i) => (
        <code key={i} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{e}</code>
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#fb7185";
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
      style={{ background: `${color}20`, color }}
    >
      {pct}% confidence
    </span>
  );
}

