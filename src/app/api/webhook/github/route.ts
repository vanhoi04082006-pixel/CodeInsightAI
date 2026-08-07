// CodeInsight AI — GitHub Webhook Handler (Stage 7.4 + audit fix F2)
// POST /api/webhook/github — receives GitHub push/PR events
// Audit fix F2: Verifies x-hub-signature-256 header using HMAC-SHA256.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(req: NextRequest) {
  // Get raw body for signature verification
  const rawBody = await req.text();
  const body = JSON.parse(rawBody);
  const event = req.headers.get("x-github-event");

  // Find webhook config
  const repoOwner = body.repository?.owner?.login || "";
  const repoName = body.repository?.name || "";
  const webhooks = await db.webhook.findMany({ where: { repoOwner, repoName, active: true } });

  if (webhooks.length === 0) {
    return NextResponse.json({ ok: true, message: "No webhooks configured" });
  }

  for (const webhook of webhooks) {
    // Audit fix F2: Verify GitHub signature
    if (webhook.secret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (!signature) {
        return NextResponse.json({ error: "Missing x-hub-signature-256 header" }, { status: 401 });
      }

      const expected = "sha256=" + createHmac("sha256", webhook.secret).update(rawBody).digest("hex");
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);

      if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const events = JSON.parse(webhook.events || "[]");
    if (!events.includes(event)) continue;

    await db.webhook.update({ where: { id: webhook.id }, data: { lastTriggered: new Date() } });

    if (event === "push" || event === "pull_request") {
      console.log(`[Webhook] Triggered for ${repoOwner}/${repoName} — event: ${event}`);
    }
  }

  return NextResponse.json({ ok: true, event, repo: `${repoOwner}/${repoName}` });
}
