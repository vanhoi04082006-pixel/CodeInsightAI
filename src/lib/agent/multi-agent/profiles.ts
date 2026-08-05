// CodeInsight AI — Stage 6: Multi-Agent System
// AgentProfile defines a specialized agent with its own tools, prompt, and role.
// Coordinator orchestrates multiple agents running in parallel.

import type { Capability, AgentContext, AgentEvent, ExecutionPlan } from "../contracts";

// ─── Agent Profile ───────────────────────────────────────────────────

export interface AgentProfile {
  /** Unique agent ID (e.g. "architect", "security") */
  id: string;
  /** Display name */
  name: string;
  /** Icon (for UI) */
  icon: string;
  /** Description of what this agent does */
  description: string;
  /** System prompt for this agent's Planner */
  systemPrompt: string;
  /** Capabilities this agent is allowed to use (subset of all capabilities) */
  capabilities: Capability[];
  /** Default query for this agent when invoked by Coordinator */
  defaultQuery: string;
  /** Color for UI (hex) */
  color: string;
}

// ─── 6 Specialized Agent Profiles ────────────────────────────────────

export const AGENT_PROFILES: Record<string, AgentProfile> = {
  architect: {
    id: "architect",
    name: "Architect Agent",
    icon: "🏗️",
    description: "Analyzes project architecture, patterns, and dependencies",
    systemPrompt: "You are an Architecture Analyst. Focus on: design patterns, layer violations, coupling/cohesion metrics, circular dependencies, and architectural improvements. Generate a concise architecture report.",
    capabilities: ["find-architecture", "find-metrics", "find-circular-deps", "get-diagram", "search-code", "ai-chat"],
    defaultQuery: "Analyze the architecture of this project. Find the design pattern, identify layer violations, circular dependencies, and suggest improvements.",
    color: "#22d3ee",
  },
  security: {
    id: "security",
    name: "Security Agent",
    icon: "🔒",
    description: "Audits security vulnerabilities, CVEs, and best practices",
    systemPrompt: "You are a Security Auditor. Focus on: CVEs, injection vulnerabilities, authentication issues, hardcoded secrets, and OWASP Top 10. Search for known CVEs in dependencies. Generate a security report with severity ratings.",
    capabilities: ["search-code", "find-issues", "cve-search", "read-docs", "ai-chat"],
    defaultQuery: "Audit security vulnerabilities. Search for CVEs in dependencies, find security issues in code, and provide fix recommendations.",
    color: "#f472b6",
  },
  performance: {
    id: "performance",
    name: "Performance Agent",
    icon: "⚡",
    description: "Finds performance bottlenecks and optimization opportunities",
    systemPrompt: "You are a Performance Engineer. Focus on: N+1 queries, unnecessary loops, missing indexes, large bundle sizes, and memory leaks. Generate a performance report with impact assessment.",
    capabilities: ["search-code", "find-issues", "find-impact", "find-metrics", "ai-chat"],
    defaultQuery: "Find performance bottlenecks. Search for N+1 queries, unnecessary loops, expensive operations, and suggest optimizations.",
    color: "#fbbf24",
  },
  review: {
    id: "review",
    name: "Code Review Agent",
    icon: "🔍",
    description: "Reviews code quality, dead code, and duplicates",
    systemPrompt: "You are a Senior Code Reviewer. Focus on: dead code, duplicate code, naming conventions, complexity hotspots, and maintainability. Generate a quality report with actionable suggestions.",
    capabilities: ["search-code", "find-symbol", "find-references", "find-dead-code", "find-duplicates", "ai-chat"],
    defaultQuery: "Review code quality. Find dead code, duplicate code, complexity hotspots, and maintainability issues.",
    color: "#a78bfa",
  },
  testing: {
    id: "testing",
    name: "Testing Agent",
    icon: "🧪",
    description: "Assesses test coverage and suggests test improvements",
    systemPrompt: "You are a Test Engineer. Focus on: test coverage gaps, untested critical paths, missing edge cases, and test quality. Run existing tests and assess results. Generate a test coverage report.",
    capabilities: ["search-code", "find-symbol", "run-tests", "ai-chat"],
    defaultQuery: "Assess test coverage. Find untested code paths, run existing tests, and suggest what tests should be added.",
    color: "#34d399",
  },
  docs: {
    id: "docs",
    name: "Docs Agent",
    icon: "📚",
    description: "Generates and reviews documentation",
    systemPrompt: "You are a Technical Writer. Focus on: missing documentation, outdated docs, API documentation, and README quality. Generate documentation suggestions.",
    capabilities: ["search-code", "find-architecture", "ai-chat"],
    defaultQuery: "Review documentation. Find missing docs, outdated comments, and generate documentation suggestions for key modules.",
    color: "#fb923c",
  },
};

// ─── Coordinator ─────────────────────────────────────────────────────

export interface MultiAgentRequest {
  /** User's original query */
  query: string;
  /** Analysis ID */
  analysisId: string;
  /** Which agents to run (default: all 6) */
  agentIds?: string[];
  /** Max iterations per agent (for autonomous sub-agents) */
  maxIterations?: number;
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  status: "running" | "completed" | "failed";
  events: AgentEvent[];
  summary: string;
  findings: string;
  durationMs: number;
}

export interface MultiAgentResult {
  query: string;
  agents: AgentResult[];
  coordinatorSummary: string;
  totalDurationMs: number;
}

/**
 * Coordinator: generates sub-queries for each agent based on the user's request.
 * Each agent gets a tailored query that fits its specialization.
 */
export function generateSubQueries(query: string, agentIds: string[]): Record<string, string> {
  const subQueries: Record<string, string> = {};

  for (const agentId of agentIds) {
    const profile = AGENT_PROFILES[agentId];
    if (!profile) continue;

    // If user's query is specific, augment it; otherwise use default
    if (query.toLowerCase().includes("audit") || query.toLowerCase().includes("analyze") || query.toLowerCase().includes("review")) {
      subQueries[agentId] = `${profile.defaultQuery} Context: User request is "${query}". Focus on your specialty.`;
    } else {
      subQueries[agentId] = `${query} As the ${profile.name}, ${profile.defaultQuery.toLowerCase()}`;
    }
  }

  return subQueries;
}

/**
 * Get profiles for a list of agent IDs.
 */
export function getProfiles(agentIds: string[]): AgentProfile[] {
  return agentIds
    .map((id) => AGENT_PROFILES[id])
    .filter((p): p is AgentProfile => p !== undefined);
}

/**
 * Default agent set for comprehensive analysis.
 */
export const DEFAULT_AGENTS = ["architect", "security", "performance", "review", "testing"];

/**
 * All available agent IDs.
 */
export const ALL_AGENT_IDS = Object.keys(AGENT_PROFILES);
