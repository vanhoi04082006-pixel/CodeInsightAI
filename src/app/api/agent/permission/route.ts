// CodeInsight AI — Agent Permission API (Layer 9)
// POST /api/agent/permission — Respond to permission requests
//
// Signals the Runtime's PermissionGate to resolve a pending permission request.
// Uses in-memory registry from /api/agent/run (per-server-instance).

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { nodeId, granted, taskId, reason } = body;

  if (!nodeId || typeof granted !== "boolean") {
    return NextResponse.json({ error: "Missing 'nodeId' or 'granted' field" }, { status: 400 });
  }

  if (!taskId) {
    return NextResponse.json({ error: "Missing 'taskId' field" }, { status: 400 });
  }

  // Dynamically import to get the active runtimes registry
  // (same module instance as /api/agent/run since Next.js bundles per-route)
  // In Vercel serverless, this won't work across invocations.
  // For production, use Redis pub/sub or DB polling.
  // For now, we use a global registry that persists within the same server process.
  // Use a global registry for cross-route communication
  const globalAny = globalThis as any;
  if (!globalAny.__agentActiveRuntimes) {
    globalAny.__agentActiveRuntimes = new Map();
  }
  const activeRuntimes = globalAny.__agentActiveRuntimes as Map<string, any>;

  const entry = activeRuntimes.get(taskId);
  if (!entry) {
    return NextResponse.json(
      { error: "Task not found or already completed", taskId },
      { status: 404 },
    );
  }

  // Signal the PermissionGate
  entry.permissionGate.respond(nodeId, granted, reason);

  return NextResponse.json({ ok: true, nodeId, granted, taskId });
}
