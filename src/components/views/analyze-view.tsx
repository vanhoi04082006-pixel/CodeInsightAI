"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  ScanLine,
  Binary,
  Network,
  Brain,
  SearchCode,
  Sparkles,
  FileText,
  ArrowRight,
  Github,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useProvidersStore } from "@/lib/providers-store";
import { ANALYSIS_STAGES, parseRepoUrl } from "@/lib/analysis-engine";
import type { AnalysisReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const ICONS: Record<string, typeof GitBranch> = {
  "git-branch": GitBranch,
  scan: ScanLine,
  binary: Binary,
  network: Network,
  brain: Brain,
  "search-code": SearchCode,
  sparkles: Sparkles,
  "file-text": FileText,
};

type Phase = "input" | "running" | "done" | "error";

export function AnalyzeView() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [stageIdx, setStageIdx] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [useAI, setUseAI] = useState(true); // AI analysis toggle (default ON)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Smooth progress animation: separate target (from API) vs displayed (interpolated).
  // The API polls every 1s and gives chunky jumps (5→10→15). We interpolate
  // between displayed and target every animation frame (60fps) for smooth 1-2-3-4-5.
  const [displayProgress, setDisplayProgress] = useState(0);
  const targetProgress = useRef(0);
  const rafId = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(0);

  const setView = useAppStore((s) => s.setView);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const setActiveAnalysisId = useAppStore((s) => s.setActiveAnalysisId);
  const clearChat = useAppStore((s) => s.clearChat);
  const { t } = useT();

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // requestAnimationFrame loop — interpolates displayed progress toward target.
  // Speed: covers ~1.5% per frame at 60fps ≈ 90%/s, but slows near target
  // (easeOut) so it never overshoots.
  const animateProgress = useCallback((timestamp: number) => {
    if (lastFrameTime.current === 0) lastFrameTime.current = timestamp;
    const deltaMs = timestamp - lastFrameTime.current;
    lastFrameTime.current = timestamp;

    setDisplayProgress((current) => {
      const target = targetProgress.current;
      if (Math.abs(target - current) < 0.1) {
        return target;  // snapped to target
      }
      // Ease toward target. Scale by delta time so it's frame-rate independent.
      // At 60fps, deltaMs ≈ 16ms. We want ~1.2%/frame when far, slowing near target.
      const distance = target - current;
      const speed = Math.max(0.4, Math.abs(distance) * 0.12) * (deltaMs / 16.67);
      const next = current + Math.sign(distance) * Math.min(Math.abs(distance), speed);
      return Math.round(next * 10) / 10;  // 1 decimal place
    });

    rafId.current = requestAnimationFrame(animateProgress);
  }, []);

  const startProgressAnimation = useCallback(() => {
    if (rafId.current !== null) return;  // already running
    lastFrameTime.current = 0;
    rafId.current = requestAnimationFrame(animateProgress);
  }, [animateProgress]);

  const stopProgressAnimation = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  // Set the target progress (called from poll). The animation loop will
  // smoothly catch up.
  const setTargetProgress = useCallback((p: number) => {
    targetProgress.current = Math.max(0, Math.min(100, p));
  }, []);

  useEffect(() => () => {
    clearTimers();
    stopProgressAnimation();
  }, []);

  // Consume pending repo URL (set by dashboard sample-repo clicks)
  useEffect(() => {
    const pending = useAppStore.getState().consumePendingRepoUrl?.();
    if (pending) {
      setUrl(pending);
    }
  }, []);

  const start = async () => {
    const parsed = parseRepoUrl(url);
    if (!parsed.valid) {
      setError(t("errors", "invalidUrl"));
      return;
    }
    setError("");
    setPhase("running");
    setStageIdx(0);
    setStageProgress(0);
    setDisplayProgress(0);
    targetProgress.current = 0;
    clearTimers();
    startProgressAnimation();  // begin smooth interpolation loop

    // Start real async analysis with job polling
    // Send platform provider + model if Pro user, or BYOK key if available
    try {
      const { useEffectiveAIConfig, buildAIRequestBody } = await import("@/hooks/use-effective-ai-config");
      // Read config from localStorage (sync — hook is for component state, but we
      // need it in the event handler, so we read directly)
      const aiMode = useProvidersStore.getState().aiMode;
      const providers = useProvidersStore.getState().providers;
      const byokProvider = providers.find((p) => p.enabled && p.apiKey);
      const platformSelection = JSON.parse(localStorage.getItem("codeinsight-platform-selection") || "null");
      const session = await import("next-auth/react").then(m => m.getSession ? null : null);
      // Build request body
      const aiBody: Record<string, any> = {};
      // Pro user with platform selection: use admin key
      if (platformSelection && (!byokProvider || aiMode === "platform")) {
        aiBody.platformProvider = platformSelection.providerId;
        aiBody.platformModel = platformSelection.model;
        aiBody.aiMode = "platform";
      } else if (byokProvider) {
        // BYOK with saved key
        aiBody.provider = {
          providerId: byokProvider.providerId,
          apiKey: byokProvider.apiKey,
          baseUrl: byokProvider.baseUrl,
          model: byokProvider.model,
          label: byokProvider.label,
        };
        aiBody.aiMode = "byok";
      }

      const startRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: parsed.url, async: false, force: true,
          aiEnhance: useAI, // send AI toggle state
          ...aiBody,
        }),
      });
      const startData = await startRes.json();

      // If cached result returned immediately
      if (startData.report) {
        setReport(startData.report);
        setActiveAnalysisId(startData.id ?? null);
        clearChat();
        setPhase("done");
        toast.success(`Analysis complete — ${startData.report.scores.overall}/100`);
        return;
      }

      // If we got a jobId, poll for progress
      if (startData.jobId) {
        const jobId = startData.jobId;
        let pollCount = 0;
        const maxPolls = 120;

        const poll = async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            setPhase("error");
            toast.error("Analysis timed out. Please try again.");
            return;
          }

          try {
            const res = await fetch(`/api/jobs/${jobId}`);
            const data = await res.json();
            const job = data.job;

            if (!job) {
              setPhase("error");
              toast.error("Job not found");
              return;
            }

            // Map job progress to visual stages.
            // We set the TARGET progress — the rAF loop interpolates the
            // DISPLAYED progress smoothly (1-2-3-4-5 instead of 5-10-15 jumps).
            const progress = job.progress || 0;
            setTargetProgress(progress);
            // Stages update based on target (so stage transitions happen at
            // the right moment even before the bar catches up visually).
            const sIdx = Math.min(Math.floor((progress / 100) * ANALYSIS_STAGES.length), ANALYSIS_STAGES.length - 1);
            setStageIdx(sIdx);
            const stagePct = ((progress / (100 / ANALYSIS_STAGES.length)) % 1) * 100;
            setStageProgress(stagePct);

            if (job.status === "completed" && job.result) {
              setTargetProgress(100);
              setStageIdx(ANALYSIS_STAGES.length - 1);
              setStageProgress(100);
              // Give the animation ~600ms to reach 100% before switching view.
              setTimeout(() => {
                setReport(job.result.report);
                setActiveAnalysisId(job.result.id ?? null);
                clearChat();
                setPhase("done");
                stopProgressAnimation();
                const score = job.result.report?.scores?.overall ?? 0;
                toast.success(`Analysis complete — ${score}/100`);
              }, 600);
            } else if (job.status === "failed") {
              stopProgressAnimation();
              setPhase("error");
              toast.error(job.error || "Analysis failed");
            } else if (job.status === "cancelled") {
              stopProgressAnimation();
              setPhase("error");
              toast.error("Analysis cancelled");
            } else {
              // Still running — poll again after 500ms (faster for smoother UX)
              timers.current.push(setTimeout(poll, 500));
            }
          } catch (e) {
            console.error("Poll error:", e);
            timers.current.push(setTimeout(poll, 2000));
          }
        };

        timers.current.push(setTimeout(poll, 500));
        return;
      }

      // Fallback: sync API call
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: parsed.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analysis failed");
      setReport(data.report);
      setActiveAnalysisId(data.id ?? null);
      clearChat();
      setPhase("done");
      toast.success(`Analysis complete — ${data.report.scores.overall}/100`);
    } catch (e) {
      console.error(e);
      setPhase("error");
      toast.error("Analysis failed. Please try again.");
    }
  };

  const reset = () => {
    clearTimers();
    stopProgressAnimation();
    setPhase("input");
    setUrl("");
    setReport(null);
    setStageIdx(0);
    setStageProgress(0);
    setDisplayProgress(0);
    targetProgress.current = 0;
  };

  /* ---------- INPUT PHASE ---------- */
  if (phase === "input") {
    return (
      <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 -z-0 flex items-center justify-center opacity-70">
          {/* 3D AI Core removed */}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-2xl text-center"
        >
          <span className="inline-block rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground backdrop-blur-md">
            {t("analysis", "title")}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t("analysis", "subtitle")}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t("analysis", "subtitleDesc")}
          </p>

          <div className="mt-8">
            <div className="gradient-border flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 px-3">
                <Github className="h-5 w-5 shrink-0 text-cyan-300" />
                <Input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && start()}
                  placeholder={t("analysis", "inputPlaceholder")}
                  className="border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                onClick={start}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {t("analysis", "analyzeBtn")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

            {/* AI Analysis Toggle */}
            <div className="mt-4 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 transition hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-violet-500"
                />
                <Brain className="h-4 w-4 text-violet-300" />
                <span className="text-sm font-medium">
                  {useAI ? "🧠 Deep AI Analysis (7-pass)" : "⚡ Static Analysis Only"}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                {useAI
                  ? "Uses AI for executive summary, security review, architecture, performance + best practices audit"
                  : "Faster — 66 static rules only, no AI tokens used"}
              </span>
            </div>
          </div>

          {/* quick examples */}
          <div className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{t("analysis", "popularRepos")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: "vercel/next.js", desc: "React framework" },
                { label: "facebook/react", desc: "UI library" },
                { label: "vuejs/core", desc: "Progressive framework" },
                { label: "tailwindlabs/tailwindcss", desc: "CSS engine" },
              ].map((r) => (
                <button
                  key={r.label}
                  onClick={() => setUrl(`https://github.com/${r.label}`)}
                  className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.05]"
                >
                  <Github className="h-4 w-4 text-muted-foreground group-hover:text-cyan-300" />
                  <div>
                    <p className="text-xs font-medium">{r.label}</p>
                    <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ---------- RUNNING PHASE ---------- */
  if (phase === "running") {
    const current = ANALYSIS_STAGES[stageIdx];
    const Icon = ICONS[current.icon] ?? Sparkles;
    // Use displayProgress (smoothly interpolated) for the overall bar.
    const overallProgress = displayProgress;

    return (
      <div className="relative mx-auto max-w-5xl px-4 py-10">
        {/* Active core */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 flex justify-center opacity-60">
          {/* 3D AI Core removed */}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center"
        >
          <h2 className="text-2xl font-bold md:text-3xl">
            Analyzing <GradientText>{parseRepoUrl(url).name || "repository"}</GradientText>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("analysis", "analyzingDesc")}
          </p>
        </motion.div>

        {/* Overall progress */}
        <GlassCard strong className="relative z-10 mt-8 p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              {current.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round(overallProgress)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
              style={{ width: `${overallProgress}%` }}
              transition={{ ease: "linear" }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{current.description}</p>
        </GlassCard>

        {/* Stage list */}
        <div className="relative z-10 mt-6 grid gap-2 sm:grid-cols-2">
          {ANALYSIS_STAGES.map((stage, i) => {
            const status = i < stageIdx ? "done" : i === stageIdx ? "active" : "pending";
            const SIcon = ICONS[stage.icon] ?? Sparkles;
            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition",
                  status === "active" && "border-cyan-400/40 bg-cyan-400/[0.06]",
                  status === "done" && "border-emerald-400/20 bg-emerald-400/[0.04]",
                  status === "pending" && "border-white/5 bg-white/[0.02] opacity-60"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    status === "active" && "bg-cyan-400/15 text-cyan-300",
                    status === "done" && "bg-emerald-400/15 text-emerald-300",
                    status === "pending" && "bg-white/5 text-muted-foreground"
                  )}
                >
                  {status === "done" ? (
                    <Check className="h-4 w-4" />
                  ) : status === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{stage.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{stage.description}</p>
                </div>
                {status === "active" && (
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-all duration-100"
                      style={{ width: `${stageProgress}%` }}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* live log */}
        <GlassCard className="relative z-10 mt-6 p-4 font-mono text-xs">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="ml-2">{t("analysis", "logLabel")}</span>
          </div>
          <div className="space-y-1 text-foreground/70">
            {ANALYSIS_STAGES.slice(0, stageIdx + 1).map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2"
              >
                <span className="text-cyan-400">[{String(i + 1).padStart(2, "0")}]</span>
                <span className="text-emerald-300">OK</span>
                <span className="truncate">{s.description}…</span>
              </motion.div>
            ))}
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-cyan-300"
            >
              {t("analysis", "working")}
            </motion.div>
          </div>
        </GlassCard>
      </div>
    );
  }

  /* ---------- ERROR PHASE ---------- */
  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400" />
          <h2 className="mt-4 text-2xl font-bold">{t("analysis", "failed")}</h2>
          <p className="mt-2 text-muted-foreground">
            Something went wrong. The repository may be private or unreachable.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={reset} variant="outline">{t("analysis", "tryAgain")}</Button>
            <Button onClick={() => setView("dashboard")} variant="ghost">{t("analysis", "goToDashboard")}</Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  /* ---------- DONE PHASE ---------- */
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 neon-glow-cyan"
        >
          <Check className="h-8 w-8" />
        </motion.div>
        <h2 className="mt-4 text-3xl font-bold md:text-4xl">
          Analysis <GradientText>complete</GradientText>
        </h2>
        <p className="mt-2 text-muted-foreground">
          {report?.repoOwner}/{report?.repoName} · {report?.totalFiles} files · {report?.totalLines.toLocaleString()} lines
        </p>
      </motion.div>

      {report && (
        <GlassCard strong className="mt-8 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreMini label="Overall" value={report.scores.overall} color="#22d3ee" />
            <ScoreMini label="Security" value={report.scores.security} color="#f472b6" />
            <ScoreMini label="Performance" value={report.scores.performance} color="#34d399" />
            <ScoreMini label="Architecture" value={report.scores.architecture} color="#a78bfa" />
            <ScoreMini label="Maintainability" value={report.scores.maintainability} color="#fbbf24" />
            <ScoreMini label="Code Quality" value={report.scores.codeQuality} color="#60a5fa" />
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                setActiveReport(report);
                setView("project");
              }}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
            >
              <FileText className="mr-1.5 h-4 w-4" />
              View full report
            </Button>
            <Button
              onClick={() => {
                setActiveReport(report);
                setView("chat");
              }}
              variant="outline"
              className="flex-1"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Chat with AI CTO
            </Button>
            <Button onClick={reset} variant="ghost">
              Analyze another
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function ScoreMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, width: `${value}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
