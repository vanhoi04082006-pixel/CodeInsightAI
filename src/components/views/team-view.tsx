"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Plus, UserPlus, Share2, Check, X } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";

export function TeamView() {
  const activeAnalysisId = useAppStore((s) => s.activeAnalysisId);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/list");
      if (res.ok) { const data = await res.json(); setTeams(data.teams || []); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadTeams(); }, []);

  const createTeam = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/team/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: desc }) });
      if (res.ok) { toast.success("Team created!"); setName(""); setDesc(""); setShowCreate(false); loadTeams(); }
      else toast.error("Failed to create team");
    } catch { toast.error("Failed"); }
  };

  const shareAnalysis = async (teamId: string) => {
    if (!activeAnalysisId) { toast.error("No analysis selected"); return; }
    try {
      const res = await fetch("/api/team/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, analysisId: activeAnalysisId }) });
      if (res.ok) toast.success("Analysis shared with team");
    } catch { toast.error("Failed to share"); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl"><GradientText>Team Collaboration</GradientText></h1>
          <p className="mt-1 text-sm text-muted-foreground">Share analyses, invite members, collaborate on code</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
          <Plus className="mr-1.5 h-4 w-4" /> New Team
        </Button>
      </motion.div>

      {showCreate && (
        <GlassCard className="mb-4 p-4">
          <div className="space-y-3">
            <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={createTeam} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">Create</Button>
              <Button onClick={() => setShowCreate(false)} variant="outline">Cancel</Button>
            </div>
          </div>
        </GlassCard>
      )}

      {loading ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">Loading teams...</GlassCard>
      ) : teams.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-violet-300/50" />
          <p className="mt-2 text-sm text-muted-foreground">No teams yet. Create one to start collaborating.</p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => (
            <GlassCard key={team.id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15">
                    <Users className="h-4 w-4 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{team.name}</p>
                    <p className="text-[10px] text-muted-foreground">{team.memberCount} members · {team.role}</p>
                  </div>
                </div>
              </div>
              {team.description && <p className="mt-2 text-xs text-muted-foreground">{team.description}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => shareAnalysis(team.id)} disabled={!activeAnalysisId}>
                  <Share2 className="mr-1 h-3 w-3" /> Share Analysis
                </Button>
                <Button size="sm" variant="outline"><UserPlus className="mr-1 h-3 w-3" /> Invite</Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
