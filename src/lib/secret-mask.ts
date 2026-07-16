// CodeInsight AI — Secret masking for Developer Mode
// Developer Mode must NEVER expose API keys, tokens, passwords, or credentials.

const SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  // OpenAI / OpenRouter / Anthropic / generic API keys
  { re: /\b(sk-[a-zA-Z0-9_-]{16,})\b/g, label: "sk-***" },
  { re: /\b(sk-ant-[a-zA-Z0-9_-]{16,})\b/g, label: "sk-ant-***" },
  { re: /\b(sk-or-[a-zA-Z0-9_-]{16,})\b/g, label: "sk-or-***" },
  // GitHub PATs (classic + fine-grained)
  { re: /\b(ghp_[a-zA-Z0-9]{20,})\b/g, label: "ghp_***" },
  { re: /\b(github_pat_[a-zA-Z0-9_]{20,})\b/g, label: "github_pat_***" },
  { re: /\b(gho_[a-zA-Z0-9]{20,})\b/g, label: "gho_***" },
  { re: /\b(ghu_[a-zA-Z0-9]{20,})\b/g, label: "ghu_***" },
  { re: /\b(ghs_[a-zA-Z0-9]{20,})\b/g, label: "ghs_***" },
  // Google / Gemini
  { re: /\b(AIza[a-zA-Z0-9_-]{20,})\b/g, label: "AIza***" },
  // xAI
  { re: /\b(xai-[a-zA-Z0-9]{16,})\b/g, label: "xai-***" },
  // DeepSeek
  { re: /\b(sk-[a-zA-Z0-9]{16,})\b/g, label: "sk-***" },
  // Bearer tokens in headers
  { re: /(Bearer\s+)([a-zA-Z0-9_.\-]{8,})/gi, label: "$1***" },
];

const ENV_SECRET_RE = /((?:API_KEY|SECRET|TOKEN|PASSWORD|PASSPHRASE|PRIVATE_KEY|CREDENTIAL)(?:_?[A-Z0-9]*)*)(\s*[:=]\s*)(["']?)([^"'\s]{4,})\3/gi;

/**
 * Mask known secret patterns in a string. Returns the masked version.
 * Used before displaying any prompt/response/context in Developer Mode.
 */
export function maskSecrets(input: string): string {
  if (!input || typeof input !== "string") return input;
  let out = input;
  for (const { re, label } of SECRET_PATTERNS) {
    out = out.replace(re, label);
  }
  // Mask values of env-style assignments: API_KEY=sk-... → API_KEY=***
  out = out.replace(ENV_SECRET_RE, "$1$2$3***$3");
  return out;
}

/**
 * Mask an object deeply — recursively walks and masks string values.
 */
export function maskSecretsDeep<T>(obj: T): T {
  if (typeof obj === "string") return maskSecrets(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(maskSecretsDeep) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // never expose keys whose name looks like a secret, regardless of value
      if (/^(api[_-]?key|secret|token|password|passwd|private[_-]?key|credential|authorization)$/i.test(k)) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = maskSecretsDeep(v);
      }
    }
    return out as unknown as T;
  }
  return obj;
}

/**
 * Estimate token count for a string (rough: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
