// GET /api/admin/subscriptions — List Pro/Team subscribers with Stripe info.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const subscribers = await db.user.findMany({
      where: {
        OR: [{ plan: "pro" }, { plan: "team" }, { plan: "enterprise" }],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        plan: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { analyses: true } },
      },
    });

    const mrr = subscribers.reduce((sum, u) => {
      if (u.plan === "pro") return sum + 9;
      if (u.plan === "team") return sum + 29;
      if (u.plan === "enterprise") return sum + 99;
      return sum;
    }, 0);

    return NextResponse.json({
      subscribers,
      total: subscribers.length,
      mrr,
    });
  } catch (e) {
    console.error("[/api/admin/subscriptions]", e);
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }
}
