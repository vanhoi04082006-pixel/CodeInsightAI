// POST /api/terminal/run — Run a sandboxed shell command
import { NextRequest, NextResponse } from "next/server";
import { commandRunner, permissionSystem, commandHistory } from "@/lib/terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const body = await req.json();
    const { command, cwd, timeout, env } = body;

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Missing 'command'" }, { status: 400 });
    }

    // Permission check
    const permission = permissionSystem.checkPermission(command);
    if (permission === "deny") {
      return NextResponse.json({
        error: "Command denied by permission system",
        command,
        permission,
      }, { status: 403 });
    }
    if (permission === "prompt") {
      // In a real app, we'd prompt the user. For API, require explicit allow.
      return NextResponse.json({
        error: "Command requires user confirmation",
        command,
        permission: "prompt",
        message: "This command is not in the allowlist. Add it via POST /api/terminal/permissions or use an allowlisted command.",
      }, { status: 402 });
    }

    const controller = new AbortController();
    const result = await commandRunner.runCommand(command, {
      cwd,
      timeout: timeout ?? 30000,
      env,
      signal: controller.signal,
    });

    return NextResponse.json({
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cancelled: result.cancelled,
      historyId: commandHistory.getAll().slice(-1)[0]?.id,
    });
  } catch (err: any) {
    console.error("[/api/terminal/run] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
