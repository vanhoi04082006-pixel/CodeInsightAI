"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Play,
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  Filter,
  Loader2,
  CornerDownLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TerminalLine {
  stream: "stdout" | "stderr" | "system";
  data: string;
  timestamp: number;
}

interface LiveTerminalProps {
  output: TerminalLine[];
  onRunCommand?: (command: string) => Promise<void>;
  history?: string[];
  className?: string;
}

type StreamFilter = "all" | "stdout" | "stderr";

// ── ANSI parsing ─────────────────────────────────────────────────────────────

// Basic ANSI escape sequence parser. Strips the escape codes and applies
// a color based on the most-recent SGR (Select Graphic Rendition) sequence.
// Supports the common 8-color + bright variants + 256-color + reset.

interface AnsiToken {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "#475569", // black → slate-600
  31: "#f472b6", // red → rose-400
  32: "#34d399", // green → emerald-400
  33: "#fbbf24", // yellow → amber-400
  34: "#22d3ee", // (no blue in palette, but kept for completeness) cyan-400
  35: "#a78bfa", // magenta → violet-400
  36: "#22d3ee", // cyan → cyan-400
  37: "#e2e8f0", // white → slate-200
  // Bright variants (90-97)
  90: "#64748b",
  91: "#fb7185",
  92: "#4ade80",
  93: "#facc15",
  94: "#38bdf8",
  95: "#c084fc",
  96: "#67e8f9",
  97: "#f8fafc",
};

function parseAnsi(input: string): AnsiToken[] {
  if (!input.includes("\x1b[")) {
    return [{ text: input }];
  }

  const tokens: AnsiToken[] = [];
  const re = /\x1b\[([\d;]*)m/g;
  let last = 0;
  let currentColor: string | undefined;
  let bold = false;
  let dim = false;
  let italic = false;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    // Push preceding text
    if (match.index > last) {
      tokens.push({
        text: input.slice(last, match.index),
        color: currentColor,
        bold,
        dim,
        italic,
      });
    }
    const codes = match[1]
      ? match[1].split(";").map((n) => parseInt(n, 10))
      : [0];
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        bold = false;
        dim = false;
        italic = false;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 3) italic = true;
      else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 23) italic = false;
      else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code];
      } else if (code >= 38 && code <= 39) {
        // 38;5;n or 38;2;r;g;b — handled by next iteration
      } else if (code === 39) {
        currentColor = undefined;
      }
    }
    last = match.index + match[0].length;
  }
  if (last < input.length) {
    tokens.push({
      text: input.slice(last),
      color: currentColor,
      bold,
      dim,
      italic,
    });
  }
  return tokens;
}

// ── Component ────────────────────────────────────────────────────────────────

