// GET /api/mission/stream?missionId=xxx — Server-Sent Events stream
// Phase A: Live mission events for the UI.
//
// Each event is sent as `data: <JSON>\n\n`. A heartbeat comment (`: ping\n\n`)
// is emitted every 15s to keep proxies / browsers from closing the connection.
// The subscriber is removed on client disconnect to avoid memory leaks.

import { NextRequest } from "next/server";
import { missionEmitter } from "@/lib/agents/executive/event-emitter";
import type { MissionEvent } from "@/lib/agents/executive/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const missionId = url.searchParams.get("missionId");

  if (!missionId) {
    return new Response(JSON.stringify({ error: "Missing 'missionId' query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Use a TransformStream so we can push events as they arrive.
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  let closed = false;
  const safeWrite = async (text: string): Promise<void> => {
    if (closed) return;
    try {
      await writer.write(encoder.encode(text));
    } catch {
      closed = true;
    }
  };

  // SSE event handler — converts a MissionEvent into an SSE `data:` line.
  const onEvent = (event: MissionEvent): void => {
    // `data:` lines cannot contain raw newlines — JSON.stringify already
    // escapes them, so the payload is single-line.
    void safeWrite(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Subscribe to live + replayed events.
  const unsubscribe = missionEmitter.subscribe(missionId, onEvent);

  // Send an initial hello so the client knows the connection is live.
  await safeWrite(`: connected to mission ${missionId}\n\n`);

  // Heartbeat interval.
  const heartbeat = setInterval(() => {
    void safeWrite(`: ping ${new Date().toISOString()}\n\n`);
  }, HEARTBEAT_MS);

  // Detect client disconnect via req.signal (Next.js / undici).
  const onAbort = () => {
    closed = true;
    clearInterval(heartbeat);
    try {
      unsubscribe();
    } catch {
      /* ignore */
    }
    try {
      void writer.close();
    } catch {
      /* already closed */
    }
  };
  if (req.signal.aborted) {
    onAbort();
  } else {
    req.signal.addEventListener("abort", onAbort, { once: true });
  }

  // Headers per the SSE spec.
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering
  });

  return new Response(stream.readable, { headers });
}
