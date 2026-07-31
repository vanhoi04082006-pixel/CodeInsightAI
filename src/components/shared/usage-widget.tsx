"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, MessageSquare, Bot, BarChart3, Loader2, Infinity as InfinityIcon, Crown } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useUpgrade } from "@/hooks/use-upgrade";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type UsageData = {
  plan: string;
  usage: {
    analysis: { used: number; limit: number };
    chat: { used: number; limit: number };
    agentTask: { used: number; limit: number };
  };
};

const USAGE_TYPES = [
  { key: "analysis" as const, labelKey: "analyses", icon: Activity, color: "#22d3ee" },
  { key: "chat" as const, labelKey: "chatMessages", icon: MessageSquare, color: "#a78bfa" },
  { key: "agentTask" as const, labelKey: "agentTasks", icon: Bot, color: "#34d399" },
];

/**
 * Usage widget — shows monthly usage progress bars with limits.
 * Fetches from /api/usage on mount. Shows "Unlimited" for enterprise/admin.
 */
export function UsageWidget() {
  const { data: session } = useSession();
  const { t } = useT();
  const role = (session as any)?.role ?? "user";
  const isAdmin = role === "admin";
  const { upgrade, loading: upgrading } = useUpgrade();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <GlassCard className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </GlassCard>
    );
  }

  if (!data) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm text-muted-foreground">{t("errors", "fetchFailed")}</p>
      </GlassCard>
    );
  }

  const isUnlimited = isAdmin || data.plan === "enterprise" || data.plan === "team";

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold">
            <GradientText>{t("pro", "usage.title")}</GradientText>
          </h3>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {isAdmin ? t("pro", "usage.admin") : data.plan}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {USAGE_TYPES.map((type, i) => {
          const u = data.usage[type.key];
          const unlimited = isUnlimited || u.limit === -1;
          const pct = unlimited ? 0 : u.limit > 0 ? Math.min(100, (u.used / u.limit) * 100) : 100;
          const nearLimit = !unlimited && pct >= 80;

          return (
            <motion.div
              key={type.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <type.icon className="h-3.5 w-3.5" style={{ color: type.color }} />
                  {t("pro", `usage.${type.labelKey}`)}
                </span>
                <span className={cn("font-mono tabular-nums", nearLimit && "text-amber-300")}>
                  {unlimited ? (
                    <span className="flex items-center gap-1 text-emerald-300">
                      <InfinityIcon className="h-3 w-3" /> {t("pro", "usage.unlimited")}
                    </span>
                  ) : (
                    <span className={cn(pct >= 100 && "text-rose-300")}>
                      {u.used} / {u.limit}
                    </span>
                  )}
                </span>
              </div>
              {!unlimited && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className="h-full rounded-full"
                    style={{
                      background: nearLimit
                        ? "linear-gradient(90deg, #fbbf24, #fb7185)"
                        : `linear-gradient(90deg, ${type.color}, ${type.color}aa)`,
                    }}
                  />
                </div>
              )}
              {nearLimit && !unlimited && (
                <p className="mt-1 text-[10px] text-amber-300">
                  {pct >= 100 ? t("pro", "usage.limitReached") : t("pro", "usage.approachingLimit")}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {!isUnlimited && (
        <Button
          onClick={() => upgrade("pro")}
          disabled={upgrading}
          size="sm"
          variant="outline"
          className="mt-4 w-full border-violet-400/40 text-violet-300 hover:bg-violet-400/10"
        >
          <Crown className="mr-1.5 h-3.5 w-3.5" /> {t("pro", "proFeatures.upgradeForMore")}
        </Button>
      )}
    </GlassCard>
  );
}
