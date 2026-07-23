"use client";

import { Sparkles, ShieldCheck, Network, Zap, Rocket, Activity } from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import type { AnalysisReport } from "@/lib/types";

/**
 * AI Insights Tab — displays 7-pass Deep AI Analysis results.
 * Extracted from project-view.tsx for better maintainability.
 */
export function AIInsightsTab({ report }: { report: AnalysisReport }) {
  const deep = (report as any).deepAnalysis;
  const aiEnh = (report as any).aiEnhancement;

  if (!deep && !aiEnh) {
    return (
      <GlassCard className="p-8 text-center">
        <Activity className="mx-auto h-8 w-8 text-cyan-300" />
        <h3 className="mt-3 text-sm font-semibold">Static Analysis Only</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No AI insights available. Add an AI provider or enable Platform AI for deep AI-powered insights.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {deep?.badge === "deep-ai" ? (
          <span className="flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300">
            <Sparkles className="h-3.5 w-3.5" /> Deep AI Analysis (7-pass)
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
            <Activity className="h-3.5 w-3.5" /> AI-Enhanced
          </span>
        )}
      </div>

      <GlassCard className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-300" /> Executive Summary</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          {deep?.executiveSummary || aiEnh?.aiSummary || report.summary}
        </p>
      </GlassCard>

      {deep && (
        <>
          {deep.securityReview?.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-rose-400" /> AI Security Review</h3>
              <div className="mt-3 space-y-3">
                {deep.securityReview.map((s: any, i: number) => (
                  <div key={i} className="rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-3">
                    <p className="text-sm font-medium text-rose-200">{s.issue}</p>
                    <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Root cause:</span> {s.rootCause}</p>
                    <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Impact:</span> {s.impact}</p>
                    {s.fixCode && <pre className="mt-2 overflow-x-auto rounded-md bg-black/40 p-2 text-[10px] font-mono text-emerald-300"><code>{s.fixCode}</code></pre>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {deep.architectureReview && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-cyan-300" /> AI Architecture Review</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400">Strengths</p>
                  <ul className="mt-1 space-y-1">{deep.architectureReview.strengths?.map((s: string, i: number) => <li key={i} className="text-xs text-muted-foreground">✓ {s}</li>)}</ul>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-rose-400">Weaknesses</p>
                  <ul className="mt-1 space-y-1">{deep.architectureReview.weaknesses?.map((w: string, i: number) => <li key={i} className="text-xs text-muted-foreground">✗ {w}</li>)}</ul>
                </div>
              </div>
              {deep.architectureReview.suggestions?.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-violet-300">Suggestions</p>
                  {deep.architectureReview.suggestions.map((s: any, i: number) => (
                    <div key={i} className="rounded border border-white/5 bg-white/[0.02] p-2">
                      <p className="text-xs font-medium">{s.title} <span className="ml-1 text-[9px] text-muted-foreground">({s.effort})</span></p>
                      <p className="text-[11px] text-muted-foreground">{s.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {deep.performanceReview?.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-400" /> AI Performance Review</h3>
              <div className="mt-3 space-y-3">
                {deep.performanceReview.map((p: any, i: number) => (
                  <div key={i} className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3">
                    <p className="text-sm font-medium text-amber-200">{p.issue}</p>
                    <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Root cause:</span> {p.rootCause}</p>
                    {p.fixCode && <pre className="mt-2 overflow-x-auto rounded-md bg-black/40 p-2 text-[10px] font-mono text-emerald-300"><code>{p.fixCode}</code></pre>}
                    <p className="mt-1 text-xs text-emerald-300"><span className="font-medium">Expected:</span> {p.expectedImprovement}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {deep.bestPracticesAudit && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-cyan-300" /> AI Best Practices Audit — {deep.bestPracticesAudit.framework}</h3>
              <div className="mt-3 flex items-center gap-3">
                <div className="text-3xl font-bold" style={{ color: deep.bestPracticesAudit.score >= 70 ? "#34d399" : deep.bestPracticesAudit.score >= 40 ? "#fbbf24" : "#fb7185" }}>
                  {deep.bestPracticesAudit.score}
                </div>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              {deep.bestPracticesAudit.passed?.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Passed</p>
                  <div className="flex flex-wrap gap-1">
                    {deep.bestPracticesAudit.passed.map((p: string, i: number) => (
                      <span key={i} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">✓ {p}</span>
                    ))}
                  </div>
                </div>
              )}
              {deep.bestPracticesAudit.failed?.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-rose-400 mb-1">Needs Improvement</p>
                  {deep.bestPracticesAudit.failed.map((f: any, i: number) => (
                    <div key={i} className="rounded border border-rose-500/10 bg-rose-500/[0.02] p-2">
                      <p className="text-xs font-medium text-rose-200">{f.practice}</p>
                      <p className="text-[11px] text-muted-foreground">{f.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {deep.priorities?.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-400" /> AI Priorities</h3>
              <div className="mt-3 space-y-2">
                {deep.priorities.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-300">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{p.issue}</p>
                      <p className="text-[11px] text-muted-foreground"><span className="font-medium">Impact:</span> {p.businessImpact}</p>
                      <p className="text-[11px] text-muted-foreground"><span className="font-medium">Recommendation:</span> {p.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {deep.roadmap?.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4 text-cyan-300" /> AI Roadmap</h3>
              <div className="mt-3 space-y-3">
                {deep.roadmap.map((phase: any, i: number) => (
                  <div key={i} className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
                    <p className="text-xs font-semibold text-cyan-200">{phase.phase}</p>
                    <ul className="mt-1 space-y-0.5">{phase.tasks?.map((task: string, j: number) => <li key={j} className="text-[11px] text-muted-foreground">→ {task}</li>)}</ul>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}
