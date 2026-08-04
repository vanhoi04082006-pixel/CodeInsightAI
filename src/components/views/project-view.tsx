"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutGrid,
  Network,
  Bug,
  ShieldCheck,
  Gauge,
  FileText,
  Rocket,
  Download,
  Share2,
  Sparkles,
  FileCode,
  TrendingUp,
  TrendingDown,
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
  Clock,
  AlertCircle,
  Target,
  GitFork,
  AlertTriangle,
  GitCompare,
  Brain,
} from "lucide-react";
import { GlassCard, ScoreGauge, GradientText, NeonDivider, SeverityBadge } from "@/components/shared/ui";
import { AgentPanel, issueContext, tabContext } from "@/components/agent-integration";
import type { AgentTabId } from "@/components/agent-integration";
import { CodeViewer } from "@/components/shared/code-viewer";
import { UnifiedCodeGraph } from "@/components/shared/unified-codegraph";
import { DiagramRenderer } from "@/lib/diagram/diagram-renderer";
import { ANALYSIS_TABS, ANALYSIS_PASSES, buildManifest } from "@/lib/analysis-manifest";
import { useAnalysisManifest } from "@/hooks/use-analysis-manifest";
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
import type { AnalysisReport, AnalysisDiffResult, Issue, CodeSnippet, AIMode } from "@/lib/types";
import type { RegressionReport } from "@/lib/regression-detector";
import type { RefactorRoadmap } from "@/lib/refactor-roadmap";
import { toast } from "sonner";
import { useT, useI18nStore } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Tab type derived from the manifest (single source of truth) — no hardcoded union.
type Tab = (typeof ANALYSIS_TABS)[number]["id"];

// Tab icons mapped by tab id — UI concern (icons are not in the manifest).
// Falls back to LayoutGrid for any tab without an explicit icon.
const TAB_ICONS: Record<string, typeof LayoutGrid> = {
  overview: LayoutGrid,
  architecture: Network,
  bugs: Bug,
  security: ShieldCheck,
  performance: Gauge,
  codegraph: Network,
  code: FileCode,
  docs: FileText,
  roadmap: Rocket,
  timeline: GitCompare,
};

