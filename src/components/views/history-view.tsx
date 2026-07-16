"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  History as HistoryIcon,
  FolderGit2,
  Star,
  Trash2,
  Search,
  Sparkles,
  Clock,
  ShieldCheck,
  Gauge,
  Network,
  Wrench,
  Code2,
  Loader2,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import type { AnalysisReport } from "@/lib/types";
import { toast } from "sonner";

interface HistoryItem {
  id: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  status: string;
  overallScore: number;
  securityScore: number;
  performanceScore: number;
  architectureScore: number;
  maintainabilityScore: number;
  codeQualityScore: number;
  primaryLanguage: string | null;
  totalFiles: number;
  totalLines: number;
  languages: { name: string; color: string; percentage: number }[];
  frameworks: { name: string }[];
  messageCount: number;
  createdAt: string;
}

export function HistoryView() {
  const setView = useAppStore((s) => s.setView);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const [filter, setFilter] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const res = await fetch("/api/analyze?limit=30");
      const d = await res.json();
      return d.items as HistoryItem[];
    },
  });

  const items = (data ?? []).filter(
    (i) =>
      !filter ||
      `${i.repoOwner}/${i.repoName}`.toLowerCase().includes(filter.toLowerCase()) ||
      (i.primaryLanguage ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const open = async (item: HistoryItem) => {
    // fetch full report then load into project view
    try {
      const res = await fetch(`/api/report?id=${item.id}`);
      const d = await res.json();
      if (d.report) {
        setActiveReport(d.report as AnalysisReport);
        setView("project");
        toast.success(`Loaded ${item.repoOwner}/${item.repoName}`);
      }
    } catch {
      toast.error("Failed to load report");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">
            Analysis <GradientText>History</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">All repositories you've analysed, ranked by recency.</p>
        </div>
        <Button onClick={() => setView("analyze")} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
          <Sparkles className="mr-1.5 h-4 w-4" /> New analysis
        </Button>
      </motion.div>

      <div className="mt-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by repo or language…"
            className="bg-white/[0.03] pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="mt-10 p-12 text-center">
          <HistoryIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">No analyses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Run your first analysis to see it here.</p>
        </GlassCard>
      ) : (
        <div className="mt-5 grid gap-3">
          {items.map((item, i) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => open(item)}
              className="group text-left"
            >
              <GlassCard hover className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <FolderGit2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.repoOwner}/{item.repoName}
                      <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.repoBranch}</span>
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleString()}
                      <span>·</span>
                      <span>{item.primaryLanguage ?? "Unknown"}</span>
                      <span>·</span>
                      <span>{item.totalFiles} files</span>
                      {item.messageCount > 0 && (<><span>·</span><span>{item.messageCount} chats</span></>)}
                    </p>
                  </div>

                  {/* mini scores */}
                  <div className="flex flex-wrap gap-2">
                    <MiniScore icon={ShieldCheck} value={item.securityScore} color="#f472b6" label="Sec" />
                    <MiniScore icon={Gauge} value={item.performanceScore} color="#34d399" label="Perf" />
                    <MiniScore icon={Network} value={item.architectureScore} color="#a78bfa" label="Arch" />
                    <MiniScore icon={Code2} value={item.codeQualityScore} color="#60a5fa" label="Qual" />
                  </div>

                  {/* overall */}
                  <div className="flex flex-col items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Overall</span>
                    <span className="text-xl font-bold tabular-nums text-cyan-300">{item.overallScore}</span>
                  </div>
                </div>

                {/* language bars */}
                {item.languages?.length > 0 && (
                  <>
                    <NeonDivider className="my-3" />
                    <div className="flex items-center gap-3">
                      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
                        {item.languages.slice(0, 6).map((l, j) => (
                          <div key={j} style={{ width: `${l.percentage}%`, background: l.color }} className="h-full" />
                        ))}
                      </div>
                      <div className="hidden gap-2 sm:flex">
                        {item.languages.slice(0, 4).map((l, j) => (
                          <span key={j} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                            {l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </GlassCard>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniScore({ icon: Icon, value, color, label }: { icon: typeof Star; value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
      <Icon className="h-3 w-3" style={{ color }} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
