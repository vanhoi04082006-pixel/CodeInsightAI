"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Rocket,
  Square,
  Pause,
  Play,
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
  ChevronUp,
  Network as NetworkIcon,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GlassCard, GradientText } from "@/components/shared/ui";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const STATUS_META: Record<
  string,
  { color: string; label: string; icon: typeof Circle }
> = {
  idle: { color: "#64748b", label: "Idle", icon: Circle },
  planning: { color: "#fbbf24", label: "Planning", icon: Loader2 },
  executing: { color: "#22d3ee", label: "Executing", icon: Activity },
  verifying: { color: "#a78bfa", label: "Verifying", icon: Loader2 },
  completed: { color: "#34d399", label: "Completed", icon: Sparkles },
  failed: { color: "#f472b6", label: "Failed", icon: Pause },
};

export function MissionControlView() {
  const { t } = useT();
  const report = useAppStore((s) => s.activeReport);

  // Use selective subscriptions to avoid re-rendering on every event.
  // The previous code destructured the entire store, causing infinite re-renders
  // because `events` changes reference on every handleEvent() call.
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
  const [bottomOpen, setBottomOpen] = useState(true);
  const [rightTab, setRightTab] = useState("tree");
  const [rightMaximized, setRightMaximized] = useState(false);
  const [feedMaximized, setFeedMaximized] = useState(false);
  const [networkMaximized, setNetworkMaximized] = useState(false);
  const [bottomSize, setBottomSize] = useState<"min" | "default" | "max">("default");
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
      // The "clear" sentinel clears the in-memory buffer locally.
      if (line.data === "clear" && line.stream === "system") {
        // We can't directly clear the store's terminalOutput from here without
        // a dedicated action; emit a no-op system message instead.
        useMissionStore.getState().handleEvent({
          id: `term_${Date.now().toString(36)}`,
          type: "terminal:output",
          timestamp: Date.now(),
          stream: "system",
          data: "— terminal cleared —",
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

  // When the user picks a file in the FileTreePanel, switch to the Diff tab.
  const onSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setRightTab("diff");
  }, []);

  const onStart = async () => {
    if (!goal.trim()) {
      toast.error("Please describe a mission goal first.");
      return;
    }
    setStarting(true);
    try {
      await startMission();
      toast.success("Mission dispatched.");
    } catch {
      toast.error("Failed to start mission.");
    } finally {
      setStarting(false);
    }
  };

  const onDemo = () => {
    if (!goal.trim()) {
      setGoal("Demo mission: explore the codebase and identify 3 quick wins.");
    }
    startDemoMode();
    toast("Demo mode started — simulating agent events.", {
      icon: "🧪",
    });
  };

  const onStop = () => {
    cancelMission();
    toast("Mission stopped.");
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

  // ── Render: Start Mission form (when no active mission) ──────────────────
  if (!hasMission) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
        <MissionHeader />

        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/5 bg-gradient-to-r from-cyan-500/5 to-violet-500/5 px-6 py-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold">
                {t("mission", "form.title") || "Define Your Mission"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("mission", "form.description") ||
                "Describe what you want your AI team to accomplish. They'll plan, execute, verify, and ship."}
            </p>
          </div>

          <div className="space-y-5 p-6">
            {/* Goal */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("mission", "form.goalLabel") || "Mission Goal"}
              </label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g., Add Google OAuth login with JWT session handling and write tests for the new auth flow"
                className="min-h-[88px] resize-none border-white/10 bg-white/[0.02] font-mono text-sm"
              />
            </div>

            {/* Repo + Provider row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("mission", "form.repoLabel") || "Repository URL"}
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
                  {t("mission", "form.providerLabel") || "AI Provider"}
                </label>
                <Select
                  value={provider?.providerId ?? "none"}
                  onValueChange={onProviderChange}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.02]">
                    <SelectValue placeholder="Select an enabled provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">
                        Built-in (no AI provider)
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
                    {t("mission", "form.noProviders") ||
                      "No enabled providers — workflow will use built-in fallbacks. Add one in Providers."}
                  </p>
                )}
              </div>
            </div>

            {/* Max iterations */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("mission", "form.maxIterations") || "Max Iterations"}
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
                  {t("mission", "form.iterationsHint") ||
                    "Each iteration = one observe → think → act → verify → reflect cycle. The Executive may stop earlier if confidence is high."}
                </p>
              </div>
            </div>

            {/* Templates */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("mission", "form.templates") || "Quick Templates"}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MISSION_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => onApplyTemplate(tpl.goal)}
                    className="group flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
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
                {t("mission", "form.disclaimer") ||
                  "Missions execute locally — your code never leaves your machine."}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onDemo}
                  className="gap-1.5 border-white/10"
                >
                  <Beaker className="h-4 w-4" />
                  <span>{t("mission", "form.demo") || "Demo Mode"}</span>
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
                      ? t("mission", "form.starting") || "Starting…"
                      : t("mission", "form.startButton") || "Start Mission"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* History */}
        {history.length > 0 && (
          <GlassCard className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {t("mission", "history.title") || "Mission History"}
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
                      iterations · {h.filesModified} files
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
          </GlassCard>
        )}
      </div>
    );
  }

  // ── Render: Live Mission Workspace ───────────────────────────────────────
  const statusMeta = STATUS_META[status] ?? STATUS_META.idle;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col gap-2 px-3 py-2 md:px-4 md:py-3">
      {/* Top bar */}
      <GlassCard strong className="shrink-0 px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Left: mission info (truncates) */}
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-violet-500/30 md:h-9 md:w-9">
              <Rocket className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Mission
                </span>
                {demoMode && (
                  <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                    Demo
                  </span>
                )}
                {connected ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-400">
                    <Wifi className="h-3 w-3" /> Live
                  </span>
                ) : (
                  !demoMode && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <WifiOff className="h-3 w-3" /> Disconnected
                    </span>
                  )
                )}
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold">
                {goal || "Untitled mission"}
              </p>
              <div className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {repoUrl && (
                  <span className="truncate font-mono">
                    {repoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
                  </span>
                )}
                <span className="shrink-0 capitalize">phase: {currentPhase}</span>
                <span className="shrink-0">iter: {iteration}/{maxIterations}</span>
              </div>
            </div>
          </div>

          {/* Right: status + actions (never wraps) */}
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-transparent px-2 py-0.5 text-[11px] md:px-3 md:py-1 md:text-xs"
              style={{
                background: `${statusMeta.color}1a`,
                color: statusMeta.color,
                boxShadow: `0 0 0 1px ${statusMeta.color}33`,
              }}
            >
              <StatusIcon
                className={cn(
                  "h-3 w-3",
                  (status === "planning" ||
                    status === "executing" ||
                    status === "verifying") &&
                    "animate-spin"
                )}
              />
              <span className="hidden sm:inline">{statusMeta.label}</span>
            </Badge>

            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              className="gap-1.5 border-rose-400/30 text-rose-300 hover:bg-rose-400/10"
            >
              <Square className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("mission", "actions.stop") || "Stop"}</span>
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* ═══ RESIZABLE WORKSPACE ═══
          Uses react-resizable-panels for drag-to-resize columns + rows.
          Panels can be maximized (absolute inset-0 z-50) for full-screen view.
          All panels have min-h-0 + overflow-y-auto for independent scrolling. */}

      {/* Maximized Network Graph overlay */}
      <AnimatePresence>
        {networkMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-3"
          >
            <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <NetworkIcon className="h-4 w-4 text-cyan-300" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Agent Network Graph (Fullscreen)
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNetworkMaximized(false)}
                  className="h-7 gap-1.5 text-[11px]"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Exit Fullscreen
                </Button>
              </div>
              <div className="min-h-0 flex-1 py-2">
                <AgentNetworkGraph />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maximized Feed overlay (absolute, covers everything) */}
      <AnimatePresence>
        {feedMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-3"
          >
            <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-cyan-300" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("mission", "feed.title") || "AI Activity Feed"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {events.length} events
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFeedMaximized(false)}
                  className="h-7 gap-1.5 text-[11px]"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Exit Fullscreen
                </Button>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <AIActivityFeed events={events} />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maximized Right Panel overlay */}
      <AnimatePresence>
        {rightMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col gap-2 p-3"
          >
            <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/5 px-2 py-1.5">
                <div className="flex items-center gap-1 p-1">
                  <button
                    onClick={() => setRightTab("tree")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition",
                      rightTab === "tree" ? "bg-white/5 text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ListTree className="h-3 w-3" /> Files
                    {filesModified.length > 0 && (
                      <span className="ml-1 rounded-full bg-white/5 px-1 text-[9px] text-muted-foreground">{filesModified.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setRightTab("diff")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition",
                      rightTab === "diff" ? "bg-white/5 text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <FileDiffIcon className="h-3 w-3" /> Diff
                  </button>
                  <button
                    onClick={() => setRightTab("world")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition",
                      rightTab === "world" ? "bg-white/5 text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Globe className="h-3 w-3" /> World
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRightMaximized(false)}
                  className="h-7 gap-1.5 text-[11px]"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Exit Fullscreen
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {rightTab === "tree" && (
                  <FileTreePanel filesModified={filesModified} onSelectFile={onSelectFile} selectedPath={selectedFilePath} className="h-full" />
                )}
                {rightTab === "diff" && (
                  <FileDiffViewer filesModified={filesModified} selectedPath={selectedFilePath} onSelect={setSelectedFilePath} className="h-full" />
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
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Normal resizable workspace (hidden when any panel is maximized) */}
      {!feedMaximized && !rightMaximized && !networkMaximized && (
        <div className="flex min-h-0 flex-1 gap-2">
          <AgentDock
            agentStatuses={agentStatuses}
            events={events}
            className="hidden md:flex"
          />

          {/* Horizontal resizable: Sidebar | Feed | Right */}
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            {/* LEFT: Missions sidebar (resizable, scrollable) */}
            <Panel defaultSize={18} minSize={12} maxSize={30} className="hidden lg:block">
              <div className="h-full min-h-0 overflow-y-auto scrollbar-thin pr-1">
                <MissionsSidebar />
              </div>
            </Panel>

            <PanelResizeHandle className="hidden lg:block w-1 bg-transparent hover:bg-cyan-400/20 transition-colors cursor-col-resize" />

            {/* CENTER: Activity Feed + Timeline (resizable, scrollable) */}
            <Panel defaultSize={42} minSize={25}>
              <div className="flex h-full min-h-0 flex-col gap-2">
                <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-cyan-300" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("mission", "feed.title") || "AI Activity Feed"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {events.length} events
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFeedMaximized(true)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-cyan-300"
                        title="Maximize Activity Feed"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 p-2">
                    <AIActivityFeed events={events} />
                  </div>
                </GlassCard>

                <MissionTimeline events={events} className="shrink-0" />
              </div>
            </Panel>

            <PanelResizeHandle className="hidden lg:block w-1 bg-transparent hover:bg-violet-400/20 transition-colors cursor-col-resize" />

            {/* RIGHT: Network Graph + Files/Diff/World (resizable, scrollable, maximizable) */}
            <Panel defaultSize={30} minSize={20} maxSize={50} className="hidden lg:block">
              <div className="flex h-full min-h-0 flex-col gap-2">
                <Collapsible defaultOpen className="shrink-0">
                  <GlassCard className="p-3">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-white/[0.02]">
                        <NetworkIcon className="h-3.5 w-3.5 text-cyan-300" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Agent Network Graph
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      </CollapsibleTrigger>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setNetworkMaximized(true)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-cyan-300"
                        title="Maximize Network Graph"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-2">
                        <AgentNetworkGraph />
                      </div>
                    </CollapsibleContent>
                  </GlassCard>
                </Collapsible>

                <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  <Tabs
                    value={rightTab}
                    onValueChange={setRightTab}
                    className="flex h-full flex-col"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 px-2">
                      <TabsList className="h-auto bg-transparent p-1">
                        <TabsTrigger
                          value="tree"
                          className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
                        >
                          <ListTree className="h-3 w-3" /> Files
                          {filesModified.length > 0 && (
                            <span className="ml-1 rounded-full bg-white/5 px-1 text-[9px] text-muted-foreground">
                              {filesModified.length}
                            </span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger
                          value="diff"
                          className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
                        >
                          <FileDiffIcon className="h-3 w-3" /> Diff
                        </TabsTrigger>
                        <TabsTrigger
                          value="world"
                          className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
                        >
                          <Globe className="h-3 w-3" /> World
                        </TabsTrigger>
                      </TabsList>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRightMaximized(true)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-violet-300"
                        title="Maximize Panel"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </Button>
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
                        <div className="h-full overflow-y-auto scrollbar-thin">
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
                        </div>
                      )}
                    </div>
                  </Tabs>
                </GlassCard>
              </div>
            </Panel>
          </PanelGroup>
        </div>
      )}

      {/* Agent status row (always visible, compact) */}
      <GlassCard className="shrink-0 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("mission", "agents.title") || "Agent Team"} · 11 agents
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            Active:{" "}
            {
              Object.values(agentStatuses).filter(
                (a) => a.status === "thinking" || a.status === "acting"
              ).length
            }
          </span>
        </div>
        <AgentStatusCards statuses={agentStatuses} compact />
      </GlassCard>

      {/* ═══ BOTTOM PANEL: Terminal / Git / Diff / Logs ═══
          3 quick sizes: Min (32px bar) / Default (220px) / Max (70vh).
          Toggle buttons let users switch instantly. */}

      {/* Toggle buttons row */}
      <div className="flex shrink-0 items-center justify-between px-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setBottomOpen(true);
            setBottomSize("min");
          }}
          className="h-6 gap-1 text-[10px] text-muted-foreground"
          title="Minimize to bar"
        >
          <ChevronDown className="h-3 w-3" />
          Min
        </Button>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBottomOpen(true);
              setBottomSize("default");
            }}
            className={cn("h-6 gap-1 text-[10px]", bottomSize === "default" && bottomOpen ? "text-cyan-300" : "text-muted-foreground")}
            title="Default size"
          >
            Default
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBottomOpen(true);
              setBottomSize("max");
            }}
            className={cn("h-6 gap-1 text-[10px]", bottomSize === "max" && bottomOpen ? "text-violet-300" : "text-muted-foreground")}
            title="Maximize (70% screen)"
          >
            <ChevronUp className="h-3 w-3" />
            Max
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBottomOpen((v) => !v)}
            className="h-6 gap-1 text-[10px] text-muted-foreground"
          >
            {bottomOpen ? (
              <>
                <Pause className="h-3 w-3" />
                <span>{t("mission", "actions.collapseBottom") || "Hide"}</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                <span>{t("mission", "actions.expandBottom") || "Show"}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {bottomOpen && (
          <motion.div
            key={bottomSize}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: bottomSize === "min" ? 36 : bottomSize === "max" ? "70vh" : 220,
              opacity: 1,
            }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
            className="shrink-0 overflow-hidden"
          >
            <GlassCard className="h-full overflow-hidden p-0">
              {bottomSize === "min" ? (
                <div className="flex h-9 items-center justify-between px-3 text-[11px] text-muted-foreground">
                  <span className="font-mono truncate">
                    {terminalOutput.length > 0
                      ? `${terminalOutput.length} lines · last: ${(terminalOutput[terminalOutput.length - 1]?.data ?? "").slice(0, 80)}`
                      : "Terminal ready"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBottomSize("default")}
                    className="h-6 gap-1 text-[10px] text-cyan-300"
                  >
                    <ChevronUp className="h-3 w-3" /> Expand
                  </Button>
                </div>
              ) : (
                <BottomPanel
                  terminalOutput={terminalOutput}
                  events={events}
                  filesModified={filesModified}
                  onTerminalOutput={onTerminalOutput}
                />
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-center">
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          className="ml-2 gap-1.5 text-[11px] text-muted-foreground"
        >
          <Sparkles className="h-3 w-3" />
          <span>{t("mission", "actions.newMission") || "New Mission"}</span>
        </Button>
      </div>
    </div>
  );
}

function MissionHeader() {
  const { t } = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Rocket className="h-4 w-4 text-cyan-300" />
          <span>{t("mission", "subtitle") || "AI Operating System"}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">
          <GradientText>
            {t("mission", "title") || "Mission Control"}
          </GradientText>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("mission", "description") ||
            "Give your AI team a goal. They plan, execute, verify, and ship — autonomously."}
        </p>
      </div>
    </motion.div>
  );
}

function MissionsSidebar() {
  const { t } = useT();
  const { history, status, goal, missionId, demoMode, reset } = useMissionStore();

  return (
    <GlassCard className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-cyan-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("mission", "sidebar.title") || "Missions"}
        </span>
      </div>

      {/* Active mission */}
      {(missionId || demoMode) && (
        <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-2">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              Active
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-foreground/90">{goal}</p>
          <p className="mt-1 text-[10px] capitalize text-muted-foreground">
            {status}
          </p>
          <button
            onClick={reset}
            className="mt-2 w-full rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-white/5"
          >
            Discard
          </button>
        </div>
      )}

      {/* History */}
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("mission", "sidebar.history") || "History"}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground/60">
            No past missions yet.
          </p>
        ) : (
          history.slice(0, 10).map((h) => (
            <button
              key={h.missionId}
              className="w-full rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      h.status === "completed"
                        ? "#34d399"
                        : h.status === "failed"
                        ? "#f472b6"
                        : "#fbbf24",
                  }}
                />
                <span className="truncate text-[11px] text-foreground/80">
                  {h.goal}
                </span>
              </div>
              <p className="mt-0.5 pl-3 text-[9px] text-muted-foreground/60">
                {new Date(h.startedAt).toLocaleDateString()} ·{" "}
                {h.filesModified} files
              </p>
            </button>
          ))
        )}
      </div>

      {/* Templates */}
      <div className="mt-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("mission", "sidebar.templates") || "Templates"}
      </div>
      <div className="space-y-1">
        {MISSION_TEMPLATES.slice(0, 4).map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => useMissionStore.getState().setGoal(tpl.goal)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tpl.accent }}
            />
            <span className="truncate text-[11px] text-foreground/80">
              {tpl.title}
            </span>
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
