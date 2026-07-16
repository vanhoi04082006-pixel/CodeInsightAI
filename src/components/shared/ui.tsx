"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* ---------- GlassCard ---------- */
export function GlassCard({
  children,
  className,
  strong,
  hover,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
  hover?: boolean;
  glow?: "cyan" | "violet" | "none";
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -4, transition: { duration: 0.25 } } : undefined}
      className={cn(
        strong ? "glass-strong" : "glass-card",
        "relative rounded-2xl",
        glow === "cyan" && "neon-glow-cyan",
        glow === "violet" && "neon-glow-violet",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

/* ---------- ScoreGauge (circular) ---------- */
export function ScoreGauge({
  value,
  size = 120,
  stroke = 9,
  label,
  color = "#22d3ee",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
        {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

/* ---------- SeverityBadge ---------- */
const SEV_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "#ff5470", bg: "oklch(0.65 0.24 25 / 0.15)", label: "Critical" },
  high: { color: "#ff9f43", bg: "oklch(0.75 0.18 55 / 0.15)", label: "High" },
  medium: { color: "#fbbf24", bg: "oklch(0.82 0.17 75 / 0.15)", label: "Medium" },
  low: { color: "#22d3ee", bg: "oklch(0.82 0.16 195 / 0.12)", label: "Low" },
  info: { color: "#a78bfa", bg: "oklch(0.7 0.22 300 / 0.12)", label: "Info" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.info;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
      {s.label}
    </span>
  );
}

/* ---------- SectionTitle ---------- */
export function SectionTitle({
  eyebrow,
  title,
  description,
  center,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("space-y-3", center && "text-center")}>
      {eyebrow && (
        <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-neon-cyan">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {description && (
        <p className={cn("text-muted-foreground md:text-lg", center && "mx-auto max-w-2xl")}>
          {description}
        </p>
      )}
    </div>
  );
}

/* ---------- StatPill ---------- */
export function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

/* ---------- AnimatedGradientText ---------- */
export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("text-gradient-aurora", className)}>{children}</span>;
}

/* ---------- NeonButton-like glow divider ---------- */
export function NeonDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-px w-full", className)}
      style={{
        background:
          "linear-gradient(90deg, transparent, oklch(0.82 0.16 195 / 0.5), oklch(0.7 0.22 300 / 0.5), transparent)",
      }}
    />
  );
}

/* ---------- AnimatedCounter ---------- */

export function AnimatedCounter({
  value,
  duration = 1800,
  suffix = "",
  prefix = "",
  decimals = 0,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // easeOutExpo
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(value * eased);
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{formatted}{suffix}
    </span>
  );
}
