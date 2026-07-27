// CodeInsight AI — Secret Redaction (Pre-AI)
//
// Enterprise-grade: BEFORE sending code/prompts to ANY AI provider, secrets are
// replaced with opaque placeholders like `[REDACTED_OPENAI_KEY]`. This ensures
// API keys, tokens, passwords, and private keys NEVER leave the system — they
// are stripped at the single chokepoint (callAI / streamAI) before the network
// request is made.
//
// The AI sees `[REDACTED_OPENAI_KEY]` instead of the real key, so it can still
// reason about the structure of the input (e.g. "you have an API key configured")
// without ever learning the actual value. Because the AI never sees the real
// secret, the AI response cannot leak it — no unredaction of the AI output is
// needed. If the AI mentions a placeholder, that's fine — it's already public
// information (it's a label, not a secret).
//
// NOTE: This is distinct from src/lib/secret-mask.ts which masks secrets for
// Developer Mode UI display (using `sk-***` style masks). This module uses
// semantic placeholders (`[REDACTED_OPENAI_KEY]`) that are useful to the AI.

// Patterns for common secret formats. Each entry has:
//   - regex:      the global regex that matches the secret
//   - placeholder: the string to substitute in (acts as a meaningful label for the AI)
//   - label:      a human-readable name for the redacted secret (for audit logs)
const SECRET_PATTERNS: Array<{ regex: RegExp; placeholder: string; label: string }> = [
  // Anthropic (must come BEFORE generic sk- to avoid being caught first)
  { regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, placeholder: "[REDACTED_ANTHROPIC_KEY]", label: "Anthropic API key" },
  // OpenRouter
  { regex: /sk-or-[a-zA-Z0-9_-]{20,}/g, placeholder: "[REDACTED_OPENROUTER_KEY]", label: "OpenRouter API key" },
  // OpenAI — allows hyphens/underscores so it also catches modern `sk-proj-...` keys.
  // (Anthropic + OpenRouter are stripped first, so this only matches real OpenAI keys.)
  { regex: /sk-[a-zA-Z0-9_-]{20,}/g, placeholder: "[REDACTED_OPENAI_KEY]", label: "OpenAI API key" },
  // GitHub PAT (classic)
  { regex: /ghp_[a-zA-Z0-9]{36}/g, placeholder: "[REDACTED_GITHUB_TOKEN]", label: "GitHub PAT" },
  // GitHub fine-grained PAT
  { regex: /github_pat_[a-zA-Z0-9_]{22,}/g, placeholder: "[REDACTED_GITHUB_PAT]", label: "GitHub fine-grained PAT" },
  // GitHub OAuth / user / server tokens
  { regex: /gh[oousr]_[a-zA-Z0-9]{20,}/g, placeholder: "[REDACTED_GITHUB_OAUTH]", label: "GitHub OAuth token" },
  // Google API key (AIza...)
  { regex: /AIza[a-zA-Z0-9_-]{35}/g, placeholder: "[REDACTED_GOOGLE_KEY]", label: "Google API key" },
  // AWS access key id
  { regex: /AKIA[A-Z0-9]{16}/g, placeholder: "[REDACTED_AWS_KEY]", label: "AWS access key" },
  // AWS secret access key (40-char base64 in assignment form)
  {
    regex: /(?:aws_secret_access_key|secret_access_key|secretKey)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    placeholder: "[REDACTED_AWS_SECRET]",
    label: "AWS secret key",
  },
  // Private keys (RSA, EC, DSA, OpenSSH, PGP)
  {
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    placeholder: "[REDACTED_PRIVATE_KEY]",
    label: "Private key",
  },
  // JWT tokens (header.payload.signature, base64url segments)
  { regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, placeholder: "[REDACTED_JWT]", label: "JWT token" },
  // Slack tokens
  { regex: /xox[baprs]-[a-zA-Z0-9-]{10,}/g, placeholder: "[REDACTED_SLACK_TOKEN]", label: "Slack token" },
  // Stripe keys
  { regex: /(?:sk|pk|rk)_(?:test_|live_)?[a-zA-Z0-9]{24,}/g, placeholder: "[REDACTED_STRIPE_KEY]", label: "Stripe key" },
  // xAI
  { regex: /xai-[a-zA-Z0-9]{16,}/g, placeholder: "[REDACTED_XAI_KEY]", label: "xAI API key" },
  // Database connection strings with embedded passwords
  // e.g. postgres://user:hunter2@host:5432/db
  {
    regex: /((?:postgres|postgresql|mongodb(?:\+srv)?|mysql|redis|amqp|mssql):\/\/[^:/@\s]+):([^@\s]+)@/gi,
    placeholder: "$1:[REDACTED_DB_PASSWORD]@",
    label: "DB connection string password",
  },
  // Generic password / token / secret / api_key assignments: password="..." or api_key: '...'
  // Only triggers when the value is at least 8 chars and quoted (to reduce false positives on prose).
  {
    regex: /((?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*)(["'])([^\s"']{8,})\2/gi,
    placeholder: "$1$2[REDACTED_SECRET]$2",
    label: "Generic secret",
  },
  // Authorization: Bearer <token>  (HTTP header form)
  { regex: /(Bearer\s+)([a-zA-Z0-9._\-]{8,})/gi, placeholder: "$1[REDACTED_BEARER]", label: "Bearer token" },
];

export interface RedactionResult {
  /** The sanitized text, with secrets replaced by `[REDACTED_*]` placeholders. */
  redacted: string;
  /** Total count of secrets redacted across all patterns. */
  redactionCount: number;
  /** Human-readable labels of the secret TYPES that were matched (deduped). */
  redactedLabels: string[];
}

/**
 * Redact secrets from a single string BEFORE sending to an AI provider.
 * Returns the redacted text plus metadata for audit logging.
 *
 * @example
 * const { redacted, redactionCount } = redactSecrets(prompt);
 * // prompt: "OPENAI_API_KEY=sk-abcd1234..."  ->  "OPENAI_API_KEY=[REDACTED_SECRET]..."
 */
export function redactSecrets(text: string): RedactionResult {
  if (!text || typeof text !== "string") {
    return { redacted: text ?? "", redactionCount: 0, redactedLabels: [] };
  }

  let redacted = text;
  let redactionCount = 0;
  const redactedLabels = new Set<string>();

  for (const { regex, placeholder, label } of SECRET_PATTERNS) {
    // Use a fresh non-global regex source for `match` to count occurrences safely.
    // (Global regexes carry lastIndex state across calls — we reset by recreating.)
    const globalRe = new RegExp(regex.source, regex.flags);
    const matches = redacted.match(globalRe);
    if (matches && matches.length > 0) {
      redactionCount += matches.length;
      redactedLabels.add(label);
      redacted = redacted.replace(new RegExp(regex.source, regex.flags), placeholder);
    }
  }

  return { redacted, redactionCount, redactedLabels: Array.from(redactedLabels) };
}

/**
 * Redact secrets from an array of AI messages (system + user + assistant prompts).
 * Returns a new array — the input is not mutated. The role field is preserved.
 *
 * @example
 * const safe = redactMessages([
 *   { role: "system", content: "You are helpful. API_KEY=sk-..." },
 *   { role: "user",   content: "Explain this code: ..." },
 * ]);
 */
export function redactMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    const { redacted } = redactSecrets(msg.content);
    return { ...msg, content: redacted } as T;
  });
}

/**
 * Convenience: redact a single string and return just the safe text (no metadata).
 * Useful for inline use where the caller doesn't care about counts.
 */
export function redactText(text: string): string {
  return redactSecrets(text).redacted;
}
