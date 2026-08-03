"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Loader2, CheckCircle2, XCircle, Circle,
  ChevronDown, ChevronRight, Zap, Brain, Shield, Terminal,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PlanVisualizer } from "./plan-visualizer";
import { ToolCallCard } from "./tool-call-card";
import { PermissionDialog, type PendingPermission } from "./permission-dialog";
import { WorkingMemoryPanel } from "./working-memory-panel";
import type { AgentEvent } from "@/lib/agent/contracts";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ToolCall {
  nodeId: string;
  tool: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  duration?: number;
}

interface PendingPermissionLocal {
  nodeId: string;
  tool: string;
  params: Record<string, unknown>;
  diff?: string;
}

export function AgentChatView() {
  const { t } = useT();
  const activeReport = useAppStore((s) => s.activeReport);
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const setView = useAppStore((s) => s.setView);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermissionLocal | null>(null);
  const [workingMemory, setWorkingMemory] = useState<any>({});
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: Date.now(),
    }]);
  }, []);

  const handleEvent = useCallback((event: any) => {
    // Store taskId when received
    if (event.taskId) {
      setActiveTaskId(event.taskId);
    }

    switch (event.type) {
      case "plan.generated":
        setPlan(event.plan);
        setProgress({ completed: 0, total: event.plan.graph.nodes.length });
        addMessage("assistant", `Plan generated: ${event.plan.graph.nodes.length} steps`);
        break;

      case "node.started":
        setToolCalls((prev) => [...prev, {
          nodeId: event.nodeId,
          tool: event.tool,
          status: "running",
        }]);
        break;

      case "node.completed":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId
            ? { ...tc, status: "done", result: event.result }
            : tc,
        ));
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        break;

      case "node.failed":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId
            ? { ...tc, status: "failed", error: event.error.message }
            : tc,
        ));
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        break;

      case "node.skipped":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId
            ? { ...tc, status: "skipped" }
            : tc,
        ));
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        break;

      case "permission.requested":
        setPendingPermission({
          nodeId: event.nodeId,
          tool: event.tool,
          params: (event.params as Record<string, unknown>) || {},
          diff: event.diff,
        });
        break;

      case "permission.granted":
        setPendingPermission(null);
        break;

      case "permission.denied":
        setPendingPermission(null);
        break;

      case "memory.updated":
        setWorkingMemory((prev: any) => ({ ...prev, ...event.working }));
        break;

      case "task.completed":
        addMessage("assistant", `✅ ${event.summary}`);
        setIsRunning(false);
        break;

      case "task.failed":
        addMessage("assistant", `❌ ${event.error.message}`);
        setIsRunning(false);
        break;

      case "task.cancelled":
        addMessage("assistant", `⚠️ ${event.reason}`);
        setIsRunning(false);
        break;
    }
  }, [addMessage]);

  const submitQuery = async () => {
    if (!input.trim() || isRunning) return;
    if (!activeReport) {
      addMessage("system", "Please analyze a repository first.");
      return;
    }

    const query = input.trim();
    setInput("");
    addMessage("user", query);
    setIsRunning(true);
    setToolCalls([]);
    setPlan(null);
    setProgress({ completed: 0, total: 0 });
    setActiveTaskId(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          analysisId: activeAnalysisId,
          locale: useAppStore.getState().aiPending ? "en" : "en",
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", `Error: ${data.error || res.statusText}`);
        setIsRunning(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        addMessage("assistant", "Error: No response stream");
        setIsRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {}
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6));
          handleEvent(event);
        } catch {}
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        addMessage("assistant", "⚠️ Task cancelled.");
      } else {
        addMessage("assistant", `Error: ${e.message}`);
      }
      setIsRunning(false);
    }
  };

  const cancelTask = () => {
    abortRef.current?.abort();
  };

  const respondPermission = async (granted: boolean) => {
    if (!pendingPermission) return;
    try {
      await fetch("/api/agent/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: pendingPermission.nodeId,
          granted,
          taskId: activeTaskId,
        }),
      });
    } catch {}
    setPendingPermission(null);
  };

  if (!activeReport) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <Brain className="mx-auto h-10 w-10 text-violet-300" />
          <h2 className="mt-4 text-xl font-bold">Agent Chat</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Analyze a repository first to use the AI Agent.
          </p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Sparkles className="mr-1.5 h-4 w-4" /> Analyze Repo
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">
          <GradientText>Agent Chat</GradientText>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeReport.repoOwner}/{activeReport.repoName} · AI-powered coding agent
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1fr_350px]">
        {/* Left: Chat + Tools */}
        <div className="space-y-4">
          {/* Progress bar */}
          {isRunning && plan && (
            <GlassCard className="p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                  Executing plan... {progress.completed}/{progress.total}
                </span>
                <Button onClick={cancelTask} size="sm" variant="outline" className="h-6 px-2 text-xs">
                  Cancel
                </Button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                  animate={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </GlassCard>
          )}

          {/* Plan visualizer */}
          {plan && <PlanVisualizer plan={plan} toolCalls={toolCalls} />}

          {/* Tool call cards */}
          {toolCalls.length > 0 && (
            <div className="space-y-2">
              {toolCalls.map((tc) => (
                <ToolCallCard key={tc.nodeId + tc.tool} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Messages */}
          <GlassCard className="p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" /> Conversation
            </div>
            <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin">
              {messages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Sparkles className="mx-auto mb-2 h-6 w-6 text-violet-300/50" />
                  Ask the agent to fix bugs, refactor code, generate tests, or analyze security.
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "rounded-lg p-2.5 text-sm",
                        msg.role === "user" && "bg-cyan-500/10 text-cyan-100",
                        msg.role === "assistant" && "bg-violet-500/10 text-violet-100",
                        msg.role === "system" && "bg-amber-500/10 text-amber-100",
                      )}
                    >
                      <span className="mr-1.5 text-[10px] font-bold uppercase">
                        {msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "⚠️"}
                      </span>
                      {msg.content}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </GlassCard>

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submitQuery())}
              placeholder="Ask the agent... (e.g. 'fix bug in login')"
              disabled={isRunning}
              className="bg-white/[0.03]"
            />
            <Button
              onClick={submitQuery}
              disabled={isRunning || !input.trim()}
              className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Right: Working Memory + Quick Actions */}
        <div className="space-y-4">
          <WorkingMemoryPanel memory={workingMemory} />

          {/* Quick actions */}
          <GlassCard className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Actions
            </h3>
            <div className="space-y-1.5">
              {[
                { label: "Fix bugs", icon: Zap, query: "Find and fix bugs in this repository" },
                { label: "Security audit", icon: Shield, query: "Audit security vulnerabilities" },
                { label: "Generate tests", icon: CheckCircle2, query: "Generate tests for the main module" },
                { label: "Code review", icon: Brain, query: "Review code quality and best practices" },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => !isRunning && (setInput(action.query), setTimeout(submitQuery, 100))}
                  disabled={isRunning}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground transition hover:border-violet-400/20 hover:bg-violet-500/[0.04] hover:text-violet-200 disabled:opacity-50"
                >
                  <action.icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Permission dialog */}
      <PermissionDialog
        permission={pendingPermission as PendingPermission | null}
        onRespond={respondPermission}
      />
    </div>
  );
}
