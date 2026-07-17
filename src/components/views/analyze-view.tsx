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
import { useEffect, useRef, useState } from "react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { ANALYSIS_STAGES, parseRepoUrl } from "@/lib/analysis-engine";
import type { AnalysisReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

// ==========================================
// CẤU HÌNH TỐC ĐỘ CHẠY UI (Millisecond cho mỗi 1%):
// 60ms  = Tổng thời gian chạy khoảng 6 giây
// 90ms  = Tổng thời gian chạy khoảng 9 giây (Khuyên dùng - Rất mượt và vừa mắt)
// 120ms = Tổng thời gian chạy khoảng 12 giây
const PROGRESS_SPEED_MS = 90;
// ==========================================

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
  const [report, setReport] = useState<AnalysisReport | null>(null);

  // State điều khiển nội suy tiến độ UI
  const [visualProgress, setVisualProgress] = useState(0); 
  const [targetProgress, setTargetProgress] = useState(0); 
  const [isJobComplete, setIsJobComplete] = useState(false); 

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setView = useAppStore((s) => s.setView);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const setActiveAnalysisId = useAppStore((s) => s.setActiveAnalysisId);
  const clearChat = useAppStore((s) => s.clearChat);
  const { t } = useT();

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  // --- BỘ ĐIỀU KHIỂN TỐC ĐỘ CHẬM VÀ MƯỢT ---
  useEffect(() => {
    if (phase !== "running") return;

    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        // 1. Nếu chưa tới 100% và (chưa đuổi kịp backend HOẶC backend đã xong nhưng UI chưa chạy hết)
        // -> Luôn nhích ĐÚNG 1%, tuyệt đối không nhảy cóc để đảm bảo thời gian tối thiểu
        if (prev < targetProgress || (isJobComplete && prev < 100)) {
          return Math.min(prev + 1, 100);
        }

        // 2. Nếu Backend chạy lâu hơn dự kiến và UI đã đuổi kịp -> Tự động nhích cực chậm (+0.5%) để chờ API (tối đa đến 92%)
        if (!isJobComplete && prev >= targetProgress && prev < 92) {
          return prev + 0.5;
        }

        // 3. Khi đạt 100% và Backend đã có kết quả -> Dừng 800ms để người dùng nhìn thấy full icon Check xanh rồi mới chuyển
        if (isJobComplete && prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setPhase("done");
            if (report) {
              toast.success(`Analysis complete — ${report.scores?.overall ?? 0}/100`);
            }
          }, 800);
        }

        return prev;
      });
    }, PROGRESS_SPEED_MS);

    return () => clearInterval(interval);
  }, [phase, targetProgress, isJobComplete, report]);

  // Tính toán giai đoạn (stage) dựa trên visualProgress
  const totalStages = ANALYSIS_STAGES.length;
  const stageIdx = Math.min(
    Math.floor((visualProgress / 100) * totalStages),
    totalStages - 1
  );
  const stageProgress = ((visualProgress * totalStages) % 100);

  const start = async () => {
    const parsed = parseRepoUrl(url);
    if (!parsed.valid) {
      setError(t("errors", "invalidUrl"));
      return;
    }
    setError("");
    setPhase("running");
    
    // Reset toàn bộ tiến độ về 0
    setVisualProgress(0);
    setTargetProgress(5); 
    setIsJobComplete(false);
    clearTimers();

    try {
      const startRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: parsed.url, async: true, force: true }),
      });
      const startData = await startRes.json();

      // Trường hợp trả về kết quả ngay lập tức (cache)
      if (startData.report) {
        setReport(startData.report);
        setActiveAnalysisId(startData.id ?? null);
        clearChat();
        setTargetProgress(100);
        setIsJobComplete(true);
        return;
      }

      // Trường hợp có jobId, bắt đầu polling
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

            if (job.progress > targetProgress) {
              setTargetProgress(job.progress);
            }

            if (job.status === "completed" && job.result) {
              setReport(job.result.report);
              setActiveAnalysisId(job.result.id ?? null);
              clearChat();
              setTargetProgress(100);
              setIsJobComplete(true);
            } else if (job.status === "failed") {
              setPhase("error");
              toast.error(job.error || "Analysis failed");
            } else if (job.status === "cancelled") {
              setPhase("error");
              toast.error("Analysis cancelled");
            } else {
              timers.current.push(setTimeout(poll, 1000));
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
      setTargetProgress(100);
      setIsJobComplete(true);
    } catch (e) {
      console.error(e);
      setPhase("error");
      toast.error("Analysis failed. Please try again.");
    }
  };

  const reset = () => {
    clearTimers();
    setPhase("input");
    setUrl("");
    setReport(null);
    setVisualProgress(0);
    setTargetProgress(0);
    setIsJobComplete(false);
  };

  /* ---------- INPUT PHASE ---------- */
  if (phase === "input") {
    return (
      <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 -z-0 flex items-center justify-center opacity-70"></div>

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
          </div>

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
    const current = ANALYSIS_STAGES[stageIdx] || ANALYSIS_STAGES[0];
    const overallProgress = visualProgress;

    return (
      <div className="relative mx-auto max-w-5xl px-4 py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 flex justify-center opacity-60"></div>

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
              transition={{ ease: "linear", duration: 0.1 }}
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