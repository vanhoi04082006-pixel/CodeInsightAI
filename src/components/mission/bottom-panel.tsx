"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Terminal as TerminalIcon,
  GitBranch,
  FileDiff,
  ScrollText,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type {
  MissionEvent,
  TerminalLine,
  FileModified,
} from "@/lib/mission-store";
import { cn } from "@/lib/utils";
import {
  LiveTerminalConnected,
  type TerminalLine as LiveTerminalLine,
} from "./live-terminal";

interface BottomPanelProps {
  terminalOutput: TerminalLine[];
  events: MissionEvent[];
  filesModified: FileModified[];
  /** Called when the user runs a command in the terminal — pushes the line(s) into the upstream store. */
  onTerminalOutput?: (line: LiveTerminalLine) => void;
  className?: string;
}

function TerminalTab({
  lines,
  onTerminalOutput,
}: {
  lines: TerminalLine[];
  onTerminalOutput?: (line: LiveTerminalLine) => void;
}) {
  return (
    <LiveTerminalConnected
      output={lines}
      onCommandRun={onTerminalOutput}
      className="h-full"
    />
  );
}

function GitTab({
  filesModified,
}: {
  filesModified: FileModified[];
}) {
  const [diff, setDiff] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/git/operation?op=diff&path=${encodeURIComponent(selected)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setDiff(text || "// no diff returned");
      } catch {
        if (cancelled) return;
        setDiff(
          `// Diff preview for ${selected}\n// Connect a repository to fetch real git diff.\n` +
            filesModified
              .filter((f) => f.path === selected)
              .map(
                (f) =>
                  `@@ ${f.path} @@\n+${f.additions} additions\n-${f.deletions} deletions`
              )
              .join("\n")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selected, filesModified]);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[220px_1fr]">
      <div className="border-b border-white/5 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Changed files
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {filesModified.length}
          </span>
        </div>
        <div className="scrollbar-thin max-h-32 overflow-y-auto md:max-h-none">
          {filesModified.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/60">
              No changes yet.
            </p>
          ) : (
            filesModified.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelected(f.path)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition hover:bg-white/5",
                  selected === f.path && "bg-white/5"
                )}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      f.action === "added"
                        ? "#34d399"
                        : f.action === "deleted"
                        ? "#f472b6"
                        : "#a78bfa",
                  }}
                />
                <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {f.path}
                </code>
                <span className="font-mono text-[9px] text-emerald-400">+{f.additions}</span>
                {f.deletions > 0 && (
                  <span className="font-mono text-[9px] text-rose-400">-{f.deletions}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-auto bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
        {!selected && (
          <p className="text-muted-foreground/60">
            Select a file on the left to view its diff.
          </p>
        )}
        {selected && loading && (
          <p className="text-muted-foreground/60">Loading diff…</p>
        )}
        {selected && !loading && (
          <pre className="whitespace-pre-wrap break-words text-emerald-200/90">{diff}</pre>
        )}
      </div>
    </div>
  );
}

function FileDiffTab({
  filesModified,
}: {
  filesModified: FileModified[];
}) {
  // Derive the selected file lazily from props — no setState-in-effect needed.
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const selected =
    selectedOverride ?? (filesModified[0]?.path ?? null);
  const file = filesModified.find((f) => f.path === selected);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[220px_1fr]">
      <div className="border-b border-white/5 md:border-b-0 md:border-r">
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Files Modified
        </div>
        <div className="scrollbar-thin max-h-32 overflow-y-auto md:max-h-none">
          {filesModified.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/60">
              No modified files yet.
            </p>
          ) : (
            filesModified.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedOverride(f.path)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition hover:bg-white/5",
                  selected === f.path && "bg-white/5"
                )}
              >
                <FileDiff className="h-3 w-3 shrink-0 text-violet-300" />
                <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {f.path}
                </code>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-auto bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
        {!file && (
          <p className="text-muted-foreground/60">No file selected.</p>
        )}
        {file && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-300">
              <FileDiff className="h-3.5 w-3.5" />
              <code className="text-xs">{file.path}</code>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                {file.action}
              </span>
              <span className="ml-auto text-emerald-400">+{file.additions}</span>
              {file.deletions > 0 && (
                <span className="text-rose-400">-{file.deletions}</span>
              )}
            </div>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
{`// Synthetic diff preview
// Real diff fetched from /api/git/operation?op=diff&path=${encodeURIComponent(file.path)}

@@ -1,${file.deletions || 1} +1,${file.additions || 1} @@
- [removed line]
+ [added line]
`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function LogsTab({ events }: { events: MissionEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Raw Event Log
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
          className="h-6 gap-1 px-2 text-[10px]"
        >
          <ScrollText className="h-3 w-3" />
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
      </div>
      <div
        ref={ref}
        className="scrollbar-thin h-full overflow-y-auto bg-black/40 p-3 font-mono text-[10px] leading-relaxed"
      >
        {events.length === 0 ? (
          <p className="text-muted-foreground/60">No events logged.</p>
        ) : (
          events
            .slice()
            .reverse()
            .map((e, i) => (
              <div key={`${e.id}-${i}`} className="mb-1 break-words text-muted-foreground/80">
                <span className="text-cyan-300/80">
                  {new Date(e.timestamp).toISOString()}
                </span>{" "}
                <span className="text-violet-300/80">{e.type}</span>{" "}
                <span>{JSON.stringify({ ...e, id: undefined, timestamp: undefined, type: undefined })}</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export function BottomPanel({
  terminalOutput,
  events,
  filesModified,
  onTerminalOutput,
  className,
}: BottomPanelProps) {
  const [tab, setTab] = useState("terminal");

  return (
    <div className={cn("flex flex-col", className)}>
      <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/5 px-2">
          <TabsList className="h-auto bg-transparent p-1">
            <TabsTrigger
              value="terminal"
              className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
            >
              <TerminalIcon className="h-3 w-3" /> Terminal
            </TabsTrigger>
            <TabsTrigger
              value="git"
              className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
            >
              <GitBranch className="h-3 w-3" /> Git
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
            >
              <FileDiff className="h-3 w-3" /> File Diff
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="gap-1.5 rounded-md px-2.5 py-1 text-[11px] data-[state=active]:bg-white/5"
            >
              <ScrollText className="h-3 w-3" /> Logs
              <span className="ml-1 rounded-full bg-white/5 px-1 text-[9px] text-muted-foreground">
                {events.length}
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1 pr-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
              title="Clear"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <motion.div
          key={tab}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="min-h-0 flex-1"
        >
          <TabsContent value="terminal" className="mt-0 h-full">
            <TerminalTab
              lines={terminalOutput}
              onTerminalOutput={onTerminalOutput}
            />
          </TabsContent>
          <TabsContent value="git" className="mt-0 h-full">
            <GitTab filesModified={filesModified} />
          </TabsContent>
          <TabsContent value="diff" className="mt-0 h-full">
            <FileDiffTab filesModified={filesModified} />
          </TabsContent>
          <TabsContent value="logs" className="mt-0 h-full">
            <LogsTab events={events} />
          </TabsContent>
        </motion.div>
      </Tabs>
    </div>
  );
}
