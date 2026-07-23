// POST /api/billing/portal — Create Stripe Customer Portal session
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing/stripe";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },                // look up by User.id (cuid), NOT email
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const result = await createPortalSession(
      user.stripeCustomerId,
      `${origin}/?view=settings`,
    );

    if (!result) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/billing/portal]", e);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
