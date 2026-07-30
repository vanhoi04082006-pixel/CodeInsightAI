// POST /api/docs/enhance — AI-generate a specific doc type
//
// Docs tab enhancement: each of the 6 doc tabs (README.md, API.md,
// Architecture.md, Folder Guide, Component Guide, Deployment Guide) ships a
// SHORT static template by default (saves tokens). This endpoint lets the
// user click "✨ Enhance with AI" to generate a richer, context-aware version
// on demand — the static content is replaced in-place on the client.
//
// Request body:
//   { analysisId: string, docType: string, language?: "en" | "vi" }
//
// docType ∈ { readme, apiDocs, architectureMd, folderGuide, componentGuide, deploymentGuide }
//
// Auth: requires a logged-in user; ownership-checks the analysis row before
// reading `report` + `parsedData` (multi-tenant safe). Resolves an AI provider
// via the standard priority chain (Platform AI → BYOK credential → 400).
// Honors `callAIWithFallback` so the admin's fallback chain + the user's
// monthly token budget are both enforced.
//
// Response:
//   { content: string, providerUsed: string, docType: string }

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAIWithFallback, getFallbackChain } from "@/lib/ai-fallback";
import { getPlatformAIConfig } from "@/lib/platform-ai";
import {
  AIMessage,
  TokenBudgetExceededError,
  type AIProviderConfig,
} from "@/lib/ai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const VALID_DOC_TYPES = new Set([
  "readme",
  "apiDocs",
  "architectureMd",
  "folderGuide",
  "componentGuide",
  "deploymentGuide",
]);

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { analysisId?: string; docType?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { analysisId, docType, language } = body;
  if (!analysisId || !docType) {
    return NextResponse.json(
      { error: "analysisId and docType required" },
      { status: 400 },
    );
  }
  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json(
      { error: `Unknown docType: ${docType}` },
      { status: 400 },
    );
  }

  // ── Ownership check + load report + parsedData ──
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    select: { userId: true, report: true, parsedData: true },
  });
  if (!analysis || analysis.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let report: any;
  try {
    report = JSON.parse(analysis.report);
  } catch {
    return NextResponse.json(
      { error: "Analysis report is malformed" },
      { status: 500 },
    );
  }

  const parsed = analysis.parsedData
    ? (() => {
        try {
          return JSON.parse(analysis.parsedData);
        } catch {
          return null;
        }
      })()
    : null;

  const lang = language === "vi" ? "vi" : "en";

  // ── Resolve AI provider (Platform AI first, then BYOK) ──
  let aiConfig: AIProviderConfig | null = await getPlatformAIConfig();
  if (!aiConfig) {
    const cred = await db.providerCredential.findFirst({
      where: { userId, enabled: true },
      orderBy: { updatedAt: "desc" },
    });
    if (cred) {
      try {
        const { decrypt } = await import("@/lib/crypto");
        const apiKey = decrypt(cred.encryptedApiKey);
        if (apiKey) {
          aiConfig = {
            providerId: cred.providerId,
            apiKey,
            baseUrl: cred.baseUrl,
            model: "gpt-5.5",
            temperature: cred.temperature ?? 0.5,
            maxTokens: -1,
            timeout: 50,
          };
        }
      } catch {
        /* decryption failed — fall through to "no AI" error */
      }
    }
  }
  if (!aiConfig) {
    return NextResponse.json(
      {
        error:
          "No AI provider configured. Add one in Settings → AI Providers, or enable Platform AI mode.",
      },
      { status: 400 },
    );
  }

  const fallbacks = await getFallbackChain();

  const langInstruction =
    lang === "vi"
      ? "\n\nQUAN TRỌNG: Viết bằng tiếng Việt. Giữ nguyên code, file paths, thuật ngữ kỹ thuật."
      : "\n\nIMPORTANT: Write in English. Keep code, file paths, and technical terms as-is.";

  // ── Build prompt based on docType ──
  const repoInfo = `Repository: ${report.repoOwner}/${report.repoName}
Files: ${report.totalFiles}, Lines: ${report.totalLines?.toLocaleString()}
Primary language: ${report.primaryLanguage}
Frameworks: ${report.frameworks?.map((f: any) => f.name).join(", ") || "None"}
Architecture: ${report.architecture?.pattern ?? "Unknown"}
Scores: Overall ${report.scores?.overall}/100, Security ${report.scores?.security}, Performance ${report.scores?.performance}`;

  const fileList = parsed?.files || report.files || [];
  const topFiles = fileList
    .slice(0, 10)
    .map(
      (f: any) =>
        `- ${f.path} (${f.language}, ${f.lines} lines, complexity: ${f.complexity ?? "n/a"})`,
    )
    .join("\n");

  let prompt = "";
  switch (docType) {
    case "readme":
      prompt = `${repoInfo}\n\nTop files:\n${topFiles}\n\nGenerate a professional README.md for this repository. Include: project title, description, features, tech stack, installation, usage, API endpoints (if any), project structure, contributing, license. Use markdown formatting.`;
      break;
    case "apiDocs": {
      const routes = fileList.flatMap((f: any) =>
        (f.routes || []).map((r: string) => ({ path: r, file: f.path })),
      );
      prompt = `${repoInfo}\n\nAPI routes found:\n${routes.map((r: any) => `- ${r.path} (in ${r.file})`).join("\n") || "No routes found"}\n\nGenerate comprehensive API.md documentation. For each endpoint: method, path, description, request params, response format, example. Use markdown.`;
      break;
    }
    case "architectureMd":
      prompt = `${repoInfo}\n\nArchitecture: ${report.architecture?.pattern ?? "Unknown"}\nLayers: ${report.architecture?.layers?.map((l: any) => `${l.name} (${l.files} files)`).join(", ") || "Unknown"}\nStrengths: ${report.architecture?.strengths?.join("; ") || "None"}\nWeaknesses: ${report.architecture?.weaknesses?.join("; ") || "None"}\n\nGenerate Architecture.md: pattern explanation, layer breakdown, data flow, design decisions, technical debt, improvement recommendations. Use markdown.`;
      break;
    case "folderGuide":
      prompt = `${repoInfo}\n\nTop files:\n${topFiles}\n\nGenerate a Folder Guide: for each major directory, explain its purpose, what files live there, and conventions. Use markdown table format.`;
      break;
    case "componentGuide": {
      const components = fileList.flatMap((f: any) =>
        (f.components || []).map((c: string) => ({ name: c, file: f.path })),
      );
      prompt = `${repoInfo}\n\nComponents found:\n${components.map((c: any) => `- ${c.name} (in ${c.file})`).join("\n") || "No components found"}\n\nGenerate a Component Guide: for each component, describe its purpose, props, usage example. Use markdown.`;
      break;
    }
    case "deploymentGuide":
      prompt = `${repoInfo}\n\nFrameworks: ${report.frameworks?.map((f: any) => f.name).join(", ") || "None"}\n\nGenerate a Deployment Guide: prerequisites, environment setup, build steps, deployment options (Vercel/Docker/VPS), environment variables, post-deploy checks. Use markdown.`;
      break;
    default:
      return NextResponse.json(
        { error: `Unknown docType: ${docType}` },
        { status: 400 },
      );
  }

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are a technical writer. Generate professional documentation in markdown format." +
        langInstruction,
    },
    { role: "user", content: prompt },
  ];

  try {
    const result = await callAIWithFallback(aiConfig, fallbacks, messages, {
      temperature: 0.5,
      maxTokens: -1,
      timeout: 50,
      userId,
      plan: "enterprise",
      audit: { userId, analysisId, agent: `docs-${docType}` },
    });

    return NextResponse.json({
      content: result.content || "",
      providerUsed: result.providerUsed,
      docType,
    });
  } catch (e: any) {
    // Token-budget exceeded → 429 with friendly upgrade CTA.
    if (e instanceof TokenBudgetExceededError) {
      return NextResponse.json(
        {
          error: "Token budget exceeded",
          message: `You've used ${e.status.used.toLocaleString()} / ${e.status.limit === -1 ? "∞" : e.status.limit.toLocaleString()} tokens this month. Upgrade your plan for more.`,
          budget: {
            used: e.status.used,
            limit: e.status.limit,
            remaining: e.status.remaining,
            exceeded: true,
            unlimited: e.status.unlimited,
            resetsAt: e.status.resetsAt.toISOString(),
          },
          upgradeUrl: "/?view=settings",
        },
        { status: 429 },
      );
    }
    console.error(`[/api/docs/enhance] AI call failed for ${docType}:`, e);
    return NextResponse.json(
      { error: e?.message || "AI enhance failed" },
      { status: 500 },
    );
  }
}
