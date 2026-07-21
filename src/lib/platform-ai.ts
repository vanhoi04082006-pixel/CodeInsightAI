// CodeInsight AI — Platform AI configuration resolver
//
// Resolves the Platform AI provider config from environment variables.
// Supports ALL 14 providers — not just OpenRouter.
//
// Env vars (all optional — if not set, Platform AI is disabled):
//   PLATFORM_AI_PROVIDER   — openrouter | openai | anthropic | gemini | deepseek | groq |
//                            together | fireworks | mistral | xai | azure | ollama | lmstudio | custom
//   PLATFORM_AI_API_KEY    — the API key (server-side only, never exposed to frontend)
//   PLATFORM_AI_BASE_URL   — the base URL for the provider
//   PLATFORM_AI_MODEL      — the model name
//
// If PLATFORM_AI_PROVIDER is not set, defaults to "openrouter".

import { PRESET_BY_ID } from "@/lib/providers";
import type { AIProviderConfig } from "@/lib/ai-client";
import { isProduction } from "@/lib/env";

/**
 * Resolve the Platform AI provider config from env vars.
 * Returns null if Platform AI is not configured (no API key).
 */
export function getPlatformAIConfig(): AIProviderConfig | null {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey || apiKey.length === 0) return null;

  const providerId = process.env.PLATFORM_AI_PROVIDER || "openrouter";
  const preset = PRESET_BY_ID[providerId];
  const baseUrl = process.env.PLATFORM_AI_BASE_URL || preset?.defaultBaseUrl || "https://openrouter.ai/api/v1";
  const model = process.env.PLATFORM_AI_MODEL || preset?.defaultModel || "anthropic/claude-3.5-sonnet";

  return {
    providerId,
    apiKey,
    baseUrl,
    model,
    temperature: 0.7,
    maxTokens: 4096,
    timeout: 60,
  };
}

/**
 * Check if Platform AI is configured.
 */
export function isPlatformAIConfigured(): boolean {
  return getPlatformAIConfig() !== null;
}

/**
 * Resolve the BYOK provider config from a saved credential (decrypted).
 * Used when the user has BYOK mode enabled.
 */
export function getBYOKConfig(
  providerId: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  temperature?: number,
  maxTokens?: number
): AIProviderConfig {
  return {
    providerId,
    apiKey,
    baseUrl,
    model,
    temperature: temperature ?? 0.7,
    maxTokens: maxTokens ?? 4096,
    timeout: 60,
  };
}

/**
 * Resolve the effective AI provider for a request.
 * Priority:
 * 1. If aiMode === "platform" AND Platform AI is configured → use Platform AI
 * 2. If user sent a provider with apiKey → use BYOK
 * 3. If no apiKey AND Platform AI is configured → use Platform AI (fallback)
 * 4. Otherwise → null (no AI available)
 *
 * In production, BYOK keys are looked up from the encrypted DB credential
 * if the client sends a provider without an apiKey.
 */
export function resolveEffectiveProvider(
  aiMode: "byok" | "platform" | undefined,
  clientProvider: {
    providerId: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } | undefined,
  decryptedBYOK?: {
    providerId: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  } | null
): AIProviderConfig | null {
  // 1. Explicit Platform AI mode
  if (aiMode === "platform") {
    return getPlatformAIConfig();
  }

  // 2. BYOK with decrypted credential from DB (production)
  if (decryptedBYOK) {
    return getBYOKConfig(
      decryptedBYOK.providerId,
      decryptedBYOK.apiKey,
      decryptedBYOK.baseUrl,
      decryptedBYOK.model,
      decryptedBYOK.temperature,
      decryptedBYOK.maxTokens
    );
  }

  // 3. BYOK with client-provided apiKey (local dev convenience)
  if (clientProvider?.apiKey) {
    return getBYOKConfig(
      clientProvider.providerId,
      clientProvider.apiKey,
      clientProvider.baseUrl || PRESET_BY_ID[clientProvider.providerId]?.defaultBaseUrl || "",
      clientProvider.model || PRESET_BY_ID[clientProvider.providerId]?.defaultModel || "",
      clientProvider.temperature,
      clientProvider.maxTokens
    );
  }

  // 4. Local providers (Ollama, LM Studio) don't need API key — but only in local dev
  if (clientProvider?.providerId === "ollama" || clientProvider?.providerId === "lmstudio") {
    if (!isProduction) {
      return getBYOKConfig(
        clientProvider.providerId,
        "",
        clientProvider.baseUrl || PRESET_BY_ID[clientProvider.providerId]?.defaultBaseUrl || "",
        clientProvider.model || PRESET_BY_ID[clientProvider.providerId]?.defaultModel || "",
        clientProvider.temperature,
        clientProvider.maxTokens
      );
    }
  }

  // 5. Fallback to Platform AI if configured
  return getPlatformAIConfig();
}
