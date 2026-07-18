// CodeInsight AI — Shared AI Client for Agents
// Wraps provider calls (OpenAI-compatible, Anthropic, Gemini) for server-side use.

export interface AIProviderConfig {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call an AI provider with messages. Returns the assistant's text reply.
 * Supports: OpenAI-compatible, Anthropic, Gemini.
 */
export async function callAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  const temperature = options?.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? (provider.maxTokens && provider.maxTokens > 0 ? provider.maxTokens : undefined);
  const model = provider.model || "gpt-4o-mini";
  const timeout = (provider.timeout || 60) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (options?.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;

    if (provider.providerId === "anthropic") {
      url = provider.baseUrl.endsWith("/v1")
        ? `${provider.baseUrl}/messages`
        : `${provider.baseUrl}/v1/messages`;
      headers["x-api-key"] = provider.apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
      const systemMsg = messages.find(m => m.role === "system")?.content || "";
      const chatMsgs = messages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role, content: m.content }));
      body = {
        model,
        max_tokens: maxTokens || 4096,
        temperature,
        system: systemMsg,
        messages: chatMsgs,
      };
    } else if (provider.providerId === "gemini") {
      url = `${provider.baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`;
      const contents = messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const systemMsg = messages.find(m => m.role === "system")?.content;
      body = {
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens || 4096 },
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
      };
    } else {
      // OpenAI-compatible default
      url = provider.baseUrl.endsWith("/v1")
        ? `${provider.baseUrl}/chat/completions`
        : `${provider.baseUrl}/v1/chat/completions`;
      if (provider.apiKey) {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      }
      body = {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`AI provider ${provider.providerId} returned ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();

    // Extract reply based on provider format
    if (provider.providerId === "anthropic") {
      return data.content?.[0]?.text ?? "";
    } else if (provider.providerId === "gemini") {
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } else {
      return data.choices?.[0]?.message?.content ?? "";
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask AI to return structured JSON. Parses the response and validates.
 */
export async function callAIForJSON<T = any>(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<T> {
  const reply = await callAI(provider, messages, { temperature: options?.temperature ?? 0.3, maxTokens: options?.maxTokens, signal: options?.signal });
  // Extract JSON from response (may be wrapped in ```json ... ``` blocks)
  const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : reply.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find the first { ... } or [ ... ]
    const start = jsonStr.search(/[{[]/);
    if (start >= 0) {
      const end = jsonStr.lastIndexOf(jsonStr[start] === "{" ? "}" : "]");
      if (end > start) {
        return JSON.parse(jsonStr.slice(start, end + 1));
      }
    }
    throw new Error(`AI did not return valid JSON: ${reply.slice(0, 200)}`);
  }
}

/**
 * Stream AI response chunk by chunk. Calls onChunk for each text delta.
 * Currently falls back to non-streaming (calls callAI then emits one chunk).
 * Full streaming can be added per-provider later.
 */
export async function streamAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  onChunk: (chunk: string) => void,
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  // TODO: implement true SSE streaming per provider. For now, fallback to non-stream.
  const reply = await callAI(provider, messages, options);
  onChunk(reply);
  return reply;
}
