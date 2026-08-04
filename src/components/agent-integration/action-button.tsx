"use client";

import { motion } from "framer-motion";
import { Loader2, Zap, Shield, Bug, FileText, Wrench, GitBranch, Search, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentAction } from "@/lib/agent-integration/context-adapter";

const ACTION_CONFIG: Record<AgentAction, { icon: typeof Zap; label: string; color: string }> = {
  explain: { icon: Brain, label: "Explain", color: "text-cyan-300" },
  fix: { icon: Wrench, label: "Fix", color: "text-emerald-300" },
  optimize: { icon: Zap, label: "Optimize", color: "text-amber-300" },
  test: { icon: Bug, label: "Test", color: "text-violet-300" },
  refactor: { icon: GitBranch, label: "Refactor", color: "text-blue-300" },
  document: { icon: FileText, label: "Docs", color: "text-pink-300" },
  impact: { icon: Search, label: "Impact", color: "text-orange-300" },
  rootCause: { icon: Search, label: "Root Cause", color: "text-red-300" },
  summarize: { icon: FileText, label: "Summarize", color: "text-cyan-300" },
  custom: { icon: Brain, label: "Ask", color: "text-violet-300" },
};

export interface ActionButtonProps {
  action: AgentAction;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "compact";
  className?: string;
}

export function ActionButton({
  action,
  onClick,
  disabled,
  loading,
  size = "sm",
  variant = "default",
  className,
}: ActionButtonProps) {
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.custom;
  const Icon = loading ? Loader2 : config.icon;
  const sz = size === "sm" ? "h-7 px-2.5 text-[11px]" : size === "lg" ? "h-9 px-4 text-sm" : "h-8 px-3 text-xs";

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.03 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] font-medium transition-all",
        sz,
        config.color,
        "hover:border-white/20 hover:bg-white/[0.06]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      {variant === "default" && <span>{config.label}</span>}
    </motion.button>
  );
}

/**
 * A row of action buttons — typical usage in a tab:
 *
 * <ActionRow actions={["explain", "fix", "test", "impact"]} onAction={setActiveAction} />
 */
export function ActionRow({
  actions,
  onAction,
  disabled,
  loadingAction,
  size = "sm",
}: {
  actions: AgentAction[];
  onAction: (a: AgentAction) => void;
  disabled?: boolean;
  loadingAction?: AgentAction | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((a) => (
        <ActionButton
          key={a}
          action={a}
          onClick={() => onAction(a)}
          disabled={disabled}
          loading={loadingAction === a}
          size={size}
        />
      ))}
    </div>
  );
}
