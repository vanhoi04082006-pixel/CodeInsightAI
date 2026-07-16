"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIProvider, FeatureKind, ProviderId } from "./types";
import { PRESET_BY_ID, FEATURE_DEFAULTS } from "./providers";

interface ProvidersState {
  providers: AIProvider[];
  // feature -> provider instance id
  routing: Partial<Record<FeatureKind, string>>;

  addProvider: (providerId: ProviderId) => string;
  updateProvider: (id: string, patch: Partial<AIProvider>) => void;
  removeProvider: (id: string) => void;
  setRouting: (feature: FeatureKind, providerInstanceId: string | undefined) => void;
  setProviderStatus: (id: string, status: AIProvider["status"], latencyMs?: number, error?: string) => void;
  getProviderForFeature: (feature: FeatureKind) => AIProvider | undefined;
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

export const useProvidersStore = create<ProvidersState>()(
  persist(
    (set, get) => ({
      providers: [],
      routing: {},

      addProvider: (providerId) => {
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
    }),
    {
      name: "codeinsight-ai-providers",
      // only persist providers + routing, not runtime status
      partialize: (s) => ({
        providers: s.providers.map((p) => ({
          ...p,
          status: "unknown" as const,
          latencyMs: undefined,
          lastCheckedAt: undefined,
          error: undefined,
        })),
        routing: s.routing,
      }),
    }
  )
);
