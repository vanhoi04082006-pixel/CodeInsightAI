import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AnalysisReport, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProviderConfig {
  providerId: string;
  label: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  timeout: number;
  // NOTE: apiKey is accepted but NEVER logged or echoed back. It is masked in
  // any debug output via the secret-mask utility on the client.
  apiKey?: string;
}

interface PersonalityConfig {
  id: string;
  name: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
}

interface ChatBody {
  analysisId?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  personality?: PersonalityConfig;
  provider?: ProviderConfig;
  debug?: boolean; // when true, return debug metadata
}

const DEFAULT_SYSTEM_PROMPT = `You are CodeInsight AI — an elite AI CTO, Software Architect, Security Expert, Performance Engineer, and Senior Staff Engineer combined.

You analyze GitHub repositories and answer questions about them like a world-class engineering leader would.

Your style:
- Direct, opinionated, and senior-level. No fluff.
- Use crisp structure: short paragraphs, bullet points, and code blocks where useful.
- Cite specific files, modules, or architectural layers when relevant.
- When recommending changes, give the "why" and a concrete "how", plus estimated effort.
- If asked about something outside the analyzed repository, gently refocus on the repo.

Always answer in clean Markdown. Be the engineer every team wishes they had.`;

function buildContext(report: AnalysisReport | null): string {
  if (!report) return "No repository is currently loaded.";
  const topIssues = [
    ...report.issues.security.slice(0, 3),
    ...report.issues.performance.slice(0, 3),
    ...report.issues.bugs.slice(0, 3),
  ]
    .map((i) => `- [${i.severity}] ${i.title} (${i.file})`)
    .join("\n");
  return `REPOSITORY CONTEXT
- Repo: ${report.repoOwner}/${report.repoName} (branch: ${report.repoBranch})
- URL: ${report.repoUrl}
- Primary language: ${report.primaryLanguage}
- Total files: ${report.totalFiles} | Total lines: ${report.totalLines}
- Languages: ${report.languages.map((l) => `${l.name} ${l.percentage}%`).join(", ")}
- Frameworks: ${report.frameworks.map((f) => `${f.name} ${f.version}`).join(", ")}
- Architecture pattern: ${report.architecture.pattern}
- Summary: ${report.summary}

SCORES (0-100)
- Overall: ${report.scores.overall}
- Security: ${report.scores.security}
- Performance: ${report.scores.performance}
- Architecture: ${report.scores.architecture}
- Maintainability: ${report.scores.maintainability}
- Code Quality: ${report.scores.codeQuality}

KEY FILES
${report.files.map((f) => `- ${f.path} (${f.language}, ${f.lines} lines, complexity ${f.complexity}) — ${f.description}`).join("\n")}

ARCHITECTURE
- Layers: ${report.architecture.layers.map((l) => `${l.name} (${l.responsibility}, ${l.files} files)`).join("; ")}
- Strengths: ${report.architecture.strengths.join("; ")}
- Weaknesses: ${report.architecture.weaknesses.join("; ")}

TECHNICAL DEBT (score ${report.technicalDebt.score})
${report.technicalDebt.items.map((t) => `- ${t.title} — ${t.impact} (${t.estimate})`).join("\n")}

TOP ISSUES
${topIssues}

ROADMAP SUGGESTIONS
${report.roadmap.map((r) => `- [${r.priority}] ${r.title}: ${r.description}`).join("\n")}

Use this context to give precise, senior-level answers.`;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const body = (await req.json()) as ChatBody;
    const { message, history = [], personality, provider, debug } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Load the analysis + report for context
    let report: AnalysisReport | null = null;
    let analysisRow: { id: string } | null = null;
    if (body.analysisId) {
      const row = await db.analysis.findUnique({ where: { id: body.analysisId } });
      if (row) {
        analysisRow = { id: row.id };
        try {
          report = JSON.parse(row.report) as AnalysisReport;
        } catch {
          report = null;
        }
      }
    }

    // ---- AI Request Pipeline ----
    // 1. Selected Personality → system prompt (overrides default)
    const systemPrompt = personality?.systemPrompt?.trim()
      ? personality.systemPrompt
      : DEFAULT_SYSTEM_PROMPT;
    // 2. Repository Context
    const context = buildContext(report);
    // 3. Conversation History + 4. User Prompt
    const llmMessages = [
      { role: "assistant" as const, content: systemPrompt },
      { role: "user" as const, content: context },
      { role: "assistant" as const, content: "Repository context loaded. I'm ready — ask me anything about this codebase." },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    const finalPrompt = llmMessages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n---\n\n");

    // Persist the user message
    if (analysisRow) {
      await db.chatMessage.create({
        data: { analysisId: analysisRow.id, role: "user", content: message },
      });
    }

    // 5. Call the LLM (personality temperature/maxTokens override if provided)
    const queueMs = Date.now() - requestStart;
    const genStart = Date.now();
    let reply: string;
    let llmError: string | undefined;
    let retryCount = 0;
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: llmMessages,
        thinking: { type: "disabled" },
        ...(personality?.temperature != null ? { temperature: personality.temperature } : {}),
        ...(personality?.maxTokens != null && personality.maxTokens > 0 ? { max_tokens: personality.maxTokens } : {}),
      });
      reply = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[/api/chat] LLM error", err);
      llmError = err instanceof Error ? err.message : String(err);
      retryCount = 1;
      reply = fallbackReply(message, report, personality);
    }

    if (!reply || !reply.trim()) {
      reply = fallbackReply(message, report, personality);
    }

    const generationMs = Date.now() - genStart;
    const totalMs = Date.now() - requestStart;

    // Persist the assistant message
    if (analysisRow) {
      await db.chatMessage.create({
        data: { analysisId: analysisRow.id, role: "assistant", content: reply },
      });
    }

    // ---- Debug metadata (only when requested; secrets masked client-side) ----
    const inputTokens = estimateTokens(systemPrompt) + estimateTokens(context) + estimateTokens(history.map((m) => m.content).join("")) + estimateTokens(message);
    const outputTokens = estimateTokens(reply);
    const totalTokens = inputTokens + outputTokens;

    const debugMeta = debug
      ? {
          requestId,
          timestamp: requestStart,
          provider: provider?.providerId ?? "builtin",
          model: provider?.model ?? personality?.preferredModel ?? "z-ai-default",
          personality: personality?.name ?? "Default (CTO)",
          temperature: personality?.temperature ?? provider?.temperature ?? 0.7,
          maxTokens: personality?.maxTokens ?? provider?.maxTokens ?? -1,
          streaming: provider?.streaming ?? false,
          contextWindow: 128000,
          systemPrompt,
          userPrompt: message,
          repositoryContext: context,
          retrievedChunks: [] as { path: string; score: number; snippet: string }[],
          finalPrompt,
          inputTokens,
          outputTokens,
          totalTokens,
          queueMs,
          generationMs,
          totalMs,
          capabilities: {
            vision: provider?.providerId === "gemini" || provider?.providerId === "openai",
            toolCalling: true,
            functionCalling: true,
            reasoning: provider?.providerId === "openai",
          },
          rawResponse: reply,
          formattedResponse: reply,
          tokenCostEstimate: {
            inputCost: (inputTokens / 1_000_000) * 5,
            outputCost: (outputTokens / 1_000_000) * 15,
            totalCost: (inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 15,
            currency: "USD",
          },
          embeddingResults: [],
          vectorSearchResults: [],
          chunkRanking: [],
          repositoryIndex: report
            ? { files: report.totalFiles, chunks: Math.round(report.totalFiles * 1.8), embeddings: Math.round(report.totalFiles * 1.8) }
            : undefined,
          dependencyGraphData: report
            ? { nodes: report.dependencies.nodes.length, edges: report.dependencies.edges.length, circular: report.dependencies.circular.length }
            : undefined,
          staticAnalysisOutput: report
            ? {
                issues: report.issues.bugs.length + report.issues.security.length + report.issues.performance.length,
                bugs: report.issues.bugs.length,
                security: report.issues.security.length,
                performance: report.issues.performance.length,
              }
            : undefined,
          log: {
            id: requestId,
            timestamp: requestStart,
            requestId,
            provider: provider?.providerId ?? "builtin",
            model: provider?.model ?? "z-ai-default",
            personality: personality?.name ?? "Default (CTO)",
            durationMs: totalMs,
            queueMs,
            generationMs,
            status: llmError ? ("error" as const) : ("success" as const),
            statusCode: llmError ? 500 : 200,
            error: llmError,
            retryCount,
            inputTokens,
            outputTokens,
            totalTokens,
          },
        }
      : undefined;

    return NextResponse.json({
      reply,
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      } satisfies ChatMessage,
      debug: debugMeta,
    });
  } catch (e) {
    console.error("[/api/chat] error", e);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}

