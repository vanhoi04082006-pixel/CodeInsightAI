// Multi-tenant ownership helper.
//
// All API routes that accept an `analysisId` (path param, query string, or
// body field) MUST verify that the analysis belongs to the authenticated
// user BEFORE doing any work with it. Without this check, user A can access
// user B's analysis data (chat history, file summaries, AI passes, code
// graph, etc.) by simply guessing or enumerating analysisId values.
//
// Pattern (in a route handler):
//
//   const userId = await requireUserId();
//   if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
//
//   const analysis = await verifyAnalysisOwnership(analysisId, userId, {
//     select: { userId: true, report: true },
//   });
//   if (!analysis) {
//     // 404 (not 403) — don't leak that the resource exists
//     return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
//   }
//   // ... use analysis.* (only the fields you selected) ...
//
// Share-token exception:
//   `/api/share/[token]` is intentionally public — the share token IS the
//   capability. Pass the token to `verifyAnalysisOwnership` as the 4th arg
//   to allow shared read-only access (used by `/api/report` when a share
//   token is supplied). See `src/app/api/share/[token]/route.ts` for the
//   canonical public path — that route doesn't go through this helper.

import { db } from "@/lib/db";

// Prisma's `Analysis` model select type — kept loose to avoid coupling callers
// to the Prisma namespace. Callers pass a `{ select: { ... } }` object exactly
// as they would to `db.analysis.findUnique`.
type AnalysisSelectArg = { select: Record<string, boolean> };

// Return type is `any` on purpose — the caller selected specific fields, so
// the runtime shape varies per call site. The caller is expected to know the
// shape it asked for.
type AnalysisRow = any;

/**
 * Verify that an analysis belongs to the current user (or is shared via a
 * valid share token). Returns the analysis row (with the requested fields)
 * if authorized, `null` otherwise.
 *
 * Caller handles `null` by returning a 404 (NOT 403 — never leak that the
 * resource exists to a different tenant).
 *
 * @param analysisId  The analysis ID to check.
 * @param userId      The authenticated user's ID (from `requireUserId()`).
 * @param select      Optional `{ select: { ... } }` clause (Prisma-style).
 *                    Defaults to `{ select: { userId: true } }` (minimal —
 *                    use a real select in routes that need more fields).
 * @param shareToken  Optional share token. When provided AND the token is
 *                    valid + not expired, access is granted even if the
 *                    analysis belongs to a different user. This supports
 *                    the public read-only share mechanism (P3.7 share
 *                    exception). Most routes don't pass this — only
 *                    `/api/report` and any future "public read" endpoints.
 *
 * @returns The analysis row (selected fields only), or `null` if:
 *            - the analysis doesn't exist, OR
 *            - it belongs to a different user AND no valid share token was
 *              provided, OR
 *            - the share token is expired / doesn't match the analysis.
 *
 * @never throws — caller can use the null-coalescing pattern without try/catch.
 */
export async function verifyAnalysisOwnership(
  analysisId: string,
  userId: string | null,
  select?: AnalysisSelectArg,
  shareToken?: string,
): Promise<AnalysisRow | null> {
  if (!analysisId) return null;

  // Minimal safety: require either a userId OR a shareToken. If neither is
  // present, deny (no anonymous access except via explicit share token).
  if (!userId && !shareToken) return null;

  const selectClause =
    select && select.select && Object.keys(select.select).length > 0
      ? select.select
      : { userId: true };

  let analysis: AnalysisRow | null = null;
  try {
    analysis = await db.analysis.findUnique({
      where: { id: analysisId },
      select: selectClause,
    });
  } catch {
    // DB errors → fail closed (treat as not found)
    return null;
  }

  if (!analysis) return null;

  // Happy path: caller owns the analysis.
  if (userId && analysis.userId === userId) return analysis;

  // Fallback: a share token grants read access.
  if (shareToken) {
    try {
      const token = await db.shareToken.findFirst({
        where: {
          analysisId,
          token: shareToken,
          // Token must not be expired (null expiresAt = never expires)
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        select: { id: true },
      });
      if (token) return analysis;
    } catch {
      // fall through to deny
    }
  }

  return null;
}

/**
 * Convenience: verify ownership WITHOUT loading any extra fields — use this
 * for routes that only need to gate access (e.g. `/api/chat` which loads
 * the report separately via the same row).
 *
 * Returns `true` if the caller is authorized, `false` otherwise.
 */
export async function isAnalysisAccessible(
  analysisId: string,
  userId: string | null,
  shareToken?: string,
): Promise<boolean> {
  const row = await verifyAnalysisOwnership(
    analysisId,
    userId,
    { select: { userId: true } },
    shareToken,
  );
  return row !== null;
}
