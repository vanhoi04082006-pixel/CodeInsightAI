"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Send, X, Brain, ChevronDown, ChevronRight,
  Circle, CheckCircle2, XCircle, AlertTriangle, Zap, Terminal,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { PlanVisualizer } from "@/components/views/plan-visualizer";
import { ToolCallCard } from "@/components/views/tool-call-card";
import { PermissionDialog, type PendingPermission } from "@/components/views/permission-dialog";
import { WorkingMemoryPanel } from "@/components/views/working-memory-panel";
import type { AgentItemContext } from "@/lib/agent-integration/context-adapter";
import { contextToQuery } from "@/lib/agent-integration/context-adapter";
import { ActionRow } from "./action-button";
import type { AgentAction } from "@/lib/agent-integration/context-adapter";

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
}

export interface AgentPanelProps {
  /** Context describing the item the Agent is acting on. */
  context: AgentItemContext;
  /** Actions to show as buttons (e.g. ["explain", "fix", "test"]). */
  actions?: AgentAction[];
  /** Whether the panel is collapsible (default: true). */
  collapsible?: boolean;
  /** Initial collapsed state. */
  defaultCollapsed?: boolean;
  /** Title override. */
  title?: string;
  /** Called when the panel closes (if dismissible). */
  onClose?: () => void;
  /** CSS class. */
  className?: string;
}

export function AgentPanel({
  context,
  actions = ["explain", "fix"],
  collapsible = true,
  defaultCollapsed = true,
  title,
  onClose,
  className,
}: AgentPanelProps) {
  const { t } = useT();
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [workingMemory, setWorkingMemory] = useState<any>({});
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<AgentAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role, content, timestamp: Date.now(),
    }]);
  }, []);

  const handleEvent = useCallback((event: any) => {
    if (event.taskId) setActiveTaskId(event.taskId);

    switch (event.type) {
      case "plan.generated":
        setPlan(event.plan);
        setProgress({ completed: 0, total: event.plan.graph.nodes.length });
        addMessage("assistant", `Plan generated: ${event.plan.graph.nodes.length} steps`);
        break;
      case "node.started":
        setToolCalls((prev) => [...prev, { nodeId: event.nodeId, tool: event.tool, status: "running" }]);
        break;
      case "node.completed":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId ? { ...tc, status: "done", result: event.result } : tc,
        ));
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        break;
      case "node.failed":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId ? { ...tc, status: "failed", error: event.error?.message } : tc,
        ));
        setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        break;
      case "node.skipped":
        setToolCalls((prev) => prev.map((tc) =>
          tc.nodeId === event.nodeId ? { ...tc, status: "skipped" } : tc,
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
      case "permission.denied":
        setPendingPermission(null);
        break;
      case "memory.updated":
        setWorkingMemory((prev: any) => ({ ...prev, ...event.working }));
        break;
      case "task.completed":
        addMessage("assistant", `✅ ${event.summary}`);
        setIsRunning(false);
        setLoadingAction(null);
        break;
      case "task.failed":
        addMessage("assistant", `❌ ${event.error?.message || "Task failed"}`);
        setIsRunning(false);
        setLoadingAction(null);
        break;
      case "task.cancelled":
        addMessage("assistant", `⚠️ ${event.reason || "Cancelled"}`);
        setIsRunning(false);
        setLoadingAction(null);
        break;
    }
  }, [addMessage]);

  const runAgent = useCallback(async (query: string, action?: AgentAction) => {
    if (!query.trim() || isRunning) return;
    if (!activeAnalysisId) {
      addMessage("system", "No analysis selected. Analyze a repository first.");
      return;
    }

    setInput("");
    setCollapsed(false); // expand the panel
    addMessage("user", query);
    setIsRunning(true);
    setToolCalls([]);
    setPlan(null);
    setProgress({ completed: 0, total: 0 });
    setActiveTaskId(null);
    if (action) setLoadingAction(action);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, analysisId: activeAnalysisId, locale: "en" }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", `Error: ${data.error || res.statusText}`);
        setIsRunning(false);
        setLoadingAction(null);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        addMessage("assistant", "Error: No response stream");
        setIsRunning(false);
        setLoadingAction(null);
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
      setLoadingAction(null);
    }
  }, [activeAnalysisId, isRunning, addMessage, handleEvent]);

  const handleAction = useCallback((action: AgentAction) => {
    const ctx = { ...context, action, analysisId: context.analysisId || activeAnalysisId || undefined };
    const { query } = contextToQuery(ctx);
    runAgent(query, action);
  }, [context, activeAnalysisId, runAgent]);

  const cancelTask = useCallback(async () => {
    abortRef.current?.abort();
    if (activeTaskId) {
      try {
        await fetch("/api/agent/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: activeTaskId }),
        });
      } catch {}
    }
  }, [activeTaskId]);

  const respondPermission = useCallback(async (granted: boolean) => {
    if (!pendingPermission) return;
    try {
      await fetch("/api/agent/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: pendingPermission.nodeId, granted, taskId: activeTaskId }),
      });
    } catch {}
    setPendingPermission(null);
  }, [pendingPermission, activeTaskId]);

  const panelTitle = title || `Agent — ${context.itemLabel}`;

  return (
    <GlassCard className={cn("overflow-hidden", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5 cursor-pointer select-none"
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <motion.div animate={{ rotate: collapsed ? 0 : 90 }}>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.div>
          )}
          <Brain className="h-4 w-4 text-violet-300" />
          <span className="text-xs font-semibold">
            <GradientText>{panelTitle}</GradientText>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {progress.completed}/{progress.total}
              </span>
              <Button onClick={(e) => { e.stopPropagation(); cancelTask(); }} size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                Cancel
              </Button>
            </div>
          )}
          {onClose && (
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 p-4">
              {/* Action buttons */}
              <ActionRow
                actions={actions}
                onAction={handleAction}
                disabled={isRunning}
                loadingAction={loadingAction}
              />

              {/* Progress bar */}
              {isRunning && plan && (
                <div className="h-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                    animate={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </div>
              )}

              {/* Plan visualizer */}
              {plan && <PlanVisualizer plan={plan} toolCalls={toolCalls} />}

              {/* Tool calls */}
              {toolCalls.length > 0 && (
                <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
                  {toolCalls.map((tc) => (
                    <ToolCallCard key={tc.nodeId + tc.tool} toolCall={tc} />
                  ))}
                </div>
              )}

              {/* Messages */}
              {messages.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
                  <AnimatePresence>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "rounded-lg p-2 text-xs",
                          msg.role === "user" && "bg-cyan-500/10 text-cyan-100",
                          msg.role === "assistant" && "bg-violet-500/10 text-violet-100",
                          msg.role === "system" && "bg-amber-500/10 text-amber-100",
                        )}
                      >
                        <span className="mr-1 text-[9px] font-bold uppercase">
                          {msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "⚠️"}
                        </span>
                        {msg.content}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Custom input */}
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), runAgent(input))}
                  placeholder="Ask the Agent..."
                  disabled={isRunning}
                  className="h-8 bg-white/[0.03] text-xs"
                />
                <Button
                  onClick={() => runAgent(input)}
                  disabled={isRunning || !input.trim()}
                  className="h-8 bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                  size="sm"
                >
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permission dialog */}
      <PermissionDialog
        permission={pendingPermission as PendingPermission | null}
        onRespond={respondPermission}
      />
    </GlassCard>
  );
}
