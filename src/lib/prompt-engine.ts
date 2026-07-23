// CodeInsight AI — Prompt Engine
// Constructs AI prompts dynamically from real repository context.
// Token-aware, deduplicates context, ranks by relevance.

import type { ParsedFile, ParsedRepository } from "./repo-parser";

export interface PromptContext {
  systemPrompt: string;
  repositoryContext: string;
  retrievedChunks: { path: string; score: number; snippet: string }[];
  finalPrompt: string;
  estimatedTokens: number;
}

// Rough token estimate: ~4 chars per token
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Build repository summary for the prompt
function buildRepoSummary(parsed: ParsedRepository): string {
  const langList = parsed.languages.slice(0, 5).map((l) => `${l.name} (${l.percentage}%)`).join(", ");
  const fwList = parsed.frameworks.map((f) => `${f.name} ${f.version}`).join(", ");
  const entryPoints = parsed.entryPoints.slice(0, 5).join("\n  - ");
  return `REPOSITORY SUMMARY
- Repo: ${parsed.owner}/${parsed.name} (branch: ${parsed.branch})
- URL: ${parsed.url}
- Total files: ${parsed.totalFiles} | Total lines: ${parsed.totalLines.toLocaleString()}
- Languages: ${langList}
- Frameworks: ${fwList || "none detected"}
- Package manager: ${parsed.packageManager}
- Entry points:
  - ${entryPoints || "not detected"}
- Config files: ${parsed.configFiles.slice(0, 10).join(", ") || "none"}`;
}

