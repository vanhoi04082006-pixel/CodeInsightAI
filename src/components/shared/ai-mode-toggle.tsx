"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, KeyRound, Sparkles, Loader2, Check, Crown } from "lucide-react";
import { useProvidersStore } from "@/lib/providers-store";
import { useSession } from "next-auth/react";
import { useUpgrade } from "@/hooks/use-upgrade";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface PlatformProvider {
  providerId: string;
  name: string;
  category: string;
  models: string[];
}

/**
 * AI Mode toggle with Platform AI provider/model selection for Pro users.
 *
 * - Free users: BYOK only. Clicking Platform AI → upgrade CTA.
 * - Pro users: can select which admin-configured provider + model to use.
 * - Admin: same as Pro (all features unlocked).
 *
 * The selected provider + model is stored in localStorage and sent with
 * analyze/chat requests so the server uses the admin's key for that provider.
 */
export function AIModeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const aiMode = useProvidersStore((s) => s.aiMode);
  const setAiMode = useProvidersStore((s) => s.setAiMode);
  const { data: session, status } = useSession();
  const { upgrade, loading } = useUpgrade();
  const [justSwitched, setJustSwitched] = useState(false);

  // Platform providers (admin-configured) for Pro users
  const [platformProviders, setPlatformProviders] = useState<PlatformProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [maxTokens, setMaxTokens] = useState<number>(-1);  // -1 = unlimited (use model default)

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";
  const isPlatform = aiMode === "platform";

  // Load platform providers for ALL users (free + pro)
  // Free users get 1 model (default), Pro users get all models
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/platform-ai/options")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers?.length > 0) {
          setPlatformProviders(data.providers);
          // Load saved selection from localStorage
          const saved = JSON.parse(localStorage.getItem("codeinsight-platform-selection") || "null");
          if (saved?.providerId && data.providers.some((p: PlatformProvider) => p.providerId === saved.providerId)) {
            setSelectedProvider(saved.providerId);
            setSelectedModel(saved.model || data.providers.find((p: PlatformProvider) => p.providerId === saved.providerId)?.models[0] || "");
            setMaxTokens(saved.maxTokens ?? -1);
          } else {
            setSelectedProvider(data.providers[0].providerId);
            setSelectedModel(data.providers[0].models[0] || "");
            setMaxTokens(-1);
          }
        }
      })
      .catch(() => {});
  }, [isPro, status]);

  // Save selection to localStorage when changed
  useEffect(() => {
    if (selectedProvider && isPlatform) {
      localStorage.setItem("codeinsight-platform-selection", JSON.stringify({
        providerId: selectedProvider,
        model: selectedModel,
        maxTokens,
      }));
    }
  }, [selectedProvider, selectedModel, maxTokens, isPlatform]);

  const handleToggle = async () => {
    if (isPlatform) {
      // Switch from Default → Custom
      setAiMode("byok");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success(t("providers", "toast.switchedToCustom"), { description: t("providers", "toast.switchedToCustomDesc") });
    } else {
      // Switch from Custom → Default (available for ALL users, including free)
      // Default = admin's Platform AI key (free: 1M tokens, Pro: 10M tokens)

      // If providers not loaded yet, try loading now
      if (platformProviders.length === 0) {
        toast.loading(t("providers", "toast.loadingProviders"), { id: "load-providers" });
        try {
          const res = await fetch("/api/platform-ai/options");
          const data = await res.json();
          if (data.providers?.length > 0) {
            setPlatformProviders(data.providers);
            const first = data.providers[0];
            setSelectedProvider(first.providerId);
            // Pro users can choose model, free users use first model
            setSelectedModel(first.models[0] || "");
            toast.dismiss("load-providers");
            setAiMode("platform");
            setJustSwitched(true);
            setTimeout(() => setJustSwitched(false), 1000);
            toast.success(t("providers", "toast.switchedToDefault"), {
              description: t("providers", "toast.switchedToDefaultDesc", { name: first.name, tokens: isPro ? "10M" : "1M" }),
            });
            return;
          }
        } catch {}
        toast.dismiss("load-providers");
        toast.error(t("providers", "toast.noDefaultProvider"), {
          description: t("providers", "toast.noDefaultProviderDesc"),
        });
        return;
      }
      setAiMode("platform");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success(t("providers", "toast.switchedToDefault"), {
        description: t("providers", "toast.switchedToDefaultShortDesc", { tokens: isPro ? "10M" : "1M" }),
      });
    }
  };

  const Icon = isPlatform ? Sparkles : KeyRound;
  const color = isPlatform ? "#a78bfa" : "#22d3ee"; // violet for Platform AI

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1.5">
        {/* Model badge (Default mode only — model is fixed gpt-5.5, no selector) */}
        {isPlatform && (
          <div className="hidden items-center gap-1 sm:flex">
            <span className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-300">
              gpt-5.5
            </span>
          </div>
        )}

        {/* Mode toggle button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleToggle}
              disabled={loading}
              className="group relative flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={t("providers", "aria.label", { mode: isPlatform ? t("providers", "labels.default") : t("providers", "labels.custom") })}
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
                  {isPlatform ? t("providers", "labels.default") : t("providers", "labels.custom")}
                </span>
              )}
              {!isPro && !isPlatform && (
                <span className="ml-0.5 rounded bg-violet-500/20 px-1 text-[8px] font-bold uppercase text-violet-300">
                  {t("providers", "labels.pro")}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <p className="font-semibold">
                {isPlatform ? t("providers", "tooltip.titleDefault") : t("providers", "tooltip.titleCustom")}
              </p>
              <p className="text-muted-foreground">
                {isPlatform
                  ? t("providers", "tooltip.platformDesc", { provider: selectedProvider ? ` (${selectedProvider})` : "" })
                  : t("providers", "tooltip.byokDesc")}
              </p>
              {!isPro && !isPlatform && (
                <p className="text-cyan-300">{t("providers", "tooltip.clickDefault")}</p>
              )}
              {isPro && platformProviders.length === 0 && (
                <p className="text-amber-300">{t("providers", "tooltip.noProvider")}</p>
              )}
              <p className="text-muted-foreground/70">{t("providers", "tooltip.clickSwitch")}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/**
 * Get model info (use-case badge, maxTokens) — all from Platform AI list.
 * Returns undefined if model not in our curated list.
 */
function getModelInfo(modelId: string): { useCase: string; badge: string; maxTokens: number } | undefined {
  const MODELS: Record<string, { useCase: string; badge: string; maxTokens: number }> = {
    "gpt-5-nano": { useCase: "budget", badge: "Cheapest · Free default ($0.05/$0.40)", maxTokens: 1000 },
    "gpt-4.1-nano": { useCase: "fast", badge: "Fast · Low cost ($0.10/$0.40)", maxTokens: 1500 },
    "gpt-4o-mini": { useCase: "vision", badge: "Vision · Multimodal ($0.15/$0.60)", maxTokens: 2000 },
    "gpt-5-mini": { useCase: "chat", badge: "Best for Chat ($0.25/$2.00)", maxTokens: 3000 },
    "gpt-4.1-mini": { useCase: "analyze", badge: "Best for Analyze ($0.40/$1.60)", maxTokens: 4000 },
    "grok-4-fast-reasoning": { useCase: "fast", badge: "Fast Reasoning ($0.20/$0.50)", maxTokens: 2000 },
    "deepseek-chat": { useCase: "code", badge: "Best for Code ($2.00/$3.00)", maxTokens: 3000 },
    "qwen3-coder-flash": { useCase: "code", badge: "Code Specialist ($1.00/$4.00)", maxTokens: 3000 },
  };
  return MODELS[modelId];
}
