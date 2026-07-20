// POST /api/billing/webhook — Stripe webhook handler
// NOTE: Stripe sends raw body — must use `body: false` (Next.js handles this)
import { NextRequest, NextResponse } from "next/server";
import { handleWebhookEvent } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    // Get raw body as text
    const rawBody = await req.text();

    const result = await handleWebhookEvent(rawBody, signature);

    if (!result.received) {
      return NextResponse.json({ error: "Stripe not configured or invalid signature" }, { status: 503 });
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[/api/billing/webhook]", e);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
