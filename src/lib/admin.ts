// CodeInsight AI — Admin authorization helper
//
// An admin is a user whose email matches the ADMIN_EMAIL env var, OR whose
// `role` field in the database is "admin". The JWT callback in auth.ts
// automatically promotes ADMIN_EMAIL users on sign-in.
//
// Usage in API routes:
//   import { requireAdmin } from "@/lib/admin";
//   const adminId = await requireAdmin();
//   if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Returns the admin user's id if the current session is an admin, else null.
 * Reads `role` from the DB (source of truth) — the JWT is a cache but the DB
 * is authoritative, so role changes take effect on the next request.
 */
export async function requireAdmin(): Promise<string | null> {
  const userId = await requireUserId();
  if (!userId) return null;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, banned: true },
    });

    // Banned users can never be admin
    if (!user || user.banned) return null;

    // Admin by DB role
    if (user.role === "admin") return userId;

    // Admin by ADMIN_EMAIL env var (fallback — in case JWT callback hasn't
    // promoted the user yet, e.g. they signed up before ADMIN_EMAIL was set)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email && user.email.toLowerCase() === adminEmail.toLowerCase()) {
      // Promote them now (best-effort)
      try {
        await db.user.update({
          where: { id: userId },
          data: { role: "admin", plan: "enterprise" },
        });
      } catch { /* ignore concurrent updates */ }
      return userId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a user id is an admin (without requiring a session).
 * Used for internal checks (e.g. audit log display).
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, banned: true },
    });
    if (!user || user.banned) return false;
    if (user.role === "admin") return true;
    const adminEmail = process.env.ADMIN_EMAIL;
    return !!(adminEmail && user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
  } catch {
    return false;
  }
}
