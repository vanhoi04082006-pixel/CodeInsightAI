"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  Zap,
  Infinity as InfinityIcon,
  Rocket,
  FileText,
  BarChart3,
  Headphones,
  Check,
  Crown,
  Shield,
  Loader2,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useUpgrade } from "@/hooks/use-upgrade";
import { cn } from "@/lib/utils";

const PRO_FEATURES = [
  { icon: Sparkles, label: "Platform AI", desc: "No API key needed — Claude 3.5 / GPT-4o" },
  { icon: InfinityIcon, label: "Unlimited Analyses", desc: "100/month instead of 5" },
  { icon: Zap, label: "Streaming Chat", desc: "Real-time token streaming" },
  { icon: Rocket, label: "Priority Queue", desc: "Faster agent task execution" },
  { icon: FileText, label: "PDF / JSON Export", desc: "Export reports in multiple formats" },
  { icon: BarChart3, label: "Usage Analytics", desc: "Detailed usage dashboard" },
  { icon: Headphones, label: "Priority Support", desc: "Direct line to the team" },
];

/**
 * Pro Features card — shows locked features for free users, unlocked for Pro,
 * and "all unlocked" for admins. Mounted on the dashboard.
 */
export function ProFeaturesCard() {
  const { data: session } = useSession();
  const { upgrade, loading } = useUpgrade();
  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";
  const isAdmin = role === "admin";

  return (
    <GlassCard
      strong={!isPro}
      className={cn(
        "relative overflow-hidden p-6",
        !isPro && "border-violet-400/30",
        isAdmin && "border-cyan-400/30",
      )}
    >
      {/* Background glow */}
      {!isPro && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
      )}
      {isAdmin && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Shield className="h-5 w-5 text-cyan-300" />
            ) : isPro ? (
              <Check className="h-5 w-5 text-emerald-400" />
            ) : (
              <Crown className="h-5 w-5 text-amber-400" />
            )}
            <h3 className="text-sm font-semibold">
              {isAdmin ? (
                <GradientText>Admin — All Features Unlocked</GradientText>
              ) : isPro ? (
                <span className="text-emerald-300">Pro Active</span>
              ) : (
                <span className="text-amber-300">Unlock Pro Features</span>
              )}
            </h3>
          </div>
          {!isPro && (
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300">
              $9/mo
            </span>
          )}
          {isPro && !isAdmin && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
              Active
            </span>
          )}
          {isAdmin && (
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
              Admin
            </span>
          )}
        </div>

        {/* Features grid */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {PRO_FEATURES.map((f, i) => {
            const Icon = f.icon;
            const unlocked = isPro;
            return (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2.5 transition",
                  unlocked
                    ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                    : "border-white/5 bg-white/[0.02] opacity-80",
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  unlocked ? "bg-emerald-500/15" : "bg-violet-500/10",
                )}>
                  {unlocked ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-violet-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-medium", unlocked && "text-emerald-200")}>
                    {f.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        {!isPro && (
          <Button
            onClick={() => upgrade("pro")}
            disabled={loading}
            className="mt-4 w-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Redirecting to checkout…
              </>
            ) : (
              <>
                <Crown className="mr-1.5 h-4 w-4" /> Upgrade to Pro — $9/month
              </>
            )}
          </Button>
        )}
        {isPro && !isAdmin && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Need to cancel? Visit{" "}
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/billing/portal", { method: "POST" });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                } catch { /* ignore */ }
              }}
              className="text-cyan-300 hover:underline"
            >
              Stripe customer portal
            </button>
          </p>
        )}
      </div>
    </GlassCard>
  );
}
