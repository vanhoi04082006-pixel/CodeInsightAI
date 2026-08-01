// CodeInsight AI — Unified AI Client
//
// A single module for calling ANY of the 15 supported AI providers.
// Used by: /api/chat, /api/chat/stream, /lib/ai-enhance,
// /api/agents/execute.
//
// Supports:
// - OpenAI-compatible (OpenRouter, OpenAI, DeepSeek, Groq, Together, Fireworks,
//   Mistral, xAI, Ollama, LM Studio, Custom)
// - Anthropic Messages API
// - Google Gemini API
// - Azure OpenAI API
//
// All calls support: streaming, temperature, maxTokens, timeout, abort.
//
// W6-C — ENTERPRISE HARDENING:
// - Secret redaction is applied to EVERY message before it leaves the system.
//   The AI sees `[REDACTED_OPENAI_KEY]` placeholders instead of real secrets.
// - Every call produces one AICallLog row (best-effort, never throws) so we can
//   track cost (tokens × model), latency, errors, and redaction counts.

import { redactMessages, redactSecrets } from "./redaction";
import { logAICall } from "./audit";
import {
  checkTokenBudget,
  recordTokenUsage,
  estimateTokensFromText,
  TokenBudgetExceededError,
} from "./billing/token-budget";

// Re-export so callers can `import { TokenBudgetExceededError } from "@/lib/ai-client"`.
export { TokenBudgetExceededError };

export interface AIProviderConfig {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number; // seconds
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Optional audit context for an AI call. If provided, the AICallLog row will
 * be richer (links to a user + analysis + agent). All fields optional.
 * Backward compatible — existing callers don't need to pass this.
 */
export interface AICallAuditContext {
  userId?: string | null;
  analysisId?: string | null;
  agent?: string | null; // "security" | "overview" | "chat" | "deep-analysis" | ...
  passType?: string | null;
}

export interface AICallOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number; // seconds, default 60
  signal?: AbortSignal;
  responseFormat?: "text" | "json_object";
  /** W6-C: optional context for the AICallLog row. */
  audit?: AICallAuditContext;
  /**
   * P3.1: User id for token-budget enforcement. If both `userId` AND `plan`
   * are provided, `callAI()` does a pre-flight budget check (single indexed
   * DB read) and throws `TokenBudgetExceededError` if the user is over their
   * monthly limit. If either is missing, the check is skipped (system / bg
   * calls). After a successful call, `recordTokenUsage()` is called
   * best-effort with `result.usage.totalTokens` (or chars/4 estimate for
   * streaming).
   */
  userId?: string;
  /** P3.1: User's plan ("free" | "pro" | "team" | "enterprise"). */
  plan?: string;
}

export interface AICallResult {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model: string;
  providerId: string;
}

/**
 * Call any AI provider with a unified interface.
 * Automatically detects the API format based on providerId.
 *
 * W6-C: Secrets are redacted from all messages BEFORE the network request.
 * An AICallLog row is written after the call (success or error) with token
 * counts, latency, status, and redaction metadata. Audit logging is
 * best-effort and never throws.
 *
 * @example
 * const result = await callAI(
 *   { providerId: "openrouter", apiKey: "sk-...", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-3.5-sonnet" },
 *   [{ role: "user", content: "Hello" }],
 *   { temperature: 0.7, maxTokens: 4096 }
 * );
 */
