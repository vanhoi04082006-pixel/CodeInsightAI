"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, KeyRound, Sparkles, Loader2, Check } from "lucide-react";
import { useProvidersStore } from "@/lib/providers-store";
import { useSession } from "next-auth/react";
import { useUpgrade } from "@/hooks/use-upgrade";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

/**
 * Compact AI Mode toggle for the topbar.
 *
 * Two states:
 * - BYOK (default, free): icon = KeyRound, color = cyan
 * - Platform AI (Pro): icon = Sparkles, color = violet
 *
 * Behavior:
 * - Free users clicking Platform AI → triggers Stripe checkout (via useUpgrade)
 * - Pro users clicking → actually toggles the mode
 * - Admin users → can toggle freely (they have all features)
 */
export function AIModeToggle({ compact = false }: { compact?: boolean }) {
  const aiMode = useProvidersStore((s) => s.aiMode);
  const setAiMode = useProvidersStore((s) => s.setAiMode);
  const { data: session } = useSession();
  const { upgrade, loading, canUpgrade } = useUpgrade();
  const [justSwitched, setJustSwitched] = useState(false);

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";
  const isPlatform = aiMode === "platform";

  const handleToggle = () => {
    if (isPlatform) {
      // Switch to BYOK
      setAiMode("byok");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success("Switched to BYOK mode", {
        description: "Using your own API keys (free).",
      });
    } else {
      // Trying to switch to Platform AI
      if (!isPro) {
        // Free user → trigger checkout
        upgrade("pro");
        return;
      }
      // Pro/admin → actually toggle
      setAiMode("platform");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success("Switched to Platform AI mode", {
        description: "Using CodeInsight AI (no key needed).",
      });
    }
  };

  const Icon = isPlatform ? Sparkles : KeyRound;
  const color = isPlatform ? "#a78bfa" : "#22d3ee";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            disabled={loading}
            className="group relative flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`AI Mode: ${isPlatform ? "Platform AI" : "BYOK"} — click to switch`}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
            ) : justSwitched ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <motion.div
                key={isPlatform ? "platform" : "byok"}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </motion.div>
            )}
            {!compact && (
              <span className="hidden sm:inline" style={{ color }}>
                {isPlatform ? "Platform AI" : "BYOK"}
              </span>
            )}
            {/* Pro badge for free users */}
            {!isPro && !isPlatform && (
              <span className="ml-0.5 rounded bg-violet-500/20 px-1 text-[8px] font-bold uppercase text-violet-300">
                Pro
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">
              AI Mode: {isPlatform ? "🤖 Platform AI" : "🔑 BYOK (Bring Your Own Key)"}
            </p>
            <p className="text-muted-foreground">
              {isPlatform
                ? "Using CodeInsight AI's key (no setup needed)."
                : "Using your own API keys from OpenRouter, OpenAI, etc. (free)"}
            </p>
            {!isPro && !isPlatform && (
              <p className="text-violet-300">Click to upgrade to Pro — $9/mo</p>
            )}
            <p className="text-muted-foreground/70">Click to switch mode</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
