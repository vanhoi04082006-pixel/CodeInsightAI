"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Rocket,
  Square,
  Pause,
  Circle,
  Loader2,
  Activity,
  History,
  Sparkles,
  ChevronRight,
  Github,
  Wifi,
  WifiOff,
  Beaker,
  Target,
  ListTree,
  FileDiff as FileDiffIcon,
  Globe,
  Maximize2,
  Minimize2,
  ChevronDown,
  Network as NetworkIcon,
  Users,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useMissionStore, MISSION_TEMPLATES } from "@/lib/mission-store";
import { useProvidersStore } from "@/lib/providers-store";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AIActivityFeed } from "@/components/mission/ai-activity-feed";
import { AgentStatusCards } from "@/components/mission/agent-status-cards";
import { WorldStatePanel } from "@/components/mission/world-state-panel";
import { MissionTimeline } from "@/components/mission/mission-timeline";
import { BottomPanel } from "@/components/mission/bottom-panel";
import { AgentDock } from "@/components/mission/agent-dock";
import { FileDiffViewer } from "@/components/mission/file-diff-viewer";
import { FileTreePanel } from "@/components/mission/file-tree-panel";
import { AgentNetworkGraph } from "@/components/mission/agent-network-graph";
import type { TerminalLine as LiveTerminalLine } from "@/components/mission/live-terminal";
import type { AIProviderConfig } from "@/lib/mission-store";
import { MissionHeader } from "@/components/mission-tabs/mission-header";

const STATUS_META: Record<
  string,
  { color: string; icon: typeof Circle; animating: boolean }
> = {
  idle: { color: "#64748b", icon: Circle, animating: false },
  planning: { color: "#fbbf24", icon: Loader2, animating: true },
  executing: { color: "#22d3ee", icon: Activity, animating: true },
  verifying: { color: "#a78bfa", icon: Loader2, animating: true },
  completed: { color: "#34d399", icon: Sparkles, animating: false },
  failed: { color: "#f472b6", icon: Pause, animating: false },
};

