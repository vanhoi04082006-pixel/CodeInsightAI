import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { isProduction } from "@/lib/env";
import { checkQuota, incrementUsage } from "@/lib/billing/usage";
import { callAI, type AIMessage } from "@/lib/ai-client";
import { resolveEffectiveProvider } from "@/lib/platform-ai";
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
  language?: string;
  debug?: boolean;
  aiMode?: "byok" | "platform"; // SaaS: BYOK or Platform AI
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
    const { message, history = [], personality, provider, language, debug } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Quota enforcement — chat messages are limited per plan (admin bypasses)
    const userId = await requireUserId();
    if (userId) {
      const quota = await checkQuota(userId, "chat");
      if (!quota.allowed) {
        return NextResponse.json({
          error: `Chat quota exceeded (${quota.used}/${quota.limit} this month). Upgrade to Pro for more messages.`,
          quota,
        }, { status: 429 });
      }
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
    // Check if we have real parsed repository data
    let parsedRepo: any = null;
    try {
      const reportData = report ? JSON.parse(JSON.stringify(report)) : null;
      if (reportData && reportData.parsed) parsedRepo = reportData;
    } catch { /* not parsed */ }

    let systemPrompt: string;
    let context: string;
    let retrievedChunks: { path: string; score: number; snippet: string }[] = [];
    let estimatedTokens = 0;

    if (parsedRepo) {
      // Use real prompt engine with parsed repository data
      const { buildPromptContext } = await import("@/lib/prompt-engine");
      const promptCtx = buildPromptContext(
        parsedRepo,
        message,
        personality?.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
        language || "en"
      );
      systemPrompt = promptCtx.systemPrompt;
      context = promptCtx.repositoryContext;
      retrievedChunks = promptCtx.retrievedChunks;
      estimatedTokens = promptCtx.estimatedTokens;

      // ── CodeGraph integration ──
      // Build a CodeGraph from the parsed repo and query it for relevant context.
      // This gives the AI a "Google Maps" view of the codebase — instead of
      // grep/read, it can see function callers, callees, impact analysis, etc.
      try {
        const { buildCodeGraph, getGraphStats, searchNodes } = await import("@/lib/codegraph/builder");
        const graph = buildCodeGraph(parsedRepo);
        const stats = getGraphStats(graph);

        // Search for nodes matching the user's message (semantic-ish search)
        const words = message.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
        const matchedNodes = words.flatMap((w) => searchNodes(graph, w)).slice(0, 10);

        // Append CodeGraph context to the system prompt
        const graphContext = `\n\nCODEGRAPH (semantic knowledge graph — "Google Maps for codebase")
Total: ${stats.totalNodes} nodes, ${stats.totalEdges} edges
Node types: ${Object.entries(stats.byType).map(([k, v]) => `${k} (${v})`).join(", ")}

Most connected nodes (hubs):
${stats.mostConnected.slice(0, 5).map((m) => `- ${m.node.label} (${m.node.type}, ${m.degree} connections) — ${m.node.filePath}`).join("\n")}

${matchedNodes.length > 0 ? `Nodes matching your question:\n${matchedNodes.map((n) => `- ${n.label} (${n.type}) — ${n.filePath}`).join("\n")}` : ""}

Use this graph knowledge to answer questions about function callers, callees, dependencies, and impact analysis without needing to grep the codebase.`;

        systemPrompt += graphContext;
      } catch (e) {
        // Non-fatal — CodeGraph is optional enhancement
        console.warn("[/api/chat] CodeGraph integration failed (non-fatal):", e);
      }
    } else {
      // Fallback to simulated report context
      const basePrompt = personality?.systemPrompt?.trim()
        ? personality.systemPrompt
        : DEFAULT_SYSTEM_PROMPT;
      const langInstruction = language === "vi"
        ? "\n\nIMPORTANT: Respond in Vietnamese (Tiếng Việt). Keep code, file paths, and technical terms in English, but write all prose and explanations in Vietnamese."
        : "\n\nRespond in English.";
      systemPrompt = basePrompt + langInstruction;
      context = buildContext(report);
    }
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

    // 5. Call the LLM — use user's provider (BYOK), Platform AI, or built-in
    const queueMs = Date.now() - requestStart;
    const genStart = Date.now();
    let reply: string;
    let llmError: string | undefined;
    let retryCount = 0;

    // ── Production security: if the client sent a provider but no apiKey,
    //     look up the encrypted credential from the DB (multi-tenant safe).
    //     This lets the browser hold only a masked key while the server still
    //     makes authenticated calls to the AI provider.
    // ── In local dev, we trust the apiKey from localStorage (BYOK convenience).
    let effectiveProvider = provider;
    if (provider && !provider.apiKey && isProduction) {
      const userId = await requireUserId();
      if (userId) {
        // Find by providerId + label (label may be undefined → fall back to providerId)
        const cred = await db.providerCredential.findFirst({
          where: {
            userId,
            providerId: provider.providerId,
            ...(provider.label ? { label: provider.label } : {}),
            enabled: true,
          },
        });
        if (cred) {
          try {
            const realKey = decrypt(cred.encryptedApiKey);
            effectiveProvider = {
              ...provider,
              apiKey: realKey,
              baseUrl: cred.baseUrl || provider.baseUrl,
              model: cred.model || provider.model,
              temperature: cred.temperature ?? provider.temperature,
              maxTokens: cred.maxTokens ?? provider.maxTokens,
              streaming: cred.streaming ?? provider.streaming,
            };
          } catch {
            // Decryption failed — fall through to error path below
          }
        }
      }
    }

    // Resolve effective provider using the unified platform-ai resolver.
    // This supports ALL 14 providers (not just OpenRouter) and handles
    // Platform AI, BYOK (with encrypted DB lookup in production), and local providers.
    const finalProvider = await resolveEffectiveProvider(
      body.aiMode,
      effectiveProvider ? {
        providerId: effectiveProvider.providerId,
        apiKey: effectiveProvider.apiKey,
        baseUrl: effectiveProvider.baseUrl,
        model: effectiveProvider.model,
        temperature: effectiveProvider.temperature,
        maxTokens: effectiveProvider.maxTokens,
      } : undefined,
      null  // decryptedBYOK already handled above (effectiveProvider has the key)
    );

    try {
      if (finalProvider) {
        // Use unified ai-client (supports all 14 providers)
        const result = await callAI(
          finalProvider,
          llmMessages as AIMessage[],
          {
            temperature: personality?.temperature ?? 0.7,
            maxTokens: personality?.maxTokens && personality.maxTokens > 0 ? personality.maxTokens : 4096,
          }
        );
        reply = result.content;
      } else {
        // Fallback: try z-ai built-in SDK
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
        } catch (zaiErr) {
          console.error("[/api/chat] z-ai SDK error", zaiErr);
          throw new Error("No AI provider configured. Please add an AI provider in Settings → AI Providers, or enable Platform AI mode.");
        }
      }
    } catch (err) {
      console.error("[/api/chat] LLM error", err);
      llmError = err instanceof Error ? err.message : String(err);
      reply = "";
    }

    if (!reply || !reply.trim()) {
      if (llmError) {
        reply = `⚠️ **AI Error**: ${llmError}\n\nPlease check your API key and provider configuration in **AI Providers** settings.`;
      } else {
        reply = "⚠️ The AI returned an empty response. Please try again or check your provider configuration.";
      }
    }

    const generationMs = Date.now() - genStart;
    const totalMs = Date.now() - requestStart;

    // Persist the assistant message
    if (analysisRow) {
      await db.chatMessage.create({
        data: { analysisId: analysisRow.id, role: "assistant", content: reply },
      });
    }

    // Increment usage counter (best-effort)
    if (userId) {
      incrementUsage(userId, "chat").catch(() => { /* silent */ });
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
          retrievedChunks,
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

/**
 * Call a user-configured AI provider (OpenAI-compatible API).
 * Supports: OpenAI, OpenRouter, DeepSeek, Groq, Together, Fireworks,
 * Mistral, xAI, Ollama, LM Studio, Custom, Anthropic, Gemini.
 */
async function callProvider(
  provider: ProviderConfig,
  messages: { role: string; content: string }[],
  personality?: PersonalityConfig
): Promise<string> {
  const temperature = personality?.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = personality?.maxTokens && personality.maxTokens > 0 ? personality.maxTokens : (provider.maxTokens > 0 ? provider.maxTokens : undefined);
  const model = provider.model || "gpt-4o-mini";
  const timeout = (provider.timeout || 60) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;

    if (provider.providerId === "anthropic") {
      // Anthropic Messages API
      url = provider.baseUrl.endsWith("/v1") ? `${provider.baseUrl}/messages` : `${provider.baseUrl}/v1/messages`;
      headers["x-api-key"] = provider.apiKey || "";
      headers["anthropic-version"] = "2023-06-01";
      // Convert messages: Anthropic needs separate system + messages array
      const systemMsg = messages.find(m => m.role === "assistant")?.content || "";
      const chatMsgs = messages.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      body = {
        model,
        max_tokens: maxTokens || 4096,
        temperature,
        system: systemMsg,
        messages: chatMsgs,
      };
    } else if (provider.providerId === "gemini") {
      // Google Gemini API
      url = `${provider.baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`;
      const contents = messages.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      body = {
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens || 4096 },
      };
    } else {
      // OpenAI-compatible API (default)
      url = provider.baseUrl.endsWith("/v1") ? `${provider.baseUrl}/chat/completions` : `${provider.baseUrl}/v1/chat/completions`;
      if (provider.apiKey) {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;
      }
      body = {
        model,
        messages: messages.map(m => ({ role: m.role === "assistant" ? "system" : m.role, content: m.content })),
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errMsg;
      } catch {
        if (errText) errMsg = errText.substring(0, 300);
      }
      throw new Error(`Provider error (${res.status}): ${errMsg}`);
    }

    const data = await res.json();

    // Extract response based on provider format
    if (provider.providerId === "anthropic") {
      return data.content?.[0]?.text || "";
    } else if (provider.providerId === "gemini") {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      return data.choices?.[0]?.message?.content || "";
    }
  } finally {
    clearTimeout(timer);
  }
}