export async function callAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options: AICallOptions = {}
): Promise<AICallResult> {
  const { providerId } = provider;
  const temperature = options.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? provider.maxTokens ?? 4096;
  const timeoutMs = (options.timeout ?? provider.timeout ?? 60) * 1000;

  // ── W6-C: Redact secrets before anything leaves the process ──
  const redaction = computeRedaction(messages);
  const safeMessages = redaction.redactedMessages;

  // ── P3.1: Token budget pre-flight check ──
  // If the caller provided `userId` + `plan`, do a single indexed DB read
  // to confirm the user is under their monthly token budget. Throws
  // `TokenBudgetExceededError` synchronously BEFORE the network call so the
  // caller can return a 429 without paying for an AI call they can't make.
  // Skipped entirely when userId/plan are missing (system / bg calls).
  if (options.userId && options.plan) {
    const { allowed, status } = await checkTokenBudget(options.userId, options.plan);
    if (!allowed && status) {
      throw new TokenBudgetExceededError(status);
    }
  }

  // Build abort signal with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Combine with external signal if provided
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  const startedAt = Date.now();
  let timedOut = false;

  // Detect timeout via the abort event (distinguishes caller-abort from timeout-abort)
  controller.signal.addEventListener("abort", () => {
    if (controller.signal.reason === undefined || controller.signal.reason === "timeout") {
      // Heuristic: if no explicit reason was set by the caller, treat as timeout.
      timedOut = true;
    }
  });

  try {
    // Route to the correct API format — pass the REDACTED messages
    let result: AICallResult;
    if (providerId === "anthropic") {
      result = await callAnthropic(provider, safeMessages, temperature, maxTokens, controller.signal, options.responseFormat);
    } else if (providerId === "gemini") {
      result = await callGemini(provider, safeMessages, temperature, maxTokens, controller.signal, options.responseFormat);
    } else if (providerId === "azure") {
      result = await callAzure(provider, safeMessages, temperature, maxTokens, controller.signal, options.responseFormat);
    } else {
      // OpenAI-compatible (default): OpenRouter, OpenAI, DeepSeek, Groq, Together,
      // Fireworks, Mistral, xAI, Ollama, LM Studio, Custom
      result = await callOpenAICompatible(provider, safeMessages, temperature, maxTokens, controller.signal, options.responseFormat);
    }

    // ── W6-C: Best-effort audit log on success ──
    void logAICall({
      userId: options.audit?.userId ?? null,
      analysisId: options.audit?.analysisId ?? null,
      agent: options.audit?.agent ?? null,
      passType: options.audit?.passType ?? null,
      provider: providerId,
      model: provider.model,
      inputTokens: result.usage?.promptTokens ?? null,
      outputTokens: result.usage?.completionTokens ?? null,
      totalTokens: result.usage?.totalTokens ?? null,
      latencyMs: Date.now() - startedAt,
      status: "success",
      redactionCount: redaction.redactionCount,
      redactedLabels: redaction.redactedLabels,
    }).catch(() => { /* never throw on audit failure */ });

    // ── P3.1: Best-effort token usage accounting ──
    // Increment the user's monthly cache atomically. Uses real token counts
    // from `result.usage.*` when the provider returns them; falls back to
    // chars/4 estimate if totalTokens is missing. Never throws.
    if (options.userId) {
      const inTok = result.usage?.promptTokens ?? 0;
      const outTok = result.usage?.completionTokens ?? 0;
      const totalTok = result.usage?.totalTokens ?? 0;
      void recordTokenUsage(options.userId, inTok, outTok, totalTok).catch(() => {
        /* silent — accounting is best-effort */
      });
    }

    return result;
  } catch (err) {
    // TokenBudgetExceededError is re-thrown unchanged — the caller catches it
    // and returns a 429. We don't log it as an error AICallLog row because no
    // network call was actually made (it was blocked before fetch()).
    if (err instanceof TokenBudgetExceededError) {
      throw err;
    }
    // ── W6-C: Best-effort audit log on error ──
    const isTimeout = timedOut || (err instanceof Error && err.name === "AbortError");
    void logAICall({
      userId: options.audit?.userId ?? null,
      analysisId: options.audit?.analysisId ?? null,
      agent: options.audit?.agent ?? null,
      passType: options.audit?.passType ?? null,
      provider: providerId,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
      status: isTimeout ? "timeout" : "error",
      error: err instanceof Error ? err.message : String(err),
      redactionCount: redaction.redactionCount,
      redactedLabels: redaction.redactedLabels,
    }).catch(() => { /* never throw on audit failure */ });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Helper: redact a messages array and return both the safe messages + metadata. */
function computeRedaction(messages: AIMessage[]): {
  redactionCount: number;
  redactedLabels: string[];
  redactedMessages: AIMessage[];
} {
  // Compute counts from the ORIGINAL messages so we capture every secret.
  let totalCount = 0;
  const allLabels = new Set<string>();
  for (const m of messages) {
    const r = redactSecrets(m.content);
    totalCount += r.redactionCount;
    for (const lbl of r.redactedLabels) allLabels.add(lbl);
  }
  // Produce the sanitized messages array (no secrets).
  const redactedMessages = redactMessages(messages);
  return {
    redactionCount: totalCount,
    redactedLabels: Array.from(allLabels),
    redactedMessages,
  };
}

/**
 * Stream tokens from any AI provider.
 * Yields chunk strings as they arrive.
 */
export async function* streamAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options: AICallOptions = {}
): AsyncGenerator<string, void, unknown> {
  const { providerId } = provider;
  const temperature = options.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? provider.maxTokens ?? 4096;
  const timeoutMs = (options.timeout ?? provider.timeout ?? 60) * 1000;

  // ── W6-C: Redact secrets before anything leaves the process ──
  const redaction = computeRedaction(messages);
  const safeMessages = redaction.redactedMessages;

  // ── P3.1: Token budget pre-flight check ──
  // Throws `TokenBudgetExceededError` synchronously BEFORE the fetch() so the
  // caller can return a 429 without paying for a stream they can't afford.
  if (options.userId && options.plan) {
    const { allowed, status } = await checkTokenBudget(options.userId, options.plan);
    if (!allowed && status) {
      throw new TokenBudgetExceededError(status);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  const startedAt = Date.now();
  let loggedStatus: "success" | "error" | "timeout" | null = null;
  let loggedError: string | null = null;
  // P3.1: track total yielded chars so we can estimate tokens post-stream.
  let yieldedChars = 0;

  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;

    if (providerId === "anthropic") {
      url = provider.baseUrl.endsWith("/v1")
        ? `${provider.baseUrl}/messages`
        : `${provider.baseUrl}/v1/messages`;
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const systemMsg = safeMessages.find((m) => m.role === "system")?.content || "";
      const chatMsgs = safeMessages.filter((m) => m.role !== "system");
      body = {
        model: provider.model,
        max_tokens: maxTokens,
        temperature,
        system: systemMsg,
        messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      };
    } else if (providerId === "gemini") {
      url = `${provider.baseUrl.replace(/\/$/, "")}/models/${provider.model}:streamGenerateContent?key=${provider.apiKey}&alt=sse`;
      const contents = safeMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const systemInstruction = safeMessages.find((m) => m.role === "system");
      body = {
        contents,
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } } : {}),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      };
    } else if (providerId === "azure") {
      // Azure: https://YOUR-RESOURCE.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-06-01
      url = `${provider.baseUrl.replace(/\/$/, "")}/${provider.model}/chat/completions?api-version=2024-06-01`;
      headers["api-key"] = provider.apiKey;
      body = {
        messages: safeMessages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };
    } else {
      // OpenAI-compatible
      url = provider.baseUrl.endsWith("/v1")
        ? `${provider.baseUrl}/chat/completions`
        : `${provider.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
      if (providerId === "openrouter") {
        headers["HTTP-Referer"] = "https://codeinsight.ai";
        headers["X-Title"] = "CodeInsight AI";
      }
      body = {
        model: provider.model,
        messages: safeMessages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...(options.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errMsg;
      } catch {
        if (errText) errMsg = errText.substring(0, 300);
      }
      throw new Error(`Provider error (${res.status}): ${errMsg}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          let chunk = "";

          if (providerId === "anthropic") {
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              chunk = parsed.delta.text;
            }
          } else if (providerId === "gemini") {
            chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          } else {
            chunk = parsed.choices?.[0]?.delta?.content || "";
          }

          if (chunk) {
            yield chunk;
            yieldedChars += chunk.length;
          }
        } catch {
          // ignore parse errors for partial chunks
        }
      }
    }
    loggedStatus = "success";
  } catch (err) {
    // P3.1: TokenBudgetExceededError is re-thrown unchanged — no audit log
    // entry because no network call was actually made.
    if (err instanceof TokenBudgetExceededError) {
      throw err;
    }
    const isAbort = err instanceof Error && err.name === "AbortError";
    loggedStatus = isAbort ? "timeout" : "error";
    loggedError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    clearTimeout(timer);
    // ── W6-C: Best-effort audit log (streaming — token counts not available) ──
    if (loggedStatus) {
      void logAICall({
        userId: options.audit?.userId ?? null,
        analysisId: options.audit?.analysisId ?? null,
        agent: options.audit?.agent ?? null,
        passType: options.audit?.passType ?? null,
        provider: providerId,
        model: provider.model,
        latencyMs: Date.now() - startedAt,
        status: loggedStatus,
        error: loggedError,
        redactionCount: redaction.redactionCount,
        redactedLabels: redaction.redactedLabels,
      }).catch(() => { /* never throw on audit failure */ });
    }

    // ── P3.1: Best-effort token accounting for streaming ──
    // SSE streams don't return `usage.totalTokens` (the standard is messy
    // across OpenAI / Anthropic / Gemini). Estimate from yielded chars (4
    // chars ≈ 1 token) PLUS an estimate of the input prompt tokens so we
    // don't systematically undercount chat. Only counted on successful
    // streams; failed streams don't consume significant output tokens.
    if (options.userId && loggedStatus === "success") {
      const outTokens = estimateTokensFromText("a".repeat(yieldedChars));
      const inTokens = estimateTokensFromText(
        safeMessages.map((m) => m.content).join("")
      );
      const total = inTokens + outTokens;
      void recordTokenUsage(options.userId, inTokens, outTokens, total).catch(() => {
        /* silent — accounting is best-effort */
      });
    }
  }
}

