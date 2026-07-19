"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Terminal as TerminalIcon,
  GitBranch,
  Workflow,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Eye,
  ListTodo,
  FolderSearch,
  Bug,
  Wrench,
  BookOpen,
  FlaskConical,
  ShieldAlert,
  Gauge,
  Network,
  Server,
  AlertTriangle,
  FileText,
  GitCommitHorizontal,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProvidersStore } from "@/lib/providers-store";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentCapability {
  kind: string;
  description: string;
}

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  capabilities: AgentCapability[];
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  retrying?: number;
  total: number;
}

interface AgentEvent {
  id?: string;
  type: string;
  level?: "info" | "warn" | "error" | "debug";
  agent?: string;
  message?: string;
  timestamp: number;
  data?: unknown;
}

interface AgentStatusResponse {
  agents: AgentInfo[];
  agentCount: number;
  queue: QueueStats;
  recentEvents: AgentEvent[];
  timestamp: number;
}

interface WorkflowPhase {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
  result?: unknown;
}

interface WorkflowArtifact {
  kind: string;
  path?: string;
  content: string;
  language?: string;
}

interface BuildTestResult {
  buildPassed: boolean;
  testPassed: boolean;
  lintPassed: boolean;
  buildOutput?: string;
  testOutput?: string;
  lintOutput?: string;
  fixAttempts: number;
  finalBuildPassed: boolean;
}

interface CommitResult {
  committed: boolean;
  pushed: boolean;
  sha?: string;
  message?: string;
  filesChanged: number;
  error?: string;
}

interface WorkflowResult {
  success: boolean;
  goal: string;
  graphId: string;
  tasksCompleted: number;
  tasksFailed: number;
  finalReport: string;
  artifacts: WorkflowArtifact[];
  durationMs: number;
  errors: string[];
  phases: WorkflowPhase[];
  buildResult?: BuildTestResult;
  commitResult?: CommitResult;
  traceId: string;
}

interface TerminalResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cancelled?: boolean;
  historyId?: string;
  error?: string;
  permission?: string;
  message?: string;
}

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  staged: boolean;
  oldPath?: string;
}

interface GitStatusInfo {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

interface GitCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
}

interface CommitMessage {
  type: string;
  scope?: string;
  title: string;
  body: string;
}

interface DiffIssue {
  file: string;
  line: number;
  severity: "critical" | "warning" | "info" | "suggestion";
  comment: string;
}

interface DiffReview {
  score: number;
  summary: string;
  issues: DiffIssue[];
  suggestions: string[];
}

// ── Provider config helper ────────────────────────────────────────────────────

