"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useProvidersStore } from "@/lib/providers-store";

export interface PlatformProvider {
  providerId: string;
  name: string;
  category: string;
  models: string[];
}

export interface EffectiveAIConfig {
  /** Pro user's selected platform provider (from admin configs) */
  platformProvider?: string;
  /** Pro user's selected model */
  platformModel?: string;
  /** BYOK provider instance (from localStorage) — null if no key */
  byokProvider?: {
    providerId: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    label: string;
  };
  /** Whether user is Pro/Admin */
  isPro: boolean;
  /** Whether any AI is available (platform or BYOK) */
  hasAI: boolean;
  /** Human-readable description of what will be used */
  description: string;
}

/**
 * useEffectiveAIConfig — resolves the AI config for the current user.
 *
 * Resolution order:
 * 1. Pro user with Platform AI mode → admin's key for selected provider/model
 * 2. Pro user with BYOK mode + saved key → user's own key
 * 3. Pro user with BYOK mode + NO key → fallback to admin's first provider
 * 4. Free user with saved BYOK key → user's own key
 * 5. Free user with no key → no AI (static only)
 *
 * The returned config should be sent with analyze/chat API requests.
 */
export function useEffectiveAIConfig(): EffectiveAIConfig {
  const { data: session } = useSession();
  const aiMode = useProvidersStore((s) => s.aiMode);
  const providers = useProvidersStore((s) => s.providers);
  const [platformProviders, setPlatformProviders] = useState<PlatformProvider[]>([]);
  const [platformSelection, setPlatformSelection] = useState<{ providerId: string; model: string } | null>(null);

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";

  // Load platform providers for Pro users
  useEffect(() => {
    if (!isPro) return;
    fetch("/api/platform-ai/options")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers?.length > 0) {
          setPlatformProviders(data.providers);
          const saved = JSON.parse(localStorage.getItem("codeinsight-platform-selection") || "null");
          if (saved?.providerId && data.providers.some((p: PlatformProvider) => p.providerId === saved.providerId)) {
            setPlatformSelection({ providerId: saved.providerId, model: saved.model || data.providers.find((p: PlatformProvider) => p.providerId === saved.providerId)?.models[0] || "" });
          } else {
            setPlatformSelection({ providerId: data.providers[0].providerId, model: data.providers[0].models[0] || "" });
          }
        }
      })
      .catch(() => {});
  }, [isPro]);

  // Find first enabled BYOK provider with apiKey
  const byokProvider = providers.find((p) => p.enabled && p.apiKey);

  // Build config
  let config: EffectiveAIConfig = {
    isPro,
    hasAI: false,
    description: "No AI provider configured",
  };

  if (isPro && platformSelection && (aiMode === "platform" || !byokProvider)) {
    // Pro user: Platform AI (explicit mode, or BYOK fallback when no key)
    config = {
      platformProvider: platformSelection.providerId,
      platformModel: platformSelection.model,
      isPro: true,
      hasAI: true,
      description: `Platform AI: ${platformProviders.find(p => p.providerId === platformSelection.providerId)?.name || platformSelection.providerId} / ${platformSelection.model}`,
    };
  } else if (byokProvider) {
    // BYOK with saved key
    config = {
      byokProvider: {
        providerId: byokProvider.providerId,
        apiKey: byokProvider.apiKey,
        baseUrl: byokProvider.baseUrl,
        model: byokProvider.model,
        label: byokProvider.label,
      },
      isPro,
      hasAI: true,
      description: `BYOK: ${byokProvider.label} / ${byokProvider.model}`,
    };
  } else if (isPro && platformSelection) {
    // Pro user, no BYOK key, but platform available — use platform
    config = {
      platformProvider: platformSelection.providerId,
      platformModel: platformSelection.model,
      isPro: true,
      hasAI: true,
      description: `Platform AI: ${platformProviders.find(p => p.providerId === platformSelection.providerId)?.name || platformSelection.providerId} / ${platformSelection.model}`,
    };
  }

  return config;
}

/**
 * Build the request body for analyze/chat API calls.
 * Includes platformProvider/platformModel or provider config.
 */
export function buildAIRequestBody(aiConfig: EffectiveAIConfig): Record<string, any> {
  const body: Record<string, any> = {};

  if (aiConfig.platformProvider) {
    body.platformProvider = aiConfig.platformProvider;
    body.platformModel = aiConfig.platformModel;
    body.aiMode = "platform";
  } else if (aiConfig.byokProvider) {
    body.provider = {
      providerId: aiConfig.byokProvider.providerId,
      apiKey: aiConfig.byokProvider.apiKey,
      baseUrl: aiConfig.byokProvider.baseUrl,
      model: aiConfig.byokProvider.model,
      label: aiConfig.byokProvider.label,
    };
    body.aiMode = "byok";
  }

  return body;
}
