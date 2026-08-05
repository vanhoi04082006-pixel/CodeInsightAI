"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Send, Brain, Code2, Eye, X, Terminal as TerminalIcon,
  ChevronRight, Zap,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { PlanVisualizer } from "@/components/views/plan-visualizer";
import { PermissionDialog, type PendingPermission } from "@/components/views/permission-dialog";
import { useAgent, type ChatMessage, type ToolCallEntry } from "./use-agent";
import type { AnalysisReport } from "@/lib/types";

// ─── WorkspaceView ───────────────────────────────────────────────────

export function WorkspaceView() {
  const activeReport = useAppStore((s) => s.activeReport);
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const setView = useAppStore((s) => s.setView);

  const agent = useAgent();

  // Stage 5.2: Autonomous mode — auto-approve write tools
  const [autonomousMode, setAutonomousMode] = useState(false);

  // Sync autonomousMode to SessionMemory preferences (engine reads this)
  useEffect(() => {
    if (agent.state) {
      // The engine reads context.memory.session.preferences.autoApproveWriteTools
      // We need to set it before running. Since useAgent doesn't expose memory,
      // we pass autonomousMode to runAgent which sets it before execution.
    }
  }, [autonomousMode, agent.state]);

  // Resizable splitter state
  const [splitPercent, setSplitPercent] = useState(38); // left panel width %
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(() => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.max(25, Math.min(65, pct)));
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  if (!activeReport) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <Brain className="mx-auto h-10 w-10 text-violet-300" />
          <h2 className="mt-4 text-xl font-bold">AI Workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Analyze a repository first to use the AI Workspace.
          </p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            Analyze Repo
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── LEFT: Chat Panel ─── */}
      <div
        className="flex flex-col overflow-hidden border-r border-white/5"
        style={{ width: `${splitPercent}%` }}
      >
        <ChatPanel
          messages={agent.state.messages}
          isRunning={agent.state.isRunning}
          onSend={(text) => autonomousMode
            ? agent.runAutonomous(text, activeAnalysisId, 3)
            : agent.runAgent(text, activeAnalysisId, false)
          }
          onCancel={agent.cancelTask}
          progress={agent.state.progress}
          autonomousMode={autonomousMode}
          onToggleAutonomous={() => setAutonomousMode(!autonomousMode)}
        />
      </div>

      {/* ─── Resizable Splitter ─── */}
      <div
        onMouseDown={onMouseDown}
        className="group relative w-1 shrink-0 cursor-col-resize bg-white/5 transition-colors hover:bg-violet-500/40"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3" />
      </div>

      {/* ─── RIGHT: Code View / Live Preview ─── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <RightPanel
          agent={agent}
          report={activeReport}
        />
      </div>

      {/* Permission Dialog (overlay) */}
      <PermissionDialog
        permission={agent.state.pendingPermission as PendingPermission | null}
        onRespond={agent.respondPermission}
      />
    </div>
  );
}

// ─── Chat Panel (left) ───────────────────────────────────────────────

function ChatPanel({
  messages,
  isRunning,
  onSend,
  onCancel,
  progress,
  autonomousMode,
  onToggleAutonomous,
}: {
  messages: ChatMessage[];
  isRunning: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  progress: { completed: number; total: number };
  autonomousMode: boolean;
  onToggleAutonomous: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = () => {
    if (!input.trim() || isRunning) return;
    onSend(input);
    setInput("");
  };

  return (
    <>
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-300" />
          <span className="text-xs font-semibold">
            <GradientText>Agent Chat</GradientText>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Stage 5.2: Autonomous mode toggle */}
          <button
            onClick={onToggleAutonomous}
            disabled={isRunning}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-all disabled:opacity-40",
              autonomousMode
                ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
            )}
            title={autonomousMode ? "Autonomous mode ON — write tools auto-approved" : "Autonomous mode OFF — write tools require approval"}
          >
            <Zap className="h-3 w-3" />
            {autonomousMode ? "Auto" : "Manual"}
          </button>
          {isRunning && (
            <>
              <span className="text-[10px] text-muted-foreground">{progress.completed}/{progress.total}</span>
              <Button onClick={onCancel} size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-3 p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Brain className="mb-3 h-8 w-8 text-violet-300/50" />
              {autonomousMode ? (
                <p className="text-xs">
                  ⚡ Autonomous mode ON — Agent will automatically fix lint/test errors (max 3 iterations).<br/>
                  Ask it to implement features, fix bugs, or refactor code.
                </p>
              ) : (
                <p className="text-xs">Ask the Agent to fix bugs, generate tests, refactor code, or analyze security.</p>
              )}
            </div>
          ) : (
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "rounded-xl p-3 text-sm",
                    msg.role === "user" && "bg-cyan-500/10 text-cyan-100",
                    msg.role === "assistant" && "bg-violet-500/10 text-violet-100",
                    msg.role === "system" && "bg-amber-500/10 text-amber-100",
                  )}
                >
                  <span className="mr-1.5 text-[10px] font-bold uppercase opacity-60">
                    {msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "⚠️"}
                  </span>
                  <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/5 p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())}
            placeholder="Ask the Agent..."
            disabled={isRunning}
            className="bg-white/[0.03]"
          />
          <Button
            onClick={submit}
            disabled={isRunning || !input.trim()}
            className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
            size="sm"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Right Panel (Code View / Live Preview toggle) ───────────────────