export function LiveTerminal({
  output,
  onRunCommand,
  history = [],
  className,
}: LiveTerminalProps) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<StreamFilter>("all");
  const [localHistory, setLocalHistory] = useState<string[]>(history);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge incoming history prop into local state (newest first).
  // Use a stable string key for comparison — the `history` array prop
  // gets a new reference on every parent render, which would cause
  // infinite re-renders if we depend on the array reference directly.
  const historyKey = history.join("\n");
  useEffect(() => {
    setLocalHistory((prev) => {
      const merged = [...new Set([...history, ...prev])];
      const next = merged.slice(0, 50);
      // Only update if content actually changed (avoid setState loop)
      if (next.join("\n") === prev.join("\n")) return prev;
      return next;
    });
  }, [historyKey, history]);

  // Auto-scroll to bottom when new output arrives (if user hasn't scrolled up).
  useEffect(() => {
    if (!autoscroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output, autoscroll]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoscroll(atBottom);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return output;
    return output.filter((l) => l.stream === filter);
  }, [output, filter]);

  const onRun = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || !onRunCommand) return;
    setRunning(true);
    try {
      await onRunCommand(cmd);
      setLocalHistory((prev) => {
        const next = [cmd, ...prev.filter((c) => c !== cmd)];
        return next.slice(0, 50);
      });
      setHistoryIdx(-1);
      setInput("");
    } catch {
      toast.error("Command failed");
    } finally {
      setRunning(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [input, onRunCommand]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void onRun();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (localHistory.length === 0) return;
        const next = historyIdx < 0 ? 0 : Math.min(historyIdx + 1, localHistory.length - 1);
        setHistoryIdx(next);
        setInput(localHistory[next] ?? "");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx < 0) return;
        const next = historyIdx - 1;
        setHistoryIdx(next);
        setInput(next < 0 ? "" : localHistory[next] ?? "");
      } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Clear screen — emit a system line via onRunCommand if available
        if (onRunCommand) void onRunCommand("clear");
      }
    },
    [historyIdx, localHistory, onRun]
  );

  const onClear = useCallback(() => {
    // We can't actually clear the upstream store from here, but we can emit
    // a synthetic "clear" via onRunCommand, OR just visually scroll to top.
    if (onRunCommand) void onRunCommand("clear");
    setAutoscroll(true);
  }, [onRunCommand]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            mission@sandbox:~$
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Stream filter */}
          <FilterButtons filter={filter} onChange={setFilter} />
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
            title="Clear terminal"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-black/40 p-3 font-mono text-[11px] leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {output.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-muted-foreground/60">
            <TerminalIcon className="h-5 w-5" />
            <p className="text-xs">
              Terminal output from agents (test runs, build logs) will appear here.
            </p>
            {onRunCommand && (
              <p className="text-[10px] text-muted-foreground/40">
                Type a command below and press Enter to run it.
              </p>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground/60">
            No {filter} output. Switch the filter to see other streams.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((l, i) => (
              <TerminalLineRow key={`${l.timestamp}-${i}`} line={l} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Command input */}
      {onRunCommand && (
        <div className="flex items-center gap-2 border-t border-white/5 bg-black/30 px-3 py-1.5">
          <span className="font-mono text-[11px] text-emerald-400">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="bun run lint"
            className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40"
            spellCheck={false}
            autoComplete="off"
          />
          {historyIdx >= 0 && (
            <span className="font-mono text-[9px] text-muted-foreground/60">
              {historyIdx + 1}/{localHistory.length}
            </span>
          )}
          <Button
            size="sm"
            onClick={onRun}
            disabled={running || !input.trim()}
            className="h-6 gap-1 px-2 text-[10px]"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">Run</span>
            <CornerDownLeft className="h-2.5 w-2.5 opacity-60 sm:hidden" />
          </Button>
        </div>
      )}

      {/* History scrubber (when local history is non-empty) */}
      {localHistory.length > 0 && (
        <div className="flex items-center gap-1 border-t border-white/5 bg-black/20 px-3 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </span>
          <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {localHistory.slice(0, 12).map((h, i) => (
              <button
                key={`${h}-${i}`}
                onClick={() => {
                  setInput(h);
                  inputRef.current?.focus();
                }}
                className="shrink-0 rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
                title={h}
              >
                {h.length > 24 ? h.slice(0, 22) + "…" : h}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                if (localHistory.length === 0) return;
                const next = historyIdx < 0 ? 0 : Math.min(historyIdx + 1, localHistory.length - 1);
                setHistoryIdx(next);
                setInput(localHistory[next] ?? "");
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-white/5"
              title="Previous command"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                if (historyIdx < 0) return;
                const next = historyIdx - 1;
                setHistoryIdx(next);
                setInput(next < 0 ? "" : localHistory[next] ?? "");
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-white/5"
              title="Next command"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButtons({
  filter,
  onChange,
}: {
  filter: StreamFilter;
  onChange: (f: StreamFilter) => void;
}) {
  const options: { value: StreamFilter; label: string; color: string }[] = [
    { value: "all", label: "All", color: "#94a3b8" },
    { value: "stdout", label: "out", color: "#34d399" },
    { value: "stderr", label: "err", color: "#f472b6" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/5 bg-white/[0.02] p-0.5">
      <Filter className="mr-0.5 h-2.5 w-2.5 text-muted-foreground/60" />
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase transition",
            filter === o.value
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground/60 hover:text-foreground"
          )}
          style={filter === o.value ? { color: o.color } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TerminalLineRow({ line }: { line: TerminalLine }) {
  // Detect simple ANSI codes for color support.
  const tokens = useMemo(() => parseAnsi(line.data), [line.data]);
  const streamColor =
    line.stream === "stderr"
      ? "#f472b6"
      : line.stream === "system"
      ? "#22d3ee"
      : "#e2e8f0";

  return (
    <motion.div
      initial={{ opacity: 0.4, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="whitespace-pre-wrap break-words"
      style={{ color: streamColor }}
    >
      {tokens.length === 1 && !tokens[0].color ? (
        line.data
      ) : (
        tokens.map((t, i) => (
          <span
            key={i}
            style={{
              color: t.color ?? streamColor,
              fontWeight: t.bold ? 600 : 400,
              opacity: t.dim ? 0.6 : 1,
              fontStyle: t.italic ? "italic" : undefined,
            }}
          >
            {t.text}
          </span>
        ))
      )}
    </motion.div>
  );
}

// ── Convenience wrapper: pre-wires onRunCommand to POST /api/terminal/run ────

interface LiveTerminalConnectedProps {
  output: TerminalLine[];
  onCommandRun?: (line: TerminalLine) => void;
  history?: string[];
  className?: string;
}

/**
 * LiveTerminal pre-wired to POST /api/terminal/run. Calls `onCommandRun`
 * for each output line so the parent can append it to its store.
 */
export function LiveTerminalConnected({
  output,
  onCommandRun,
  history,
  className,
}: LiveTerminalConnectedProps) {
  const runCommand = useCallback(
    async (command: string) => {
      if (command === "clear") {
        // Special-case: clear is handled locally by the parent.
        onCommandRun?.({
          stream: "system",
          data: "clear",
          timestamp: Date.now(),
        });
        return;
      }
      // Echo the command back to the terminal
      onCommandRun?.({
        stream: "system",
        data: `$ ${command}`,
        timestamp: Date.now(),
      });
      try {
        const res = await fetch("/api/terminal/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        });
        const data = (await res.json()) as {
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          error?: string;
        };
        if (data.stdout) {
          onCommandRun?.({
            stream: "stdout",
            data: data.stdout,
            timestamp: Date.now(),
          });
        }
        if (data.stderr) {
          onCommandRun?.({
            stream: "stderr",
            data: data.stderr,
            timestamp: Date.now(),
          });
        }
        if (data.error) {
          onCommandRun?.({
            stream: "stderr",
            data: data.error,
            timestamp: Date.now(),
          });
        }
        if (typeof data.exitCode === "number") {
          onCommandRun?.({
            stream: "system",
            data: `→ exit ${data.exitCode}`,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        onCommandRun?.({
          stream: "stderr",
          data: `Failed to run command: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
          timestamp: Date.now(),
        });
      }
    },
    [onCommandRun]
  );

  return (
    <LiveTerminal
      output={output}
      onRunCommand={runCommand}
      history={history}
      className={className}
    />
  );
}

// Badge export for parents that want to show stream counts
export function StreamCountBadge({
  output,
  stream,
}: {
  output: TerminalLine[];
  stream: "stdout" | "stderr";
}) {
  const count = output.filter((l) => l.stream === stream).length;
  if (count === 0) return null;
  return (
    <Badge
      variant="outline"
      className="h-4 border-transparent px-1 text-[9px] tabular-nums"
      style={{
        background:
          stream === "stderr" ? "#f472b61a" : "#34d3991a",
        color: stream === "stderr" ? "#f472b6" : "#34d399",
      }}
    >
      {count}
    </Badge>
  );
}
