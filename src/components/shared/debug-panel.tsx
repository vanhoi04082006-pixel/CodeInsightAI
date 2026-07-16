"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock,
  Cpu,
  Gauge,
  Hash,
  ListChecks,
  Quote,
  ScrollText,
  Sparkles,
  Thermometer,
  Zap,
  Brain,
  Eye,
  Wrench,
  FileSearch,
  Network,
  DollarSign,
  Download,
  Terminal,
  Shield,
} from "lucide-react";
import { GlassCard, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useDeveloperModeStore, type DebugSnapshot, type AIRequestLog } from "@/lib/developer-mode-store";
import { maskSecrets } from "@/lib/secret-mask";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ============================================================
   Main expandable Developer Panel
   ============================================================ */
export function DeveloperPanel({ snapshot }: { snapshot: DebugSnapshot | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const enabled = useDeveloperModeStore((s) => s.enabled);
  if (!enabled) return null;

  return (
    <GlassCard className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
          <Terminal className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{t("developer", "panel")}</p>
          <p className="text-[11px] text-muted-foreground">
            {snapshot ? `Last request · ${snapshot.totalMs}ms · ${snapshot.totalTokens} tokens` : "No requests yet"}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && snapshot && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="space-y-3 p-3">
              <TokenUsageCard snapshot={snapshot} />
              <ResponseTimeCard snapshot={snapshot} />
              <ModelInfoCard snapshot={snapshot} />
              <PromptDebugger snapshot={snapshot} />
              <ModelDebugger snapshot={snapshot} />
              <RawResponseViewer snapshot={snapshot} />
              <AdvancedDebugCard snapshot={snapshot} />
              <ExportButtons snapshot={snapshot} />
            </div>
          </motion.div>
        )}
        {open && !snapshot && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5 p-4 text-center text-xs text-muted-foreground"
          >
            {t("developer", "sendToPopulate")}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

/* ============================================================
   Token Usage Card
   ============================================================ */
export function TokenUsageCard({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showTokenUsage);
  if (!show) return null;
  return (
    <DebugSection icon={Hash} title="Token Usage" color="#22d3ee">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Input" value={snapshot.inputTokens} icon={ArrowDown} color="#22d3ee" />
        <Metric label="Output" value={snapshot.outputTokens} icon={ArrowUp} color="#34d399" />
        <Metric label="Total" value={snapshot.totalTokens} icon={Hash} color="#a78bfa" highlight />
      </div>
      {snapshot.tokenCostEstimate && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          est. cost: {snapshot.tokenCostEstimate.totalCost.toFixed(4)} {snapshot.tokenCostEstimate.currency}
        </div>
      )}
    </DebugSection>
  );
}

/* ============================================================
   Response Time Card
   ============================================================ */
export function ResponseTimeCard({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showResponseTime);
  if (!show) return null;
  return (
    <DebugSection icon={Clock} title="Performance" color="#fbbf24">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Queue" value={`${snapshot.queueMs}ms`} icon={Clock} color="#fbbf24" />
        <Metric label="Generation" value={`${snapshot.generationMs}ms`} icon={Zap} color="#34d399" />
        <Metric label="Total" value={`${snapshot.totalMs}ms`} icon={Gauge} color="#22d3ee" highlight />
        <Metric label="Tokens/s" value={snapshot.generationMs > 0 ? Math.round(snapshot.outputTokens / (snapshot.generationMs / 1000)) : 0} icon={Activity} color="#a78bfa" />
      </div>
    </DebugSection>
  );
}

/* ============================================================
   Model Info Card
   ============================================================ */
export function ModelInfoCard({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showModelDebug);
  if (!show) return null;
  return (
    <DebugSection icon={Cpu} title="Model Information" color="#a78bfa">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <Row label="Provider" value={snapshot.provider} />
        <Row label="Model" value={snapshot.model} />
        <Row label="Personality" value={snapshot.personality} />
        <Row label="Context window" value={snapshot.contextWindow.toLocaleString()} />
        <Row label="Temperature" value={snapshot.temperature.toFixed(2)} />
        <Row label="Max tokens" value={snapshot.maxTokens === -1 ? "∞" : snapshot.maxTokens} />
        <Row label="Streaming" value={snapshot.streaming ? "on" : "off"} />
      </div>
    </DebugSection>
  );
}

/* ============================================================
   Prompt Debugger
   ============================================================ */
export function PromptDebugger({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showPromptDebug);
  if (!show) return null;
  return (
    <DebugSection icon={Quote} title="Prompt Debug" color="#34d399">
      <CollapsibleText label="System Prompt" text={maskSecrets(snapshot.systemPrompt)} />
      <CollapsibleText label="User Prompt" text={maskSecrets(snapshot.userPrompt)} />
      <CollapsibleText label="Repository Context" text={maskSecrets(snapshot.repositoryContext)} />
      {snapshot.retrievedChunks.length > 0 && (
        <div>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">Retrieved Chunks ({snapshot.retrievedChunks.length})</p>
          <div className="mt-1 space-y-1">
            {snapshot.retrievedChunks.map((c, i) => (
              <div key={i} className="rounded border border-white/5 bg-black/30 p-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-mono text-cyan-300">{c.path}</span>
                  <span className="text-amber-400">score {c.score.toFixed(3)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{c.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <CollapsibleText label="Final Prompt Sent to AI" text={maskSecrets(snapshot.finalPrompt)} defaultOpen={false} />
    </DebugSection>
  );
}

/* ============================================================
   Model Debugger
   ============================================================ */
export function ModelDebugger({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showModelDebug);
  if (!show) return null;
  const caps = snapshot.capabilities;
  return (
    <DebugSection icon={Brain} title="Model Capabilities" color="#f472b6">
      <div className="grid grid-cols-2 gap-2">
        <Capability label="Vision" supported={caps.vision} icon={Eye} />
        <Capability label="Tool calling" supported={caps.toolCalling} icon={Wrench} />
        <Capability label="Function calling" supported={caps.functionCalling} icon={Wrench} />
        <Capability label="Reasoning" supported={caps.reasoning} icon={Brain} />
      </div>
    </DebugSection>
  );
}

/* ============================================================
   Raw Response Viewer
   ============================================================ */
export function RawResponseViewer({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showRawResponse);
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <DebugSection icon={ScrollText} title="Raw AI Response" color="#60a5fa">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {open ? "Hide" : "Show"} raw response ({snapshot.rawResponse.length} chars)
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-foreground/70 scrollbar-thin">
{maskSecrets(snapshot.rawResponse)}
        </pre>
      )}
    </DebugSection>
  );
}

/* ============================================================
   Advanced Debug (embeddings, vector search, chunk ranking, etc.)
   ============================================================ */
export function AdvancedDebugCard({ snapshot }: { snapshot: DebugSnapshot }) {
  const show = useDeveloperModeStore((s) => s.showAdvancedDebug);
  if (!show) return null;
  return (
    <DebugSection icon={FileSearch} title="Advanced Debugging" color="#fb7185">
      {snapshot.embeddingResults && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Embedding Results ({snapshot.embeddingResults.length})</p>
          <div className="mt-1 space-y-0.5">
            {snapshot.embeddingResults.slice(0, 5).map((e) => (
              <div key={e.id} className="flex justify-between text-[10px]">
                <span className="font-mono text-cyan-300">{e.id}</span>
                <span className="text-amber-400">{e.score.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {snapshot.vectorSearchResults && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vector Search Results ({snapshot.vectorSearchResults.length})</p>
          <div className="mt-1 space-y-1">
            {snapshot.vectorSearchResults.slice(0, 3).map((v) => (
              <div key={v.id} className="rounded border border-white/5 bg-black/30 p-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="font-mono text-cyan-300">{v.id}</span>
                  <span className="text-amber-400">{v.score.toFixed(4)}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-muted-foreground">{v.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {snapshot.chunkRanking && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Chunk Ranking</p>
          <div className="mt-1 space-y-0.5">
            {snapshot.chunkRanking.slice(0, 5).map((c) => (
              <div key={c.path} className="flex items-center gap-2 text-[10px]">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-white/10 text-[9px]">{c.rank}</span>
                <span className="flex-1 truncate font-mono text-cyan-300">{c.path}</span>
                <span className="text-amber-400">{c.score.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {snapshot.repositoryIndex && (
          <MiniStat icon={FileSearch} label="Repo index" value={`${snapshot.repositoryIndex.files}f / ${snapshot.repositoryIndex.chunks}c / ${snapshot.repositoryIndex.embeddings}e`} />
        )}
        {snapshot.dependencyGraphData && (
          <MiniStat icon={Network} label="Dep graph" value={`${snapshot.dependencyGraphData.nodes}n / ${snapshot.dependencyGraphData.edges}e / ${snapshot.dependencyGraphData.circular}cyc`} />
        )}
        {snapshot.staticAnalysisOutput && (
          <MiniStat icon={ListChecks} label="Static analysis" value={`${snapshot.staticAnalysisOutput.issues}iss`} />
        )}
        {snapshot.tokenCostEstimate && (
          <MiniStat icon={DollarSign} label="Token cost" value={`${snapshot.tokenCostEstimate.totalCost.toFixed(4)} ${snapshot.tokenCostEstimate.currency}`} />
        )}
      </div>
    </DebugSection>
  );
}

/* ============================================================
   Request / Response Log Viewer
   ============================================================ */
export function LogViewer() {
  const show = useDeveloperModeStore((s) => s.showRequestLogs || s.showResponseLogs);
  const logs = useDeveloperModeStore((s) => s.logs);
  const clearLogs = useDeveloperModeStore((s) => s.clearLogs);
  if (!show) return null;
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold">{t("developer", "logs.title")}</h3>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{logs.length}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={clearLogs} className="h-7 text-xs">{t("developer", "logs.clear")}</Button>
      </div>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto scrollbar-thin">
        {logs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No requests logged yet.</p>
        ) : (
          logs.map((log) => <LogRow key={log.id} log={log} />)
        )}
      </div>
    </GlassCard>
  );
}

function LogRow({ log }: { log: AIRequestLog }) {
  const statusColor = log.status === "success" ? "#34d399" : log.status === "error" ? "#fb7185" : "#fbbf24";
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
        <span className="font-mono text-cyan-300">{log.requestId.slice(0, 12)}</span>
        <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
        <span className="ml-auto text-muted-foreground">{log.durationMs}ms</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span><Cpu className="mr-0.5 inline h-2.5 w-2.5" />{log.provider}/{log.model}</span>
        <span><Sparkles className="mr-0.5 inline h-2.5 w-2.5" />{log.personality}</span>
        <span><Hash className="mr-0.5 inline h-2.5 w-2.5" />{log.totalTokens} tok</span>
        {log.retryCount > 0 && <span className="text-amber-400">↻{log.retryCount}</span>}
        <span style={{ color: statusColor }}>{log.statusCode}</span>
      </div>
      {log.error && <p className="mt-1 text-[10px] text-rose-400">{maskSecrets(log.error)}</p>}
    </div>
  );
}

/* ============================================================
   Export buttons
   ============================================================ */
function ExportButtons({ snapshot }: { snapshot: DebugSnapshot }) {
  const exportAs = (format: "json" | "markdown" | "txt") => {
    let content: string;
    let mime: string;
    let ext: string;
    const safe = maskSecrets;
    if (format === "json") {
      // deep-mask the snapshot
      const masked = JSON.parse(safe(JSON.stringify(snapshot)));
      content = JSON.stringify(masked, null, 2);
      mime = "application/json";
      ext = "json";
    } else if (format === "markdown") {
      content = `# Debug Snapshot\n\n- **Request ID:** ${snapshot.requestId}\n- **Timestamp:** ${new Date(snapshot.timestamp).toISOString()}\n- **Provider:** ${snapshot.provider}\n- **Model:** ${snapshot.model}\n- **Personality:** ${snapshot.personality}\n- **Tokens:** ${snapshot.inputTokens} in / ${snapshot.outputTokens} out / ${snapshot.totalTokens} total\n- **Duration:** ${snapshot.totalMs}ms (queue ${snapshot.queueMs}ms, gen ${snapshot.generationMs}ms)\n\n## System Prompt\n\`\`\`\n${safe(snapshot.systemPrompt)}\n\`\`\`\n\n## User Prompt\n\`\`\`\n${safe(snapshot.userPrompt)}\n\`\`\`\n\n## Raw Response\n\`\`\`\n${safe(snapshot.rawResponse)}\n\`\`\`\n`;
      mime = "text/markdown";
      ext = "md";
    } else {
      content = `CodeInsight AI — Debug Snapshot\n================================\nRequest ID: ${snapshot.requestId}\nTimestamp: ${new Date(snapshot.timestamp).toISOString()}\nProvider: ${snapshot.provider}\nModel: ${snapshot.model}\nPersonality: ${snapshot.personality}\nTemperature: ${snapshot.temperature}\nMax Tokens: ${snapshot.maxTokens}\nStreaming: ${snapshot.streaming}\n\nTokens:\n  Input:  ${snapshot.inputTokens}\n  Output: ${snapshot.outputTokens}\n  Total:  ${snapshot.totalTokens}\n\nTiming:\n  Queue:      ${snapshot.queueMs}ms\n  Generation: ${snapshot.generationMs}ms\n  Total:      ${snapshot.totalMs}ms\n\n--- System Prompt ---\n${safe(snapshot.systemPrompt)}\n\n--- User Prompt ---\n${safe(snapshot.userPrompt)}\n\n--- Raw Response ---\n${safe(snapshot.rawResponse)}\n`;
      mime = "text/plain";
      ext = "txt";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codeinsight-debug-${snapshot.requestId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportAs("json")}><Download className="mr-1 h-3 w-3" /> JSON</Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportAs("markdown")}><Download className="mr-1 h-3 w-3" /> Markdown</Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportAs("txt")}><Download className="mr-1 h-3 w-3" /> TXT</Button>
    </div>
  );
}

/* ============================================================
   Shared sub-components
   ============================================================ */
function DebugSection({ icon: Icon, title, color, children }: { icon: typeof Hash; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color, highlight }: { label: string; value: string | number; icon: typeof Hash; color: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2 text-center", highlight ? "border-white/15 bg-white/[0.04]" : "border-white/5 bg-black/20")}>
      <Icon className="mx-auto h-3 w-3" style={{ color }} />
      <p className="mt-1 text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Capability({ label, supported, icon: Icon }: { label: string; supported: boolean; icon: typeof Eye }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border p-2", supported ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-white/5 bg-white/[0.02]")}>
      <Icon className={cn("h-3.5 w-3.5", supported ? "text-emerald-400" : "text-muted-foreground")} />
      <span className="text-[11px]">{label}</span>
      <span className={cn("ml-auto text-[10px] font-semibold", supported ? "text-emerald-400" : "text-muted-foreground")}>{supported ? "yes" : "no"}</span>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-0.5 text-xs font-medium">{value}</p>
    </div>
  );
}

function CollapsibleText({ label, text, defaultOpen = true }: { label: string; text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {label} ({text.length} chars)
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-white/5 bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-foreground/70 scrollbar-thin">
{text}
        </pre>
      )}
    </div>
  );
}
