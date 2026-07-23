"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Pin,
  PinOff,
  PanelRightOpen,
  Brain,
  Boxes,
  Cpu,
  Zap,
  ScrollText,
  LayoutDashboard,
  Copy,
  Check,
  FolderGit2,
  Bot,
  Globe,
  Hash,
  Clock,
  Activity,
  Eye,
  Wrench,
  Network,
  Sparkles,
  Database,
  FileCode,
  Layers,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeveloperModeStore, type DebugSnapshot, type AIRequestLog } from "@/lib/developer-mode-store";
import { useAppStore } from "@/lib/store";
import { CodeBlock } from "./code-block";
import { RequestTimeline, MetricCard, EmptyState, LoadingSkeleton } from "./shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PinMode = "pinned" | "floating" | "autohide";

const STORAGE_WIDTH_KEY = "codeinsight-dev-width";
const STORAGE_PIN_KEY = "codeinsight-dev-pin-mode";

export function DeveloperConsole({
  snapshot,
  closed,
  onClose,
  onOpen,
}: {
  snapshot: DebugSnapshot | null;
  closed: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const enabled = useDeveloperModeStore((s) => s.enabled);
  const logs = useDeveloperModeStore((s) => s.logs);
  const clearLogs = useDeveloperModeStore((s) => s.clearLogs);
  const activeReport = useAppStore((s) => s.activeReport);

  const [width, setWidth] = useState(380);
  const [pinMode, setPinMode] = useState<PinMode>("pinned");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [autoHidden, setAutoHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore width + pin mode from localStorage (use microtask to avoid setState-in-effect)
  useEffect(() => {
    const savedWidth = localStorage.getItem(STORAGE_WIDTH_KEY);
    const savedPin = localStorage.getItem(STORAGE_PIN_KEY) as PinMode | null;
    Promise.resolve().then(() => {
      if (savedWidth) setWidth(Math.min(520, Math.max(280, parseInt(savedWidth))));
      if (savedPin) setPinMode(savedPin);
    });
  }, []);

  // Persist width
  useEffect(() => {
    localStorage.setItem(STORAGE_WIDTH_KEY, String(width));
  }, [width]);

  // Persist pin mode
  useEffect(() => {
    localStorage.setItem(STORAGE_PIN_KEY, pinMode);
  }, [pinMode]);

  // Resize drag
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const newWidth = Math.min(520, Math.max(280, dragRef.current.startWidth + delta));
      setWidth(newWidth);
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Global search — check if current tab has matches (must be before early returns)
  const searchMatches = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matches: Record<string, boolean> = {};
    if (snapshot) {
      if (snapshot.systemPrompt?.toLowerCase().includes(q)) matches.prompt = true;
      if (snapshot.userPrompt?.toLowerCase().includes(q)) matches.prompt = true;
      if (snapshot.repositoryContext?.toLowerCase().includes(q)) matches.context = true;
      if (snapshot.finalPrompt?.toLowerCase().includes(q)) matches.prompt = true;
      if (snapshot.provider?.toLowerCase().includes(q)) matches.runtime = true;
      if (snapshot.model?.toLowerCase().includes(q)) matches.runtime = true;
    }
    if (logs.some((l) => l.requestId.toLowerCase().includes(q) || (l.error || "").toLowerCase().includes(q))) {
      matches.logs = true;
    }
    return matches;
  }, [search, snapshot, logs]);

  if (!enabled) return null;
  if (closed) {
    return (
      <button
        onClick={onOpen}
        className="glass-strong absolute right-2 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 text-violet-300 shadow-lg transition hover:scale-110 hover:border-violet-400/40 hover:bg-violet-400/10 hover:text-violet-200 md:flex"
        aria-label="Open Developer Console"
        title="Open Developer Console"
      >
        <Terminal className="h-5 w-5" />
      </button>
    );
  }

  const repoName = activeReport ? `${activeReport.repoOwner}/${activeReport.repoName}` : "No repo";
  const provider = snapshot?.provider ?? "—";
  const model = snapshot?.model ?? "—";
  const environment = process.env.NODE_ENV ?? "development";

  // Pin mode behavior
  const isFloating = pinMode === "floating";
  const isAutohide = pinMode === "autohide";
  const showSidebar = !isAutohide || !autoHidden;

  const consoleContent = (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "glass-strong flex h-full flex-col border-l border-white/10",
        isFloating && "absolute right-0 top-0 z-40 shadow-2xl"
      )}
      style={{ width: isFloating ? width : "100%" }}
      onMouseEnter={() => isAutohide && setAutoHidden(false)}
    >
      {/* Drag handle (desktop only, not floating) */}
      {!isFloating && (
        <div
          onMouseDown={onDragStart}
          className="absolute -left-1 top-0 z-10 hidden h-full w-2 cursor-col-resize md:block"
        >
          <div className="h-full w-0.5 bg-transparent transition hover:bg-cyan-400/30" />
        </div>
      )}

      {/* Header — fixed */}
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/15">
              <Terminal className="h-4 w-4 text-violet-300" />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                Developer Console
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-300">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                  Live
                </span>
                <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-violet-300">Debug</span>
                {snapshot?.streaming && (
                  <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-cyan-300">Stream</span>
                )}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                <FolderGit2 className="mr-1 inline h-2.5 w-2.5" />
                {repoName} · <Bot className="ml-1 inline h-2.5 w-2.5" /> {provider}/{model}
              </p>
              <p className="truncate text-[9px] text-muted-foreground/70">
                <Globe className="mr-1 inline h-2.5 w-2.5" />
                {environment} · {snapshot?.requestId?.slice(0, 12) || "no session"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setPinMode((p) => (p === "pinned" ? "floating" : p === "floating" ? "autohide" : "pinned"))}
                    className="rounded p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  >
                    {pinMode === "pinned" ? <Pin className="h-3.5 w-3.5" /> : pinMode === "floating" ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Pin mode: {pinMode}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => {
                if (snapshot) {
                  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `dev-snapshot-${snapshot.requestId}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Snapshot exported");
                }
              }}
              className="rounded p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              title="Export snapshot"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-rose-500/15 hover:text-rose-300" aria-label="Close console" title="Close console">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search console…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground/60 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full shrink-0 grid-cols-6 rounded-none border-b border-white/10 bg-transparent p-0">
          <TabsTrigger value="overview" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-cyan-400 data-[state=active]:bg-transparent">
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="prompt" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-violet-400 data-[state=active]:bg-transparent">
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Prompt</span>
          </TabsTrigger>
          <TabsTrigger value="context" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent">
            <Boxes className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Context</span>
          </TabsTrigger>
          <TabsTrigger value="runtime" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-amber-400 data-[state=active]:bg-transparent">
            <Cpu className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Runtime</span>
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-pink-400 data-[state=active]:bg-transparent">
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Cap</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2 text-[10px] data-[state=active]:border-cyan-400 data-[state=active]:bg-transparent">
            <ScrollText className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Logs</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab content — independent scroll */}
        <ScrollArea className="flex-1">
          <div className="p-3">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab snapshot={snapshot} activeReport={activeReport} search={search} />
            </TabsContent>
            <TabsContent value="prompt" className="mt-0">
              <PromptTab snapshot={snapshot} search={search} />
            </TabsContent>
            <TabsContent value="context" className="mt-0">
              <ContextTab snapshot={snapshot} activeReport={activeReport} search={search} />
            </TabsContent>
            <TabsContent value="runtime" className="mt-0">
              <RuntimeTab snapshot={snapshot} search={search} />
            </TabsContent>
            <TabsContent value="capabilities" className="mt-0">
              <CapabilitiesTab snapshot={snapshot} />
            </TabsContent>
            <TabsContent value="logs" className="mt-0">
              <LogsTab logs={logs} clearLogs={clearLogs} snapshot={snapshot} search={search} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </motion.div>
  );

  return (
    <>
      {/* Desktop: sidebar */}
      {showSidebar && (
        <aside
          className="relative hidden h-full shrink-0 md:block"
          style={{ width: pinMode === "floating" ? 0 : width }}
        >
          {isFloating ? (
            <div className="fixed right-0 top-0 z-40 h-full" style={{ width }}>
              <AnimatePresence>{consoleContent}</AnimatePresence>
            </div>
          ) : (
            consoleContent
          )}
        </aside>
      )}

      {/* Autohide edge trigger */}
      {isAutohide && autoHidden && (
        <button
          onMouseEnter={() => setAutoHidden(false)}
          className="absolute right-0 top-0 z-30 hidden h-full w-1 cursor-pointer bg-cyan-400/0 transition hover:bg-cyan-400/30 md:block"
          aria-label="Show Developer Console"
        />
      )}

      {/* Mobile: floating button + drawer */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg md:hidden"
        aria-label="Open Developer Console"
      >
        <Terminal className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed right-0 top-0 z-50 h-full w-[90vw] max-w-[400px] md:hidden"
            >
              {consoleContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────── Overview Tab ─────────── */
function OverviewTab({ snapshot, activeReport, search }: { snapshot: DebugSnapshot | null; activeReport: any; search: string }) {
  if (!snapshot) {
    return <EmptyState icon={LayoutDashboard} title="No request yet" description="Send a message in chat to populate the developer console." />;
  }

  const timelineSteps = [
    { label: "Context", timeMs: snapshot.queueMs, status: "done" as const },
    { label: "Assembly", timeMs: 0, status: "done" as const },
    { label: "Request", timeMs: 0, status: "done" as const },
    { label: "Generation", timeMs: snapshot.generationMs, status: "done" as const },
    { label: "Complete", timeMs: snapshot.totalMs, status: "done" as const },
  ];

  return (
    <div className="space-y-4">
      {/* Current Request Summary */}
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.03] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Current Request</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <FolderGit2 className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{activeReport ? `${activeReport.repoOwner}/${activeReport.repoName}` : "No repo"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{snapshot.personality || "Default"}</span>
          </div>
          {snapshot.userPrompt && (
            <div className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 text-foreground/80">"{snapshot.userPrompt}"</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", snapshot.streaming ? "animate-pulse bg-cyan-400" : "bg-emerald-400")} />
            <span className="text-muted-foreground">{snapshot.streaming ? "Streaming" : "Completed"} · {snapshot.totalMs}ms</span>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Provider" value={snapshot.provider} icon={Cpu} color="#22d3ee" index={0} />
        <MetricCard label="Model" value={snapshot.model?.split("/").pop() || snapshot.model} icon={Brain} color="#a78bfa" index={1} />
        <MetricCard label="Latency" value={`${snapshot.totalMs}ms`} icon={Clock} color="#34d399" index={2} />
        <MetricCard label="Tokens" value={snapshot.totalTokens} icon={Hash} color="#fbbf24" sub={`${snapshot.inputTokens} in / ${snapshot.outputTokens} out`} index={3} />
        {snapshot.temperature != null && (
          <MetricCard label="Temperature" value={snapshot.temperature} icon={Activity} color="#f472b6" index={4} />
        )}
        {snapshot.maxTokens > 0 && (
          <MetricCard label="Max Tokens" value={snapshot.maxTokens} icon={Zap} color="#60a5fa" index={5} />
        )}
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Request Timeline</p>
        <RequestTimeline steps={timelineSteps} totalMs={snapshot.totalMs} />
      </div>

      {/* Context usage (if available) */}
      {snapshot.contextWindow > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Context Window</p>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{snapshot.totalTokens.toLocaleString()} / {snapshot.contextWindow.toLocaleString()}</span>
              <span className="font-semibold tabular-nums text-cyan-300">
                {Math.round((snapshot.totalTokens / snapshot.contextWindow) * 100)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (snapshot.totalTokens / snapshot.contextWindow) * 100)}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Prompt Tab (Pipeline Accordion) ─────────── */
function PromptTab({ snapshot, search }: { snapshot: DebugSnapshot | null; search: string }) {
  if (!snapshot) return <EmptyState icon={Brain} title="No prompt data" description="Send a message to see the prompt pipeline." />;

  const highlight = (text: string) => {
    if (!search.trim()) return text;
    const q = search.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.replace(regex, "⟦$1⟧");
  };

  const sections = [
    { id: "system", label: "1. System Prompt", icon: Bot, content: snapshot.systemPrompt, tokens: Math.ceil((snapshot.systemPrompt || "").length / 4) },
    { id: "repo", label: "3. Repository Context", icon: FolderGit2, content: snapshot.repositoryContext, tokens: Math.ceil((snapshot.repositoryContext || "").length / 4) },
    { id: "user", label: "7. User Message", icon: Sparkles, content: snapshot.userPrompt, tokens: Math.ceil((snapshot.userPrompt || "").length / 4) },
    { id: "final", label: "8. Final Prompt (Sent to AI)", icon: FileCode, content: snapshot.finalPrompt, tokens: snapshot.inputTokens },
  ].filter((s) => s.content && s.content.trim());

  if (sections.length === 0) {
    return <EmptyState icon={Brain} title="No prompt data" description="Prompt data will appear here after first message." />;
  }

  return (
    <Accordion type="single" defaultValue="system" collapsible className="space-y-2">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <AccordionItem key={section.id} value={section.id} className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
            <AccordionTrigger className="flex items-center gap-2 px-3 py-2 text-xs hover:no-underline">
              <Icon className="h-3.5 w-3.5 text-cyan-300" />
              <span className="flex-1 text-left font-medium">{section.label}</span>
              {section.tokens > 0 && (
                <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
                  ~{section.tokens} tok
                </span>
              )}
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <CodeBlock content={highlight(section.content)} maxLines={8} maxHeight="160px" label={section.label} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/* ─────────── Context Tab ─────────── */
function ContextTab({ snapshot, activeReport, search }: { snapshot: DebugSnapshot | null; activeReport: any; search: string }) {
  if (!snapshot && !activeReport) {
    return <EmptyState icon={Boxes} title="No context data" description="Repository context will appear here after analysis." />;
  }

  const sections: Array<{ id: string; label: string; icon: typeof FolderGit2; content: React.ReactNode }> = [];

  // Repository Summary
  if (activeReport) {
    sections.push({
      id: "repo",
      label: "Repository Summary",
      icon: FolderGit2,
      content: (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Repo:</span> {activeReport.repoOwner}/{activeReport.repoName}</div>
          <div><span className="text-muted-foreground">Branch:</span> {activeReport.repoBranch}</div>
          <div><span className="text-muted-foreground">Language:</span> {activeReport.primaryLanguage}</div>
          <div><span className="text-muted-foreground">Files:</span> {activeReport.totalFiles}</div>
          <div><span className="text-muted-foreground">Lines:</span> {activeReport.totalLines.toLocaleString()}</div>
          <div><span className="text-muted-foreground">Score:</span> <span className="text-cyan-300">{activeReport.scores?.overall}</span></div>
        </div>
      ),
    });
  }

  // Analysis Context (scores + architecture)
  if (activeReport) {
    sections.push({
      id: "analysis",
      label: "Analysis Context",
      icon: Activity,
      content: (
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Architecture:</span> <span>{activeReport.architecture?.pattern}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tech Debt:</span> <span className="text-amber-300">{activeReport.technicalDebt?.score}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Frameworks:</span> <span>{activeReport.frameworks?.length || 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Issues:</span> <span>{(activeReport.issues?.security?.length || 0) + (activeReport.issues?.performance?.length || 0) + (activeReport.issues?.bugs?.length || 0)}</span></div>
        </div>
      ),
    });
  }

  // Retrieved Sources (chunks)
  if (snapshot?.retrievedChunks && snapshot.retrievedChunks.length > 0) {
    sections.push({
      id: "sources",
      label: `Retrieved Sources (${snapshot.retrievedChunks.length})`,
      icon: FileCode,
      content: (
        <div className="space-y-1.5">
          {snapshot.retrievedChunks.slice(0, 10).map((chunk, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2 py-1 text-[11px]">
              <span className="truncate font-mono">{chunk.path}</span>
              <span className="ml-2 shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] tabular-nums text-cyan-300">{chunk.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

  // Repository Index
  if (snapshot?.repositoryIndex) {
    sections.push({
      id: "index",
      label: "Repository Index",
      icon: Database,
      content: (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center"><p className="text-muted-foreground">Files</p><p className="font-semibold text-cyan-300">{snapshot.repositoryIndex.files}</p></div>
          <div className="text-center"><p className="text-muted-foreground">Chunks</p><p className="font-semibold text-violet-300">{snapshot.repositoryIndex.chunks}</p></div>
          <div className="text-center"><p className="text-muted-foreground">Embeds</p><p className="font-semibold text-emerald-300">{snapshot.repositoryIndex.embeddings}</p></div>
        </div>
      ),
    });
  }

  // Dependency Graph
  if (snapshot?.dependencyGraphData) {
    sections.push({
      id: "deps",
      label: "Dependency Graph",
      icon: Network,
      content: (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center"><p className="text-muted-foreground">Nodes</p><p className="font-semibold text-cyan-300">{snapshot.dependencyGraphData.nodes}</p></div>
          <div className="text-center"><p className="text-muted-foreground">Edges</p><p className="font-semibold text-violet-300">{snapshot.dependencyGraphData.edges}</p></div>
          <div className="text-center"><p className="text-muted-foreground">Circular</p><p className="font-semibold text-rose-300">{snapshot.dependencyGraphData.circular}</p></div>
        </div>
      ),
    });
  }

  if (sections.length === 0) {
    return <EmptyState icon={Boxes} title="No context data" />;
  }

  return (
    <Accordion type="single" collapsible className="space-y-2">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <AccordionItem key={section.id} value={section.id} className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
            <AccordionTrigger className="flex items-center gap-2 px-3 py-2 text-xs hover:no-underline">
              <Icon className="h-3.5 w-3.5 text-emerald-300" />
              <span className="flex-1 text-left font-medium">{section.label}</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">{section.content}</AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/* ─────────── Runtime Tab ─────────── */
function RuntimeTab({ snapshot, search }: { snapshot: DebugSnapshot | null; search: string }) {
  if (!snapshot) return <EmptyState icon={Cpu} title="No runtime data" description="Runtime metrics will appear here." />;

  const cards: Array<{ label: string; value: string | number; icon: typeof Cpu; color: string; sub?: string }> = [];

  if (snapshot.provider) cards.push({ label: "Provider", value: snapshot.provider, icon: Cpu, color: "#22d3ee" });
  if (snapshot.model) cards.push({ label: "Model", value: snapshot.model, icon: Brain, color: "#a78bfa" });
  if (snapshot.temperature != null) cards.push({ label: "Temperature", value: snapshot.temperature, icon: Activity, color: "#f472b6" });
  if (snapshot.maxTokens > 0) cards.push({ label: "Max Tokens", value: snapshot.maxTokens, icon: Zap, color: "#60a5fa" });
  if (snapshot.streaming != null) cards.push({ label: "Streaming", value: snapshot.streaming ? "Enabled" : "Disabled", icon: Layers, color: snapshot.streaming ? "#34d399" : "#64748b" });
  if (snapshot.contextWindow > 0) cards.push({ label: "Context Window", value: snapshot.contextWindow.toLocaleString(), icon: Hash, color: "#fbbf24" });
  if (snapshot.totalMs > 0) cards.push({ label: "Total Time", value: `${snapshot.totalMs}ms`, icon: Clock, color: "#34d399" });
  if (snapshot.generationMs > 0) cards.push({ label: "Generation Time", value: `${snapshot.generationMs}ms`, icon: Clock, color: "#22d3ee" });
  if (snapshot.queueMs > 0) cards.push({ label: "Queue Time", value: `${snapshot.queueMs}ms`, icon: Clock, color: "#fbbf24" });
  if (snapshot.inputTokens > 0) cards.push({ label: "Input Tokens", value: snapshot.inputTokens, icon: Hash, color: "#22d3ee" });
  if (snapshot.outputTokens > 0) cards.push({ label: "Output Tokens", value: snapshot.outputTokens, icon: Hash, color: "#34d399" });
  if (snapshot.totalTokens > 0) cards.push({ label: "Total Tokens", value: snapshot.totalTokens, icon: Hash, color: "#a78bfa" });

  if (cards.length === 0) return <EmptyState icon={Cpu} title="No runtime data" />;

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card, i) => (
        <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} color={card.color} sub={card.sub} index={i} />
      ))}
    </div>
  );
}

/* ─────────── Capabilities Tab ─────────── */
function CapabilitiesTab({ snapshot }: { snapshot: DebugSnapshot | null }) {
  if (!snapshot?.capabilities) return <EmptyState icon={Zap} title="No capabilities data" />;

  const caps = snapshot.capabilities;
  const capabilities = [
    { label: "Vision", icon: Eye, enabled: caps.vision, color: "#22d3ee" },
    { label: "Tool Calling", icon: Wrench, enabled: caps.toolCalling, color: "#a78bfa" },
    { label: "Function Calling", icon: Zap, enabled: caps.functionCalling, color: "#fbbf24" },
    { label: "Streaming", icon: Layers, enabled: snapshot.streaming, color: "#34d399" },
    { label: "Long Context", icon: Hash, enabled: snapshot.contextWindow >= 100000, color: "#60a5fa" },
    { label: "Reasoning", icon: Brain, enabled: caps.reasoning, color: "#f472b6" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {capabilities.map((cap, i) => {
        const Icon = cap.icon;
        return (
          <motion.div
            key={cap.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition",
              cap.enabled
                ? "border-emerald-400/20 bg-emerald-500/[0.04]"
                : "border-white/5 bg-white/[0.02]"
            )}
          >
            <Icon className="h-5 w-5" style={{ color: cap.enabled ? cap.color : "#64748b" }} />
            <span className={cn("text-[10px] font-medium", cap.enabled ? "text-foreground" : "text-muted-foreground")}>
              {cap.label}
            </span>
            <span className={cn("text-[9px] font-bold uppercase", cap.enabled ? "text-emerald-400" : "text-muted-foreground/50")}>
              {cap.enabled ? "✓ Supported" : "✗ N/A"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─────────── Logs Tab (DevTools Timeline) ─────────── */
function LogsTab({ logs, clearLogs, snapshot, search }: { logs: AIRequestLog[]; clearLogs: () => void; snapshot: DebugSnapshot | null; search: string }) {
  const [filter, setFilter] = useState<"all" | "error" | "success">("all");

  const filtered = useMemo(() => {
    let result = logs;
    if (filter === "error") result = logs.filter((l) => l.status === "error");
    if (filter === "success") result = logs.filter((l) => l.status === "success");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((l) => l.requestId.toLowerCase().includes(q) || (l.error || "").toLowerCase().includes(q) || l.provider.toLowerCase().includes(q));
    }
    return result;
  }, [logs, filter, search]);

  // Current request timeline (from snapshot)
  const currentTimeline = snapshot ? [
    { label: "Context Loaded", timeMs: snapshot.queueMs, status: "done" as const },
    { label: "Prompt Assembled", timeMs: 0, status: "done" as const },
    { label: "API Request Sent", timeMs: 0, status: "done" as const },
    { label: "Generation Started", timeMs: snapshot.generationMs, status: "done" as const },
    { label: "Response Complete", timeMs: snapshot.totalMs, status: "done" as const },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Current request timeline */}
      {snapshot && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Request Timeline</p>
          <RequestTimeline steps={currentTimeline} totalMs={snapshot.totalMs} />
        </div>
      )}

      {/* Request history */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Request History ({filtered.length})
          </p>
          <div className="flex items-center gap-1">
            {(["all", "success", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-medium transition",
                  filter === f
                    ? f === "error" ? "bg-rose-500/15 text-rose-300" : f === "success" ? "bg-emerald-500/15 text-emerald-300" : "bg-cyan-500/15 text-cyan-300"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
            {logs.length > 0 && (
              <button onClick={() => { if (confirm("Clear all logs?")) { clearLogs(); toast.success("Logs cleared"); } }} className="ml-1 rounded p-1 text-muted-foreground transition hover:text-rose-300" title="Clear logs">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No logs yet" description="Request history will appear here." />
        ) : (
          <div className="space-y-1.5">
            {filtered.slice(0, 30).map((log, i) => {
              const isError = log.status === "error";
              const color = isError ? "#ff5470" : "#34d399";
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="truncate font-mono text-cyan-300">{log.requestId.slice(0, 16)}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{log.durationMs}ms</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>{log.provider}/{log.model}</span>
                    {log.retryCount > 0 && <span className="text-amber-400">↻{log.retryCount}</span>}
                    <span style={{ color }} className="ml-auto">{log.statusCode}</span>
                  </div>
                  {log.error && <p className="mt-1 line-clamp-1 text-[10px] text-rose-400">{log.error}</p>}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