export function ProjectView({ isShared = false }: { isShared?: boolean }) {
  const { t } = useT();
  const report = useAppStore((s) => s.activeReport);
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const setView = useAppStore((s) => s.setView);
  const aiPending = useAppStore((s) => s.aiPending);
  const [tab, setTab] = useState<Tab>("overview");
  const [sharing, setSharing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Build manifest from report (single source of truth)
  const manifest = useMemo(() => buildManifest(report, activeAnalysisId), [report, activeAnalysisId]);

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

  // Export the raw AnalysisReport object as JSON — full data for programmatic
  // import / audit. P3.6 — Analysis Snapshots.
  const exportJSON = () => {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.repoOwner}-${report.repoName}-analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("reports", "project.jsonExported"));
  };

  // Export the report as a structured compliance-ready PDF (P3.6).
  // Client-side generation via `jspdf` + `jspdf-autotable` (dynamic import
  // keeps the ~200KB bundle out of the initial payload). No server round-trip
  // — works inside Vercel's 60s function limit since it runs in the browser.
  const exportPDF = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      toast.info(t("reports", "project.generatingPDF"));
      const { generateAnalysisPDF } = await import("@/lib/export/pdf-generator");
      const locale = useI18nStore.getState().locale;
      const blob = await generateAnalysisPDF(report, locale);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.repoOwner}-${report.repoName}-analysis.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("reports", "project.pdfExported"));
    } catch (e) {
      console.error("[P3.6] PDF generation failed:", e);
      toast.error(t("reports", "project.pdfFailed"));
    } finally {
      setPdfLoading(false);
    }
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
            {/* AI badge from manifest */}
            {manifest.aiEnabled && manifest.completedPassCount > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                <Activity className="h-3 w-3" /> {t("reports", "project.staticAnalysis")}
              </span>
            )}
            {/* AI progress from manifest */}
            {manifest.status === "running" && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" /> {manifest.completedPassCount}/{manifest.totalPassCount} {t("reports", "project.aiAnalyzing")}
              </span>
            )}
            {/* Failed indicator from manifest */}
            {manifest.passes.some(p => p.status === "failed") && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                <AlertCircle className="h-3 w-3" /> {manifest.passes.filter(p => p.status === "failed").length} failed
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
            <Button onClick={exportJSON} variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" /> JSON
            </Button>
            <Button onClick={exportPDF} variant="outline" size="sm" disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} PDF
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
              {ANALYSIS_TABS.map((tabDef) => {
                const Icon = TAB_ICONS[tabDef.id] || LayoutGrid;
                // Count from manifest (not hardcoded)
                const count = tabDef.getCount?.(report) ?? 0;
                // AI status for this tab (from manifest)
                const tabPasses = manifest.passes.filter(p => p.tab === tabDef.id);
                const tabAiStatus = tabPasses.length > 0
                  ? (tabPasses.every(p => p.status === "completed") ? "done"
                    : tabPasses.some(p => p.status === "failed") ? "failed"
                    : tabPasses.some(p => p.status === "pending") ? "pending"
                    : "none")
                  : "none";
                return (
                  <TabsTrigger
                    key={tabDef.id}
                    value={tabDef.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-violet-500/20 data-[state=active]:text-cyan-300"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t("reports", tabDef.labelKey)}
                    {count > 0 && (
                      <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{count}</span>
                    )}
                    {/* AI status dot from manifest */}
                    {tabAiStatus === "pending" && (
                      <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                    )}
                    {tabAiStatus === "done" && manifest.aiEnabled && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                    {tabAiStatus === "failed" && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab report={report} onJumpToTimeline={() => setTab("timeline")} />
          </TabsContent>
          <TabsContent value="architecture" className="mt-4">
            <ArchitectureTab report={report} />
          </TabsContent>
          <TabsContent value="bugs" className="mt-4">
            <IssuesTab id="bugs" issues={report.issues.bugs} title={t("reports", "project.bugDetection")} color="#fbbf24" report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="security" className="mt-4">
            <IssuesTab id="security" issues={report.issues.security} title={t("reports", "project.securityAudit")} color="#f472b6" report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <IssuesTab id="performance" issues={report.issues.performance} title={t("reports", "project.performanceAnalysis")} color="#34d399" report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="codegraph" className="mt-4">
            <UnifiedCodeGraph analysisId={activeAnalysisId} report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="code" className="mt-4">
            <CodeTab report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <DocsTab report={report} isShared={isShared} />
          </TabsContent>
          <TabsContent value="roadmap" className="mt-4">
            <RoadmapTab report={report} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <TimelineTab report={report} isShared={isShared} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function OverviewTab({ report, onJumpToTimeline }: { report: AnalysisReport; onJumpToTimeline?: () => void }) {
  const { t } = useT();
  const aiPending = useAppStore((s) => s.aiPending);
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const deep = (report as any).deepAnalysis as any;
  const aiEnh = (report as any).aiEnhancement as any;
  const aiExecSummary: string | undefined = deep?.executiveSummary || aiEnh?.aiSummary;
  const hasAiExec = !!aiExecSummary;
  const aiOverview = deep?.aiOverview;

  // AI pass status from the manifest (single source of truth).
  const manifest = useAnalysisManifest();
  const overviewPass = manifest.passes.find(p => p.type === "overview");
  const overviewPassFailed = overviewPass?.status === "failed" && !aiOverview;
  const overviewPassPending = overviewPass?.status === "pending" || overviewPass?.status === "running";

  // Phase 2 (P2.2 + P2.4) — "What changed since last scan" banner.
  // Loads the previous-vs-current diff on mount and classifies it into a
  // RegressionReport (verdict + regressions[] + improvements[] + headline).
  // Renders only when a previous analysis exists (the API returns
  // `{ previousAnalysis: null }` when there's no prior scan).
  const [regressions, setRegressions] = useState<RegressionReport | null>(null);

  useEffect(() => {
    if (!activeAnalysisId) return;
    let cancelled = false;
    fetch(`/api/analysis/regressions?analysisId=${activeAnalysisId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Endpoint returns either { previousAnalysis: null } (no prior scan)
        // or a full RegressionReport (which always carries `comparedTo`).
        if (data && data.comparedTo) setRegressions(data as RegressionReport);
      })
      .catch(() => {
        /* silent — banner just doesn't render */
      });
    return () => {
      cancelled = true;
    };
  }, [activeAnalysisId]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* What-changed banner (Phase 2 — P2.4). Renders only when a previous
          analysis of this repo exists. Color-coded by verdict:
            - regressed  → rose border + bg tint
            - improved   → emerald border + bg tint
            - neutral    → cyan border + bg tint */}
      {regressions && regressions.comparedTo?.analysisId && (
        <GlassCard
          className={cn(
            "p-4 lg:col-span-3 border-2",
            regressions.verdict === "regressed"
              ? "border-rose-500/40 bg-rose-500/[0.05]"
              : regressions.verdict === "improved"
                ? "border-emerald-500/40 bg-emerald-500/[0.05]"
                : "border-cyan-500/20 bg-cyan-500/[0.03]"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {regressions.verdict === "regressed" ? (
                <TrendingDown className="h-4 w-4 text-rose-400" />
              ) : regressions.verdict === "improved" ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <Activity className="h-4 w-4 text-cyan-300" />
              )}
              <h3 className="text-sm font-semibold">
                {t("reports", "regressions.whatChanged")}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  regressions.verdict === "regressed"
                    ? "bg-rose-500/15 text-rose-300"
                    : regressions.verdict === "improved"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/10 text-muted-foreground"
                )}
              >
                {t("reports", `regressions.verdict.${regressions.verdict}`)}
              </span>
            </div>
            {onJumpToTimeline && (
              <Button size="sm" variant="ghost" onClick={onJumpToTimeline}>
                {t("reports", "regressions.viewTimeline")} →
              </Button>
            )}
          </div>

          <p className="mb-3 text-sm font-medium text-foreground/85">
            {regressions.headline}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Regressions */}
            {regressions.regressions.length > 0 && (
              <div>
                <h4 className="mb-1 text-[10px] uppercase tracking-wider text-rose-400">
                  {t("reports", "regressions.regressions")} ({regressions.regressions.length})
                </h4>
                <div className="space-y-1.5">
                  {regressions.regressions.slice(0, 5).map((r, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={r.severity} />
                        <span className="font-medium">{r.title}</span>
                      </div>
                      <p className="ml-1 text-muted-foreground">{r.detail}</p>
                      {r.evidence && r.evidence.length > 0 && (
                        <EvidenceChips evidence={r.evidence} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Improvements */}
            {regressions.improvements.length > 0 && (
              <div>
                <h4 className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">
                  {t("reports", "regressions.improvements")} ({regressions.improvements.length})
                </h4>
                <div className="space-y-1.5">
                  {regressions.improvements.slice(0, 5).map((imp, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium text-emerald-300">✓ {imp.title}</span>
                      <p className="ml-1 text-muted-foreground">{imp.detail}</p>
                      {imp.evidence && imp.evidence.length > 0 && (
                        <EvidenceChips evidence={imp.evidence} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {regressions.comparedTo?.createdAt && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t("reports", "regressions.comparedTo")}{" "}
              {new Date(regressions.comparedTo.createdAt).toLocaleDateString()}
            </p>
          )}
        </GlassCard>
      )}

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

      {/* Fallback: AI overview pass failed */}
      {overviewPassFailed && (
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.03] p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">{t("reports", "aiFallback.title")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "aiFallback.desc", { pass: t("reports", "aiOverview.title") })}</p>
        </GlassCard>
      )}

      {/* Fallback: AI overview still running */}
      {overviewPassPending && (
        <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.03] p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <p className="text-sm font-medium text-cyan-300">{t("reports", "aiFallback.pending")}</p>
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
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [showAgent, setShowAgent] = useState(false);
  const a = report.architecture;
  const deep = (report as any).deepAnalysis as any;
  const archReview = deep?.architectureReview;
  const bestPractices = deep?.bestPracticesAudit;
  // AI pass status from the manifest (single source of truth).
  const manifest = useAnalysisManifest();
  const archPass = manifest.passes.find(p => p.type === "architecture");
  const archPassFailed = archPass?.status === "failed" && !archReview;
  const archPassPending = archPass?.status === "pending" || archPass?.status === "running";
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

      {/* Fallback: AI architecture pass failed */}
      {archPassFailed && (
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">{t("reports", "aiFallback.title")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "aiFallback.desc", { pass: t("reports", "aiInsights.archReview") })}</p>
        </GlassCard>
      )}

      {/* Fallback: AI architecture still running */}
      {archPassPending && (
        <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <p className="text-sm font-medium text-cyan-300">{t("reports", "aiFallback.pending")}</p>
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

      {/* Stage 2.3: Inline Agent — architecture analysis */}
      {activeAnalysisId && (
        <div>
          {showAgent ? (
            <AgentPanel
              context={tabContext("architecture", "explain", `${report.repoOwner}/${report.repoName} architecture`, activeAnalysisId, report, `Pattern: ${a.pattern}. Layers: ${a.layers.map(l=>l.name).join(", ")}. Weaknesses: ${a.weaknesses.join("; ")}`)}
              actions={["explain", "impact", "refactor", "document"]}
              title="Agent — Architecture Analysis"
              onClose={() => setShowAgent(false)}
              defaultCollapsed={false}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAgent(true)}
              className="border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            >
              <Brain className="mr-1.5 h-3.5 w-3.5" />
              Analyze with Agent
            </Button>
          )}
        </div>
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
function IssuesTab({ issues, title, color, report, id, isShared = false }: { issues: Issue[]; title: string; color: string; report: AnalysisReport; id: "bugs" | "security" | "performance"; isShared?: boolean }) {
  const { t } = useT();
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [agentIssueId, setAgentIssueId] = useState<string | null>(null);
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

  // Derive this tab's pass state from the manifest (single source of truth).
  // Tab id → pass type is defined in ANALYSIS_TABS, not hardcoded here.
  const manifest = useAnalysisManifest();
  const tabDef = ANALYSIS_TABS.find(td => td.id === id);
  const passType = tabDef?.passTypes[0];
  const passState = passType ? manifest.passes.find(p => p.type === passType) : undefined;
  const aiPassFailed = passState?.status === "failed";
  const aiPending = passState?.status === "pending" || passState?.status === "running";

  const [actionLoading, setActionLoading] = useState(false);
  // Per-issue AI analysis (on-demand, persisted in sessionStorage)
  const [issueAiMap, setIssueAiMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = sessionStorage.getItem(`issue-ai-${id}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [issueAiLoading, setIssueAiLoading] = useState<string | null>(null);

  const persistIssueAi = (map: Record<string, string>) => {
    try { sessionStorage.setItem(`issue-ai-${id}`, JSON.stringify(map)); } catch {}
  };

  const askAIAboutIssue = async (issue: Issue) => {
    const key = issue.id;
    setIssueAiLoading(key);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Analyze this ${id} issue in detail:\n\nIssue: ${issue.title}\nFile: ${issue.file}${issue.line ? `:${issue.line}` : ""}\nSeverity: ${issue.severity}\nCategory: ${issue.category}\nDescription: ${issue.description}\n\nProvide: 1) Root cause analysis 2) Attack scenario / impact 3) Fix code example 4) Prevention recommendations. Be specific and actionable.`,
          language: useI18nStore.getState().locale,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.message?.content || t("reports", "action.aiFailed");
      setIssueAiMap(prev => {
        const updated = { ...prev, [key]: reply };
        persistIssueAi(updated);
        return updated;
      });
    } catch {
      setIssueAiMap(prev => {
        const updated = { ...prev, [key]: t("reports", "action.aiFailed") };
        persistIssueAi(updated);
        return updated;
      });
    } finally {
      setIssueAiLoading(null);
    }
  };

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
      if (data.success) {
        toast.success(t("reports", "action.agentStarted"), {
          description: data.summary?.slice(0, 100),
        });
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

      {/* Fallback: AI was attempted but this pass failed — show honest message */}
      {aiPassFailed && (
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">{t("reports", "aiFallback.title")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "aiFallback.desc", { pass: aiTitle })}</p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">{t("reports", "aiFallback.hint")}</p>
        </GlassCard>
      )}

      {/* Fallback: AI is still running this pass */}
      {aiPending && (
        <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <p className="text-sm font-medium text-cyan-300">{t("reports", "aiFallback.pending")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "aiFallback.pendingDesc", { pass: aiTitle })}</p>
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
                            Wrapped in AlertDialog for confirmation before running.
                            Hidden in shared (read-only) mode — viewer cannot trigger agents. */}
                        {!isShared && (
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

                          {/* Ask AI about this issue — on-demand per-issue AI analysis (hidden in shared mode) */}
                          {!isShared && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => askAIAboutIssue(iss)}
                            disabled={issueAiLoading === iss.id}
                            className="border-violet-400/30 text-violet-300 hover:bg-violet-500/10"
                          >
                            {issueAiLoading === iss.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {issueAiLoading === iss.id ? t("reports", "action.aiAnalyzing") : t("reports", "action.askAI")}
                          </Button>
                          )}
                        </div>
                        )}

                        {/* AI response for this issue (persisted per issue) */}
                        {(issueAiMap[iss.id] || issueAiLoading === iss.id) && (
                          <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                              <span className="text-xs font-semibold text-violet-300">{t("reports", "action.aiAnalysis")}</span>
                              <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-300">✨ AI</span>
                            </div>
                            {issueAiLoading === iss.id ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {t("reports", "action.aiAnalyzing")}
                              </div>
                            ) : (
                              <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/85 scrollbar-thin">{issueAiMap[iss.id]}</pre>
                            )}
                          </div>
                        )}

                        {/* Stage 2.2: Inline Agent — "Fix with Agent" / "Explain" / "Root Cause" / "Impact"
                            Full Agent runtime embedded in the issue card. */}
                        {!isShared && activeAnalysisId && (
                          <div className="mt-3">
                            {agentIssueId === iss.id ? (
                              <AgentPanel
                                context={issueContext(id as AgentTabId, "fix", iss, activeAnalysisId, report)}
                                actions={["explain", "fix", "test", "rootCause", "impact"]}
                                title={`Agent — ${iss.title.slice(0, 50)}`}
                                onClose={() => setAgentIssueId(null)}
                                defaultCollapsed={false}
                              />
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAgentIssueId(iss.id)}
                                className="border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                              >
                                <Brain className="mr-1.5 h-3.5 w-3.5" />
                                Fix with Agent
                              </Button>
                            )}
                          </div>
                        )}
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

/* ---------- Code ---------- */
function CodeTab({ report, isShared = false }: { report: AnalysisReport; isShared?: boolean }) {
  const { t } = useT();
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);

  // AI explain per-file per-mode (keyed by `${file}::${mode}`) — persisted in
  // sessionStorage so switching tabs preserves results, and each file+mode
  // combination keeps its own response.
  const storagePrefix = activeAnalysisId ? `code-ai-${activeAnalysisId}` : "code-ai-shared";
  const [aiExplainMap, setAiExplainMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = sessionStorage.getItem(storagePrefix);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [explainLoadingKey, setExplainLoadingKey] = useState<string | null>(null);
  const [activeAiFile, setActiveAiFile] = useState<string | null>(null);
  const [activeAiMode, setActiveAiMode] = useState<AIMode | null>(null);

  // Flatten all issues for the CodeViewer (bugs + security + performance)
  const allIssues: Issue[] = useMemo(
    () => [...report.issues.bugs, ...report.issues.security, ...report.issues.performance],
    [report.issues],
  );

  const persistMap = (next: Record<string, string>) => {
    setAiExplainMap(next);
    try { sessionStorage.setItem(storagePrefix, JSON.stringify(next)); } catch {}
  };

  const buildPrompt = (snippet: CodeSnippet, mode: AIMode, sendFullFile: boolean): string => {
    const fileInsight = report.files.find((f) => f.path === snippet.file);
    const issuesInFile = allIssues.filter((i) => i.file === snippet.file);
    const primaryIssue = snippet.issueId
      ? issuesInFile.find((i) => i.id === snippet.issueId) || issuesInFile[0]
      : issuesInFile[0];

    // Optimized context — saves ~80% tokens for large files
    const contextBlock = sendFullFile
      ? `--- FULL FILE (${snippet.totalLines ?? 0} lines) ---\n\`\`\`\n${snippet.rawContent ?? snippet.code}\n\`\`\``
      : [
          `--- FILE SUMMARY ---`,
          `Path: ${snippet.file}`,
          `Language: ${snippet.language}`,
          `Lines: ${snippet.totalLines ?? "?"}`,
          `Complexity: ${fileInsight?.complexity ?? "?"}`,
          `Functions (${fileInsight?.functions?.length ?? 0}): ${(fileInsight?.functions ?? []).slice(0, 20).join(", ")}`,
          `Classes (${fileInsight?.classes?.length ?? 0}): ${(fileInsight?.classes ?? []).slice(0, 10).join(", ")}`,
          ``,
          `--- IMPORTS (${fileInsight?.imports?.length ?? 0}) ---`,
          (fileInsight?.imports ?? []).slice(0, 30).join("\n"),
          ``,
          `--- FUNCTION SIGNATURES ---`,
          (fileInsight?.functionSignatures ?? []).slice(0, 20)
            .map((fn) => `${fn.isAsync ? "async " : ""}${fn.name}(${fn.params.join(", ")})${fn.returnType ? ": " + fn.returnType : ""}`)
            .join("\n") || "(none parsed)",
          ``,
          primaryIssue
            ? `--- PRIMARY ISSUE ---\nTitle: ${primaryIssue.title}\nSeverity: ${primaryIssue.severity}\nLine: ${primaryIssue.line ?? "?"}\nDescription: ${primaryIssue.description}\nRecommendation: ${primaryIssue.recommendation}`
            : `--- PRIMARY ISSUE ---\n(none detected)`,
          ``,
          `--- SNIPPET (lines ${snippet.startLine ?? 1}–${snippet.endLine ?? "?"}) ---`,
          "```",
          snippet.code,
          "```",
        ].join("\n");

    const modePrompts: Record<AIMode, string> = {
      explain: `You are an expert code reviewer. Explain what this file does, its main responsibilities, the patterns it uses, and any notable design decisions. Be concise (4-6 short paragraphs).`,
      security: `You are a security expert. Identify security vulnerabilities in this code: injection, auth bypass, secret leaks, insecure crypto, SSRF, XSS, etc. For each finding, give: severity, location (file:line), explanation, and a concrete fix. Format as bullet list.`,
      performance: `You are a performance expert. Identify performance issues: O(n²) loops, unnecessary re-renders, blocking I/O, memory leaks, N+1 queries, large bundle, etc. For each: severity, location, explanation, optimization suggestion.`,
      refactor: `You are a senior software engineer. Suggest concrete refactorings to improve readability, modularity, and maintainability. List each as: what to change, why, and how (with code sketch if useful).`,
      tests: `You are a test engineer. Generate test cases for the public functions/exports in this file. Output runnable test code (Jest/Vitest) covering happy path, edge cases, and error cases. Include brief comments.`,
      bugs: `You are a bug hunter. Find logic bugs, off-by-one errors, null/undefined derefs, race conditions, unhandled promises, incorrect error handling, etc. For each: severity, location, explanation, suggested fix.`,
    };

    return `${modePrompts[mode]}\n\n${contextBlock}`;
  };

  const askAI = async (snippet: CodeSnippet, mode: AIMode, sendFullFile: boolean, forceRegenerate: boolean = false) => {
    const key = `${snippet.file}::${mode}`;
    setActiveAiFile(snippet.file);
    setActiveAiMode(mode);

    // If already cached and not forcing regenerate → just switch view, don't call AI
    if (!forceRegenerate && aiExplainMap[key]) {
      return; // Response already in map — UI will display it via currentKey
    }

    setExplainLoadingKey(key);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildPrompt(snippet, mode, sendFullFile),
          language: useI18nStore.getState().locale,
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.message?.content || "No response";
      persistMap({ ...aiExplainMap, [key]: reply });
    } catch {
      persistMap({ ...aiExplainMap, [key]: "AI explanation unavailable" });
    } finally {
      setExplainLoadingKey(null);
    }
  };

  // Regenerate: force AI call for current file+mode, overwriting cached response
  const regenerateAI = async (snippet: CodeSnippet) => {
    if (!activeAiMode) return;
    await askAI(snippet, activeAiMode, false, true);
  };

  // Current displayed AI response = the file+mode user last clicked
  const currentKey = activeAiFile && activeAiMode ? `${activeAiFile}::${activeAiMode}` : null;
  const aiExplain = currentKey ? aiExplainMap[currentKey] : null;
  const explainLoading = !!explainLoadingKey;

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
        files={report.files}
        issues={allIssues}
        onAskAI={isShared ? undefined : askAI}
        onRegenerate={isShared ? undefined : regenerateAI}
        aiLoading={isShared ? false : explainLoading}
        aiResponse={aiExplain ?? null}
        activeAiMode={activeAiMode}
        activeAiFile={activeAiFile}
      />
    </div>
  );
}

/* ---------- Docs ---------- */
function DocsTab({ report, isShared = false }: { report: AnalysisReport; isShared?: boolean }) {
  const { t, locale } = useT();
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [copied, setCopied] = useState<string | null>(null);
  const [diagram, setDiagram] = useState<string>("uml");
  const [diagramLayout, setDiagramLayout] = useState<string>("dagre-tb");
  const [diagramData, setDiagramData] = useState<any>(null);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramSelected, setDiagramSelected] = useState<string | null>(null);
  const [diagramFocus, setDiagramFocus] = useState(false);
  const [diagramSearch, setDiagramSearch] = useState("");
  const [docTab, setDocTab] = useState<string>("readme");
  // AI-enhance state — keyed by docId so each tab tracks its own AI content.
  // Persisted in sessionStorage so switching tabs preserves AI results.
  const docStorageKey = activeAnalysisId ? `docs-ai-${activeAnalysisId}` : "docs-ai-shared";
  const [aiDocs, setAiDocs] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = sessionStorage.getItem(docStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const persistAiDocs = (next: Record<string, string>) => {
    setAiDocs(next);
    try { sessionStorage.setItem(docStorageKey, JSON.stringify(next)); } catch {}
  };

  const copy = (which: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(which);
    toast.success(t("reports", "copiedToClipboard"));
    setTimeout(() => setCopied(null), 1500);
  };

  // Lazy AI call — only fires on button click. Loads the analysis report +
  // parsed data on the server, asks the AI to generate a richer version of
  // the active doc, and stores it in `aiDocs[docId]`. The static template
  // stays the default; AI is on-demand only (saves tokens).
  const handleEnhanceWithAI = async (docId: string) => {
    if (!activeAnalysisId) {
      toast.error(t("reports", "project.enhanceFailed"));
      return;
    }
    setAiLoading(docId);
    try {
      const res = await fetch("/api/docs/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: activeAnalysisId,
          docType: docId,
          language: locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "AI enhance failed");
      }
      if (!data.content || !data.content.trim()) {
        throw new Error("AI returned an empty response");
      }
      setAiDocs(prev => {
        const next = { ...prev, [docId]: data.content };
        persistAiDocs(next);
        return next;
      });
    } catch (e: any) {
      toast.error(`${t("reports", "project.enhanceFailed")}: ${e?.message ?? e}`);
    } finally {
      setAiLoading(null);
    }
  };

  const handleBackToStatic = (docId: string) => {
    setAiDocs(prev => {
      const next = { ...prev };
      delete next[docId];
      persistAiDocs(next);
      return next;
    });
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
  // Diagram Engine v2 — 6 types
  const ALL_DIAGRAM_TYPES = [
    { id: "uml", label: "🏛 UML", show: diagrams.hasUml !== false },
    { id: "sequence", label: "📐 Sequence", show: diagrams.hasSequence !== false },
    { id: "erd", label: "🗄 ERD", show: diagrams.hasErd !== false },
    { id: "architecture", label: "🏗 Architecture", show: true },
    { id: "module", label: "📦 Module", show: true },
    { id: "component", label: "🧩 Component", show: true },
  ];

  // Fetch diagram from API when type or layout changes
  useEffect(() => {
    if (!activeAnalysisId) return;
    setDiagramLoading(true);
    fetch(`/api/diagram/${activeAnalysisId}?type=${diagram}&layout=${diagramLayout}`)
      .then(r => r.json())
      .then(data => {
        if (data.layout && Array.isArray(data.layout)) {
          data.layout = new Map(data.layout);
        }
        setDiagramData(data);
      })
      .catch(() => setDiagramData(null))
      .finally(() => setDiagramLoading(false));
  }, [activeAnalysisId, diagram, diagramLayout]);
  const activeDoc = docs.find(d => d.id === docTab) || docs[0];
  const activeAiContent = activeDoc ? aiDocs[activeDoc.id] : undefined;
  const isActiveLoading = activeDoc ? aiLoading === activeDoc.id : false;

  return (
    <div className="space-y-4">
      {/* Diagrams — Diagram Engine v2 */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-cyan-300" /> {t("reports", "generatedDiagrams")}</h4>
          <div className="flex flex-wrap items-center gap-2">
            {/* Diagram type selector */}
            <div className="inline-flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {ALL_DIAGRAM_TYPES.map((d) => (
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
            {/* Layout selector */}
            <select
              value={diagramLayout}
              onChange={(e) => setDiagramLayout(e.target.value)}
              className="h-7 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[10px] text-muted-foreground outline-none"
            >
              <option value="dagre-tb">↓ Hierarchy</option>
              <option value="dagre-lr">→ Hierarchy</option>
              <option value="circular">◯ Circular</option>
              <option value="force">✦ Force</option>
            </select>
            {/* Export buttons */}
            {diagramData && diagramData.nodes?.length > 0 && (
              <div className="flex gap-1">
                {["mermaid", "svg", "plantuml"].map(fmt => (
                  <button
                    key={fmt}
                    onClick={async () => {
                      if (!activeAnalysisId) return;
                      try {
                        const res = await fetch(`/api/diagram/${activeAnalysisId}?type=${diagram}&layout=${diagramLayout}&format=${fmt}`);
                        const data = await res.json();
                        if (data.content) {
                          navigator.clipboard.writeText(data.content);
                          toast.success(`${fmt.toUpperCase()} copied to clipboard`);
                        }
                      } catch { toast.error("Export failed"); }
                    }}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] text-muted-foreground transition hover:text-foreground"
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto scrollbar-thin rounded-lg border border-white/5 bg-black/30 p-3">
          {diagramLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            </div>
          ) : diagramData && diagramData.nodes?.length > 0 ? (
            <>
              {/* Search + focus controls */}
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={diagramSearch}
                  onChange={(e) => setDiagramSearch(e.target.value)}
                  placeholder="Search nodes..."
                  className="h-7 w-44 rounded-lg border border-white/10 bg-popover/90 px-2 text-[11px] outline-none focus:border-cyan-400/40"
                />
                <button
                  onClick={() => setDiagramFocus(!diagramFocus)}
                  disabled={!diagramSelected}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] transition",
                    diagramFocus ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/10 bg-popover/90 text-muted-foreground hover:text-foreground",
                    !diagramSelected && "cursor-not-allowed opacity-40",
                  )}
                >
                  {diagramFocus ? "✕ Exit Focus" : "⌖ Focus"}
                </button>
                {diagramSelected && (
                  <button
                    onClick={() => { setDiagramSelected(null); setDiagramFocus(false); }}
                    className="h-7 rounded-lg border border-white/10 bg-popover/90 px-2 text-[10px] text-muted-foreground transition hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <DiagramRenderer
                diagram={diagramData}
                selected={diagramSelected}
                onSelect={setDiagramSelected}
                searchQuery={diagramSearch}
                focusMode={diagramFocus}
              />
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {diagramData?.description || "No data for this diagram type"}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">{diagramData?.description}</p>
          {diagramData?.stats && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{diagramData.stats.nodeCount} nodes</span>
              <span>{diagramData.stats.edgeCount} edges</span>
              {diagramData.stats.cycleCount > 0 && <span className="text-rose-400">{diagramData.stats.cycleCount} cycles</span>}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Documentation tabs */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-cyan-300" /> {t("reports", "autoGeneratedDocs")}</h4>
          <div className="flex flex-wrap gap-1">
            {docs.map((d) => {
              const isAi = !!aiDocs[d.id];
              return (
                <button
                  key={d.id}
                  onClick={() => setDocTab(d.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition",
                    docTab === d.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={docTab === d.id ? { background: `${d.color}20`, color: d.color } : {}}
                >
                  {d.label}
                  {isAi && (
                    <span
                      title={t("reports", "project.aiEnhanced")}
                      className="ml-0.5 inline-flex items-center rounded bg-violet-500/20 px-1 py-px text-[9px] font-bold text-violet-300"
                    >
                      <Sparkles className="mr-0.5 h-2.5 w-2.5" /> AI
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeDoc && (
          <div className="mt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {activeDoc.label}
                {activeAiContent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    <Sparkles className="h-3 w-3" /> {t("reports", "project.aiEnhanced")}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {/* AI-enhance controls — hidden in shared mode AND when there's
                    no active analysis. Lazy: only fires on click. */}
                {!isShared && activeAnalysisId && !activeAiContent && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isActiveLoading}
                    onClick={() => handleEnhanceWithAI(activeDoc.id)}
                    className="border-violet-500/30 bg-violet-500/[0.04] text-violet-200 hover:bg-violet-500/[0.08] hover:text-violet-100"
                  >
                    {isActiveLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("reports", "project.aiEnhancing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("reports", "project.enhanceWithAI")}
                      </>
                    )}
                  </Button>
                )}
                {activeAiContent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleBackToStatic(activeDoc.id)}
                  >
                    {t("reports", "project.backToStatic")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => copy(activeDoc.id, activeAiContent || activeDoc.content)}>
                  {copied === activeDoc.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
{activeAiContent || activeDoc.content}
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
  const executiveNote: string | undefined = deep?.executiveNote;
  const sequencerWarnings: string[] | undefined = (report as any)._sequencerWarnings;
  const hasAi = !!aiRoadmap || !!aiPriorities;
  // AI pass status from the manifest (single source of truth).
  const manifest = useAnalysisManifest();
  const prioPass = manifest.passes.find(p => p.type === "priorities");
  const prioPassFailed = prioPass?.status === "failed" && !hasAi;
  const prioPassPending = prioPass?.status === "pending" || prioPass?.status === "running";

  // Phase 2 (P2.5) — graph-validated refactor sequencing.
  // Loads the RefactorRoadmap on mount when an active analysis exists; the
  // card renders BELOW the AI Priorities card so the user sees the AI's
  // claims first, then the graph-validated version with confidence badges.
  // Uses the project's idiomatic async-IIFE pattern (matches trends-card.tsx)
  // so setState calls happen in async continuations — not in the synchronous
  // effect body — to satisfy the `react-hooks/set-state-in-effect` lint rule.
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [refactorRoadmap, setRefactorRoadmap] = useState<RefactorRoadmap | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  useEffect(() => {
    if (!activeAnalysisId) return;
    let cancelled = false;
    (async () => {
      setRoadmapLoading(true);
      try {
        const r = await fetch(
          `/api/analysis/refactor-roadmap?analysisId=${activeAnalysisId}`,
        );
        if (cancelled) return;
        if (!r.ok) {
          setRefactorRoadmap(null);
          return;
        }
        const data = (await r.json()) as RefactorRoadmap;
        if (cancelled) return;
        setRefactorRoadmap(data);
      } catch {
        if (cancelled) return;
        setRefactorRoadmap(null);
      } finally {
        if (!cancelled) setRoadmapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAnalysisId]);

  // P2.3 — sort priorities by releasePhase asc, then roiScore desc.
  // (The sequencer already does this, but we re-sort defensively in case
  // the report was generated before the sequencer existed.)
  const sortedPriorities = (aiPriorities ?? []).slice().sort((a: any, b: any) => {
    const phaseOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const pa = phaseOrder[a.releasePhase] ?? 3;
    const pb = phaseOrder[b.releasePhase] ?? 3;
    if (pa !== pb) return pa - pb;
    return (b.roiScore ?? 0) - (a.roiScore ?? 0);
  });

  return (
    <div className="space-y-4">
      {/* Sequencer warnings (debug visibility — when the AI mis-estimated or had invalid deps) */}
      {sequencerWarnings && sequencerWarnings.length > 0 && (
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.04] p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-300">
                {t("reports", "roadmapMeta.sequencerWarnings")} ({sequencerWarnings.length})
              </p>
              <ul className="mt-1 space-y-0.5">
                {sequencerWarnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-[11px] text-amber-200/80">• {w}</li>
                ))}
                {sequencerWarnings.length > 5 && (
                  <li className="text-[11px] text-amber-200/60">
                    +{sequencerWarnings.length - 5} more…
                  </li>
                )}
              </ul>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Executive Note — CTO-facing sequencing narrative */}
      {executiveNote && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <h3 className="text-sm font-semibold">{t("reports", "roadmapMeta.executiveNote")}</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{executiveNote}</p>
        </GlassCard>
      )}

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
            {sortedPriorities.map((p: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-3"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-300">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium">{p.issue}</p>
                    {/* Release phase badge — P0 red / P1 amber / P2 cyan / P3 gray */}
                    {p.releasePhase && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          p.releasePhase === "P0"
                            ? "bg-rose-500/20 text-rose-300"
                            : p.releasePhase === "P1"
                            ? "bg-amber-500/20 text-amber-300"
                            : p.releasePhase === "P2"
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "bg-white/10 text-muted-foreground"
                        )}
                        title={t("reports", `roadmapMeta.phase${p.releasePhase}` as any)}
                      >
                        {p.releasePhase}
                      </span>
                    )}
                    {/* Effort badge — ⏱️ 4h */}
                    {typeof p.effortHours === "number" && (
                      <span className="flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-foreground/80">
                        <Clock className="h-2.5 w-2.5" />
                        {t("reports", "roadmapMeta.effortHours")}: {p.effortHours}h
                        {p.effortBand ? ` · ${p.effortBand}` : ""}
                      </span>
                    )}
                    {/* ROI mini-bar — 0-100 colored */}
                    {typeof p.roiScore === "number" && (
                      <span
                        className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium"
                        title={t("reports", "roadmapMeta.roi")}
                      >
                        <Target className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="text-foreground/70">{t("reports", "roadmapMeta.roi")}</span>
                        <span
                          className="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-white/10"
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(100, p.roiScore))}%`,
                              background:
                                p.roiScore >= 75
                                  ? "#34d399"
                                  : p.roiScore >= 50
                                  ? "#fbbf24"
                                  : "#fb7185",
                            }}
                          />
                        </span>
                        <span className="tabular-nums text-foreground/80">{Math.round(p.roiScore)}</span>
                      </span>
                    )}
                  </div>
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
                  {/* dependsOn chips — if non-empty, show "depends on: [title]" */}
                  {Array.isArray(p.dependsOn) && p.dependsOn.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <GitFork className="h-2.5 w-2.5" />
                        {t("reports", "roadmapMeta.dependsOn")}:
                      </span>
                      {p.dependsOn.map((dep: string, j: number) => (
                        <code
                          key={j}
                          className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200"
                        >
                          {dep}
                        </code>
                      ))}
                    </div>
                  )}
                  {/* blocks chips — mirror of dependsOn, for discoverability */}
                  {Array.isArray(p.blocks) && p.blocks.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <GitFork className="h-2.5 w-2.5 rotate-180" />
                        {t("reports", "roadmapMeta.blocks")}:
                      </span>
                      {p.blocks.map((blk: string, j: number) => (
                        <code
                          key={j}
                          className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200"
                        >
                          {blk}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Phase 2 (P2.5) — Refactor Sequencing card.
          Graph-validated phase ordering. Renders BELOW the AI Priorities card
          so the user sees the AI's claimed deps first, then the graph-validated
          version with confidence badges (high=graph, medium=AI-only, low=none).
          Fetches /api/analysis/refactor-roadmap on mount. */}
      {roadmapLoading && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">{t("reports", "refactorRoadmap.loading")}</span>
          </div>
        </GlassCard>
      )}

      {refactorRoadmap && !roadmapLoading && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.04] to-transparent p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-violet-300" />
              <h3 className="text-lg font-semibold">{t("reports", "refactorRoadmap.title")}</h3>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                ✨ {t("reports", "refactorRoadmap.graphValidated")}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t("reports", "refactorRoadmap.totalEffort")}</p>
              <p className="text-lg font-bold tabular-nums">{refactorRoadmap.totalEffortHours}h</p>
            </div>
          </div>

          {refactorRoadmap.warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-2">
              {refactorRoadmap.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            <span>
              {t("reports", "refactorRoadmap.parallelSpeedup")}:{" "}
              <strong className="text-cyan-300 tabular-nums">{refactorRoadmap.parallelSpeedupFactor}x</strong>
            </span>
          </div>

          {/* Phase columns (P0 → P3) */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {refactorRoadmap.phases.map((phase) => (
              <div
                key={phase.phase}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                      phase.phase === "P0"
                        ? "bg-rose-400/15 text-rose-400"
                        : phase.phase === "P1"
                          ? "bg-amber-400/15 text-amber-400"
                          : phase.phase === "P2"
                            ? "bg-cyan-400/15 text-cyan-300"
                            : "bg-white/10 text-muted-foreground",
                    )}
                  >
                    {phase.phase}
                  </span>
                  {phase.canParallelize && (
                    <span
                      className="text-[9px] text-emerald-400"
                      title={t("reports", "refactorRoadmap.canParallelize")}
                    >
                      ⚡ parallel
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {phase.title} · {phase.totalEffortHours}h
                </p>

                {phase.issues.map((iss, i) => (
                  <div
                    key={i}
                    className="mb-2 rounded border border-white/5 bg-black/20 p-2 text-xs"
                  >
                    <p className="font-medium leading-tight">{iss.issue}</p>
                    <code className="block text-[10px] text-muted-foreground mt-0.5 truncate" title={iss.file}>
                      {iss.file}
                    </code>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className="text-[10px] tabular-nums">⏱️ {iss.effortHours}h</span>
                      <span
                        className={cn(
                          "rounded px-1 text-[9px] font-medium",
                          iss.confidence === "high"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : iss.confidence === "medium"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-white/10 text-muted-foreground",
                        )}
                        title={t("reports", "refactorRoadmap.confidence")}
                      >
                        {iss.confidence}
                      </span>
                      {iss.graphValidatedDeps.length > 0 && (
                        <span
                          className="text-[9px] text-violet-300"
                          title={iss.graphValidatedDeps
                            .map((d) => `${d.from}→${d.to} (${d.edgeType})`)
                            .join(", ")}
                        >
                          🔗 {iss.graphValidatedDeps.length}
                        </span>
                      )}
                    </div>
                    {iss.unblocks.length > 0 && (
                      <p className="text-[9px] text-cyan-300 mt-1 leading-tight">
                        {t("reports", "refactorRoadmap.unblocks")}: {iss.unblocks.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Fallback: AI priorities pass failed */}
      {prioPassFailed && (
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">{t("reports", "aiFallback.title")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("reports", "aiFallback.desc", { pass: t("reports", "aiInsights.priorities") })}</p>
        </GlassCard>
      )}

      {/* Fallback: AI priorities still running */}
      {prioPassPending && (
        <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <p className="text-sm font-medium text-cyan-300">{t("reports", "aiFallback.pending")}</p>
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
                  className={cn(
                    "rounded-xl border p-3",
                    phase.phase === "P0"
                      ? "border-rose-500/20 bg-rose-500/[0.04]"
                      : phase.phase === "P1"
                      ? "border-amber-500/20 bg-amber-500/[0.04]"
                      : phase.phase === "P2"
                      ? "border-cyan-500/15 bg-cyan-500/[0.03]"
                      : "border-white/5 bg-white/[0.02]"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        phase.phase === "P0"
                          ? "bg-rose-500/20 text-rose-300"
                          : phase.phase === "P1"
                          ? "bg-amber-500/20 text-amber-300"
                          : phase.phase === "P2"
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "bg-white/10 text-muted-foreground"
                      )}
                      title={t("reports", `roadmapMeta.phase${phase.phase}` as any)}
                    >
                      {phase.phase}
                    </span>
                    {phase.title && (
                      <p className="text-xs font-semibold text-foreground/90">{phase.title}</p>
                    )}
                    {/* Phase total effort */}
                    {typeof phase.estimatedEffortHours === "number" && phase.estimatedEffortHours > 0 && (
                      <span className="ml-auto flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
                        <Clock className="h-2.5 w-2.5" />
                        {t("reports", "roadmapMeta.phaseTotal")}: {phase.estimatedEffortHours}h
                      </span>
                    )}
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {phase.tasks?.map((task: string, j: number) => (
                      <li key={j} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                        <span className="mt-0.5 text-cyan-300">→</span> {task}
                      </li>
                    ))}
                  </ul>
                  {/* blockedBy chips — which phases must complete first */}
                  {Array.isArray(phase.blockedBy) && phase.blockedBy.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                        {t("reports", "roadmapMeta.blockedBy")}:
                      </span>
                      {phase.blockedBy.map((b: string, j: number) => (
                        <code
                          key={j}
                          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200"
                        >
                          {b}
                        </code>
                      ))}
                    </div>
                  )}
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

/* ---------- Timeline (Phase 2 — P2.2) ----------
 * Two halves:
 *  1. Score trajectory bar chart — every analysis of this repo (oldest→newest)
 *     rendered as a vertical bar whose height = overall score. Click to set
 *     the "to" comparison point.
 *  2. Compare-from → compare-to dropdowns — fetches /api/analysis/diff and
 *     renders score deltas (red/green), added/resolved issues, file changes,
 *     tech-debt delta.
 *
 * Backward-compatible: if fewer than 2 analyses exist, the diff UI is hidden
 * and an empty-state message ("No previous analyses…") is shown.
 */
interface TimelineEntry {
  id: string;
  createdAt: string;
  scores: {
    overall: number;
    security: number;
    performance: number;
    architecture: number;
    maintainability: number;
    codeQuality: number;
  };
  aiStatus: string;
}

interface AISummary {
  summary?: string;
  trendAnalysis?: string;
  concerns?: string[];
  wins?: string[];
  recommendation?: string;
}

function TimelineTab({ report, isShared = false }: { report: AnalysisReport; isShared?: boolean }) {
  const { t } = useT();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [diff, setDiff] = useState<AnalysisDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  // AI Summary (P2.5) — lazy: only fetched when the user clicks the button.
  // Cleared whenever from/to changes so a stale summary is never shown for a
  // different comparison pair.
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  // Lazy initial state — only show the loading spinner if we actually have a
  // repo to fetch the timeline for. Avoids the "Loading..." flash when the
  // report has no repoOwner/repoName (e.g. legacy data).
  const [timelineLoading, setTimelineLoading] = useState(
    () => !!report.repoOwner && !!report.repoName
  );

  // Load timeline on mount — fetch the chronological list of analyses for
  // this repo (oldest → newest). Falls back to empty list on error.
  useEffect(() => {
    if (!report.repoOwner || !report.repoName) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/analysis/timeline?repoOwner=${encodeURIComponent(report.repoOwner)}&repoName=${encodeURIComponent(report.repoName)}`
        );
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const list: TimelineEntry[] = Array.isArray(data?.analyses) ? data.analyses : [];
        setTimeline(list);
        // Default: compare first (oldest) → last (newest)
        if (list.length >= 2) {
          setFromId(list[0].id);
          setToId(list[list.length - 1].id);
        }
      } catch {
        /* silent — empty state will render */
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [report.repoOwner, report.repoName]);

  // Load diff whenever from/to changes. If either is missing or they're the
  // same analysis, we skip the fetch — the cleanup of the previous effect
  // (run before this body) clears any stale diff.
  useEffect(() => {
    if (!fromId || !toId || fromId === toId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/analysis/diff?from=${fromId}&to=${toId}`);
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setDiff(data);
      } catch {
        /* silent — keeps previous diff */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Clear stale diff when deps change so the user never sees a diff for
      // a from→to pair they're no longer looking at.
      setDiff(null);
      // P2.5: also clear any AI summary — it was for a different comparison.
      setAiSummary(null);
      setAiSummaryError(null);
    };
  }, [fromId, toId]);

  // P2.5 — fetch the AI narrative for the current diff. Lazy: only called
  // from the button onClick. Uses the current locale so the AI responds in
  // the user's language (file paths + tech terms kept as-is by the prompt).
  const fetchAiSummary = async () => {
    if (!fromId || !toId || fromId === toId) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    setAiSummary(null);
    try {
      const res = await fetch("/api/analysis/diff/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromId,
          to: toId,
          language: useI18nStore.getState().locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiSummaryError(data?.error || t("reports", "timeline.aiSummaryFailed"));
      } else if (!data?.summary) {
        // AI responded but JSON parse failed — surface a graceful error.
        setAiSummaryError(t("reports", "timeline.aiSummaryFailed"));
      } else {
        setAiSummary(data.summary as AISummary);
      }
    } catch {
      setAiSummaryError(t("reports", "timeline.aiSummaryFailed"));
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const scoreLabel = (key: string): string => {
    if (key === "codeQuality") return "quality";
    if (key === "performance") return "perf";
    return key;
  };

  return (
    <div className="space-y-4">
      {/* Score trajectory chart */}
      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-300" />
          <h3 className="text-lg font-semibold">{t("reports", "timeline.scoreTrajectory")}</h3>
        </div>
        {timelineLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("reports", "timeline.loading")}
          </div>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reports", "timeline.noHistory")}</p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: "8rem" }}>
            {timeline.map((a) => {
              const score = Math.max(0, Math.min(100, a.scores.overall || 0));
              const isSelected = a.id === fromId || a.id === toId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setToId(a.id)}
                  className={cn(
                    "flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-t transition-opacity",
                    isSelected ? "opacity-100" : "opacity-70 hover:opacity-100"
                  )}
                  title={`${new Date(a.createdAt).toLocaleString()}: ${score}/100 (click to set as compare target)`}
                >
                  <span className="text-xs font-medium tabular-nums">{score}</span>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-cyan-500 to-violet-500"
                    style={{ height: `${Math.max(score, 4)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(a.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Compare from → to */}
      <GlassCard className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-cyan-300" />
            <h3 className="text-lg font-semibold">{t("reports", "timeline.compare")}</h3>
          </div>
          {timeline.length >= 2 && (
            <>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-sm"
              >
                {timeline.map((a) => (
                  <option key={a.id} value={a.id} className="bg-background">
                    {new Date(a.createdAt).toLocaleDateString()} ({a.scores.overall})
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">→</span>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-sm"
              >
                {timeline.map((a) => (
                  <option key={a.id} value={a.id} className="bg-background">
                    {new Date(a.createdAt).toLocaleDateString()} ({a.scores.overall})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {timeline.length < 2 && !timelineLoading && (
          <p className="text-sm text-muted-foreground">{t("reports", "timeline.noHistory")}</p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("reports", "timeline.loading")}
          </div>
        )}

        {diff && !loading && (
          <div className="space-y-3">
            {/* Score deltas */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Object.entries(diff.scores).map(([key, delta]) => (
                <div
                  key={key}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {scoreLabel(key)}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      delta > 0
                        ? "text-emerald-400"
                        : delta < 0
                          ? "text-rose-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </p>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
              <p className="text-sm text-foreground/85">{diff.summary}</p>
            </div>

            {/* Added issues */}
            {diff.issues.added.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wider text-rose-400">
                  {t("reports", "timeline.newIssues")} ({diff.issues.added.length})
                </h4>
                <div className="space-y-1">
                  {diff.issues.added.slice(0, 10).map((iss, i) => (
                    <div key={i} className="text-xs">
                      <SeverityBadge severity={iss.severity} />
                      <span className="ml-2">{iss.title}</span>
                      <code className="ml-2 text-[10px] text-muted-foreground">{iss.file}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved issues */}
            {diff.issues.resolved.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wider text-emerald-400">
                  {t("reports", "timeline.resolvedIssues")} ({diff.issues.resolved.length})
                </h4>
                <div className="space-y-1">
                  {diff.issues.resolved.slice(0, 10).map((iss, i) => (
                    <div key={i} className="text-xs opacity-60 line-through">
                      <SeverityBadge severity={iss.severity} />
                      <span className="ml-2">{iss.title}</span>
                      <code className="ml-2 text-[10px] text-muted-foreground">{iss.file}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files changed */}
            {(diff.files.added.length > 0 || diff.files.deleted.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {diff.files.added.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs uppercase tracking-wider text-emerald-400">
                      {t("reports", "timeline.filesAdded")} ({diff.files.added.length})
                    </h4>
                    <div className="space-y-0.5">
                      {diff.files.added.slice(0, 5).map((f) => (
                        <code key={f} className="block truncate text-[10px] text-muted-foreground">
                          {f}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {diff.files.deleted.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs uppercase tracking-wider text-rose-400">
                      {t("reports", "timeline.filesDeleted")} ({diff.files.deleted.length})
                    </h4>
                    <div className="space-y-0.5">
                      {diff.files.deleted.slice(0, 5).map((f) => (
                        <code key={f} className="block truncate text-[10px] text-muted-foreground">
                          {f}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tech debt */}
            {diff.techDebt.scoreDelta !== 0 && (
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3">
                <p className="text-xs">
                  <span className="font-medium">{t("reports", "timeline.techDebtChange")}:</span>{" "}
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      diff.techDebt.scoreDelta < 0 ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {diff.techDebt.scoreDelta > 0 ? "+" : ""}
                    {diff.techDebt.scoreDelta}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({diff.techDebt.itemsAdded} new, {diff.techDebt.itemsResolved} resolved)
                  </span>
                </p>
              </div>
            )}

            {/* P2.5 — AI Explain Changes button (lazy: only fires on click).
                Hidden in shared mode — viewer cannot trigger AI calls. */}
            {!isShared && (
            <div className="pt-1">
              <Button
                type="button"
                onClick={fetchAiSummary}
                disabled={aiSummaryLoading}
                className="bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:opacity-90"
              >
                {aiSummaryLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {t("reports", "timeline.aiExplainLoading")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {t("reports", "timeline.aiExplainButton")}
                  </>
                )}
              </Button>
            </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* P2.5 — AI Summary card (only shown while loading, on error, or when
          a summary is present). Sits below the diff card so the user can
          reference both side-by-side. */}
      {(aiSummaryLoading || aiSummaryError || aiSummary) && (
        <GlassCard className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <h3 className="text-lg font-semibold">{t("reports", "timeline.aiSummary")}</h3>
            <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
          </div>

          {aiSummaryLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("reports", "timeline.aiExplainLoading")}
            </div>
          )}

          {aiSummaryError && !aiSummaryLoading && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3 text-sm text-rose-300">
              {t("reports", "timeline.aiSummaryFailed")}: {aiSummaryError}
            </div>
          )}

          {aiSummary && !aiSummaryLoading && (
            <div className="space-y-3">
              {/* Executive summary */}
              {aiSummary.summary && (
                <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
                  <p className="text-sm text-foreground/90">{aiSummary.summary}</p>
                </div>
              )}

              {/* Trend analysis */}
              {aiSummary.trendAnalysis && (
                <div>
                  <h4 className="mb-1 text-xs uppercase tracking-wider text-cyan-300">
                    {t("reports", "timeline.trendAnalysis")}
                  </h4>
                  <p className="text-sm text-foreground/80">{aiSummary.trendAnalysis}</p>
                </div>
              )}

              {/* Concerns + Wins side-by-side on >= sm */}
              <div className="grid gap-3 sm:grid-cols-2">
                {aiSummary.concerns && aiSummary.concerns.length > 0 && (
                  <div className="rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-3">
                    <h4 className="mb-1.5 text-xs uppercase tracking-wider text-rose-400">
                      {t("reports", "timeline.concerns")}
                    </h4>
                    <ul className="space-y-1">
                      {aiSummary.concerns.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                          <span className="mt-0.5 text-rose-400">⚠</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiSummary.wins && aiSummary.wins.length > 0 && (
                  <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
                    <h4 className="mb-1.5 text-xs uppercase tracking-wider text-emerald-400">
                      {t("reports", "timeline.wins")}
                    </h4>
                    <ul className="space-y-1">
                      {aiSummary.wins.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                          <span className="mt-0.5 text-emerald-400">✓</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Recommendation — amber highlight */}
              {aiSummary.recommendation && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <h4 className="mb-1 text-xs uppercase tracking-wider text-amber-300">
                    {t("reports", "timeline.recommendation")}
                  </h4>
                  <p className="text-sm text-foreground/90">{aiSummary.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

