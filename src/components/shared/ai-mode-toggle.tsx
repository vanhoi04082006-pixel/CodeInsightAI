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
  const aiMode = useProvidersStore((s) => s.aiMode);
  const setAiMode = useProvidersStore((s) => s.setAiMode);
  const { data: session, status } = useSession();
  const { upgrade, loading } = useUpgrade();
  const [justSwitched, setJustSwitched] = useState(false);

  // Platform providers (admin-configured) for Pro users
  const [platformProviders, setPlatformProviders] = useState<PlatformProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";
  const isPlatform = aiMode === "platform";

  // Load platform providers for Pro users
  // Depends on `status` so it re-runs when session finishes loading
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!isPro) return;
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
          } else {
            setSelectedProvider(data.providers[0].providerId);
            setSelectedModel(data.providers[0].models[0] || "");
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
      }));
    }
  }, [selectedProvider, selectedModel, isPlatform]);

  const handleToggle = async () => {
    if (isPlatform) {
      setAiMode("byok");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success("Switched to BYOK mode", { description: "Using your own API keys (free)." });
    } else {
      if (!isPro) {
        upgrade("pro");
        return;
      }
      // If providers not loaded yet, try loading now (might be timing issue)
      if (platformProviders.length === 0) {
        toast.loading("Loading Platform AI providers…", { id: "load-providers" });
        try {
          const res = await fetch("/api/platform-ai/options");
          const data = await res.json();
          if (data.providers?.length > 0) {
            setPlatformProviders(data.providers);
            const first = data.providers[0];
            setSelectedProvider(first.providerId);
            setSelectedModel(first.models[0] || "");
            toast.dismiss("load-providers");
            // Now switch to platform
            setAiMode("platform");
            setJustSwitched(true);
            setTimeout(() => setJustSwitched(false), 1000);
            toast.success("Switched to Platform AI", {
              description: `Using ${first.name} / ${first.models[0] || "default"}`,
            });
            return;
          }
        } catch {}
        toast.dismiss("load-providers");
        toast.error("No Platform AI providers configured", {
          description: "Admin needs to configure at least one AI provider in Admin Dashboard.",
        });
        return;
      }
      setAiMode("platform");
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), 1000);
      toast.success("Switched to Platform AI", {
        description: `Using ${platformProviders.find(p => p.providerId === selectedProvider)?.name || "admin key"}`,
      });
    }
  };

  const Icon = isPlatform ? Sparkles : KeyRound;
  const color = isPlatform ? "#a78bfa" : "#22d3ee";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1.5">
        {/* Provider/model selector (Pro + Platform mode only) */}
        {isPlatform && isPro && platformProviders.length > 0 && (
          <div className="hidden items-center gap-1 sm:flex">
            <Select value={selectedProvider} onValueChange={(v) => {
              setSelectedProvider(v);
              const p = platformProviders.find((x) => x.providerId === v);
              if (p) setSelectedModel(p.models[0] || "");
            }}>
              <SelectTrigger className="h-7 w-28 border-white/10 bg-white/[0.03] text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platformProviders.map((p) => (
                  <SelectItem key={p.providerId} value={p.providerId} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-7 w-40 border-white/10 bg-white/[0.03] text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platformProviders.find((p) => p.providerId === selectedProvider)?.models.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs font-mono">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Mode toggle button */}
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
                  ? `Using admin's key${selectedProvider ? ` (${selectedProvider})` : ""} — no setup needed.`
                  : "Using your own API keys from OpenRouter, OpenAI, etc. (free)"}
              </p>
              {!isPro && !isPlatform && (
                <p className="text-violet-300">Click to upgrade to Pro — $9/mo</p>
              )}
              {isPro && platformProviders.length === 0 && (
                <p className="text-amber-300">No Platform AI providers configured. Ask admin to add one.</p>
              )}
              <p className="text-muted-foreground/70">Click to switch mode</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
