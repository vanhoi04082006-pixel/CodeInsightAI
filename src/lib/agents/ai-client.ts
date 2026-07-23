// CodeInsight AI — Shared AI Client for Agents
//
// DELEGATES to the unified lib/ai-client.ts (supports all 14 providers).
// This wrapper maintains backward compatibility with existing agent code
// that imports from "@/lib/agents/ai-client".
//
// Also provides CodeGraph-enhanced context for agents — agents can query
// the graph instead of grep/read files (saves tokens).

import { callAI as unifiedCallAI, streamAI as unifiedStreamAI, type AIProviderConfig, type AIMessage } from "@/lib/ai-client";

// Re-export types for backward compat
export type { AIProviderConfig, AIMessage };

/**
 * Call an AI provider with messages. Returns the assistant's text reply.
 * Delegates to unified callAI() — supports all 14 providers.
 */
export async function callAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal; timeout?: number }
): Promise<string> {
  const result = await unifiedCallAI(provider, messages, {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    signal: options?.signal,
    timeout: options?.timeout,
  });
  return result.content;
}

/**
 * Ask AI to return structured JSON. Parses the response and validates.
 */
export async function callAIForJSON<T = any>(
  provider: AIProviderConfig,
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<T> {
  const reply = await callAI(provider, messages, { temperature: options?.temperature ?? 0.3, maxTokens: options?.maxTokens, signal: options?.signal });
  // Extract JSON from response (may be wrapped in ```json ... ``` blocks)
  const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : reply.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find the first { ... } or [ ... ]
    const start = jsonStr.search(/[{[]/);
    if (start >= 0) {
      const end = jsonStr.lastIndexOf(jsonStr[start] === "{" ? "}" : "]");
      if (end > start) {
        return JSON.parse(jsonStr.slice(start, end + 1));
      }
    }
    throw new Error(`AI did not return valid JSON: ${reply.slice(0, 200)}`);
  }
}

/**
 * Stream AI response chunk by chunk. Calls onChunk for each text delta.
 * Delegates to unified streamAI() — true SSE streaming for all 14 providers.
 */
export async function streamAI(
  provider: AIProviderConfig,
  messages: AIMessage[],
  onChunk: (chunk: string) => void,
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  let full = "";
  for await (const chunk of unifiedStreamAI(provider, messages, {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    signal: options?.signal,
  })) {
    full += chunk;
    onChunk(chunk);
  }
  return full;
}

/**
 * Build a CodeGraph context string for agent prompts.
 * Agents use this to navigate the codebase without grep/read (saves tokens).
 *
 * Returns a compact summary of the graph: stats, hubs, and nodes matching
 * the agent's query (semantic search).
 */
export async function buildCodeGraphContext(
  parsedRepo: any,
  query?: string
): Promise<string> {
  try {
    const { buildCodeGraph, getGraphStats, searchNodes } = await import("@/lib/codegraph/builder");
    const graph = buildCodeGraph(parsedRepo);
    const stats = getGraphStats(graph);

    let context = `\n\nCODEGRAPH (semantic knowledge graph — "Google Maps for codebase")
Total: ${stats.totalNodes} nodes, ${stats.totalEdges} edges
Node types: ${Object.entries(stats.byType).map(([k, v]) => `${k} (${v})`).join(", ")}

Most connected nodes (hubs — these are the most important files/modules):
${stats.mostConnected.slice(0, 8).map((m) => `- ${m.node.label} (${m.node.type}, ${m.degree} connections) — ${m.node.filePath}`).join("\n")}`;

    // If query provided, search for matching nodes
    if (query) {
      const words = query.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
      const matched = words.flatMap((w) => searchNodes(graph, w)).slice(0, 15);
      if (matched.length > 0) {
        context += `\n\nNodes matching "${query}":\n${matched.map((n) => `- ${n.label} (${n.type}) — ${n.filePath}`).join("\n")}`;
      }
    }

    context += `\n\nUse this graph knowledge to answer questions about function callers, callees, dependencies, and impact analysis without needing to grep the codebase.`;

    return context;
  } catch (e) {
    // Non-fatal — CodeGraph is optional enhancement
    return "";
  }
}
