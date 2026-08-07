"use client";

import { useState, useRef, useCallback } from "react";
import type { AgentEvent } from "@/lib/agent/contracts";

// ─── Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface ToolCallEntry {
  nodeId: string;
  tool: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PendingPermission {
  nodeId: string;
  tool: string;
  params: Record<string, unknown>;
  diff?: string;
}

export interface AgentState {
  messages: ChatMessage[];
  toolCalls: ToolCallEntry[];
  plan: any | null;
  isRunning: boolean;
  pendingPermission: PendingPermission | null;
  workingMemory: Record<string, unknown>;
  progress: { completed: number; total: number };
  activeTaskId: string | null;
  /** The file currently being viewed (set when agent opens/edits a file). */
  activeFile: { path: string; content: string; diff?: string } | null;
  /** Terminal output lines (accumulated from tool executions). */
  terminalLines: { type: "cmd" | "stdout" | "stderr" | "info"; text: string; ts: number }[];
  /** Stage 5.4: Autonomous loop state */
  autonomous: {
    active: boolean;
    iteration: number;
    maxIterations: number;
    lastStatus: string;  // e.g. "Lint: fail, Tests: pass"
    totalIterations: number;
  };
}

const initialState: AgentState = {
  messages: [],
  toolCalls: [],
  plan: null,
  isRunning: false,
  pendingPermission: null,
  workingMemory: {},
  progress: { completed: 0, total: 0 },
  activeTaskId: null,
  activeFile: null,
  terminalLines: [],
  autonomous: { active: false, iteration: 0, maxIterations: 3, lastStatus: "", totalIterations: 0 },
};

// ─── Hook ─────────────────────────────────────────────────────────────