// ── Provider-specific implementations ──

async function callOpenAICompatible(
  provider: AIProviderConfig,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
  responseFormat?: "text" | "json_object"
): Promise<AICallResult> {
  const url = provider.baseUrl.endsWith("/v1")
    ? `${provider.baseUrl}/chat/completions`
    : `${provider.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
  if (provider.providerId === "openrouter") {
    headers["HTTP-Referer"] = "https://codeinsight.ai";
    headers["X-Title"] = "CodeInsight AI";
  }

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.message || errMsg;
    } catch {
      if (errText) errMsg = errText.substring(0, 300);
    }
    throw new Error(`Provider error (${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
    model: provider.model,
    providerId: provider.providerId,
  };
}

async function callAnthropic(
  provider: AIProviderConfig,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
  _responseFormat?: "text" | "json_object"
): Promise<AICallResult> {
  const url = provider.baseUrl.endsWith("/v1")
    ? `${provider.baseUrl}/messages`
    : `${provider.baseUrl}/v1/messages`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": provider.apiKey,
    "anthropic-version": "2023-06-01",
  };

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: provider.model,
    max_tokens: maxTokens,
    temperature,
    system: systemMsg,
    messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    content: data.content?.[0]?.text || "",
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined,
    model: provider.model,
    providerId: "anthropic",
  };
}

async function callGemini(
  provider: AIProviderConfig,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
  _responseFormat?: "text" | "json_object"
): Promise<AICallResult> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/models/${provider.model}:generateContent?key=${provider.apiKey}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const systemInstruction = messages.find((m) => m.role === "system");

  const body: Record<string, unknown> = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } } : {}),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    usage: data.usage ? {
      promptTokens: data.usage.promptTokenCount,
      completionTokens: data.usage.candidatesTokenCount,
      totalTokens: data.usage.totalTokenCount,
    } : undefined,
    model: provider.model,
    providerId: "gemini",
  };
}

async function callAzure(
  provider: AIProviderConfig,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
  responseFormat?: "text" | "json_object"
): Promise<AICallResult> {
  // Azure OpenAI: baseUrl = https://YOUR-RESOURCE.openai.azure.com/openai/deployments
  // model = deployment name
  const url = `${provider.baseUrl.replace(/\/$/, "")}/${provider.model}/chat/completions?api-version=2024-06-01`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": provider.apiKey,
  };

  const body: Record<string, unknown> = {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Azure error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
    model: provider.model,
    providerId: "azure",
  };
}