export function MissionControlView() {
  const { t } = useT();
  const report = useAppStore((s) => s.activeReport);
  const setView = useAppStore((s) => s.setView);

  // Use selective subscriptions to avoid re-rendering on every event.
  const goal = useMissionStore((s) => s.goal);
  const repoUrl = useMissionStore((s) => s.repoUrl);
  const provider = useMissionStore((s) => s.provider);
  const maxIterations = useMissionStore((s) => s.maxIterations);
  const setGoal = useMissionStore((s) => s.setGoal);
  const setRepoUrl = useMissionStore((s) => s.setRepoUrl);
  const setProvider = useMissionStore((s) => s.setProvider);
  const setMaxIterations = useMissionStore((s) => s.setMaxIterations);
  const missionId = useMissionStore((s) => s.missionId);
  const status = useMissionStore((s) => s.status);
  const currentPhase = useMissionStore((s) => s.currentPhase);
  const iteration = useMissionStore((s) => s.iteration);
  const confidence = useMissionStore((s) => s.confidence);
  const currentTask = useMissionStore((s) => s.currentTask);
  const currentFile = useMissionStore((s) => s.currentFile);
  const buildStatus = useMissionStore((s) => s.buildStatus);
  const testStatus = useMissionStore((s) => s.testStatus);
  const connected = useMissionStore((s) => s.connected);
  const demoMode = useMissionStore((s) => s.demoMode);
  const startMission = useMissionStore((s) => s.startMission);
  const cancelMission = useMissionStore((s) => s.cancelMission);
  const startDemoMode = useMissionStore((s) => s.startDemoMode);
  const reset = useMissionStore((s) => s.reset);

  // These change frequently — subscribe with shallow comparison
  const events = useMissionStore((s) => s.events);
  const agentStatuses = useMissionStore((s) => s.agentStatuses);
  const filesModified = useMissionStore((s) => s.filesModified);
  const decisions = useMissionStore((s) => s.decisions);
  const memory = useMissionStore((s) => s.memory);
  const terminalOutput = useMissionStore((s) => s.terminalOutput);
  const history = useMissionStore((s) => s.history);

  const providers = useProvidersStore((s) => s.providers);
  const enabledProviders = useMemo(
    () => providers.filter((p) => p.enabled),
    [providers]
  );

  const [starting, setStarting] = useState(false);
  const [rightTab, setRightTab] = useState<"tree" | "diff" | "world">("world");
  const [rightMaximized, setRightMaximized] = useState(false);
  const [feedMaximized, setFeedMaximized] = useState(false);
  const [networkMaximized, setNetworkMaximized] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
    undefined
  );

  // Pre-fill repo URL when an analysis is active.
  useEffect(() => {
    if (report?.repoUrl && !repoUrl) {
      setRepoUrl(report.repoUrl);
    }
  }, [report, repoUrl, setRepoUrl]);

  const hasMission = missionId !== null || demoMode;

  // When a file:change event arrives, surface a subtle hint that a new file is
  // available in the right panel — but only if the user is currently looking
  // at the World State tab.
  useEffect(() => {
    if (!currentFile) return;
    setSelectedFilePath((prev) => prev ?? currentFile);
  }, [currentFile]);

  // Push terminal output back into the mission store via handleEvent.
  const onTerminalOutput = useCallback(
    (line: LiveTerminalLine) => {
      if (line.data === "clear" && line.stream === "system") {
        useMissionStore.getState().handleEvent({
          id: `term_${Date.now().toString(36)}`,
          type: "terminal:output",
          timestamp: Date.now(),
          stream: "system",
          data: t("mission", "toasts.terminalCleared"),
        });
        return;
      }
      useMissionStore.getState().handleEvent({
        id: `term_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        type: "terminal:output",
        timestamp: line.timestamp,
        stream: line.stream,
        data: line.data,
      });
    },
    []
  );

  const onSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setRightTab("diff");
  }, []);

  const onStart = async () => {
    if (!goal.trim()) {
      toast.error(t("mission", "toasts.describeGoal"));
      return;
    }
    setStarting(true);
    try {
      await startMission();
      toast.success(t("mission", "toasts.dispatched"));
    } catch {
      toast.error(t("mission", "toasts.startFailed"));
    } finally {
      setStarting(false);
    }
  };

  const onDemo = () => {
    if (!goal.trim()) {
      setGoal(t("mission", "form.demoGoal"));
    }
    startDemoMode();
    toast(t("mission", "toasts.demoStarted"), {
      icon: "🧪",
    });
  };

  const onStop = () => {
    cancelMission();
    toast(t("mission", "toasts.stopped"));
  };

  const onApplyTemplate = (tplGoal: string) => {
    setGoal(tplGoal);
  };

  const onProviderChange = (value: string) => {
    if (value === "none") {
      setProvider(null);
      return;
    }
    const p = providers.find((x) => x.id === value);
    if (!p) return;
    const cfg: AIProviderConfig = {
      providerId: p.providerId,
      label: p.label,
      model: p.model,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
      timeout: p.timeout,
    };
    setProvider(cfg);
  };

  // ── Render: Empty state (no active analysis) ──────────────────────────────
  if (!report) {
    return (
      <div className="mission-canvas relative flex min-h-[80vh] items-center justify-center px-4 py-10">
        <div className="panel-glass mx-auto max-w-xl p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06]">
            <Rocket className="h-6 w-6 text-cyan-300" />
          </div>
          <h2 className="mt-4 text-xl font-bold">
            {t("mission", "empty.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("mission", "empty.description")}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              onClick={() => setView("history")}
              variant="outline"
              className="gap-1.5"
            >
              <History className="h-4 w-4" />
              {t("mission", "empty.historyButton")}
            </Button>
            <Button
              onClick={() => setView("analyze")}
              className="gap-1.5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
            >
              <Target className="h-4 w-4" />
              {t("mission", "empty.analyzeButton")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Start Mission form ────────────────────────────────────────────
  if (!hasMission) {
    return (
      <div className="mission-canvas relative mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
        <MissionHeader />

        <div className="panel-glass">
          <div className="border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-violet-500/5 px-6 py-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold">
                {t("mission", "form.title")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("mission", "form.description")}
            </p>
          </div>

          <div className="space-y-5 p-6">
            {/* Goal */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("mission", "form.goalLabel")}
              </label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t("mission", "form.goalPlaceholder")}
                className="min-h-[88px] resize-none border-white/10 bg-white/[0.02] font-mono text-sm"
              />
            </div>

            {/* Repo + Provider row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("mission", "form.repoLabel")}
                </label>
                <div className="relative">
                  <Github className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="border-white/10 bg-white/[0.02] pl-9 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("mission", "form.providerLabel")}
                </label>
                <Select
                  value={provider?.providerId ?? "none"}
                  onValueChange={onProviderChange}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.02]">
                    <SelectValue placeholder={t("mission", "form.providerPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">
                        {t("mission", "form.builtinProvider")}
                      </span>
                    </SelectItem>
                    {enabledProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: "#34d399" }}
                          />
                          {p.label} · {p.model}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {enabledProviders.length === 0 && (
                  <p className="text-[11px] text-amber-400/80">
                    {t("mission", "form.noProviders")}
                  </p>
                )}
              </div>
            </div>

            {/* Max iterations */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("mission", "form.maxIterations")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={maxIterations}
                  onChange={(e) =>
                    setMaxIterations(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="border-white/10 bg-white/[0.02]"
                />
              </div>
              <div className="md:col-span-2 md:flex md:items-end">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("mission", "form.iterationsHint")}
                </p>
              </div>
            </div>

            {/* Templates */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("mission", "form.templates")}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MISSION_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => onApplyTemplate(tpl.goal)}
                    className="group mc-lift flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
                  >
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                      style={{
                        background: `${tpl.accent}1a`,
                        color: tpl.accent,
                      }}
                    >
                      {tpl.title[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground/90">
                        {tpl.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                        {tpl.goal}
                      </p>
                    </div>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted-foreground">
                {t("mission", "form.disclaimer")}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onDemo}
                  className="gap-1.5 border-white/10"
                >
                  <Beaker className="h-4 w-4" />
                  <span>{t("mission", "form.demo")}</span>
                </Button>
                <Button
                  onClick={onStart}
                  disabled={starting || !goal.trim()}
                  className="gap-1.5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  <span>
                    {starting
                      ? t("mission", "form.starting")
                      : t("mission", "form.startButton")}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="panel-glass p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {t("mission", "history.title")}
              </h3>
            </div>
            <div className="space-y-2">
              {history.slice(0, 5).map((h) => (
                <div
                  key={h.missionId}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        h.status === "completed"
                          ? "#34d399"
                          : h.status === "failed"
                          ? "#f472b6"
                          : "#fbbf24",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground/90">{h.goal}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(h.startedAt).toLocaleString()} · {h.iteration}{" "}
                      {t("mission", "history.iterationsUnit")} · {h.filesModified} {t("mission", "history.filesUnit")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase"
                    style={{
                      color:
                        h.status === "completed"
                          ? "#34d399"
                          : h.status === "failed"
                          ? "#f472b6"
                          : "#fbbf24",
                      borderColor: "currentColor",
                    }}
                  >
                    {h.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Live Mission Workspace ───────────────────────────────────────
  const statusMeta = STATUS_META[status] ?? STATUS_META.idle;
  const StatusIcon = statusMeta.icon;
  const confColor =
    confidence < 50 ? "#f472b6" : confidence < 75 ? "#fbbf24" : "#34d399";
  const activeAgentsCount = Object.values(agentStatuses).filter(
    (a) => a.status === "thinking" || a.status === "acting"
  ).length;

  return (
    <div className="mission-canvas relative flex h-[calc(100vh-4rem)] flex-col gap-2 px-2 py-2 md:px-3 md:py-2.5">
      {/* ═════ COMMAND BAR (top, full-width glassmorphic) ═════ */}
      <div className="command-bar shrink-0">
        {/* Left: mission icon + goal + repo */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-violet-500/25 border border-cyan-400/20">
            <Rocket className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                {t("mission", "commandBar.missionLabel")}
              </span>
              {demoMode && (
                <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                  {t("mission", "commandBar.demoLabel")}
                </span>
              )}
              {connected ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-400">
                  <Wifi className="h-3 w-3" /> {t("mission", "commandBar.live")}
                </span>
              ) : (
                !demoMode && (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <WifiOff className="h-3 w-3" /> {t("mission", "commandBar.disconnected")}
                  </span>
                )
              )}
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {goal || t("mission", "commandBar.untitledMission")}
            </p>
            {repoUrl && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {repoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
              </p>
            )}
          </div>
        </div>

        {/* Center: status + phase + iteration */}
        <div className="hidden items-center gap-2 md:flex">
          <span
            className="status-badge"
            style={{
              background: `${statusMeta.color}1a`,
              color: statusMeta.color,
              border: `1px solid ${statusMeta.color}40`,
              boxShadow: statusMeta.animating
                ? `0 0 12px ${statusMeta.color}40`
                : undefined,
            }}
          >
            <StatusIcon
              className={cn(
                "h-3 w-3",
                statusMeta.animating && "animate-spin"
              )}
            />
            <span className="status-badge-dot-animated hidden sm:inline-block" style={{ background: statusMeta.color }} />
            <span>{t("mission", `statusMeta.${status}`)}</span>
          </span>
          <span className="phase-pill">
            <Activity className="h-3 w-3" />
            <span className="capitalize">{currentPhase}</span>
          </span>
          <span className="iter-pill">
            <span>{iteration}</span>
            <span className="opacity-50">/</span>
            <span>{maxIterations}</span>
          </span>
        </div>

        {/* Right: confidence + stop */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Confidence mini-meter */}
          <div className="hidden items-center gap-2 sm:flex">
            <div className="relative flex h-9 w-9 items-center justify-center">
              <svg width={36} height={36} className="-rotate-90">
                <circle
                  cx={18}
                  cy={18}
                  r={15}
                  fill="none"
                  stroke="oklch(1 0 0 / 0.08)"
                  strokeWidth={2.5}
                />
                <motion.circle
                  cx={18}
                  cy={18}
                  r={15}
                  fill="none"
                  stroke={confColor}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 15}
                  animate={{
                    strokeDashoffset:
                      2 * Math.PI * 15 - (confidence / 100) * 2 * Math.PI * 15,
                  }}
                  transition={{ type: "spring", stiffness: 120, damping: 22 }}
                  style={{ filter: `drop-shadow(0 0 4px ${confColor}aa)` }}
                />
              </svg>
              <span
                className="absolute text-[10px] font-bold tabular-nums"
                style={{ color: confColor }}
              >
                {confidence}
              </span>
            </div>
            <div className="hidden flex-col leading-tight lg:flex">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {t("mission", "worldState.confidence")}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: confColor }}>
                {confidence < 30
                  ? t("mission", "worldState.confidenceLabels.exploring")
                  : confidence < 60
                  ? t("mission", "worldState.confidenceLabels.building")
                  : confidence < 85
                  ? t("mission", "worldState.confidenceLabels.confident")
                  : t("mission", "worldState.confidenceLabels.trusted")}
              </span>
            </div>
          </div>

          <button onClick={onStop} className="stop-btn">
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden sm:inline">
              {t("mission", "actions.stop")}
            </span>
          </button>

          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            className="gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={t("mission", "commandBar.newMissionTitle")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">
              {t("mission", "actions.newMission")}
            </span>
          </Button>
        </div>
      </div>

      {/* ═══ Maximized overlays ═══ */}
      <AnimatePresence>
        {networkMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-2"
          >
            <div className="panel-glass min-h-0 flex-1 p-3">
              <div className="panel-header">
                <div className="panel-header-title">
                  <NetworkIcon className="h-3.5 w-3.5 text-cyan-300" />
                  {t("mission", "networkGraph.fullscreen")}
                </div>
                <div className="panel-header-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setNetworkMaximized(false)}
                    className="h-7 gap-1.5 text-[11px]"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    {t("mission", "commandBar.exitFullscreen")}
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 py-2">
                <AgentNetworkGraph />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {feedMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-2"
          >
            <div className="panel-glass min-h-0 flex-1 p-0">
              <div className="panel-header">
                <div className="panel-header-title">
                  <Activity className="h-3.5 w-3.5 text-cyan-300" />
                  {t("mission", "feed.title")}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground/60 normal-case">
                    {t("mission", "feed.eventsCount", { count: events.length })}
                  </span>
                </div>
                <div className="panel-header-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFeedMaximized(false)}
                    className="h-7 gap-1.5 text-[11px]"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    {t("mission", "commandBar.exitFullscreen")}
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <AIActivityFeed events={events} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rightMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-2"
          >
            <div className="panel-glass min-h-0 flex-1 p-0">
              <div className="panel-header">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRightTab("tree")}
                    data-state={rightTab === "tree" ? "active" : "inactive"}
                    className="mc-tab"
                  >
                    <ListTree className="h-3 w-3" /> {t("mission", "tabs.files")}
                    {filesModified.length > 0 && (
                      <span className="ml-1 rounded-full bg-white/5 px-1 text-[9px] text-muted-foreground">
                        {filesModified.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setRightTab("diff")}
                    data-state={rightTab === "diff" ? "active" : "inactive"}
                    className="mc-tab"
                  >
                    <FileDiffIcon className="h-3 w-3" /> {t("mission", "tabs.diff")}
                  </button>
                  <button
                    onClick={() => setRightTab("world")}
                    data-state={rightTab === "world" ? "active" : "inactive"}
                    className="mc-tab"
                  >
                    <Globe className="h-3 w-3" /> {t("mission", "tabs.world")}
                  </button>
                </div>
                <div className="panel-header-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRightMaximized(false)}
                    className="h-7 gap-1.5 text-[11px]"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    {t("mission", "commandBar.exitFullscreen")}
                  </Button>
                </div>
              </div>
              <div className="mc-scroll min-h-0 flex-1 overflow-y-auto">
                {rightTab === "tree" && (
                  <FileTreePanel
                    filesModified={filesModified}
                    onSelectFile={onSelectFile}
                    selectedPath={selectedFilePath}
                    className="h-full"
                  />
                )}
                {rightTab === "diff" && (
                  <FileDiffViewer
                    filesModified={filesModified}
                    selectedPath={selectedFilePath}
                    onSelect={setSelectedFilePath}
                    className="h-full"
                  />
                )}
                {rightTab === "world" && (
                  <WorldStatePanel
                    currentTask={currentTask}
                    currentFile={currentFile}
                    confidence={confidence}
                    buildStatus={buildStatus}
                    testStatus={testStatus}
                    iteration={iteration}
                    maxIterations={maxIterations}
                    currentPhase={currentPhase}
                    filesModified={filesModified}
                    decisions={decisions}
                    memory={memory}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FULLY RESIZABLE WORKSPACE ═══ */}
      {!feedMaximized && !rightMaximized && !networkMaximized && (
        <PanelGroup direction="vertical" className="min-h-0 flex-1">
          {/* ── Main workspace row (horizontal resizable) ── */}
          <Panel defaultSize={62} minSize={30}>
            <div className="flex h-full min-h-0 gap-2">
              {/* Agent Dock (collapsible, left) */}
              <AgentDock
                agentStatuses={agentStatuses}
                events={events}
                className="hidden md:flex"
              />

              {/* Horizontal resizable: Feed | Right */}
              <PanelGroup direction="horizontal" className="min-h-0 flex-1">
                {/* CENTER: Activity Feed + Timeline */}
                <Panel defaultSize={55} minSize={25}>
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="panel-glass min-h-0 flex-1 p-0">
                      <div className="panel-header">
                        <div className="panel-header-title">
                          <Activity className="h-3.5 w-3.5 text-cyan-300" />
                          {t("mission", "feed.title")}
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground/60 normal-case">
                            {t("mission", "feed.eventsCount", { count: events.length })}
                          </span>
                        </div>
                        <div className="panel-header-actions">
                          <button
                            onClick={() => setFeedMaximized(true)}
                            className="panel-max-btn"
                            title={t("mission", "commandBar.maximizeActivityFeed")}
                            aria-label={t("mission", "commandBar.maximizeActivityFeed")}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 p-2">
                        <AIActivityFeed events={events} />
                      </div>
                    </div>

                    <MissionTimeline events={events} className="shrink-0" />
                  </div>
                </Panel>

                <PanelResizeHandle className="mc-resize-h hidden lg:block" />

                {/* RIGHT: Network Graph + Files/Diff/World */}
                <Panel
                  defaultSize={35}
                  minSize={20}
                  maxSize={55}
                  className="hidden lg:block"
                >
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    {/* Agent Network Graph (collapsible) */}
                    <Collapsible defaultOpen className="shrink-0">
                      <div className="panel-glass p-3">
                        <div className="flex items-center justify-between">
                          <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-white/[0.02]">
                            <NetworkIcon className="h-3.5 w-3.5 text-cyan-300" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {t("mission", "networkGraph.title")}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                          </CollapsibleTrigger>
                          <button
                            onClick={() => setNetworkMaximized(true)}
                            className="panel-max-btn"
                            title={t("mission", "commandBar.maximizeNetworkGraph")}
                            aria-label={t("mission", "commandBar.maximizeNetworkGraph")}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </button>
                        </div>
                        <CollapsibleContent>
                          <div className="mt-2">
                            <AgentNetworkGraph />
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>

                    {/* Tabs: Files | Diff | World */}
                    <div className="panel-glass min-h-0 flex-1 p-0">
                      <div className="panel-header">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setRightTab("tree")}
                            data-state={rightTab === "tree" ? "active" : "inactive"}
                            className="mc-tab"
                          >
                            <ListTree className="h-3 w-3" /> {t("mission", "tabs.files")}
                            {filesModified.length > 0 && (
                              <span className="ml-1 rounded-full bg-white/5 px-1 text-[9px] text-muted-foreground">
                                {filesModified.length}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => setRightTab("diff")}
                            data-state={rightTab === "diff" ? "active" : "inactive"}
                            className="mc-tab"
                          >
                            <FileDiffIcon className="h-3 w-3" /> {t("mission", "tabs.diff")}
                          </button>
                          <button
                            onClick={() => setRightTab("world")}
                            data-state={rightTab === "world" ? "active" : "inactive"}
                            className="mc-tab"
                          >
                            <Globe className="h-3 w-3" /> {t("mission", "tabs.world")}
                          </button>
                        </div>
                        <div className="panel-header-actions">
                          <button
                            onClick={() => setRightMaximized(true)}
                            className="panel-max-btn"
                            title={t("mission", "commandBar.maximizePanel")}
                            aria-label={t("mission", "commandBar.maximizePanel")}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-hidden">
                        {rightTab === "tree" && (
                          <FileTreePanel
                            filesModified={filesModified}
                            onSelectFile={onSelectFile}
                            selectedPath={selectedFilePath}
                            className="h-full"
                          />
                        )}
                        {rightTab === "diff" && (
                          <FileDiffViewer
                            filesModified={filesModified}
                            selectedPath={selectedFilePath}
                            onSelect={setSelectedFilePath}
                            className="h-full"
                          />
                        )}
                        {rightTab === "world" && (
                          <WorldStatePanel
                            currentTask={currentTask}
                            currentFile={currentFile}
                            confidence={confidence}
                            buildStatus={buildStatus}
                            testStatus={testStatus}
                            iteration={iteration}
                            maxIterations={maxIterations}
                            currentPhase={currentPhase}
                            filesModified={filesModified}
                            decisions={decisions}
                            memory={memory}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          {/* ── Vertical drag handle ── */}
          <PanelResizeHandle className="mc-resize-v w-full" />

          {/* ── Agent status row ── */}
          <Panel defaultSize={16} minSize={8} maxSize={30}>
            <div className="panel-glass h-full overflow-hidden p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="panel-header-title">
                  <Users className="h-3.5 w-3.5 text-cyan-300" />
                  {t("mission", "agents.title")} · {t("mission", "agents.agentCount", { count: 11 })}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 6px #22d3ee" }} />
                    {t("mission", "agents.activeLabel", { count: activeAgentsCount })}
                  </span>
                </div>
              </div>
              <div className="mc-scroll h-[calc(100%-1.75rem)] overflow-y-auto pr-1">
                <AgentStatusCards statuses={agentStatuses} compact />
              </div>
            </div>
          </Panel>

          {/* ── Vertical drag handle ── */}
          <PanelResizeHandle className="mc-resize-v w-full" />

          {/* ── Bottom panel: Terminal / Git / Diff / Logs ── */}
          <Panel defaultSize={22} minSize={10} maxSize={60}>
            <div className="panel-glass h-full overflow-hidden">
              <BottomPanel
                terminalOutput={terminalOutput}
                events={events}
                filesModified={filesModified}
                onTerminalOutput={onTerminalOutput}
              />
            </div>
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}

