"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScrollText,
  Search,
  X,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Copy,
  Pin,
  User,
  Bot,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Cpu,
  Hash,
  Clock,
} from "lucide-react";
import { useDeveloperModeStore, type AIRequestLog } from "@/lib/developer-mode-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

type LogFilter = "all" | "user" | "ai" | "error" | "warning" | "success";

const FILTERS: { id: LogFilter; label: string; color: string }[] = [
  { id: "all", label: "All", color: "#a78bfa" },
  { id: "user", label: "User", color: "#22d3ee" },
  { id: "ai", label: "AI", color: "#34d399" },
  { id: "error", label: "Error", color: "#ff5470" },
  { id: "warning", label: "Warning", color: "#fbbf24" },
  { id: "success", label: "Success", color: "#34d399" },
];

/**
 * RequestLogSidebar
 *
 * Redesigned "Nhật ký Yêu cầu / Phản hồi" panel — now a collapsible RIGHT
 * sidebar instead of a bottom panel that covered chat content.
 *
 * Features:
 * - 360px wide, full height, does NOT overlap chat area
 * - Collapse/Expand with arrow button (250ms animation)
 * - Search by content
 * - Filter: All / User / AI / Error / Warning / Success
 * - Log cards with avatar, name, time, truncated content
 * - Hover actions: Copy, Delete, Pin
 * - Independent scroll
 * - Footer: Clear all + Export JSON
 * - Mobile: Drawer (slides from right)
 */
