import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/search — semantic search over repository file summaries
// Body: { analysisId, query }
export async function POST(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { analysisId, query } = await req.json();
    if (!analysisId || !query) return NextResponse.json({ error: "analysisId and query required" }, { status: 400 });

    // Get file summaries from DB (structured memory)
    const summaries = await db.fileSummary.findMany({
      where: { analysisId },
      select: {
        path: true, language: true, lines: true, complexity: true,
        description: true, imports: true, exports: true,
        functions: true, classes: true, components: true, routes: true,
      },
    });

    if (summaries.length === 0) {
      // Fallback: try parsedData from analysis
      const analysis = await db.analysis.findUnique({ where: { id: analysisId } });
      if (analysis?.parsedData) {
        try {
          const parsed = JSON.parse(analysis.parsedData);
          const { semanticSearch } = await import("@/lib/prompt-engine");
          const results = semanticSearch(parsed, query);
          return NextResponse.json({ query, results, total: results.length, source: "parsedData" });
        } catch { /* fall through */ }
      }
      return NextResponse.json({ error: "No file summaries found. Run analysis first." }, { status: 400 });
    }

    // Semantic search with synonym expansion
    const SYNONYMS: Record<string, string[]> = {
      "auth": ["login", "jwt", "oauth", "middleware", "session", "guards", "passport", "rbac", "permission", "auth"],
      "authentication": ["login", "jwt", "oauth", "middleware", "session", "guards", "passport", "rbac", "permission", "auth"],
      "database": ["prisma", "db", "model", "schema", "migration", "sql", "mongo", "postgres", "mysql", "sqlite"],
      "api": ["route", "controller", "endpoint", "handler", "rest", "graphql", "trpc", "api"],
      "state": ["store", "zustand", "redux", "context", "provider", "state", "atom"],
      "ui": ["component", "page", "layout", "render", "jsx", "tsx", "view", "button", "card"],
      "config": ["config", "env", "settings", "options", "constants"],
      "test": ["test", "spec", "mock", "fixture", "assert", "jest", "vitest", "pytest"],
      "security": ["secret", "vulnerab", "xss", "csrf", "injection", "hash", "encrypt", "password", "token"],
      "performance": ["cache", "memo", "lazy", "defer", "optimize", "bundle", "render", "virtuali"],
    };

    const q = query.toLowerCase();
    const searchTerms = new Set<string>([q]);
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (q.includes(key)) syns.forEach((s) => searchTerms.add(s));
    }

    const results = summaries.map((s) => {
      let score = 0;
      const reasons: string[] = [];
      const safeParse = (str: string): string[] => { try { return JSON.parse(str); } catch { return []; } };

      const funcs = safeParse(s.functions);
      const imports = safeParse(s.imports);
      const comps = safeParse(s.components);
      const routes = safeParse(s.routes);
      const classes = safeParse(s.classes);

      for (const term of searchTerms) {
        if (s.path.toLowerCase().includes(term)) { score += 10; reasons.push(`path contains "${term}"`); }
        if (s.description.toLowerCase().includes(term)) { score += 5; reasons.push(`description mentions "${term}"`); }
        if (funcs.some((fn: string) => fn.toLowerCase().includes(term))) { score += 8; reasons.push(`function matches "${term}"`); }
        if (classes.some((cl: string) => cl.toLowerCase().includes(term))) { score += 8; reasons.push(`class matches "${term}"`); }
        if (imports.some((im: string) => im.toLowerCase().includes(term))) { score += 3; reasons.push(`import matches "${term}"`); }
        if (comps.some((cp: string) => cp.toLowerCase().includes(term))) { score += 6; reasons.push(`component matches "${term}"`); }
        if (routes.some((rt: string) => rt.toLowerCase().includes(term))) { score += 6; reasons.push(`route matches "${term}"`); }
      }
      return { path: s.path, score, reason: reasons.slice(0, 3).join("; "), language: s.language, lines: s.lines };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

    return NextResponse.json({ query, results, total: results.length, source: "fileSummaries" });
  } catch (e) {
    console.error("[/api/search] error", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
