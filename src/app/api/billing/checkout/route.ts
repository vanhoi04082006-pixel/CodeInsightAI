// POST /api/billing/checkout — Create Stripe Checkout Session
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || "" as any) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { plan } = await req.json();
    if (plan !== "pro" && plan !== "team") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const result = await createCheckoutSession(
      (session.user.email ?? "") as any,
      session.user.email,
      plan,
      `${origin}/settings?status=success`,
      `${origin}/settings?status=cancelled`,
    );

    if (!result) {
      return NextResponse.json({
        error: "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO/TEAM env vars.",
      }, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/billing/checkout]", e);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
