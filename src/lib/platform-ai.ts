// CodeInsight AI — Platform AI configuration resolver
//
// Resolves the Platform AI provider config from:
// 1. DB (admin-set via Admin Dashboard) — takes precedence
// 2. Environment variables (fallback)
//
// Supports ALL 14 providers — not just OpenRouter.
//
// Env vars (fallback if DB config not set):
//   PLATFORM_AI_PROVIDER   — openrouter | openai | anthropic | gemini | deepseek | groq |
//                            together | fireworks | mistral | xai | azure | ollama | lmstudio | custom
//   PLATFORM_AI_API_KEY    — the API key (server-side only, never exposed to frontend)
//   PLATFORM_AI_BASE_URL   — the base URL for the provider
//   PLATFORM_AI_MODEL      — the model name

import { PRESET_BY_ID } from "@/lib/providers";
import type { AIProviderConfig } from "@/lib/ai-client";
import { isProduction } from "@/lib/env";

/**
 * Resolve the Platform AI provider config.
 * Priority: 1. DB (admin-set) → 2. Env vars → 3. null (not configured)
 *
 * This is ASYNC because it queries the DB. For sync contexts (rare), use
 * getPlatformAIConfigFromEnv() which only checks env vars.
 */
export async function getPlatformAIConfig(): Promise<AIProviderConfig | null> {
  // 1. Try DB config (admin-set) first
  try {
    const { db } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/crypto");
    const dbConfig = await db.platformAIConfig.findUnique({ where: { id: "singleton" } });
    if (dbConfig?.enabled && dbConfig.encryptedApiKey) {
      try {
        const apiKey = decrypt(dbConfig.encryptedApiKey);
        if (apiKey && apiKey.length > 0) {
          return {
            providerId: dbConfig.providerId,
            apiKey,
            baseUrl: dbConfig.baseUrl,
            model: dbConfig.model,
            temperature: dbConfig.temperature ?? 0.7,
            maxTokens: dbConfig.maxTokens ?? 4096,
            timeout: 60,
          };
        }
      } catch { /* decryption failed — fall through to env */ }
    }
  } catch { /* DB not ready — fall through to env */ }

  // 2. Fall back to env vars
  return getPlatformAIConfigFromEnv();
}

/**
 * Sync version — only checks env vars (no DB query).
 * Use this in contexts where async is not possible (rare).
 */
export function getPlatformAIConfigFromEnv(): AIProviderConfig | null {
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
 * Check if Platform AI is configured (checks DB + env).
 */
export async function isPlatformAIConfigured(): Promise<boolean> {
  return (await getPlatformAIConfig()) !== null;
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
export async function resolveEffectiveProvider(
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
): Promise<AIProviderConfig | null> {
  // 1. Explicit Platform AI mode
  if (aiMode === "platform") {
    return await getPlatformAIConfig();
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
  return await getPlatformAIConfig();
}