export function RequestLogSidebar({
  collapsed,
  onToggleCollapse,
  onClose,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { t } = useT();
  const logs = useDeveloperModeStore((s) => s.logs);
  const clearLogs = useDeveloperModeStore((s) => s.clearLogs);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LogFilter>("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by type
    if (filter !== "all") {
      if (filter === "user") {
        // AIRequestLog doesn't store role, but we can infer from provider presence
        // For now, "user" shows logs with inputTokens > 0 (user sent a message)
        result = result.filter((l) => l.inputTokens > 0);
      } else if (filter === "ai") {
        result = result.filter((l) => l.outputTokens > 0);
      } else if (filter === "error") {
        result = result.filter((l) => l.status === "error");
      } else if (filter === "warning") {
        result = result.filter((l) => l.retryCount > 0 || l.statusCode >= 400);
      } else if (filter === "success") {
        result = result.filter((l) => l.status === "success");
      }
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.provider.toLowerCase().includes(q) ||
          l.model.toLowerCase().includes(q) ||
          l.personality.toLowerCase().includes(q) ||
          l.requestId.toLowerCase().includes(q) ||
          (l.error || "").toLowerCase().includes(q)
      );
    }

    // Pinned logs always on top
    return [...result].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.timestamp - a.timestamp;
    });
  }, [logs, filter, search, pinnedIds]);

  const handleCopy = (log: AIRequestLog) => {
    const text = `[${log.requestId}] ${log.provider}/${log.model} — ${log.statusCode} (${log.durationMs}ms)\nTokens: ${log.totalTokens} (in: ${log.inputTokens}, out: ${log.outputTokens})${log.error ? `\nError: ${log.error}` : ""}`;
    navigator.clipboard.writeText(text);
    toast.success("Log copied to clipboard");
  };

  const handlePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codeinsight-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${logs.length} logs`);
  };

  // Desktop sidebar content
  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
          <ScrollText className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold">Nhật ký Yêu cầu</h3>
          <p className="text-[10px] text-muted-foreground">Request / Response log</p>
        </div>
        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
          {filteredLogs.length}
        </span>
        <button
          onClick={onToggleCollapse}
          className="hidden rounded-md p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground md:block"
          aria-label="Collapse sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          aria-label="Close log panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm trong nhật ký..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-thin">
        <Filter className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition",
              filter === f.id
                ? "text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
            style={
              filter === f.id
                ? { background: `${f.color}20`, border: `1px solid ${f.color}40`, color: f.color }
                : { border: "1px solid rgba(255,255,255,0.08)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Log list — independent scroll */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 scrollbar-thin">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03]">
              <ScrollText className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {search || filter !== "all" ? "No logs match your filters" : "No requests logged yet"}
            </p>
            {(search || filter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
                className="mt-2 text-[10px] text-cyan-300 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              pinned={pinnedIds.has(log.id)}
              onCopy={() => handleCopy(log)}
              onPin={() => handlePin(log.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-3 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[11px] font-medium transition hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất JSON</span>
          </button>
          <button
            onClick={() => {
              if (confirm("Xóa tất cả nhật ký? Hành động này không thể hoàn tác.")) {
                clearLogs();
                setPinnedIds(new Set());
                toast.success("Đã xóa tất cả nhật ký");
              }
            }}
            disabled={logs.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 py-2 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa tất cả</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: right sidebar */}
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.aside
            key="desktop-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong relative hidden h-full shrink-0 overflow-hidden border-l border-white/10 md:block"
          >
            <div className="h-full w-[360px]">{sidebarContent}</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Collapse toggle (when collapsed) — floating button on right edge */}
      {collapsed && (
        <button
          onClick={onToggleCollapse}
          className="glass-strong absolute right-0 top-1/2 z-30 hidden -translate-y-1/2 items-center gap-1 rounded-l-xl border border-r-0 border-white/10 px-2 py-4 text-muted-foreground transition hover:bg-white/5 hover:text-foreground md:flex"
          aria-label="Expand log sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
          <ScrollText className="h-4 w-4" />
        </button>
      )}

      {/* Mobile: Drawer from right */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="glass-strong fixed right-0 top-0 z-50 h-full w-[85vw] max-w-[360px] border-l border-white/10 md:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- Log Card ---------- */
function LogCard({
  log,
  pinned,
  onCopy,
  onPin,
}: {
  log: AIRequestLog;
  pinned: boolean;
  onCopy: () => void;
  onPin: () => void;
}) {
  const isUser = log.inputTokens > 0 && log.outputTokens === 0;
  const isError = log.status === "error";
  const isWarning = log.retryCount > 0 || log.statusCode >= 400;

  const avatarColor = isError ? "#ff5470" : isWarning ? "#fbbf24" : isUser ? "#22d3ee" : "#34d399";
  const statusIcon = isError ? AlertCircle : isWarning ? AlertTriangle : CheckCircle2;
  const StatusIcon = statusIcon;

  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const displayName = isUser ? "Bạn" : "AI CTO";
  const contentPreview = log.error
    ? log.error.slice(0, 80)
    : `${log.provider}/${log.model} · ${log.personality} · ${log.totalTokens} tokens`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative rounded-xl border bg-white/[0.02] p-3 transition-all",
        pinned
          ? "border-cyan-400/30 bg-cyan-500/[0.04]"
          : "border-white/5 hover:border-cyan-400/20 hover:bg-white/[0.04]"
      )}
    >
      {/* Pinned indicator */}
      {pinned && (
        <Pin className="absolute right-2 top-2 h-3 w-3 fill-cyan-300 text-cyan-300" />
      )}

      {/* Top row: avatar + name + time + status */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${avatarColor}1a`, border: `1px solid ${avatarColor}33` }}
        >
          {isUser ? (
            <User className="h-3.5 w-3.5" style={{ color: avatarColor }} />
          ) : (
            <Bot className="h-3.5 w-3.5" style={{ color: avatarColor }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-semibold" style={{ color: avatarColor }}>
            {displayName}
          </p>
          <p className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {time}
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{log.durationMs}ms</span>
          </p>
        </div>
        <StatusIcon className="h-3.5 w-3.5 shrink-0" style={{ color: avatarColor }} />
      </div>

      {/* Content preview */}
      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {contentPreview}
      </p>

      {/* Meta chips */}
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Cpu className="h-2.5 w-2.5" />
          {log.provider}
        </span>
        <span className="flex items-center gap-0.5">
          <Hash className="h-2.5 w-2.5" />
          {log.totalTokens} tok
        </span>
        {log.retryCount > 0 && (
          <span className="text-amber-400">↻{log.retryCount}</span>
        )}
        <span style={{ color: avatarColor }}>{log.statusCode}</span>
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={onCopy}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-background/80 backdrop-blur-sm transition hover:border-cyan-400/30 hover:text-cyan-300"
          aria-label="Copy log"
          title="Copy"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={onPin}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-background/80 backdrop-blur-sm transition hover:border-cyan-400/30 hover:text-cyan-300",
            pinned && "text-cyan-300"
          )}
          aria-label={pinned ? "Unpin log" : "Pin log"}
          title={pinned ? "Unpin" : "Pin"}
        >
          <Pin className={cn("h-3 w-3", pinned && "fill-cyan-300")} />
        </button>
      </div>
    </motion.div>
  );
}