export function useAgent() {
  const [state, setState] = useState<AgentState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role, content, timestamp: Date.now(),
      }],
    }));
  }, []);

  const addTerminalLine = useCallback((type: "cmd" | "stdout" | "stderr" | "info", text: string) => {
    setState((prev) => ({
      ...prev,
      terminalLines: [...prev.terminalLines, { type, text, ts: Date.now() }],
    }));
  }, []);

  const handleEvent = useCallback((event: AgentEvent) => {
    const ev = event as any;
    if (ev.taskId) {
      setState((prev) => ({ ...prev, activeTaskId: ev.taskId }));
    }

    switch (ev.type) {
      case "plan.generated":
        setState((prev) => ({
          ...prev,
          plan: ev.plan,
          progress: { completed: 0, total: ev.plan.graph.nodes.length },
        }));
        addMessage("assistant", `Plan generated: ${ev.plan.graph.nodes.length} steps`);
        break;

      case "node.started":
        setState((prev) => ({
          ...prev,
          toolCalls: [...prev.toolCalls, { nodeId: ev.nodeId, tool: ev.tool, status: "running", startedAt: Date.now() }],
        }));
        // Add terminal line for run-* tools
        if (ev.tool === "run-lint" || ev.tool === "run-tests" || ev.tool === "run-script") {
          addTerminalLine("cmd", `$ ${ev.tool}`);
        }
        break;

      case "node.completed":
        setState((prev) => ({
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.nodeId === ev.nodeId ? { ...tc, status: "done", result: ev.result, completedAt: Date.now() } : tc,
          ),
          progress: { ...prev.progress, completed: prev.progress.completed + 1 },
          // Update activeFile when agent opens/edits a file
          activeFile: ev.result?.modifiedFiles?.[0]
            ? { path: ev.result.modifiedFiles[0], content: "", diff: ev.result.changes?.[0]?.oldContent }
            : ev.result?.file
              ? { path: ev.result.file, content: ev.result.content || "", diff: ev.result.diff }
              : prev.activeFile,
        }));
        // Terminal output for run-* tools
        if (ev.result && typeof ev.result === "object") {
          const r = ev.result as any;
          if (r.output) addTerminalLine("stdout", String(r.output).slice(0, 5000));
          if (r.errorCount !== undefined) addTerminalLine("info", `→ ${r.errorCount} errors, ${r.warningCount || 0} warnings`);
          if (r.passed !== undefined) addTerminalLine("info", `→ ${r.passed} passed, ${r.failed} failed`);
          if (r.exitCode !== undefined && r.exitCode === 0) addTerminalLine("info", "→ ✓ success");
        }
        break;

      case "node.failed":
        setState((prev) => ({
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.nodeId === ev.nodeId ? { ...tc, status: "failed", error: ev.error?.message, completedAt: Date.now() } : tc,
          ),
          progress: { ...prev.progress, completed: prev.progress.completed + 1 },
        }));
        addTerminalLine("stderr", `✗ ${ev.error?.message || "failed"}`);
        break;

      case "node.skipped":
        setState((prev) => ({
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.nodeId === ev.nodeId ? { ...tc, status: "skipped" } : tc,
          ),
          progress: { ...prev.progress, completed: prev.progress.completed + 1 },
        }));
        break;

      case "permission.requested":
        setState((prev) => ({
          ...prev,
          pendingPermission: {
            nodeId: ev.nodeId,
            tool: ev.tool,
            params: (ev.params as Record<string, unknown>) || {},
            diff: ev.diff,
          },
        }));
        break;

      case "permission.granted":
      case "permission.denied":
        setState((prev) => ({ ...prev, pendingPermission: null }));
        break;

      case "memory.updated":
        setState((prev) => ({ ...prev, workingMemory: { ...prev.workingMemory, ...ev.working } }));
        break;

      case "task.completed":
        addMessage("assistant", `✅ ${ev.summary}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        addTerminalLine("info", "═══ Task completed ═══");
        break;

      case "task.failed":
        addMessage("assistant", `❌ ${ev.error?.message || "Task failed"}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        addTerminalLine("info", "═══ Task failed ═══");
        break;

      case "task.cancelled":
        addMessage("assistant", `⚠️ ${ev.reason || "Cancelled"}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        addTerminalLine("info", "═══ Task cancelled ═══");
        break;

      // ── v2.2 fix: handle remaining 7 event types ──

      // Stage 5.3: Autonomous loop events
      case "autonomous.started":
        addMessage("system", `🚀 Autonomous mode started — max ${ev.maxIterations || 3} iterations`);
        setState((prev) => ({ ...prev, autonomous: { ...prev.autonomous, active: true, iteration: 0, maxIterations: ev.maxIterations || 3, totalIterations: 0, lastStatus: "starting" } }));
        break;

      case "autonomous.iteration":
        addMessage("system", `📋 Iteration ${ev.iteration}/${ev.max}: ${ev.query?.slice(0, 100) || "working..."}`);
        setState((prev) => ({ ...prev, autonomous: { ...prev.autonomous, active: true, iteration: ev.iteration, maxIterations: ev.max, totalIterations: ev.iteration, lastStatus: prev.autonomous.lastStatus } }));
        // Reset progress for new iteration
        setState((prev) => ({ ...prev, progress: { completed: 0, total: 0 }, toolCalls: [] }));
        break;

      case "autonomous.replan":
        addMessage("system", `🔄 Re-planning — ${ev.reason}. Generating fix plan...`);
        addTerminalLine("info", `── Iteration ${ev.iteration} replan: ${ev.reason} ──`);
        setState((prev) => ({ ...prev, autonomous: { ...prev.autonomous, lastStatus: ev.reason, totalIterations: ev.iteration } }));
        break;

      case "autonomous.completed":
        addMessage("assistant", `✅ ${ev.message || "All checks passed!"} (${ev.iterations} iterations)`);
        setState((prev) => ({ ...prev, autonomous: { ...prev.autonomous, active: false, lastStatus: "completed", totalIterations: ev.iterations } }));
        break;

      case "autonomous.suggest":
        addMessage("assistant", `💡 ${ev.message || "Suggested action: " + ev.action}`);
        break;

      case "autonomous.exhausted":
        addMessage("assistant", `⚠️ ${ev.message || "Max iterations reached."}`);
        setState((prev) => ({ ...prev, autonomous: { ...prev.autonomous, active: false, lastStatus: "exhausted" } }));
        break;

      case "node.tool-output":
        // Streaming tool output (partial chunks) — append to terminal
        if (ev.chunk) addTerminalLine("stdout", String(ev.chunk));
        break;

      case "patch.generated":
        // Agent generated a patch — update activeFile with diff
        setState((prev) => ({
          ...prev,
          activeFile: prev.activeFile
            ? { ...prev.activeFile, diff: ev.diff }
            : { path: ev.file, content: "", diff: ev.diff },
        }));
        addMessage("assistant", `📝 Patch generated for ${ev.file}`);
        break;

      case "patch.applied":
        // Patch was applied — update terminal
        addTerminalLine("info", `→ patch applied to ${ev.file}`);
        break;

      case "patch.rolledback":
        // Patch was rolled back
        addTerminalLine("info", `→ patch rolled back for ${ev.file || "files"}`);
        addMessage("assistant", `↩️ Changes rolled back`);
        break;

      case "checkpoint.saved":
        // Checkpoint saved — no UI action needed, but track for debugging
        break;

      case "task.paused":
        setState((prev) => ({ ...prev, isRunning: false }));
        addMessage("system", `⏸ Task paused at ${ev.nodeId || "current step"}`);
        break;

      case "task.resumed":
        setState((prev) => ({ ...prev, isRunning: true }));
        addMessage("system", `▶ Task resumed from ${ev.nodeId || "last checkpoint"}`);
        break;
    }
  }, [addMessage, addTerminalLine]);

  const runAgent = useCallback(async (query: string, analysisId: string | null, autonomous?: boolean) => {
    if (!query.trim() || state.isRunning) return;
    if (!analysisId) {
      addMessage("system", "No analysis selected. Analyze a repository first.");
      return;
    }

    // Stage 5.2: Set autonomous mode preference before running.
    // The execution engine reads context.memory.session.preferences.autoApproveWriteTools
    // to decide whether to skip permission prompts for write tools.
    if (autonomous) {
      // We can't directly access the route's memory, but we pass the flag
      // via the request body and the route sets it on the context.
    }

    addMessage("user", query);
    setState((prev) => ({
      ...prev,
      isRunning: true,
      toolCalls: [],
      plan: null,
      progress: { completed: 0, total: 0 },
      activeTaskId: null,
      activeFile: null,
      terminalLines: [],
    }));

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, analysisId, locale: "en", autonomous }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", `Error: ${data.error || res.statusText}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        addMessage("assistant", "Error: No response stream");
        setState((prev) => ({ ...prev, isRunning: false }));
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
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, [state.isRunning, addMessage, handleEvent]);

  const cancelTask = useCallback(async () => {
    abortRef.current?.abort();
    if (state.activeTaskId) {
      try {
        await fetch("/api/agent/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: state.activeTaskId }),
        });
      } catch {}
    }
  }, [state.activeTaskId]);

  const respondPermission = useCallback(async (granted: boolean) => {
    if (!state.pendingPermission) return;
    try {
      await fetch("/api/agent/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: state.pendingPermission.nodeId, granted, taskId: state.activeTaskId }),
      });
    } catch {}
    setState((prev) => ({ ...prev, pendingPermission: null }));
  }, [state.pendingPermission, state.activeTaskId]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  // Stage 5.3: Autonomous loop — calls /api/agent/autonomous
  // which re-plans automatically when lint/test fails.
  const runAutonomous = useCallback(async (query: string, analysisId: string | null, maxIterations: number = 3) => {
    if (!query.trim() || state.isRunning) return;
    if (!analysisId) {
      addMessage("system", "No analysis selected. Analyze a repository first.");
      return;
    }

    addMessage("user", `🚀 ${query}`);
    setState((prev) => ({
      ...prev,
      isRunning: true,
      toolCalls: [],
      plan: null,
      progress: { completed: 0, total: 0 },
      activeTaskId: null,
      activeFile: null,
      terminalLines: [],
    }));

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, analysisId, maxIterations }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", `Error: ${data.error || res.statusText}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        addMessage("assistant", "Error: No response stream");
        setState((prev) => ({ ...prev, isRunning: false }));
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
        addMessage("assistant", "⚠️ Autonomous task cancelled.");
      } else {
        addMessage("assistant", `Error: ${e.message}`);
      }
    } finally {
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, [state.isRunning, addMessage, handleEvent]);

  // Stage 6: Multi-Agent — calls /api/agent/multi
  const runMultiAgent = useCallback(async (query: string, analysisId: string | null, agentIds?: string[]) => {
    if (!query.trim() || state.isRunning) return;
    if (!analysisId) {
      addMessage("system", "No analysis selected. Analyze a repository first.");
      return;
    }

    addMessage("user", `🌐 ${query}`);
    setState((prev) => ({
      ...prev,
      isRunning: true,
      toolCalls: [],
      plan: null,
      progress: { completed: 0, total: 0 },
      activeTaskId: null,
      activeFile: null,
      terminalLines: [],
    }));

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, analysisId, agentIds }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", `Error: ${data.error || res.statusText}`);
        setState((prev) => ({ ...prev, isRunning: false }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { addMessage("assistant", "Error: No stream"); setState((prev) => ({ ...prev, isRunning: false })); return; }

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
              handleMultiEvent(event);
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") addMessage("assistant", "⚠️ Multi-agent cancelled.");
      else addMessage("assistant", `Error: ${e.message}`);
    } finally {
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, [state.isRunning, addMessage]);

  // Handle multi-agent events
  const handleMultiEvent = useCallback((event: any) => {
    const ev = event as any;
    switch (ev.type) {
      case "multi.started":
        addMessage("system", `🌐 Multi-Agent started — ${ev.agents?.length || 0} agents`);
        addTerminalLine("info", `═══ Multi-Agent: ${ev.agents?.join(", ") || "all"} ═══`);
        break;
      case "agent.started":
        addMessage("system", `${ev.icon || "🤖"} ${ev.agentName} started...`);
        addTerminalLine("info", `── ${ev.agentName} ──`);
        break;
      case "agent.completed":
        addMessage("assistant", `${ev.agentName}: ${ev.summary?.slice(0, 200) || "done"} (${ev.durationMs}ms)`);
        break;
      case "agent.failed":
        addMessage("assistant", `❌ ${ev.agentName}: ${ev.error?.message || "failed"}`);
        break;
      case "coordinator.started":
        addMessage("system", "🧠 Coordinator summarizing...");
        break;
      case "coordinator.completed":
        addMessage("assistant", `📋 Coordinator Report:\n${ev.summary || ""}`);
        addTerminalLine("info", "═══ Coordinator Report ═══");
        break;
      case "multi.completed":
        addMessage("system", `✅ Multi-Agent done — ${ev.completed}/${ev.totalAgents} agents completed`);
        break;
      // Pass through standard agent events (plan.generated, node.*, task.*)
      default:
        handleEvent(event);
        break;
    }
  }, [addMessage, addTerminalLine, handleEvent]);

  // Manual file selection (Stage 3 fix: file tree browser)
  // Lets the user click any file in the analyzed repo and view its content,
  // independent of which file the Agent's tools have touched. When the user
  // picks a file, we set activeFile with empty content — the RightPanel's
  // useEffect will fetch the full content from /api/agent/file.
  const setActiveFile = useCallback((path: string) => {
    setState((prev) => ({
      ...prev,
      activeFile: {
        path,
        content: "", // RightPanel will fetch via /api/agent/file
      },
    }));
  }, []);

  return {
    state,
    runAgent,
    runAutonomous,
    runMultiAgent,
    cancelTask,
    respondPermission,
    reset,
    addMessage,
    setActiveFile,
  };
}
