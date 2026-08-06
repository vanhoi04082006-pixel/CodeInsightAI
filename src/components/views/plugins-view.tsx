"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Puzzle, Download, Check, Trash2, ShieldCheck } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PluginsView() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) { const data = await res.json(); setPlugins(data.marketplace || []); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const install = async (pluginId: string) => {
    try {
      const res = await fetch("/api/plugins/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pluginId }) });
      if (res.ok) { toast.success("Plugin installed!"); load(); }
      else toast.error("Failed to install");
    } catch { toast.error("Failed"); }
  };

  const uninstall = async (pluginId: string) => {
    try {
      const res = await fetch("/api/plugins/uninstall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pluginId }) });
      if (res.ok) { toast.success("Plugin uninstalled"); load(); }
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl"><GradientText>Plugin Marketplace</GradientText></h1>
        <p className="mt-1 text-sm text-muted-foreground">Extend the Agent with third-party tools, skills, and agent profiles</p>
      </motion.div>

      {loading ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">Loading plugins...</GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plugins.map((plugin) => (
            <GlassCard key={plugin.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-lg">{plugin.icon}</div>
                  <div>
                    <p className="text-sm font-semibold">{plugin.name}</p>
                    <p className="text-[10px] text-muted-foreground">v{plugin.version} · by {plugin.author}</p>
                  </div>
                </div>
                {plugin.verified && <ShieldCheck className="h-4 w-4 text-emerald-400" />}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{plugin.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase text-muted-foreground">{plugin.type}</span>
                  <span className="text-[10px] text-muted-foreground">{plugin.installs} installs</span>
                </div>
                {plugin.installed ? (
                  <Button size="sm" variant="outline" onClick={() => uninstall(plugin.id)} className="text-rose-300 hover:bg-rose-500/10">
                    <Trash2 className="mr-1 h-3 w-3" /> Uninstall
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => install(plugin.id)} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                    <Download className="mr-1 h-3 w-3" /> Install
                  </Button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