// Rank files by relevance to a user question
function rankFilesByRelevance(files: ParsedFile[], question: string): ParsedFile[] {
  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter((w) => w.length > 2);

  return files
    .map((f) => {
      let score = 0;
      const pathLower = f.path.toLowerCase();
      const descLower = f.description.toLowerCase();

      // Path keyword match (high weight)
      for (const kw of keywords) {
        if (pathLower.includes(kw)) score += 10;
        if (descLower.includes(kw)) score += 5;
        // Function name match
        if (f.functions.some((fn) => fn.toLowerCase().includes(kw))) score += 8;
        // Class name match
        if (f.classes.some((cl) => cl.toLowerCase().includes(kw))) score += 8;
        // Import match
        if (f.imports.some((im) => im.toLowerCase().includes(kw))) score += 3;
      }

      // Boost entry points and core files
      if (f.path.endsWith("page.tsx") || f.path.endsWith("route.ts")) score += 5;
      if (f.path.includes("auth")) score += 3;
      if (f.path.includes("middleware")) score += 3;
      if (f.path.includes("api")) score += 2;
      if (f.path.includes("config")) score += 2;

      // Penalize test files
      if (f.path.includes(".test.") || f.path.includes(".spec.")) score -= 5;
      if (f.path.includes("__tests__")) score -= 5;

      return { file: f, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.file);
}

// Build file context block
function buildFileContext(f: ParsedFile, maxChars: number): string {
  const parts: string[] = [];
  parts.push(`FILE: ${f.path} (${f.language}, ${f.lines} lines)`);
  parts.push(`Description: ${f.description}`);

  if (f.imports.length > 0) {
    parts.push(`Imports: ${f.imports.slice(0, 10).join(", ")}`);
  }
  if (f.functions.length > 0) {
    parts.push(`Functions: ${f.functions.slice(0, 15).join(", ")}`);
  }
  if (f.classes.length > 0) {
    parts.push(`Classes: ${f.classes.join(", ")}`);
  }
  if (f.components.length > 0) {
    parts.push(`Components: ${f.components.join(", ")}`);
  }
  if (f.routes.length > 0) {
    parts.push(`Routes: ${f.routes.join(", ")}`);
  }
  if (f.exports.length > 0) {
    parts.push(`Exports: ${f.exports.slice(0, 10).join(", ")}`);
  }

  let result = parts.join("\n  ");

  // Truncate if too long
  if (result.length > maxChars) {
    result = result.substring(0, maxChars) + "\n  ... (truncated)";
  }
  return result;
}

// Build dependency graph context
function buildDependencyContext(parsed: ParsedRepository): string {
  const { nodes, edges, circular } = parsed.dependencies;
  const parts: string[] = [];

  parts.push(`DEPENDENCY GRAPH`);
  parts.push(`- Nodes: ${nodes.length}`);
  parts.push(`- Edges: ${edges.length}`);
  parts.push(`- Circular dependencies: ${circular.length}`);

  if (circular.length > 0) {
    parts.push(`- Circular: ${circular.slice(0, 5).map((c) => c.nodes.join(" → ")).join("; ")}`);
  }

  // Top connected files (most imports)
  const topImporters = parsed.files
    .map((f) => ({ path: f.path, importCount: f.imports.length }))
    .sort((a, b) => b.importCount - a.importCount)
    .slice(0, 10);
  parts.push(`- Most connected files:`);
  for (const t of topImporters) {
    parts.push(`  - ${t.path} (${t.importCount} imports)`);
  }

  return parts.join("\n");
}

/**
 * Build the full prompt context for an AI request.
 * Token-aware: respects a max token budget, deduplicates context,
 * and ranks files by relevance to the user's question.
 */
export function buildPromptContext(
  parsed: ParsedRepository,
  question: string,
  personalitySystemPrompt: string,
  language: string,
  maxTokens: number = 8000
): PromptContext {
  const systemPrompt = personalitySystemPrompt || `You are CodeInsight AI — an elite AI CTO, Software Architect, Security Expert, Performance Engineer, and Senior Staff Engineer combined.`;

  // Build repository summary
  const repoSummary = buildRepoSummary(parsed);

  // Build dependency context
  const depContext = buildDependencyContext(parsed);

  // Rank files by relevance to the question
  const rankedFiles = rankFilesByRelevance(parsed.files, question);

  // Build file contexts within token budget
  const fileContexts: string[] = [];
  const retrievedChunks: { path: string; score: number; snippet: string }[] = [];
  let usedChars = systemPrompt.length + repoSummary.length + depContext.length + question.length + 500; // overhead
  const maxChars = maxTokens * 4; // 4 chars per token

  for (const f of rankedFiles) {
    const remaining = maxChars - usedChars;
    if (remaining < 200) break;

    const fileCtx = buildFileContext(f, Math.min(remaining, 500));
    fileContexts.push(fileCtx);
    usedChars += fileCtx.length + 10;

    // Simulate retrieval score (based on ranking position)
    retrievedChunks.push({
      path: f.path,
      score: 1 - (rankedFiles.indexOf(f) / rankedFiles.length),
      snippet: f.description,
    });
  }

  const fileContextStr = fileContexts.length > 0
    ? `RELEVANT FILES (${fileContexts.length} of ${parsed.files.length})\n${fileContexts.map((c) => "  - " + c).join("\n")}`
    : "RELEVANT FILES\n  No files matched the query.";

  const langInstruction = language === "vi"
    ? "\n\nIMPORTANT: Respond in Vietnamese (Tiếng Việt). Keep code, file paths, and technical terms in English, but write all prose and explanations in Vietnamese."
    : "\n\nRespond in English.";

  const finalSystemPrompt = systemPrompt + langInstruction;

  const repositoryContext = [repoSummary, "", depContext, "", fileContextStr].join("\n");

  const finalPrompt = `[SYSTEM]\n${finalSystemPrompt}\n\n[REPOSITORY CONTEXT]\n${repositoryContext}\n\n[USER QUESTION]\n${question}`;

  return {
    systemPrompt: finalSystemPrompt,
    repositoryContext,
    retrievedChunks: retrievedChunks.slice(0, 10),
    finalPrompt,
    estimatedTokens: estimateTokens(finalPrompt),
  };
}

/**
 * Semantic search simulation — finds files matching a concept.
 * "authentication" finds files with login, jwt, oauth, middleware, session, etc.
 */
export function semanticSearch(parsed: ParsedRepository, query: string): { path: string; score: number; reason: string }[] {
  const SYNONYMS: Record<string, string[]> = {
    "auth": ["login", "jwt", "oauth", "middleware", "session", "guards", "passport", "rbac", "permission", "auth"],
    "authentication": ["login", "jwt", "oauth", "middleware", "session", "guards", "passport", "rbac", "permission", "auth"],
    "database": ["prisma", "db", "model", "schema", "migration", "sql", "mongo", "postgres", "mysql", "sqlite"],
    "api": ["route", "controller", "endpoint", "handler", "rest", "graphql", "trpc", "api"],
    "state": ["store", "zustand", "redux", "context", "provider", "state", "atom", "recoil"],
    "ui": ["component", "page", "layout", "render", "jsx", "tsx", "view", "button", "card"],
    "config": ["config", "env", "settings", "options", "constants", "variables"],
    "test": ["test", "spec", "mock", "fixture", "assert", "jest", "vitest", "pytest"],
    "security": ["secret", "vulnerab", "xss", "csrf", "injection", "hash", "encrypt", "password", "token"],
    "performance": ["cache", "memo", "lazy", "defer", "optimize", "bundle", "render", "virtuali"],
  };

  const q = query.toLowerCase();
  const searchTerms = new Set<string>([q]);

  // Find synonyms
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (q.includes(key)) {
      syns.forEach((s) => searchTerms.add(s));
    }
  }

  const results: { path: string; score: number; reason: string }[] = [];

  for (const f of parsed.files) {
    let score = 0;
    const reasons: string[] = [];

    for (const term of searchTerms) {
      if (f.path.toLowerCase().includes(term)) { score += 10; reasons.push(`path contains "${term}"`); }
      if (f.description.toLowerCase().includes(term)) { score += 5; reasons.push(`description mentions "${term}"`); }
      if (f.functions.some((fn) => fn.toLowerCase().includes(term))) { score += 8; reasons.push(`function name matches "${term}"`); }
      if (f.imports.some((im) => im.toLowerCase().includes(term))) { score += 3; reasons.push(`import matches "${term}"`); }
    }

    if (score > 0) {
      results.push({ path: f.path, score, reason: reasons.slice(0, 3).join("; ") });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}
