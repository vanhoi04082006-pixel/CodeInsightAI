// CodeInsight AI — Agent Cancel API (Layer 9)
// POST /api/agent/cancel — Cancel a running agent task
//
// Signals the Runtime to cancel a running task. Uses the in-memory registry
// shared with /api/agent/run (per-server-instance, same as /api/agent/permission).

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { taskId } = body;

  if (!taskId || typeof taskId !== "string") {
    return NextResponse.json({ error: "Missing 'taskId' field" }, { status: 400 });
  }

  const globalAny = globalThis as any;
  const activeRuntimes = globalAny.__agentActiveRuntimes as Map<string, any> | undefined;
  if (!activeRuntimes) {
    return NextResponse.json({ ok: false, error: "No active runtimes registry" }, { status: 404 });
  }

  const entry = activeRuntimes.get(taskId);
  if (!entry) {
    return NextResponse.json(
      { ok: false, error: "Task not found or already completed", taskId },
      { status: 404 },
    );
  }

  // Signal the runtime to cancel (and cancel all pending permission requests).
  try {
    if (typeof entry.cancel === "function") {
      entry.cancel(taskId);
    }
    if (entry.permissionGate && typeof entry.permissionGate.cancelAll === "function") {
      entry.permissionGate.cancelAll();
    }
  } catch {
    // best-effort
  }

  activeRuntimes.delete(taskId);

  return NextResponse.json({ ok: true, taskId, cancelled: true });
}
