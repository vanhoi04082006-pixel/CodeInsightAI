// CodeInsight AI — Audit log helper for admin actions.
//
// Every admin API route that mutates state (upgrade, ban, delete, etc.)
// MUST call logAdminAction() before returning, so we have a full trail of
// who did what to whom.

import { db } from "@/lib/db";

export async function logAdminAction(
  adminId: string,
  action: string,
  targetId?: string | null,
  details?: Record<string, any>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        adminId,
        action,
        targetId: targetId ?? null,
        details: JSON.stringify(details ?? {}),
      },
    });
  } catch (e) {
    // Audit log failure must NEVER break the main operation — just log it.
    console.error("[audit] Failed to log admin action:", e);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// AI CALL LOGGING (W6-C — enterprise hardening)
// ───────────────────────────────────────────────────────────────────────────
// Every callAI()/streamAI() invocation should produce one AICallLog row so
// we can track cost (tokens × model), latency, error rate, and how many
// secrets were redacted before the prompt left the system.
//
// userId is OPTIONAL: callAI() is the single chokepoint and doesn't always
// have user context (background analysis, system passes). API routes that
// DO have userId from requireUserId() can call logAICall() directly to
// attach a richer record — or callAI() will log a basic telemetry row with
// userId=null.
//
// This function is BEST-EFFORT: it must NEVER throw or break the AI call.
// All failures are caught and logged to stderr.

export interface AICallLogParams {
  userId?: string | null;
  analysisId?: string | null;
  agent?: string | null; // "security" | "overview" | "chat" | "deep-analysis" | ...
  passType?: string | null; // analysis pass name (architecture | security | ...)
  provider: string; // openai | anthropic | openrouter | gemini | azure | ...
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  status: "success" | "error" | "timeout";
  error?: string | null;
  redactionCount?: number;
  redactedLabels?: string[];
}

export async function logAICall(params: AICallLogParams): Promise<void> {
  try {
    await db.aICallLog.create({
      data: {
        userId: params.userId ?? null,
        analysisId: params.analysisId ?? null,
        agent: params.agent ?? null,
        passType: params.passType ?? null,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens ?? null,
        outputTokens: params.outputTokens ?? null,
        totalTokens: params.totalTokens ?? null,
        latencyMs: params.latencyMs ?? null,
        status: params.status,
        // Truncate long error strings so a single bad call can't blow up the row.
        error: params.error ? String(params.error).slice(0, 500) : null,
        redactionCount: params.redactionCount ?? 0,
        redactedLabels: JSON.stringify(params.redactedLabels ?? []),
      },
    });
  } catch (e) {
    // Audit log failure must NEVER break the AI call — just log it.
    console.error("[audit] Failed to log AI call:", e);
  }
}