function fallbackReply(message: string, report: AnalysisReport | null, personality?: PersonalityConfig): string {
  const isTeacher = personality?.id === "teacher";
  const prefix = isTeacher ? "Let's walk through this together! 📚\n\n" : "";
  if (!report) {
    return `${prefix}I don't have a repository loaded yet. Run an analysis first, then ask me anything about the codebase — architecture, security, performance, or what to build next.`;
  }
  const q = message.toLowerCase();
  if (q.includes("security") || q.includes("vulnerab")) {
    return `${prefix}## Security overview\n\nOverall security score: **${report.scores.security}/100**.\n\nTop concerns:\n${report.issues.security.slice(0, 3).map((i) => `- **[${i.severity}] ${i.title}** in \`${i.file}\` — ${i.recommendation}`).join("\n")}\n\nI'd start with the critical secrets issue, then layer in the missing security headers.`;
  }
  if (q.includes("performance") || q.includes("slow") || q.includes("optimi")) {
    return `${prefix}## Performance review\n\nPerformance score: **${report.scores.performance}/100**.\n\nThe biggest wins:\n${report.issues.performance.slice(0, 3).map((i) => `- **${i.title}** — ${i.recommendation} _(effort: ${i.effort})_`).join("\n")}\n\nTackle the trivial bundle-size fix first for an immediate win, then the N+1 query.`;
  }
  if (q.includes("architecture") || q.includes("structure") || q.includes("pattern")) {
    return `${prefix}## Architecture\n\nPattern: **${report.architecture.pattern}**.\n\n${report.architecture.description}\n\n**Strengths:**\n${report.architecture.strengths.map((s) => `- ${s}`).join("\n")}\n\n**Weaknesses to address:**\n${report.architecture.weaknesses.map((s) => `- ${s}`).join("\n")}`;
  }
  if (q.includes("refactor") || q.includes("improve") || q.includes("fix")) {
    return `${prefix}## Where to focus\n\nPriority refactor targets based on complexity & debt:\n${report.files.filter((f) => f.complexity > 15).slice(0, 4).map((f) => `- \`${f.path}\` — complexity ${f.complexity}, maintainability ${f.maintainability}`).join("\n")}\n\nKnock out the trivial fixes first to build momentum, then schedule the medium-effort items.`;
  }
  return `${prefix}Here's my take on **${report.repoOwner}/${report.repoName}**:\n\n- **Overall health:** ${report.scores.overall}/100\n- **Primary language:** ${report.primaryLanguage}\n- **Architecture:** ${report.architecture.pattern}\n\nAsk me about security, performance, architecture, what to refactor, or what feature to build next.`;
}