interface ProviderConfig {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

function toProviderConfig(
  provider: { providerId: string; apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number; timeout: number } | undefined
): ProviderConfig | undefined {
  if (!provider) return undefined;
  return {
    providerId: provider.providerId,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: provider.model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens > 0 ? provider.maxTokens : undefined,
    timeout: provider.timeout,
  };
}

// ── Icon map for agents (icon name -> lucide component) ───────────────────────

const AGENT_ICONS: Record<string, typeof Bot> = {
  Eye,
  ListTodo,
  FolderSearch,
  Network,
  Bug,
  Wrench,
  BookOpen,
  FlaskConical,
  ShieldAlert,
  Gauge,
  Server,
};

function getAgentIcon(name: string): typeof Bot {
  return AGENT_ICONS[name] ?? Bot;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AgentsView() {
  const { t } = useT();
  const [tab, setTab] = useState("dashboard");
  const report = useAppStore((s) => s.activeReport);
  const setView = useAppStore((s) => s.setView);

  // Giống ChatView/ProjectView: Agents view chỉ hoạt động khi đã có 1 phân tích active.
  if (!report) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <Bot className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-4 text-xl font-bold">{t("agents", "emptyState.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("agents", "emptyState.description")}</p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Sparkles className="mr-1.5 h-4 w-4" /> {t("agents", "emptyState.cta")}
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4 text-cyan-300" />
            <span>{t("agents", "subtitle")}</span>
            <span>·</span>
            <span className="font-mono">{report.repoOwner}/{report.repoName}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            <GradientText>{t("common", "nav.agents")}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("agents", "description")}
          </p>
        </div>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-white/[0.03] border border-white/10 h-auto flex-wrap">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            <span>{t("agents", "tabs.dashboard")}</span>
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" />
            <span>{t("agents", "tabs.workflow")}</span>
          </TabsTrigger>
          <TabsTrigger value="terminal" className="gap-1.5">
            <TerminalIcon className="h-3.5 w-3.5" />
            <span>{t("agents", "tabs.terminal")}</span>
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            <span>{t("agents", "tabs.git")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab active={tab === "dashboard"} />
        </TabsContent>
        <TabsContent value="workflow" className="mt-4">
          {/* Workflow Runner gắn với phân tích hiện tại — repositoryUrl lấy từ activeReport */}
          <WorkflowTab repoUrl={report.repoUrl} />
        </TabsContent>
        <TabsContent value="terminal" className="mt-4">
          <TerminalTab />
        </TabsContent>
        <TabsContent value="git" className="mt-4">
          <GitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab 1: Dashboard ──────────────────────────────────────────────────────────

function DashboardTab({ active }: { active: boolean }) {
  const { t } = useT();
  const [status, setStatus] = useState<AgentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AgentStatusResponse;
      setStatus(data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 5s when tab is active
  useEffect(() => {
    if (!active) return;
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [active, fetchStatus]);

  if (loading && !status) {
    return (
      <GlassCard className="p-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-300" />
        <p className="mt-3 text-sm text-muted-foreground">Loading agent system…</p>
      </GlassCard>
    );
  }

  if (error && !status) {
    return (
      <GlassCard className="p-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" />
        <p className="mt-3 text-sm text-rose-300">Failed to load agent status</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchStatus} className="mt-4">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </GlassCard>
    );
  }

  if (!status) return null;

  const queue = status.queue;

  return (
    <div className="space-y-4">
      {/* Queue stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <QueueStat label={t("agents", "queue.pending")} value={queue.pending} color="#fbbf24" icon={Clock} />
        <QueueStat label={t("agents", "queue.running")} value={queue.running} color="#22d3ee" icon={Loader2} spin={queue.running > 0} />
        <QueueStat label={t("agents", "queue.completed")} value={queue.completed} color="#34d399" icon={CheckCircle} />
        <QueueStat label={t("agents", "queue.failed")} value={queue.failed} color="#f87171" icon={XCircle} />
        <QueueStat label={t("agents", "queue.cancelled")} value={queue.cancelled} color="#94a3b8" icon={XCircle} />
        <QueueStat label={t("agents", "queue.total")} value={queue.total} color="#a78bfa" icon={Activity} />
      </div>

      {/* Agents grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Registered Agents ({status.agentCount})
          </h2>
          <Button size="sm" variant="ghost" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {status.agents.map((agent, i) => {
            const Icon = getAgentIcon(agent.icon);
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <GlassCard hover className="h-full p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: `${agent.color}1a`,
                        color: agent.color,
                        border: `1px solid ${agent.color}33`,
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" style={{ color: agent.color }}>
                        {agent.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                  {agent.capabilities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {agent.capabilities.map((cap) => (
                        <span
                          key={cap.kind}
                          className="inline-flex items-center rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground"
                          title={cap.description}
                        >
                          {cap.kind}
                        </span>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recent events */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("agents", "dashboard.recentEvents")} (last 20)
        </h2>
        <GlassCard className="overflow-hidden">
          {status.recentEvents.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("agents", "dashboard.noEvents")}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin divide-y divide-white/5">
              {[...status.recentEvents].reverse().map((evt, i) => {
                const level = evt.level ?? (evt.type.includes("failed") ? "error" : evt.type.includes("completed") ? "info" : "info");
                const levelColor =
                  level === "error" ? "#f87171" :
                  level === "warn" ? "#fbbf24" :
                  level === "debug" ? "#94a3b8" : "#22d3ee";
                return (
                  <div key={`${evt.timestamp}-${i}`} className="flex items-start gap-3 p-3 text-xs">
                    <div className="flex w-20 shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div className="flex w-32 shrink-0 items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: levelColor }} />
                      <span className="truncate font-mono text-[10px]" style={{ color: levelColor }}>
                        {evt.agent ?? evt.type}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-foreground/90">
                        {evt.message ?? `${evt.type}${evt.data ? `: ${JSON.stringify(evt.data).slice(0, 100)}` : ""}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function QueueStat({
  label,
  value,
  color,
  icon: Icon,
  spin,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof Bot;
  spin?: boolean;
}) {
  return (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}
        >
          <Icon className={cn("h-4 w-4", spin && "animate-spin")} />
        </div>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
    </GlassCard>
  );
}

// ── Tab 2: Workflow Runner ────────────────────────────────────────────────────

const WORKFLOW_PHASES = [
  { name: "planning-execution", labelKey: "workflow.phases.planning", threshold: 5 },
  { name: "write-artifacts", labelKey: "workflow.phases.writeArtifacts", threshold: 62 },
  { name: "build-test-lint", labelKey: "workflow.phases.buildTestLint", threshold: 68 },
  { name: "commit-push", labelKey: "workflow.phases.commitPush", threshold: 90 },
];

function WorkflowTab({ repoUrl }: { repoUrl: string }) {
  const { t } = useT();
  const providers = useProvidersStore((s) => s.providers);
  const enabledProviders = providers.filter((p) => p.enabled);
  const [goal, setGoal] = useState("");
  const [providerId, setProviderId] = useState<string>(enabledProviders[0]?.id ?? "__default__");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState<WorkflowResult | null>(null);

  const selectedProvider = enabledProviders.find((p) => p.id === providerId);

  const runWorkflow = async () => {
    if (!goal.trim()) {
      toast.error("Please enter a goal for the workflow.");
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress(0);
    setProgressMsg(t("agents", "workflow.progressStart"));

    // Simulate incremental progress while the synchronous API call runs.
    // Cap at 90% — the real 100% only arrives when the API responds.
    // Without this cap, the bar would jump to 100% only after the full
    // (potentially multi-minute) workflow completes, leaving the user
    // wondering if it's stuck.
    const progressTimer = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;  // hold at 90% until API responds
        // Slow down as we approach 90% — diminishing increments
        const remaining = 90 - p;
        const increment = Math.max(0.3, remaining * 0.08);
        return Math.min(90, p + increment + Math.random() * 0.5);
      });
    }, 1000);

    // Also update the progress message with rotating status hints so the
    // user knows the workflow is still active (the API is synchronous and
    // can't stream real progress yet).
    const statusHintKeys = [
      "workflow.hints.planning",
      "workflow.hints.analyzing",
      "workflow.hints.executing",
      "workflow.hints.staticAnalysis",
      "workflow.hints.generatingCode",
      "workflow.hints.writingFiles",
      "workflow.hints.runningTsc",
      "workflow.hints.runningLint",
      "workflow.hints.runningTests",
      "workflow.hints.commitMessage",
      "workflow.hints.committing",
      "workflow.hints.pushing",
    ];
    let hintIdx = 0;
    const hintTimer = setInterval(() => {
      hintIdx = (hintIdx + 1) % statusHintKeys.length;
      setProgressMsg(t("agents", statusHintKeys[hintIdx]));
    }, 3000);

    try {
      const res = await fetch("/api/workflow/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "workflow",
          goal,
          // Luôn gắn với phân tích hiện tại (từ activeReport.repoUrl)
          repositoryUrl: repoUrl || undefined,
          provider: toProviderConfig(selectedProvider),
          autoCommit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const wf = data.result as WorkflowResult;
      setResult(wf);
      setProgress(100);
      setProgressMsg(t("agents", "workflow.progressDone"));
      if (wf.success) {
        toast.success("Workflow completed successfully!");
      } else {
        toast.warning("Workflow finished with errors — see report.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Workflow failed: ${msg}`);
      setProgressMsg(`Failed: ${msg}`);
    } finally {
      clearInterval(progressTimer);
      clearInterval(hintTimer);
      setRunning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setProgress(0);
    setProgressMsg("");
    setGoal("");
  };

  return (
    <div className="space-y-4">
      {!result ? (
        <GlassCard strong className="p-5">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">{t("agents", "workflow.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agents", "workflow.description")}
          </p>

          <NeonDivider className="my-4" />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-cyan-300" /> {t("agents", "workflow.goalLabel")}
              </label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t("agents", "workflow.goalPlaceholder")}
                className="bg-white/[0.03] font-mono text-sm"
                rows={3}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Repository cố định = phân tích hiện tại (chỉ-đọc, không cho user đổi) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <GitBranch className="h-3 w-3 text-violet-400" /> {t("agents", "workflow.repoLabel")}
                </label>
                <Input
                  value={repoUrl}
                  readOnly
                  className="bg-white/[0.02] font-mono text-xs text-muted-foreground"
                  title="Gắn với phân tích hiện tại"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Bot className="h-3 w-3 text-emerald-400" /> {t("agents", "workflow.providerLabel")}
                </label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger className="bg-white/[0.03] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">{t("agents", "workflow.providerDefault")}</SelectItem>
                    {enabledProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} — {p.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {enabledProviders.length === 0 && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-300">
                {t("agents", "workflow.providerHint")}
              </p>
            )}

            <Button
              onClick={runWorkflow}
              disabled={running || !goal.trim()}
              className="w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
            >
              {running ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("agents", "workflow.running")}
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-4 w-4" />
                  {t("agents", "workflow.runButton")}
                </>
              )}
            </Button>

            {/* Progress */}
            <AnimatePresence>
              {running && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{progressMsg}</span>
                    <span className="font-mono text-cyan-300">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-white/5" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {WORKFLOW_PHASES.map((phase) => {
                      const active = progress >= phase.threshold;
                      return (
                        <div
                          key={phase.name}
                          className={cn(
                            "rounded-lg border p-2 text-[10px] transition",
                            active
                              ? "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-300"
                              : "border-white/5 bg-white/[0.02] text-muted-foreground"
                          )}
                        >
                          {active ? <CheckCircle className="mb-1 h-3 w-3" /> : <Clock className="mb-1 h-3 w-3" />}
                          <p className="font-medium">{t("agents", phase.labelKey)}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </GlassCard>
      ) : (
        <WorkflowResultView result={result} onReset={reset} />
      )}
    </div>
  );
}

function WorkflowResultView({ result, onReset }: { result: WorkflowResult; onReset: () => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      {/* Header */}
      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          {result.success ? (
            <CheckCircle className="h-6 w-6 text-emerald-400" />
          ) : (
            <XCircle className="h-6 w-6 text-rose-400" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              {t("agents", "workflow.result.title")} {result.success ? t("agents", "workflow.result.statusCompleted") : t("agents", "workflow.result.statusFailed")}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{result.goal}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-mono text-[10px]">
              <Clock className="mr-1 h-2.5 w-2.5" />
              {(result.durationMs / 1000).toFixed(1)}s
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-mono text-[10px]">
              <Activity className="mr-1 h-2.5 w-2.5" />
              {result.tasksCompleted}/{result.tasksCompleted + result.tasksFailed}
            </Badge>
          </div>
          <Button size="sm" variant="outline" onClick={onReset}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {t("agents", "workflow.result.runAnother")}
          </Button>
        </div>
      </GlassCard>

      {/* Phase breakdown */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">{t("agents", "workflow.result.phases")}</h3>
        <NeonDivider className="my-3" />
        <div className="space-y-2">
          {result.phases.map((phase, i) => (
            <div key={`${phase.name}-${i}`} className="flex items-center gap-3 text-xs">
              <PhaseStatusIcon status={phase.status} />
              <span className="min-w-0 flex-1 font-medium">{phase.name}</span>
              {phase.durationMs != null && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {(phase.durationMs / 1000).toFixed(2)}s
                </span>
              )}
              {phase.error && (
                <span className="ml-2 truncate text-[10px] text-rose-300" title={phase.error}>
                  {phase.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Build / Test / Lint */}
      {result.buildResult && (
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">{t("agents", "workflow.result.buildTestLint")}</h3>
          <NeonDivider className="my-3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BuildStat label={t("agents", "workflow.result.typeScript")} passed={result.buildResult.buildPassed} />
            <BuildStat label={t("agents", "workflow.result.lint")} passed={result.buildResult.lintPassed} />
            <BuildStat label={t("agents", "workflow.result.tests")} passed={result.buildResult.testPassed} />
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agents", "workflow.result.fixAttempts")}</p>
              <p className="text-lg font-bold tabular-nums text-amber-300">{result.buildResult.fixAttempts}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Final status:</span>
            {result.buildResult.finalBuildPassed ? (
              <Badge className="border-emerald-400/30 bg-emerald-400/[0.1] text-emerald-300">{t("agents", "workflow.result.finalPassed")}</Badge>
            ) : (
              <Badge className="border-rose-400/30 bg-rose-400/[0.1] text-rose-300">{t("agents", "workflow.result.finalFailed")}</Badge>
            )}
          </div>
        </GlassCard>
      )}

      {/* Commit / Push */}
      {result.commitResult && (
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">{t("agents", "workflow.result.git")}</h3>
          <NeonDivider className="my-3" />
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">{t("agents", "workflow.result.committed")}:</span>
              {result.commitResult.committed ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-rose-400" />
              )}
            </div>
            {result.commitResult.sha && (
              <div className="flex items-center gap-2">
                <span className="w-20 text-muted-foreground">{t("agents", "workflow.result.sha")}:</span>
                <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">{result.commitResult.sha.slice(0, 12)}</code>
              </div>
            )}
            {result.commitResult.message && (
              <div className="flex items-center gap-2">
                <span className="w-20 text-muted-foreground">{t("agents", "workflow.result.message")}:</span>
                <span className="truncate">{result.commitResult.message}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">{t("agents", "workflow.result.pushed")}:</span>
              {result.commitResult.pushed ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-rose-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">{t("agents", "workflow.result.filesChanged")}:</span>
              <span className="font-mono">{result.commitResult.filesChanged}</span>
            </div>
            {result.commitResult.error && (
              <p className="rounded border border-rose-400/20 bg-rose-400/[0.05] p-2 text-rose-300">
                {result.commitResult.error}
              </p>
            )}
          </div>
        </GlassCard>
      )}

      {/* Artifacts */}
      {result.artifacts.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">{t("agents", "workflow.result.artifacts")} ({result.artifacts.length})</h3>
          <NeonDivider className="my-3" />
          <div className="space-y-2">
            {result.artifacts.map((a, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-cyan-300" />
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px]">{a.kind}</Badge>
                  {a.path && (
                    <code className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{a.path}</code>
                  )}
                </div>
                <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground scrollbar-thin">
                  {a.content.slice(0, 500)}{a.content.length > 500 ? "…" : ""}
                </pre>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Final report */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Final Report</h3>
        <NeonDivider className="my-3" />
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground/90 scrollbar-thin">
          {result.finalReport}
        </pre>
      </GlassCard>

      {/* Errors */}
      {result.errors.length > 0 && (
        <GlassCard className="border-rose-400/20 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> {t("agents", "workflow.result.errors")} ({result.errors.length})
          </h3>
          <NeonDivider className="my-3" />
          <div className="space-y-1">
            {result.errors.map((err, i) => (
              <p key={i} className="rounded border border-rose-400/10 bg-rose-400/[0.03] p-2 font-mono text-[11px] text-rose-300">
                {err}
              </p>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function PhaseStatusIcon({ status }: { status: WorkflowPhase["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-rose-400" />;
    case "skipped":
      return <span className="text-[10px] text-muted-foreground">SKIP</span>;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function BuildStat({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-center",
        passed
          ? "border-emerald-400/30 bg-emerald-400/[0.06]"
          : "border-rose-400/30 bg-rose-400/[0.06]"
      )}
    >
      {passed ? (
        <CheckCircle className="mx-auto h-4 w-4 text-emerald-400" />
      ) : (
        <XCircle className="mx-auto h-4 w-4 text-rose-400" />
      )}
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Tab 3: Terminal ───────────────────────────────────────────────────────────

interface CommandHistoryEntry {
  command: string;
  exitCode: number;
  timestamp: number;
}

function TerminalTab() {
  const { t } = useT();
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<TerminalResult | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [output]);

  const run = async (cmd?: string) => {
    const target = (cmd ?? command).trim();
    if (!target) {
      toast.error("Please enter a command.");
      return;
    }
    setRunning(true);
    setPermissionDenied(false);
    setOutput(null);

    try {
      const res = await fetch("/api/terminal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: target, timeout: 60000 }),
      });
      const data = (await res.json()) as TerminalResult;

      if (res.status === 403 || res.status === 402) {
        setPermissionDenied(true);
        setOutput({
          command: target,
          stdout: "",
          stderr: data.error ?? data.message ?? "Permission denied",
          exitCode: -1,
          durationMs: 0,
          permission: data.permission,
        });
        toast.error("Permission denied — command not in allowlist.");
        setHistory((h) => [{ command: target, exitCode: -1, timestamp: Date.now() }, ...h].slice(0, 30));
      } else if (!res.ok) {
        setOutput({
          command: target,
          stdout: "",
          stderr: data.error ?? `HTTP ${res.status}`,
          exitCode: -1,
          durationMs: 0,
        });
        toast.error(data.error ?? `HTTP ${res.status}`);
      } else {
        setOutput(data);
        setHistory((h) => [{ command: target, exitCode: data.exitCode, timestamp: Date.now() }, ...h].slice(0, 30));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed: ${msg}`);
      setOutput({
        command: target,
        stdout: "",
        stderr: msg,
        exitCode: -1,
        durationMs: 0,
      });
    } finally {
      setRunning(false);
      if (cmd) setCommand(cmd);
    }
  };

  const clearOutput = () => {
    setOutput(null);
    setPermissionDenied(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <GlassCard strong className="p-4">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">{t("agents", "terminal.title")}</h2>
            {permissionDenied && (
              <Badge className="ml-auto border-rose-400/30 bg-rose-400/[0.1] text-rose-300">
                <ShieldAlert className="mr-1 h-2.5 w-2.5" /> {t("agents", "terminal.permissionDenied")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agents", "terminal.description")}
          </p>

          <NeonDivider className="my-3" />

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-emerald-400">$</span>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={t("agents", "terminal.placeholder")}
                className="bg-white/[0.03] pl-6 font-mono text-sm"
              />
            </div>
            <Button
              onClick={() => run()}
              disabled={running || !command.trim()}
              className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
            >
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              {t("agents", "terminal.runButton")}
            </Button>
            <Button variant="outline" onClick={clearOutput} disabled={!output && !permissionDenied}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </GlassCard>

        {/* Output panel */}
        {output && (
          <GlassCard className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
              <TerminalIcon className="h-3.5 w-3.5 text-cyan-300" />
              <span className="font-mono text-[11px] text-muted-foreground">{t("agents", "terminal.output").toLowerCase()}</span>
              <div className="ml-auto flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/10 bg-white/[0.03] font-mono text-[10px]",
                    output.exitCode === 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  )}
                >
                  {t("agents", "terminal.exitCode")}: {output.exitCode}
                </Badge>
                {output.durationMs > 0 && (
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-mono text-[10px] text-muted-foreground">
                    {output.durationMs}ms
                  </Badge>
                )}
              </div>
            </div>
            <div
              ref={outputRef}
              className="max-h-[28rem] overflow-y-auto bg-[#0a0e1a] p-3 font-mono text-xs scrollbar-thin"
            >
              <div className="mb-2 text-emerald-400">
                <span className="text-muted-foreground">$</span> {output.command}
              </div>
              {output.stdout && (
                <pre className="whitespace-pre-wrap break-words text-cyan-100/90">{output.stdout}</pre>
              )}
              {output.stderr && (
                <pre className="mt-1 whitespace-pre-wrap break-words text-rose-300">{output.stderr}</pre>
              )}
              {!output.stdout && !output.stderr && (
                <p className="text-muted-foreground">(no output)</p>
              )}
            </div>
          </GlassCard>
        )}

        {!output && (
          <GlassCard className="p-8 text-center">
            <TerminalIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("agents", "terminal.noOutput")}
            </p>
          </GlassCard>
        )}
      </div>

      {/* History sidebar */}
      <div>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-3.5 w-3.5 text-violet-400" /> {t("agents", "terminal.history")}
            </h3>
            {history.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setHistory([])} className="h-7 text-xs">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <NeonDivider className="my-3" />
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("agents", "terminal.noHistory")}
            </p>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => run(h.command)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-left text-xs transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
                >
                  {h.exitCode === 0 ? (
                    <CheckCircle className="h-3 w-3 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
                  )}
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{h.command}</code>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

// ── Tab 4: Git ────────────────────────────────────────────────────────────────

function GitTab() {
  const { t } = useT();
  const providers = useProvidersStore((s) => s.providers);
  const enabledProviders = providers.filter((p) => p.enabled);
  const [providerId, setProviderId] = useState<string>(enabledProviders[0]?.id ?? "__default__");
  const selectedProvider = enabledProviders.find((p) => p.id === providerId);

  const [status, setStatus] = useState<GitStatusInfo | null>(null);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);

  const [aiCommit, setAiCommit] = useState<CommitMessage | null>(null);
  const [committing, setCommitting] = useState(false);
  const [generatingCommit, setGeneratingCommit] = useState(false);

  const [pushing, setPushing] = useState(false);
  const [review, setReview] = useState<DiffReview | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "status" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setStatus(data.status as GitStatusInfo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Git status failed: ${msg}`);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const refreshCommits = useCallback(async () => {
    setLoadingCommits(true);
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "recent-commits", count: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setCommits((data.commits as GitCommitInfo[]) ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Recent commits failed: ${msg}`);
    } finally {
      setLoadingCommits(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshCommits();
  }, [refreshStatus, refreshCommits]);

  const stage = async (paths: string[]) => {
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "stage", paths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(`Staged ${paths.length} file${paths.length === 1 ? "" : "s"}.`);
      refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Stage failed: ${msg}`);
    }
  };

  const unstage = async (paths: string[]) => {
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "unstage", paths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(`Unstaged ${paths.length} file${paths.length === 1 ? "" : "s"}.`);
      refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Unstage failed: ${msg}`);
    }
  };

  const generateCommit = async () => {
    setGeneratingCommit(true);
    setAiCommit(null);
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "commit-ai", provider: toProviderConfig(selectedProvider) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setAiCommit(data.generatedMessage as CommitMessage);
      toast.success("AI commit generated.");
      refreshStatus();
      refreshCommits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`AI commit failed: ${msg}`);
    } finally {
      setGeneratingCommit(false);
    }
  };

  const push = async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "push" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(t("agents", "git.pushed"));
      refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${t("agents", "git.pushFailed")}: ${msg}`);
    } finally {
      setPushing(false);
    }
  };

  const reviewDiff = async () => {
    setReviewing(true);
    setReview(null);
    try {
      const res = await fetch("/api/git/operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "review-diff", staged: true, provider: toProviderConfig(selectedProvider) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setReview(data.review as DiffReview);
      toast.success("Diff review complete.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Diff review failed: ${msg}`);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Git status */}
        <GlassCard strong className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">{t("agents", "git.status")}</h2>
            {status && (
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-mono text-[10px]">
                {status.branch}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {status && (status.ahead > 0 || status.behind > 0) && (
                <>
                  {status.ahead > 0 && (
                    <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/[0.1] text-[10px] text-emerald-300">
                      <ArrowUp className="mr-1 h-2.5 w-2.5" /> {status.ahead}
                    </Badge>
                  )}
                  {status.behind > 0 && (
                    <Badge variant="outline" className="border-amber-400/30 bg-amber-400/[0.1] text-[10px] text-amber-300">
                      <ArrowDown className="mr-1 h-2.5 w-2.5" /> {status.behind}
                    </Badge>
                  )}
                </>
              )}
              <Button size="sm" variant="ghost" onClick={refreshStatus} disabled={loadingStatus} className="h-7">
                <RefreshCw className={cn("h-3.5 w-3.5", loadingStatus && "animate-spin")} />
              </Button>
            </div>
          </div>

          <NeonDivider className="my-3" />

          {loadingStatus && !status ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            </div>
          ) : status ? (
            <div className="space-y-3">
              <FileSection
                title={t("agents", "git.staged")}
                files={status.staged.map((f) => ({ path: f.path, status: f.status }))}
                emptyText={t("agents", "git.noStaged")}
                actionLabel={t("agents", "git.unstage")}
                onAction={(path) => unstage([path])}
                accent="#34d399"
              />
              <FileSection
                title={t("agents", "git.unstaged")}
                files={status.unstaged.map((f) => ({ path: f.path, status: f.status }))}
                emptyText={t("agents", "git.noUnstaged")}
                actionLabel={t("agents", "git.stage")}
                onAction={(path) => stage([path])}
                accent="#fbbf24"
              />
              <FileSection
                title={t("agents", "git.untracked")}
                files={status.untracked.map((p) => ({ path: p, status: "added" as const }))}
                emptyText={t("agents", "git.noUntracked")}
                actionLabel={t("agents", "git.stage")}
                onAction={(path) => stage([path])}
                accent="#a78bfa"
              />
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("agents", "git.failedLoad")}
            </p>
          )}
        </GlassCard>

        {/* AI Commit */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold">{t("agents", "git.aiCommit")}</h3>
            <div className="ml-auto">
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger size="sm" className="h-7 w-48 bg-white/[0.03] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Built-in</SelectItem>
                  {enabledProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <NeonDivider className="my-3" />
          {aiCommit ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <p className="text-xs text-muted-foreground">Generated message:</p>
                <p className="mt-1 font-mono text-sm text-cyan-300">
                  {aiCommit.type}{aiCommit.scope ? `(${aiCommit.scope})` : ""}: {aiCommit.title}
                </p>
                {aiCommit.body && (
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                    {aiCommit.body}
                  </pre>
                )}
              </div>
              <p className="text-[11px] text-emerald-300">
                <CheckCircle className="mr-1 inline h-3 w-3" />
                {t("agents", "git.committed")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("agents", "git.aiCommitDesc")}
            </p>
          )}
          <Button
            onClick={generateCommit}
            disabled={generatingCommit || committing}
            className="mt-3 w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
          >
            {generatingCommit ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Generating + committing…
              </>
            ) : (
              <>
                <GitCommitHorizontal className="mr-1.5 h-4 w-4" />
                {t("agents", "git.generateCommit")}
              </>
            )}
          </Button>
        </GlassCard>

        {/* Diff review */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Eye className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">{t("agents", "git.diffReview")}</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={reviewDiff}
              disabled={reviewing}
              className="ml-auto"
            >
              {reviewing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {t("agents", "git.reviewDiff")}
            </Button>
          </div>
          <NeonDivider className="my-3" />
          {!review ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Run a review to get an AI score and per-line issues.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ScoreRing score={review.score} />
                <p className="flex-1 text-xs text-muted-foreground">{review.summary}</p>
              </div>
              {review.issues.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("agents", "git.issues")} ({review.issues.length})
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin">
                    {review.issues.map((issue, i) => (
                      <div key={i} className="rounded border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <SeverityPill severity={issue.severity} />
                          <code className="font-mono text-[10px] text-muted-foreground">
                            {issue.file}:{issue.line}
                          </code>
                        </div>
                        <p className="mt-1 text-muted-foreground">{issue.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {review.suggestions.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t("agents", "git.suggestions")}</p>
                  <ul className="space-y-1">
                    {review.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <span className="mt-0.5 text-cyan-300">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Right column: actions + commits */}
      <div className="space-y-4">
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">Actions</h3>
          <NeonDivider className="my-3" />
          <div className="space-y-2">
            <Button
              onClick={push}
              disabled={pushing}
              variant="outline"
              className="w-full justify-start"
            >
              {pushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUp className="mr-2 h-4 w-4 text-emerald-400" />}
              {t("agents", "git.push")}
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("agents", "git.recentCommits")}</h3>
            <Button size="sm" variant="ghost" onClick={refreshCommits} disabled={loadingCommits} className="h-7">
              <RefreshCw className={cn("h-3.5 w-3.5", loadingCommits && "animate-spin")} />
            </Button>
          </div>
          <NeonDivider className="my-3" />
          {loadingCommits && commits.length === 0 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            </div>
          ) : commits.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{t("agents", "git.noCommits")}</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin">
              {commits.map((c) => (
                <div key={c.sha} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono text-[10px] text-cyan-300">{c.sha.slice(0, 7)}</code>
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      {new Date(c.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 break-words text-foreground/90">{c.message.split("\n")[0]}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">by {c.author}</p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function FileSection({
  title,
  files,
  emptyText,
  actionLabel,
  onAction,
  accent,
}: {
  title: string;
  files: { path: string; status: string }[];
  emptyText: string;
  actionLabel: string;
  onAction: (path: string) => void;
  accent: string;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        {title} ({files.length})
      </p>
      {files.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-muted-foreground/70">{emptyText}</p>
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto scrollbar-thin">
          {files.map((f) => (
            <div
              key={f.path}
              className="group flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/[0.03]"
            >
              <span className="font-mono text-[9px] uppercase" style={{ color: accent }}>
                {f.status.slice(0, 1)}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90" title={f.path}>
                {f.path}
              </code>
              <button
                onClick={() => onAction(f.path)}
                className="shrink-0 rounded border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-muted-foreground opacity-0 transition hover:border-cyan-400/30 hover:text-cyan-300 group-hover:opacity-100"
              >
                {actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: `${color}55` }}>
      <span className="text-base font-bold tabular-nums" style={{ color }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

function SeverityPill({ severity }: { severity: DiffIssue["severity"] }) {
  const color =
    severity === "critical" ? "#f87171" :
    severity === "warning" ? "#fbbf24" :
    severity === "info" ? "#22d3ee" : "#a78bfa";
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}
    >
      {severity}
    </span>
  );
}
