// CodeInsight AI — Stage 2.1: Inline Agent Framework
// Context Adapter types — normalize tab-specific data into a uniform AgentContext.
// Agent runtime/planner never needs to know which tab it's running in.
//
// Each tab (Bugs, Security, Architecture, etc.) builds a ContextAdapter
// from its current data (issue, symbol, file, etc.) and passes it to <AgentPanel/>.
// The AgentPanel converts it to an AgentContext + pre-built query.

import type { AnalysisReport, Issue } from "@/lib/types";

/** Tab IDs that support inline Agent. */
export type AgentTabId =
  | "overview"
  | "architecture"
  | "bugs"
  | "security"
  | "performance"
  | "codegraph"
  | "docs"
  | "roadmap"
  | "timeline";

/** Action types the Agent can perform (determines the plan template). */
export type AgentAction =
  | "explain"          // Explain the current item
  | "fix"              // Fix a bug/vulnerability
  | "optimize"         // Optimize performance
  | "test"             // Generate tests
  | "refactor"         // Refactor the item
  | "document"         // Generate docs
  | "impact"           // Impact analysis
  | "rootCause"        // Find root cause
  | "summarize"        // Summarize
  | "custom";          // Free-form query

/** Context for a specific item (issue, symbol, file, node). */
export interface AgentItemContext {
  /** Tab the action originated from. */
  tab: AgentTabId;
  /** The action to perform. */
  action: AgentAction;
  /** Human-readable label for the item (e.g. "Issue #178: SQL injection"). */
  itemLabel: string;
  /** The issue being acted on (if applicable — Bugs/Security/Performance tabs). */
  issue?: Issue;
  /** The file path being acted on (if applicable). */
  filePath?: string;
  /** The symbol name being acted on (if applicable — Code Graph tab). */
  symbolName?: string;
  /** Additional context to inject into the query (free text). */
  extraContext?: string;
  /** The analysis report (for SPM build). */
  report?: AnalysisReport;
  /** Analysis ID (for DB lookup). */
  analysisId?: string;
}

/** Result of converting an AgentItemContext to an Agent query + params. */
export interface AgentQuery {
  /** The natural-language query to send to the Planner. */
  query: string;
  /** Suggested plan hint (optional — Planner still uses LLM). */
  planHint?: string;
  /** The analysisId to use for SPM build. */
  analysisId?: string;
}

/**
 * Convert an AgentItemContext to a natural-language query.
 * This is the ONLY place that knows about tab-specific phrasing.
 * The Agent runtime/planner receives a plain query string.
 */
export function contextToQuery(ctx: AgentItemContext): AgentQuery {
  const parts: string[] = [];

  // Build the item description
  const itemDesc = ctx.issue
    ? `${ctx.issue.title} in ${ctx.issue.file}:${ctx.issue.line} (severity: ${ctx.issue.severity}). Recommendation: ${ctx.issue.recommendation}`
    : ctx.symbolName
      ? `symbol "${ctx.symbolName}"${ctx.filePath ? ` in ${ctx.filePath}` : ""}`
      : ctx.filePath
        ? `file ${ctx.filePath}`
        : ctx.itemLabel;

  // Action-specific query phrasing
  switch (ctx.action) {
    case "explain":
      parts.push(`Explain ${itemDesc}.`);
      if (ctx.extraContext) parts.push(ctx.extraContext);
      return { query: parts.join(" "), planHint: "explain", analysisId: ctx.analysisId };

    case "fix":
      parts.push(`Fix ${itemDesc}.`);
      parts.push("Search for the code, find the root cause, generate a patch, apply it, then run lint and tests to verify.");
      if (ctx.extraContext) parts.push(ctx.extraContext);
      return { query: parts.join(" "), planHint: "fix-bug", analysisId: ctx.analysisId };

    case "optimize":
      parts.push(`Optimize ${itemDesc}.`);
      parts.push("Find the bottleneck, generate a patch to improve performance, apply it, and verify with tests.");
      return { query: parts.join(" "), planHint: "optimize", analysisId: ctx.analysisId };

    case "test":
      parts.push(`Generate tests for ${itemDesc}.`);
      parts.push("Read the code, generate comprehensive test cases, write the test file, and run the tests.");
      return { query: parts.join(" "), planHint: "test-gen", analysisId: ctx.analysisId };

    case "refactor":
      parts.push(`Refactor ${itemDesc}.`);
      parts.push("Find all references, analyze the impact, generate a refactoring patch, apply it, and verify.");
      return { query: parts.join(" "), planHint: "refactor", analysisId: ctx.analysisId };

    case "document":
      parts.push(`Generate documentation for ${itemDesc}.`);
      parts.push("Read the code, write clear documentation, and create/update the docs file.");
      return { query: parts.join(" "), planHint: "docs", analysisId: ctx.analysisId };

    case "impact":
      parts.push(`Analyze the impact of ${itemDesc}.`);
      parts.push("Find all references, callers, callees, and assess the blast radius of changing it.");
      return { query: parts.join(" "), planHint: "impact", analysisId: ctx.analysisId };

    case "rootCause":
      parts.push(`Find the root cause of ${itemDesc}.`);
      parts.push("Search the codebase, trace the call chain, and explain why this issue occurs.");
      return { query: parts.join(" "), planHint: "root-cause", analysisId: ctx.analysisId };

    case "summarize":
      parts.push(`Summarize ${itemDesc}.`);
      if (ctx.extraContext) parts.push(ctx.extraContext);
      return { query: parts.join(" "), planHint: "summarize", analysisId: ctx.analysisId };

    case "custom":
    default:
      parts.push(ctx.extraContext || `Analyze ${itemDesc}.`);
      return { query: parts.join(" "), analysisId: ctx.analysisId };
  }
}

/**
 * Helper to build a context for a Bugs/Security/Performance issue.
 */
export function issueContext(
  tab: AgentTabId,
  action: AgentAction,
  issue: Issue,
  analysisId?: string,
  report?: AnalysisReport,
  extraContext?: string,
): AgentItemContext {
  return {
    tab,
    action,
    itemLabel: `${issue.title} (${issue.file}:${issue.line})`,
    issue,
    filePath: issue.file,
    analysisId,
    report,
    extraContext,
  };
}

/**
 * Helper to build a context for a Code Graph symbol.
 */
export function symbolContext(
  tab: AgentTabId,
  action: AgentAction,
  symbolName: string,
  filePath?: string,
  analysisId?: string,
  report?: AnalysisReport,
  extraContext?: string,
): AgentItemContext {
  return {
    tab,
    action,
    itemLabel: `${symbolName}${filePath ? ` (${filePath})` : ""}`,
    symbolName,
    filePath,
    analysisId,
    report,
    extraContext,
  };
}

/**
 * Helper to build a context for an Architecture/Overview/Docs tab.
 */
export function tabContext(
  tab: AgentTabId,
  action: AgentAction,
  itemLabel: string,
  analysisId?: string,
  report?: AnalysisReport,
  extraContext?: string,
): AgentItemContext {
  return {
    tab,
    action,
    itemLabel,
    analysisId,
    report,
    extraContext,
  };
}