function RightPanel({
  agent,
  report,
}: {
  agent: ReturnType<typeof useAgent>;
  report: AnalysisReport;
}) {
  const [mode, setMode] = useState<"code" | "live">("code");
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const { state } = agent;

  // v2.2 fix (S3-1): fetch full file content from /api/agent/file
  // instead of relying on FileInsight.snippet (which is only a short excerpt)
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    if (!state.activeFile?.path || !activeAnalysisId) return;
    let cancelled = false;
    (async () => {
      setFileLoading(true);
      try {
        const res = await fetch(`/api/agent/file?analysisId=${activeAnalysisId}&path=${encodeURIComponent(state.activeFile!.path)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setFileContent(data.content || "");
        } else {
          setFileContent("");
        }
      } catch {
        if (!cancelled) setFileContent("");
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.activeFile?.path, activeAnalysisId]);

  const activeFileContent = state.activeFile?.content || fileContent;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar: Code View / Live Preview */}
      <div className="flex items-center justify-between border-b border-white/5 px-2 py-1">
        <div className="flex gap-1">
          <button
            onClick={() => setMode("code")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              mode === "code" ? "bg-violet-500/15 text-violet-300" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            Code View
          </button>
          <button
            onClick={() => setMode("live")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              mode === "live" ? "bg-cyan-500/15 text-cyan-300" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Live Preview
          </button>
        </div>

        {/* Progress indicator */}
        {state.isRunning && (
          <div className="flex items-center gap-2 px-2">
            <Loader2 className="h-3 w-3 animate-spin text-violet-300" />
            <span className="text-[10px] text-muted-foreground">
              {state.progress.completed}/{state.progress.total} steps
            </span>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {mode === "code" ? (
          <>
            {/* Code View — source code */}
            <div className="flex-1 overflow-auto scrollbar-thin">
              {state.activeFile ? (
                <CodeViewContent
                  path={state.activeFile.path}
                  content={activeFileContent}
                  diff={state.activeFile.diff}
                />
              ) : state.plan ? (
                <div className="p-4">
                  <PlanVisualizer plan={state.plan} toolCalls={state.toolCalls as any[]} />
                </div>
              ) : (
                <EmptyState
                  icon={Code2}
                  title="Code View"
                  description="The Agent will display source code here when it reads or edits files."
                />
              )}
            </div>

            {/* Terminal output (bottom, collapsible) */}
            {state.terminalLines.length > 0 && (
              <div className="border-t border-white/5">
                <button
                  onClick={() => setTerminalCollapsed(!terminalCollapsed)}
                  className="flex w-full items-center gap-2 bg-black/40 px-4 py-1.5 text-left"
                >
                  <TerminalIcon className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-[11px] font-semibold text-emerald-300">Terminal</span>
                  <span className="text-[10px] text-muted-foreground">{state.terminalLines.length} lines</span>
                  <motion.div animate={{ rotate: terminalCollapsed ? 0 : 90 }} className="ml-auto">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!terminalCollapsed && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <TerminalOutput lines={state.terminalLines} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          /* Live Preview — iframe */
          <LivePreviewPanel />
        )}
      </div>
    </div>
  );
}

// ─── Code View Content (syntax-highlighted source + diff) ────────────

function CodeViewContent({ path, content, diff }: { path: string; content: string; diff?: string }) {
  return (
    <div className="p-4">
      {/* File path header */}
      <div className="mb-3 flex items-center gap-2">
        <Code2 className="h-4 w-4 text-cyan-300" />
        <code className="text-xs text-muted-foreground">{path}</code>
        {diff !== undefined && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-medium text-amber-300">
            modified
          </span>
        )}
      </div>

      {/* Source code (pre-formatted, mono font) */}
      <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
        <code>{content || "(empty file)"}</code>
      </pre>

      {/* Diff (if available — show old content as reference) */}
      {diff !== undefined && diff !== "" && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-amber-300">Previous content (for diff reference):</p>
          <pre className="overflow-x-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3 font-mono text-[11px] leading-relaxed text-amber-200/60 scrollbar-thin">
            <code>{diff || "(file was created — no previous content)"}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Terminal Output (terminal-style log) ────────────────────────────

function TerminalOutput({ lines }: { lines: { type: string; text: string; ts: number }[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className="max-h-64 overflow-y-auto bg-black/60 p-3 font-mono text-[11px] leading-relaxed scrollbar-thin"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap break-words",
            line.type === "cmd" && "text-emerald-300",
            line.type === "stdout" && "text-foreground/70",
            line.type === "stderr" && "text-rose-400",
            line.type === "info" && "text-cyan-300",
          )}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}

// ─── Live Preview Panel (iframe) ──────────────────────────────────────

function LivePreviewPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
        <Eye className="h-3.5 w-3.5 text-cyan-300" />
        <span className="text-[11px] text-muted-foreground">Live Preview</span>
        <span className="text-[10px] text-muted-foreground/60">http://localhost:3000</span>
      </div>
      <div className="flex-1 bg-white">
        <iframe
          src="/"
          className="h-full w-full border-0"
          title="Live Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description }: { icon: typeof Code2; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
      <Icon className="mb-3 h-8 w-8 opacity-30" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs opacity-70">{description}</p>
    </div>
  );
}
