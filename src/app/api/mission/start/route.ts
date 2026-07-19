// POST /api/mission/start — Start an autonomous mission
// Phase A: Executive Agent + ReAct loop.
//
// Body: { goal, repositoryUrl?, provider?, cwd?, maxIterations? }
// Returns: { missionId }
//
// The mission runs in the background (non-blocking). The frontend subscribes
// to live events via GET /api/mission/stream?missionId=...

import { NextRequest, NextResponse } from "next/server";
import { startMission } from "@/lib/agents/executive/executive-agent";
import type { AIProviderConfig } from "@/lib/agents/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for the request itself; mission keeps running

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { goal, repositoryUrl, provider, cwd, maxIterations } = body as {
      goal?: string;
      repositoryUrl?: string;
      provider?: AIProviderConfig;
      cwd?: string;
      maxIterations?: number;
    };

    if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'goal' (must be a non-empty string)" },
        { status: 400 },
      );
    }

    // Validate provider shape (best-effort — surface errors early).
    if (
      provider &&
      (typeof provider !== "object" ||
        typeof provider.providerId !== "string" ||
        typeof provider.baseUrl !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid 'provider' (must have providerId + baseUrl)" },
        { status: 400 },
      );
    }

    // Cap maxIterations to a sane bound.
    const iters =
      typeof maxIterations === "number" && maxIterations > 0
        ? Math.min(maxIterations, 100)
        : 25;

    const { missionId } = await startMission({
      goal: goal.trim(),
      repositoryUrl,
      provider,
      cwd,
      maxIterations: iters,
    });

    return NextResponse.json({ missionId, stream: `/api/mission/stream?missionId=${missionId}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/mission/start] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET on this route returns a small help message (405 is too harsh).
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/mission/start",
    usage: 'POST with JSON body: { "goal": "...", "repositoryUrl?": "...", "provider?": {...}, "maxIterations?": 25 }',
    returns: '{ "missionId": "...", "stream": "/api/mission/stream?missionId=..." }',
  });
}
