// GET /api/admin/users — List all users (paginated, searchable).
// PATCH /api/admin/users — (body: { id, plan?, role?, banned? }) — update a user.
// DELETE /api/admin/users?id=... — Delete a user + all their data.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const url = req.nextUrl;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const q = url.searchParams.get("q")?.trim();
    const planFilter = url.searchParams.get("plan") ?? undefined;

    const where = {
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      } : {}),
      ...(planFilter && planFilter !== "all" ? { plan: planFilter } : {}),
    };

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          plan: true,
          role: true,
          banned: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              analyses: true,
              credentials: true,
              usageRecords: true,
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, limit, offset });
  } catch (e) {
    console.error("[/api/admin/users GET]", e);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const { id, plan, role, banned } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Prevent admin from demoting/banning themselves
    if (id === adminId && (banned === true || role === "user")) {
      return NextResponse.json({ error: "Cannot demote or ban yourself" }, { status: 400 });
    }

    const data: any = {};
    if (plan !== undefined) data.plan = plan;
    if (role !== undefined) data.role = role;
    if (banned !== undefined) data.banned = banned;

    const user = await db.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, plan: true, role: true, banned: true },
    });

    // Audit log
    const action = banned === true ? "ban_user" : banned === false ? "unban_user" : plan ? (plan === "free" ? "downgrade_user" : "upgrade_user") : "update_user";
    await logAdminAction(adminId, action, id, { plan, role, banned });

    return NextResponse.json({ user });
  } catch (e) {
    console.error("[/api/admin/users PATCH]", e);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (id === adminId) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    // Capture user info for audit before deletion
    const user = await db.user.findUnique({
      where: { id },
      select: { email: true, name: true, plan: true },
    });

    // Cascade delete handles all related rows
    await db.user.delete({ where: { id } });

    await logAdminAction(adminId, "delete_user", id, { email: user?.email, name: user?.name });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/admin/users DELETE]", e);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
