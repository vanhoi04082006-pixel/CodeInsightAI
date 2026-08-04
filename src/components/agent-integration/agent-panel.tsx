"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, X, Brain, ChevronRight } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { PlanVisualizer } from "@/components/views/plan-visualizer";
import { ToolCallCard } from "@/components/views/tool-call-card";
import { PermissionDialog, type PendingPermission } from "@/components/views/permission-dialog";
import { WorkingMemoryPanel } from "@/components/views/working-memory-panel";
import type { AgentItemContext, AgentAction } from "@/lib/agent-integration/context-adapter";
import { contextToQuery } from "@/lib/agent-integration/context-adapter";
import { ActionRow } from "./action-button";
import { useAgent } from "./use-agent";

export interface AgentPanelProps {
  context: AgentItemContext;
  actions?: AgentAction[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  title?: string;
  onClose?: () => void;
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
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const agent = useAgent();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [input, setInput] = useState("");
  const [loadingAction, setLoadingAction] = useState<AgentAction | null>(null);

  const runAgent = useCallback(async (query: string, action?: AgentAction) => {
    setCollapsed(false);
    if (action) setLoadingAction(action);
    await agent.runAgent(query, activeAnalysisId);
  }, [agent, activeAnalysisId]);

  const handleAction = useCallback((action: AgentAction) => {
    const ctx = { ...context, action, analysisId: context.analysisId || activeAnalysisId || undefined };
    const { query } = contextToQuery(ctx);
    runAgent(query, action);
  }, [context, activeAnalysisId, runAgent]);

  const panelTitle = title || `Agent — ${context.itemLabel}`;
  const { state } = agent;

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
          {state.isRunning && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {state.progress.completed}/{state.progress.total}
              </span>
              <Button onClick={(e) => { e.stopPropagation(); agent.cancelTask(); }} size="sm" variant="outline" className="h-6 px-2 text-[10px]">
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
              <ActionRow
                actions={actions}
                onAction={handleAction}
                disabled={state.isRunning}
                loadingAction={loadingAction}
              />

              {state.isRunning && state.plan && (
                <div className="h-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                    animate={{ width: `${state.progress.total > 0 ? (state.progress.completed / state.progress.total) * 100 : 0}%` }}
                  />
                </div>
              )}

              {state.plan && <PlanVisualizer plan={state.plan} toolCalls={state.toolCalls as any[]} />}

              {state.toolCalls.length > 0 && (
                <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
                  {state.toolCalls.map((tc) => (
                    <ToolCallCard key={tc.nodeId + tc.tool} toolCall={tc} />
                  ))}
                </div>
              )}

              {state.messages.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
                  <AnimatePresence>
                    {state.messages.map((msg) => (
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

              {state.isRunning && Object.keys(state.workingMemory).length > 0 && (
                <WorkingMemoryPanel memory={state.workingMemory} />
              )}

              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), runAgent(input))}
                  placeholder="Ask the Agent..."
                  disabled={state.isRunning}
                  className="h-8 bg-white/[0.03] text-xs"
                />
                <Button
                  onClick={() => runAgent(input)}
                  disabled={state.isRunning || !input.trim()}
                  className="h-8 bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                  size="sm"
                >
                  {state.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PermissionDialog
        permission={state.pendingPermission as PendingPermission | null}
        onRespond={agent.respondPermission}
      />
    </GlassCard>
  );
}
