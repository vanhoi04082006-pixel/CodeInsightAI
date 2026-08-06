"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Rocket, Plus, CheckCircle2, Circle, Loader2, Zap } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";

export function SprintsView() {
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [sprints, setSprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSprints = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pm/sprint");
      if (res.ok) { const data = await res.json(); setSprints(data.sprints || []); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadSprints(); }, []);

  const generateSprint = async () => {
    if (!activeAnalysisId) { toast.error("No analysis selected"); return; }
    try {
      const res = await fetch("/api/pm/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: activeAnalysisId }) });
      if (res.ok) { toast.success("Sprint generated from analysis!"); loadSprints(); }
      else toast.error("Failed to generate sprint");
    } catch { toast.error("Failed"); }
  };

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    await fetch("/api/pm/task", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: taskId, status: newStatus }) });
    loadSprints();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl"><GradientText>AI Project Manager</GradientText></h1>
          <p className="mt-1 text-sm text-muted-foreground">Sprint planning + task tracking from code analysis</p>
        </div>
        <Button onClick={generateSprint} disabled={!activeAnalysisId} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
          <Zap className="mr-1.5 h-4 w-4" /> Generate Sprint
        </Button>
      </motion.div>

      {loading ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">Loading sprints...</GlassCard>
      ) : sprints.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Rocket className="mx-auto h-8 w-8 text-violet-300/50" />
          <p className="mt-2 text-sm text-muted-foreground">No sprints yet. Generate one from an analysis.</p>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {sprints.map((sprint) => (
            <GlassCard key={sprint.id} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">{sprint.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{sprint.goal}</p>
                </div>
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">{sprint.status}</span>
              </div>
              <div className="space-y-1.5">
                {(sprint.tasks || []).map((task: any) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <button onClick={() => toggleTask(task.id, task.status)}>
                      {task.status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <div className="flex-1">
                      <p className={`text-xs ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                      <p className="text-[9px] text-muted-foreground">{task.effort} · {task.estimate}h</p>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] ${task.priority === "critical" ? "bg-rose-500/15 text-rose-300" : task.priority === "high" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-muted-foreground"}`}>{task.priority}</span>
                  </div>
                ))}
                {(!sprint.tasks || sprint.tasks.length === 0) && <p className="text-xs text-muted-foreground">No tasks in this sprint</p>}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
