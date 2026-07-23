"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIProvider, FeatureKind, ProviderId } from "./types";
import { PRESET_BY_ID, FEATURE_DEFAULTS, PROVIDER_PRESETS } from "./providers";
import { isProduction } from "./env";

interface ProvidersState {
  providers: AIProvider[];
  // AI mode: "byok" = bring your own key, "platform" = use CodeInsight AI
  aiMode: "byok" | "platform";
  // feature -> provider instance id
  routing: Partial<Record<FeatureKind, string>>;
  // Whether the server has a Platform AI key configured
  platformAiConfigured: boolean;

  setAiMode: (mode: "byok" | "platform") => void;
  setPlatformAiConfigured: (v: boolean) => void;
  addProvider: (providerId: ProviderId) => string;
  updateProvider: (id: string, patch: Partial<AIProvider>) => void;
  removeProvider: (id: string) => void;
  setRouting: (feature: FeatureKind, providerInstanceId: string | undefined) => void;
  setProviderStatus: (id: string, status: AIProvider["status"], latencyMs?: number, error?: string) => void;
  getProviderForFeature: (feature: FeatureKind) => AIProvider | undefined;
  /**
   * Sync from the backend (encrypted credentials). Replaces the local list
   * with the server-side list (with masked keys — no raw API key in browser).
   */
  syncFromBackend: () => Promise<void>;
}

function newId() {
  return `prov_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function makeProvider(providerId: ProviderId): AIProvider {
  const preset = PRESET_BY_ID[providerId];
  return {
    id: newId(),
    providerId,
    label: preset.name,
    apiKey: "",
    baseUrl: preset.defaultBaseUrl,
    model: preset.defaultModel,
    temperature: 0.7,
    maxTokens: -1,
    streaming: true,
    timeout: 60,
    enabled: false,
    status: "unknown",
  };
}

/**
 * Filter the provider presets by environment.
 *
 * - Local development: show ALL presets (cloud + local: Ollama, LM Studio)
 * - Production: hide local-only providers — they can't be reached from the
 *   user's browser on a different origin (CORS + localhost not accessible).
 */
export function getAvailablePresets() {
  if (isProduction) {
    return PROVIDER_PRESETS.filter((p) => !p.local);
  }
  return PROVIDER_PRESETS;
}

export const useProvidersStore = create<ProvidersState>()(
  persist(
    (set, get) => ({
      providers: [],
      aiMode: "byok",
      routing: {},
      platformAiConfigured: false,

      addProvider: (providerId) => {
        // Defensive: never allow adding local providers in production
        if (isProduction && PRESET_BY_ID[providerId]?.local) {
          console.warn(`[providers] Local provider "${providerId}" is not available in production — ignored.`);
          return "";
        }
        const p = makeProvider(providerId);
        set((s) => ({ providers: [...s.providers, p] }));
        return p.id;
      },

      updateProvider: (id, patch) =>
        set((s) => ({
          providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeProvider: (id) =>
        set((s) => {
          const routing = { ...s.routing };
          for (const k of Object.keys(routing)) {
            if (routing[k as FeatureKind] === id) delete routing[k as FeatureKind];
          }
          return { providers: s.providers.filter((p) => p.id !== id), routing };
        }),

      setAiMode: (mode) => set({ aiMode: mode }),
      setPlatformAiConfigured: (v) => set({ platformAiConfigured: v }),

      setRouting: (feature, providerInstanceId) =>
        set((s) => {
          const routing = { ...s.routing };
          if (providerInstanceId) routing[feature] = providerInstanceId;
          else delete routing[feature];
          return { routing };
        }),

      setProviderStatus: (id, status, latencyMs, error) =>
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id
              ? { ...p, status, latencyMs, error, lastCheckedAt: Date.now() }
              : p
          ),
        })),

      getProviderForFeature: (feature) => {
        const { providers, routing } = get();
        const routedId = routing[feature];
        if (routedId) {
          const found = providers.find((p) => p.id === routedId && p.enabled);
          if (found) return found;
        }
        // fallback: any enabled provider matching the feature default providerId
        const defaultPid = FEATURE_DEFAULTS[feature];
        const fallback =
          providers.find((p) => p.enabled && p.providerId === defaultPid) ??
          providers.find((p) => p.enabled);
        return fallback;
      },

      syncFromBackend: async () => {
        try {
          const res = await fetch("/api/providers", { credentials: "include" });
          if (!res.ok) return;
          const data = await res.json();
          if (!Array.isArray(data.providers)) return;

          // Map backend (masked) credentials into the local AIProvider shape.
          // The apiKey is intentionally left empty — we never store the raw key
          // in the browser. Outgoing chat requests will use aiMode="platform"
          // OR carry the (encrypted) credential id, looked up server-side.
          const mapped: AIProvider[] = data.providers.map((p: any) => ({
            id: p.id,
            providerId: p.providerId,
            label: p.label,
            apiKey: "",                              // intentionally empty — backend holds the encrypted key
            baseUrl: p.baseUrl,
            model: p.model,
            temperature: p.temperature ?? 0.7,
            maxTokens: p.maxTokens ?? -1,
            streaming: p.streaming ?? true,
            timeout: 60,
            enabled: p.enabled ?? true,
            status: "unknown",
            lastCheckedAt: undefined,
          }));

          set({
            providers: mapped,
            platformAiConfigured: !!data.platformAiConfigured,
          });
        } catch (e) {
          // Network/DB error — leave existing state. Silent fail.
          console.warn("[providers] syncFromBackend failed", e);
        }
      },
    }),
    {
      name: "codeinsight-ai-providers",
      // Only persist providers + routing + aiMode — never runtime status.
      // In production, we ALSO strip the apiKey from localStorage so even
      // if the user inspects localStorage, no secrets are visible.
      partialize: (s) => ({
        providers: s.providers.map((p) => ({
          ...p,
          apiKey: isProduction ? "" : p.apiKey,    // strip in production!
          status: "unknown" as const,
          latencyMs: undefined,
          lastCheckedAt: undefined,
          error: undefined,
        })),
        routing: s.routing,
        aiMode: s.aiMode,
      }),
    }
  )
);
