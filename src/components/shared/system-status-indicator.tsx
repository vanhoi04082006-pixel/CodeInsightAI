"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Activity, Cloud, ChevronDown, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceStatus = "ok" | "degraded" | "down" | "unknown";
type HealthResponse = {
  status: string;
  latencyMs: number;
  services: {
    database: ServiceStatus;
    jobQueue: ServiceStatus;
    github: ServiceStatus;
  };
};

const STATUS_CONFIG: Record<ServiceStatus, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  ok: { color: "#34d399", label: "Operational", icon: CheckCircle2 },
  degraded: { color: "#fbbf24", label: "Degraded", icon: AlertCircle },
  down: { color: "#ff5470", label: "Down", icon: XCircle },
  unknown: { color: "#64748b", label: "Unknown", icon: AlertCircle },
};

/**
 * SystemStatusIndicator
 *
 * Polls /api/health every 60s and shows a compact system status dot
 * in the topbar. On hover/click, expands to show per-service status
 * (database, job queue, GitHub API) and the last measured latency.
 *
 * Helps users quickly see whether CodeInsight AI's backend is healthy
 * — especially useful when diagnosing "why won't my analysis run".
 */
export function SystemStatusIndicator() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch health every 60s
  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) setHealth(data);
      } catch {
        // Silently fail — UI shows "unknown" state
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Determine overall status from services
  const services = health?.services;
  const overall: ServiceStatus = !services
    ? "unknown"
    : services.database === "down" || services.jobQueue === "down"
    ? "down"
    : services.database === "degraded" || services.jobQueue === "degraded"
    ? "degraded"
    : "ok";

  const cfg = STATUS_CONFIG[overall];
  const OverallIcon = cfg.icon;

  const serviceList = services
    ? [
        { key: "database", label: "Database", icon: Database, status: services.database },
        { key: "jobQueue", label: "Job Queue", icon: Activity, status: services.jobQueue },
        { key: "github", label: "GitHub API", icon: Cloud, status: services.github },
      ]
    : [];

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/5"
        aria-label={`System status: ${cfg.label}`}
        aria-expanded={open}
      >
        <span className="relative flex h-2 w-2">
          {overall === "ok" && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: cfg.color }}
            />
          )}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
          />
        </span>
        <span className="hidden text-muted-foreground sm:inline">{cfg.label}</span>
        {health && (
          <span className="hidden text-[10px] tabular-nums text-muted-foreground/70 md:inline">
            {health.latencyMs}ms
          </span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 p-3 shadow-2xl"
            role="dialog"
            aria-label="System status details"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <OverallIcon className="h-4 w-4" style={{ color: cfg.color }} />
              <div className="flex-1">
                <p className="text-xs font-semibold">{cfg.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {loading ? "Checking…" : health ? `Updated just now · ${health.latencyMs}ms` : "No data"}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ background: `${cfg.color}1a`, color: cfg.color, border: `1px solid ${cfg.color}33` }}
              >
                {overall}
              </span>
            </div>

            {/* Service list */}
            <div className="mt-2 space-y-1.5">
              {serviceList.length === 0 && (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  Unable to reach health endpoint
                </p>
              )}
              {serviceList.map((svc) => {
                const sc = STATUS_CONFIG[svc.status];
                const SvcIcon = svc.icon;
                const ScStatusIcon = sc.icon;
                return (
                  <div
                    key={svc.key}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <SvcIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 text-xs font-medium">{svc.label}</span>
                    <ScStatusIcon className="h-3 w-3" style={{ color: sc.color }} />
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: sc.color }}>
                      {svc.status}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <p className="mt-2 border-t border-white/5 pt-2 text-[10px] text-muted-foreground">
              Refreshes every 60s. Last check: {health ? new Date().toLocaleTimeString() : "never"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
