import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  const body = await req.json();
  const event = req.headers.get("x-github-event");
  // Find webhook config
  const repoOwner = body.repository?.owner?.login || "";
  const repoName = body.repository?.name || "";
  const webhooks = await db.webhook.findMany({ where: { repoOwner, repoName, active: true } });
  if (webhooks.length === 0) return NextResponse.json({ ok: true, message: "No webhooks configured" });
  for (const webhook of webhooks) {
    const events = JSON.parse(webhook.events || "[]");
    if (!events.includes(event)) continue;
    await db.webhook.update({ where: { id: webhook.id }, data: { lastTriggered: new Date() } });
    // Trigger analysis re-run (async, best-effort)
    if (event === "push" || event === "pull_request") {
      // In production: queue analysis re-run
      console.log(`[Webhook] Triggered for ${repoOwner}/${repoName} — event: ${event}`);
    }
  }
  return NextResponse.json({ ok: true, event, repo: `${repoOwner}/${repoName}` });
}
