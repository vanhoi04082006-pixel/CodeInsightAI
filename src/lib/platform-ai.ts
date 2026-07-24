// CodeInsight AI — Platform AI configuration resolver (MULTI-PROVIDER)
//
// Admin can configure MULTIPLE AI providers (OpenRouter, OpenAI, Anthropic, etc.)
// Each provider has its own API key + model list.
//
// Pro users choose which provider + model to use.
// Free users use their own BYOK keys.
//
// Resolution order for AI calls:
// 1. If user selected a specific platform provider + model → use that (Pro only)
// 2. If BYOK credential exists → use that (Free + Pro)
// 3. If Platform AI env vars set → use that (fallback)
// 4. null (no AI available)

import { PRESET_BY_ID } from "@/lib/providers";
import type { AIProviderConfig } from "@/lib/ai-client";
import { isProduction } from "@/lib/env";

/**
 * Get ALL admin-configured platform AI providers (for listing to Pro users).
 * Returns array of { providerId, name, models, ... } — NO API keys exposed.
 */
export async function getPlatformAIProviders(): Promise<Array<{
  providerId: string;
  name: string;
  category: string;
  baseUrl: string;
  models: string[];
}>> {
  try {
    const { db } = await import("@/lib/db");
    const configs = await db.platformAIConfig.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    });
    return configs.map((c) => {
      const preset = PRESET_BY_ID[c.providerId];
      return {
        providerId: c.providerId,
        name: preset?.name || c.providerId,
        category: preset?.category || "Unknown",
        baseUrl: c.baseUrl,
        models: JSON.parse(c.models || "[]"),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Resolve a SPECIFIC platform AI provider config (with decrypted API key).
 * Used when Pro user selects a specific provider + model.
 *
 * @param providerId — e.g. "openrouter", "openai", "anthropic"
 * @param model — the model name (e.g. "anthropic/claude-3.5-sonnet")
 * @returns AIProviderConfig with decrypted key, or null if not configured
 */
export async function getPlatformAIProvider(
  providerId: string,
  model?: string
): Promise<AIProviderConfig | null> {
  try {
    const { db } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/crypto");

    const config = await db.platformAIConfig.findUnique({
      where: { providerId },
    });

    if (!config?.enabled || !config.encryptedApiKey) return null;

    try {
      const apiKey = decrypt(config.encryptedApiKey);
      if (!apiKey) return null;

      // Use the user-selected model, or the first model in the list
      const models = JSON.parse(config.models || "[]");
      const selectedModel = model || models[0] || PRESET_BY_ID[providerId]?.defaultModel || "";

      return {
        providerId: config.providerId,
        apiKey,
        baseUrl: config.baseUrl,
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 4096,
        timeout: 60,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Get the FIRST available platform AI config (fallback when no specific provider selected).
 * Checks DB first, then env vars.
 */
export async function getPlatformAIConfig(): Promise<AIProviderConfig | null> {
  // 1. Try DB — first enabled provider
  try {
    const { db } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/crypto");

    const config = await db.platformAIConfig.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    });

    if (config?.encryptedApiKey) {
      try {
        const apiKey = decrypt(config.encryptedApiKey);
        if (apiKey) {
          const models = JSON.parse(config.models || "[]");
          return {
            providerId: config.providerId,
            apiKey,
            baseUrl: config.baseUrl,
            model: models[0] || PRESET_BY_ID[config.providerId]?.defaultModel || "",
            temperature: 0.7,
            maxTokens: 4096,
            timeout: 60,
          };
        }
      } catch {}
    }
  } catch {}

  // 2. Fallback to env vars
  return getPlatformAIConfigFromEnv();
}

/**
 * Sync version — only checks env vars (no DB query).
 */
export function getPlatformAIConfigFromEnv(): AIProviderConfig | null {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey || apiKey.length === 0) return null;

  const providerId = process.env.PLATFORM_AI_PROVIDER || "shopaikey";
  const preset = PRESET_BY_ID[providerId];
  const baseUrl = process.env.PLATFORM_AI_BASE_URL || preset?.defaultBaseUrl || "https://api.shopaikey.com/v1";
  const model = process.env.PLATFORM_AI_MODEL || preset?.defaultModel || "gpt-4.1-mini";

  return { providerId, apiKey, baseUrl, model, temperature: 0.7, maxTokens: 4096, timeout: 60 };
}

/**
 * Check if ANY platform AI is configured (DB or env).
 */
export async function isPlatformAIConfigured(): Promise<boolean> {
  return (await getPlatformAIConfig()) !== null;
}

/**
 * BYOK config builder
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
    providerId, apiKey, baseUrl, model,
    temperature: temperature ?? 0.7,
    maxTokens: maxTokens ?? 4096,
    timeout: 60,
  };
}

/**
 * Resolve the effective AI provider for a request.
 *
 * Priority:
 * 1. Pro user selected platform provider + model → use admin's key for that provider
 * 2. BYOK credential (decrypted from DB)
 * 3. Client-provided provider with apiKey (local dev)
 * 4. First available platform AI (fallback)
 * 5. null (no AI available)
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
  } | null,
  // NEW: Pro user's selected platform provider + model
  platformSelection?: {
    providerId: string;
    model?: string;
  } | null
): Promise<AIProviderConfig | null> {
  // 1. Pro user explicitly selected a platform provider + model
  if (platformSelection?.providerId) {
    const config = await getPlatformAIProvider(platformSelection.providerId, platformSelection.model);
    if (config) return config;
  }

  // 2. Explicit Platform AI mode (no specific selection — use first available)
  if (aiMode === "platform") {
    return await getPlatformAIConfig();
  }

  // 3. BYOK with decrypted credential from DB
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

  // 4. BYOK with client-provided apiKey (local dev)
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

  // 5. Local providers (Ollama, LM Studio) — local dev only
  if (clientProvider?.providerId === "ollama" || clientProvider?.providerId === "lmstudio") {
    if (!isProduction) {
      return getBYOKConfig(
        clientProvider.providerId, "",
        clientProvider.baseUrl || PRESET_BY_ID[clientProvider.providerId]?.defaultBaseUrl || "",
        clientProvider.model || PRESET_BY_ID[clientProvider.providerId]?.defaultModel || "",
        clientProvider.temperature, clientProvider.maxTokens
      );
    }
  }

  // 6. Fallback to Platform AI if configured
  return await getPlatformAIConfig();
}
