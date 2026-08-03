"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2, XCircle, Circle, Loader2, MinusCircle,
} from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

interface PlanVisualizerProps {
  plan: any;
  toolCalls: any[];
}

const STATUS_ICON: Record<string, typeof Circle> = {
  pending: Circle,
  running: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-muted-foreground/30",
  running: "text-violet-400 animate-spin",
  done: "text-emerald-400",
  failed: "text-rose-400",
  skipped: "text-muted-foreground/40",
};

export function PlanVisualizer({ plan, toolCalls }: PlanVisualizerProps) {
  if (!plan?.graph?.nodes) return null;

  const { nodes } = plan.graph;
  const toolCallMap = new Map(toolCalls.map((tc) => [tc.nodeId, tc]));

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Execution Plan ({nodes.length} steps)
      </h3>
      <div className="space-y-1">
        {nodes.map((node: any, i: number) => {
          const tc = toolCallMap.get(node.id);
          const status = tc?.status || "pending";
          const Icon = STATUS_ICON[status] || Circle;
          const color = STATUS_COLOR[status] || "text-muted-foreground";

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
              <span className={cn("flex-1 truncate", status === "pending" && "text-muted-foreground/60")}>
                {node.step || node.id}
              </span>
              {node.parallelGroup && (
                <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {node.parallelGroup}
                </span>
              )}
              {node.capability && (
                <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-300">
                  {node.capability}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}
