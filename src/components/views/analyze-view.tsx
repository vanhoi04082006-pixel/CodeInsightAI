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
import { ANALYSIS_STAGES, parseRepoUrl } from "@/lib/repo-utils";
import type { AnalysisReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT, useI18nStore } from "@/lib/i18n";

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
  const animateProgress = useRef<(timestamp: number) => void>(() => {});

  useEffect(() => {
    animateProgress.current = (timestamp: number) => {
      if (lastFrameTime.current === 0) lastFrameTime.current = timestamp;
      const deltaMs = timestamp - lastFrameTime.current;
      lastFrameTime.current = timestamp;

      setDisplayProgress((current) => {
        const target = targetProgress.current;
        if (Math.abs(target - current) < 0.1) return target;
        const distance = target - current;
        const speed = Math.max(0.4, Math.abs(distance) * 0.12) * (deltaMs / 16.67);
        const next = current + Math.sign(distance) * Math.min(Math.abs(distance), speed);
        return Math.round(next * 10) / 10;
      });

      rafId.current = requestAnimationFrame(animateProgress.current);
    };
  }, []);

  const startProgressAnimation = useCallback(() => {
    if (rafId.current !== null) return;
    lastFrameTime.current = 0;
    rafId.current = requestAnimationFrame(animateProgress.current);
  }, []);

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
      Promise.resolve().then(() => setUrl(pending));
    }
  }, []);

  // AI status: "idle" | "pending" | "done" | "failed"
  const [aiStatus, setAiStatus] = useState<"idle" | "pending" | "done" | "failed">("idle");
  const [aiPassProgress, setAiPassProgress] = useState<{ current: number; total: number; passName: string } | null>(null);

  // Run AI passes one by one (each pass = 1 API call, <60s, Hobby-compatible)
  const runAIPasses = useCallback(async (analysisId: string, language: string, aiBody: Record<string, any>) => {
    setAiStatus("pending");
    useAppStore.getState().setAiPending(true);

    // Map AI pass types to feature routing keys (Wave 6 Phase 1: overview added)
    const PASS_TO_FEATURE: Record<string, string> = {
      overview: "summary",         // NEW — routes to summary/default provider
      summary: "summary",
      priorities: "summary",
      security: "security",
      architecture: "architecture",
      quality: "bugs",
      performance: "performance",
      bestPractices: "refactor",
      duplicates: "refactor",
    };

    const tAnalysis = useI18nStore.getState().t;
    // Wave 6 Phase 1: overview runs FIRST so leadership gets a 30-second read early.
    const passes = [
      { type: "overview", name: tAnalysis("analysis", "passes.overview") },
      { type: "summary", name: tAnalysis("analysis", "passes.summary") },
      { type: "priorities", name: tAnalysis("analysis", "passes.priorities") },
      { type: "security", name: tAnalysis("analysis", "passes.security") },
      { type: "architecture", name: tAnalysis("analysis", "passes.architecture") },
      { type: "quality", name: tAnalysis("analysis", "passes.quality") },
      { type: "performance", name: tAnalysis("analysis", "passes.performance") },
      { type: "bestPractices", name: tAnalysis("analysis", "passes.bestPractices") },
      { type: "duplicates", name: tAnalysis("analysis", "passes.duplicates") },
    ];

    let completedCount = 0;

    for (const pass of passes) {
      setAiPassProgress({ current: completedCount + 1, total: passes.length, passName: pass.name });

      // Check if this pass has a specific feature routing (Custom mode)
      const featureKey = PASS_TO_FEATURE[pass.type];
      const routedProvider = aiBody.featureRouting?.[featureKey];

      try {
        const res = await fetch("/api/analyze/ai-pass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId,
            passType: pass.type,
            language,
            // If feature routing exists for this pass, use that provider
            // Otherwise fall back to default provider
            ...(routedProvider ? { provider: routedProvider } : aiBody),
          }),
        });
        // Handle non-JSON responses (504 timeout, 500 error pages, HTML)
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`;
          try {
            const text = await res.text();
            // Try to parse as JSON first
            try {
              const data = JSON.parse(text);
              errMsg = data.error || data.message || errMsg;
            } catch {
              // Not JSON — likely HTML error page (504, 500)
              if (text.includes("An error")) errMsg = "Server error (504/500)";
              else if (text.length > 100) errMsg = `Server returned ${res.status}`;
              else errMsg = text.slice(0, 100);
            }
          } catch {}
          console.warn(`[ai-pass] ${pass.type} HTTP ${res.status}:`, errMsg);
          toast.error(`${pass.name}: ${errMsg}`, { duration: 4000 });
          completedCount++;
          continue;
        }

        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          // Response is not JSON (e.g., 504 HTML error page)
          console.warn(`[ai-pass] ${pass.type} JSON parse error:`, jsonErr);
          toast.error(`${pass.name}: Server returned non-JSON response (likely timeout)`, { duration: 4000 });
          completedCount++;
          continue;
        }

        if (data.status === "done" && data.report) {
          // Update report with this pass result
          setReport(data.report);
          useAppStore.getState().setActiveReport(data.report);
          completedCount++;

          // If all done, mark complete
          if (data.allDone) {
            setAiStatus("done");
            setAiPassProgress(null);
            useAppStore.getState().setAiPending(false);
            toast.success(tAnalysis("analysis", "toast.aiDeepComplete"), {
              description: tAnalysis("analysis", "toast.aiDeepCompleteDesc"),
              duration: 6000,
            });
            return;
          }
        } else if (data.status === "failed") {
          console.warn(`[ai-pass] ${pass.type} failed:`, data.error);
          // Show toast so user knows which pass failed + why
          toast.error(`${pass.name}: ${data.error || "AI returned no valid result"}`, {
            duration: 4000,
          });
          completedCount++; // Count as attempted, continue
        } else if (data.status === "skipped") {
          console.warn(`[ai-pass] ${pass.type} skipped:`, data.error);
          completedCount++;
        }
      } catch (e) {
        console.warn(`[ai-pass] ${pass.type} error:`, e);
        completedCount++; // Count as attempted, continue
      }

      // Small delay between passes to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // All passes attempted
    setAiStatus("done");
    setAiPassProgress(null);
    useAppStore.getState().setAiPending(false);

    // Final check — reload report from DB
    try {
      const res = await fetch(`/api/report?id=${analysisId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        useAppStore.getState().setActiveReport(data.report);
      }
    } catch {}

    toast.success(tAnalysis("analysis", "toast.aiAnalysisComplete"), { duration: 5000 });
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
      // Read config from Zustand store (sync)
      const aiMode = useProvidersStore.getState().aiMode;
      const providers = useProvidersStore.getState().providers;
      const routing = useProvidersStore.getState().routing;
      const byokProvider = providers.find((p) => p.enabled && p.apiKey);
      const platformSelection = JSON.parse(localStorage.getItem("codeinsight-platform-selection") || "null");

      // Build request body
      const aiBody: Record<string, any> = {};

      // Build feature routing map (BYOK Custom mode only)
      // Maps feature → { providerId, apiKey, baseUrl, model, maxTokens }
      const featureRouting: Record<string, any> = {};
      if (aiMode === "byok" && Object.keys(routing).length > 0) {
        for (const [feature, providerId] of Object.entries(routing)) {
          const p = providers.find(pr => pr.id === providerId && pr.enabled);
          if (p) {
            featureRouting[feature] = {
              providerId: p.providerId,
              apiKey: p.apiKey,
              baseUrl: p.baseUrl,
              model: p.model,
              maxTokens: p.maxTokens,
              temperature: p.temperature,
              timeout: p.timeout,
            };
          }
        }
      }

      if (platformSelection && (!byokProvider || aiMode === "platform")) {
        aiBody.platformProvider = platformSelection.providerId;
        aiBody.platformModel = platformSelection.model;
        aiBody.platformMaxTokens = platformSelection.maxTokens ?? -1;
        aiBody.aiMode = "platform";
      } else if (byokProvider) {
        aiBody.provider = {
          providerId: byokProvider.providerId,
          apiKey: byokProvider.apiKey,
          baseUrl: byokProvider.baseUrl,
          model: byokProvider.model,
          label: byokProvider.label,
          maxTokens: byokProvider.maxTokens,
          temperature: byokProvider.temperature,
          timeout: byokProvider.timeout,
        };
        aiBody.aiMode = "byok";
        // Send feature routing if user has set it
        if (Object.keys(featureRouting).length > 0) {
          aiBody.featureRouting = featureRouting;
        }
      }

      // Simulate progress while waiting for sync API response
      // Stages: 0=Fetch(0-20%), 1=Parse(20-40%), 2=Analyze(40-60%), 3=AI(60-90%), 4=Save(90-100%)
      const progressStages = [
        { target: 15, delay: 500, stage: 0 },
        { target: 30, delay: 1500, stage: 1 },
        { target: 45, delay: 3000, stage: 2 },
        { target: 60, delay: 5000, stage: 3 },
        { target: 75, delay: 8000, stage: 3 },
        { target: 85, delay: 12000, stage: 3 },
        { target: 88, delay: 20000, stage: 3 },
        { target: 90, delay: 30000, stage: 3 },
        { target: 92, delay: 45000, stage: 3 },
        { target: 93, delay: 60000, stage: 3 },
        { target: 94, delay: 75000, stage: 3 },
        { target: 95, delay: 90000, stage: 3 },
      ];
      progressStages.forEach((ps) => {
        timers.current.push(setTimeout(() => {
          setTargetProgress(ps.target);
          setStageIdx(ps.stage);
          setStageProgress(((ps.target / (100 / ANALYSIS_STAGES.length)) % 1) * 100);
        }, ps.delay));
      });

      // Show "AI is performing deep analysis..." toast after 15s to reassure user
      timers.current.push(setTimeout(() => {
        if (phase === "running") {
          toast.info(t("analysis", "toast.aiAnalyzingDeep"), {
            description: t("analysis", "toast.aiAnalyzingDeepDesc"),
            duration: 5000,
          });
        }
      }, 15000));

      const startRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: parsed.url, async: false, force: true,
          aiEnhance: useAI,
          language: useI18nStore.getState().locale,
          ...aiBody,
        }),
      });
      const startData = await startRes.json();

      // Clear simulated progress timers
      clearTimers();

      // ERROR: server returned error
      if (!startRes.ok || startData.error) {
        stopProgressAnimation();
        setPhase("error");
        toast.error(startData.error || t("analysis", "toast.analysisFailed"));
        return;
      }

      // Success — hybrid mode returns static report immediately
      if (startData.report) {
        setTargetProgress(100);
        setStageIdx(ANALYSIS_STAGES.length - 1);
        setStageProgress(100);
        setReport(startData.report);
        setActiveAnalysisId(startData.id ?? null);
        clearChat();
        setTimeout(() => {
          setPhase("done");
          stopProgressAnimation();
          const score = startData.report.scores?.overall ?? 0;
          if (startData.aiStatus === "pending") {
            toast.success(t("analysis", "toast.staticComplete", { score }), {
              description: t("analysis", "toast.staticCompleteDesc"),
              duration: 6000,
            });
          } else {
            toast.success(t("analysis", "toast.analysisComplete", { score }));
          }
        }, 600);

        // Run AI passes one by one (each pass = 1 API call)
        if (startData.aiStatus === "pending" && startData.id) {
          runAIPasses(startData.id, useI18nStore.getState().locale, aiBody);
        }
        return;
      }

    } catch (e) {
      console.error(e);
      clearTimers();
      stopProgressAnimation();
      setPhase("error");
      toast.error(t("analysis", "toast.analysisFailedRetry"));
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
                  {useAI ? t("analysis", "aiToggle.deep") : t("analysis", "aiToggle.static")}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                {useAI
                  ? t("analysis", "aiToggle.deepDesc")
                  : t("analysis", "aiToggle.staticDesc")}
              </span>
            </div>
          </div>

          {/* quick examples */}
          <div className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{t("analysis", "popularRepos")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: "vercel/next.js", desc: t("analysis", "popularRepoDemos.next") },
                { label: "facebook/react", desc: t("analysis", "popularRepoDemos.react") },
                { label: "vuejs/core", desc: t("analysis", "popularRepoDemos.vue") },
                { label: "tailwindlabs/tailwindcss", desc: t("analysis", "popularRepoDemos.tailwind") },
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
            {t("analysis", "analyzing")} <GradientText>{parseRepoUrl(url).name || t("analysis", "repositoryFallback")}</GradientText>
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
              {t("analysis", `stages.${current.id}`)}
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
          <p className="mt-2 text-xs text-muted-foreground">{t("analysis", `${current.id}Desc`)}</p>
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
                  <p className="text-sm font-medium">{t("analysis", `stages.${stage.id}`)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{t("analysis", `${stage.id}Desc`)}</p>
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
                <span className="text-emerald-300">{t("analysis", "logOk")}</span>
                <span className="truncate">{t("analysis", `${s.id}Desc`)}…</span>
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

        {/* AI pass progress (shows when AI passes are running) */}
        {aiPassProgress && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mt-4"
          >
            <GlassCard className="border-violet-400/20 bg-violet-500/[0.04] p-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                <span className="text-sm font-semibold text-violet-300">
                  {t("analysis", "aiPassLabel", { current: aiPassProgress.current, total: aiPassProgress.total })}
                </span>
                <span className="text-xs text-muted-foreground">— {aiPassProgress.passName}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                  animate={{ width: `${(aiPassProgress.current / aiPassProgress.total) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </GlassCard>
          </motion.div>
        )}
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
            {t("analysis", "failedDesc")}
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
          {t("analysis", "completeTitlePrefix")} <GradientText>{t("analysis", "completeTitleHighlight")}</GradientText>
        </h2>
        <p className="mt-2 text-muted-foreground">
          {report?.repoOwner}/{report?.repoName} · {report?.totalFiles} {t("analysis", "filesLabel")} · {report?.totalLines.toLocaleString()} {t("analysis", "linesLabel")}
        </p>
      </motion.div>

      {report && (
        <GlassCard strong className="mt-8 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreMini label={t("analysis", "scoreLabels.overall")} value={report.scores.overall} color="#22d3ee" />
            <ScoreMini label={t("analysis", "scoreLabels.security")} value={report.scores.security} color="#f472b6" />
            <ScoreMini label={t("analysis", "scoreLabels.performance")} value={report.scores.performance} color="#34d399" />
            <ScoreMini label={t("analysis", "scoreLabels.architecture")} value={report.scores.architecture} color="#a78bfa" />
            <ScoreMini label={t("analysis", "scoreLabels.maintainability")} value={report.scores.maintainability} color="#fbbf24" />
            <ScoreMini label={t("analysis", "scoreLabels.codeQuality")} value={report.scores.codeQuality} color="#60a5fa" />
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
              {t("analysis", "viewFullReport")}
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
              {t("analysis", "chatWithAI")}
            </Button>
            <Button onClick={reset} variant="ghost">
              {t("analysis", "analyzeAnother")}
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
