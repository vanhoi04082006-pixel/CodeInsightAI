// CodeInsight AI — Documentation Agent (docs prompt)
// Generates README / API / architecture / component / deployment docs from source files.
// Falls back to a skeleton doc derived from file structure when no provider is available.

import type { AgentId, AgentInfo, Task, TaskResult } from "./types";
import { BaseAgent } from "./base-agent";
import { callAI, type AIProviderConfig, type AIMessage } from "./ai-client";
import { repositoryMemory } from "./repository-memory";

/* ────────────── Input shapes ────────────── */

interface SourceFile {
  path: string;
  content: string;
}

type DocType = "readme" | "api" | "architecture" | "component" | "deployment";

interface DocsInput {
  files?: SourceFile[];
  repositoryUrl?: string;
  docType?: DocType;
  provider?: AIProviderConfig;
  projectName?: string;
}

/* ────────────── Output shape ────────────── */

interface DocMeta {
  languages: Record<string, number>;
  frameworks: string[];
  fileCount: number;
  totalLines: number;
  structure: { path: string; lines: number; summary: string }[];
}

interface DocOutput {
  markdown: string;
  docType: DocType;
  meta: DocMeta;
}

/* ────────────── Agent ────────────── */

export class DocumentationAgent extends BaseAgent {
  readonly id: AgentId = "documentation-agent";
  readonly info: AgentInfo = {
    id: "documentation-agent",
    name: "Documentation Agent",
    description:
      "Generates README, API, architecture, component, or deployment docs from source files using AI — with a rule-based skeleton fallback.",
    capabilities: [
      { kind: "document", description: "Generate documentation markdown for a repository or component." },
    ],
    icon: "BookOpen",
    color: "#a78bfa",
  };

  protected async execute(
    task: Task,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<TaskResult> {
    const input = (task.input ?? {}) as DocsInput;
    const provider = input.provider;
    const repoUrl = input.repositoryUrl;
    const files = input.files ?? [];
    const docType: DocType = clampDocType(input.docType);
    const projectName = input.projectName ?? "Project";

    onProgress(10, "Gathering file metadata");
    const meta = gatherMetadata(files);
    if (signal.aborted) return cancelled(this.info.name);

    let markdown: string;
    if (provider && files.length > 0) {
      onProgress(40, "Building documentation prompt");
      try {
        markdown = await this.generateWithAI(provider, files, docType, projectName, meta, signal, onProgress);
      } catch (err) {
        this.log("warn", `AI doc generation failed — falling back to skeleton: ${(err as Error).message}`);
        markdown = this.skeletonDoc(docType, projectName, meta);
      }
    } else {
      onProgress(40, "No AI provider — generating skeleton doc");
      markdown = this.skeletonDoc(docType, projectName, meta);
    }

    if (signal.aborted) return cancelled(this.info.name);

    onProgress(90, "Polishing markdown");
    markdown = polishMarkdown(markdown, docType);

    onProgress(100, "Documentation complete");
    this.recordDecision(
      task.id,
      `Generated ${docType} documentation (${meta.fileCount} files analyzed)`,
      `Output ${markdown.split("\n").length} lines of markdown.`,
    );

    if (repoUrl) {
      try {
        await repositoryMemory.remember(repoUrl, `docs:${docType}:${task.id}`, markdown, "decision");
      } catch {
        // best-effort
      }
    }

    this.log("info", `Generated ${docType} docs — ${markdown.split("\n").length} lines.`);

    const output: DocOutput = { markdown, docType, meta };
    const outPath = docOutputPath(docType, projectName);

    return {
      success: true,
      data: output,
      summary: `Generated ${docType} documentation from ${meta.fileCount} file(s).`,
      artifacts: [
        {
          kind: "file",
          path: outPath,
          content: markdown,
          language: "markdown",
          meta: { docType, fileCount: meta.fileCount, totalLines: meta.totalLines },
        },
      ],
      metrics: {
        files: meta.fileCount,
        lines: meta.totalLines,
        outputLines: markdown.split("\n").length,
      },
    };
  }

  /* ────── AI generation ────── */

  private async generateWithAI(
    provider: AIProviderConfig,
    files: SourceFile[],
    docType: DocType,
    projectName: string,
    meta: DocMeta,
    signal: AbortSignal,
    onProgress: (p: number, msg: string) => void,
  ): Promise<string> {
    const brief = DOC_BRIEFS[docType];
    const fileBlocks = files
      .slice(0, 20)
      .map(f => `### ${f.path} (${f.content.split("\n").length} lines)\n\`\`\`\n${truncate(f.content, 1500)}\n\`\`\``)
      .join("\n\n");
    const langList = Object.entries(meta.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang} (${count} files)`)
      .join(", ");
    const structureList = meta.structure
      .slice(0, 30)
      .map(s => `- \`${s.path}\` — ${s.summary}`)
      .join("\n");

    const system: AIMessage = {
      role: "system",
      content:
        "You are a senior technical writer. Produce clear, accurate, well-structured Markdown documentation. " +
        "Use proper ATX headings (#, ##, ###), fenced code blocks with language tags, tables where appropriate, and avoid fluff.",
    };
    const user: AIMessage = {
      role: "user",
      content:
        `${brief}\n\n` +
        `Project name: ${projectName}\n` +
        `Languages detected: ${langList || "n/a"}\n` +
        `Frameworks detected: ${meta.frameworks.join(", ") || "n/a"}\n\n` +
        `File structure:\n${structureList || "(none)"}\n\n` +
        `Source files:\n${fileBlocks}`.trim(),
    };

    onProgress(70, "Calling AI to generate documentation");
    const reply = await callAI(provider, [system, user], { temperature: 0.3, maxTokens: 6000, signal });
    return reply && reply.trim() ? reply.trim() : this.skeletonDoc(docType, projectName, meta);
  }

  /* ────── Rule-based skeleton ────── */

  private skeletonDoc(docType: DocType, projectName: string, meta: DocMeta): string {
    const langList = Object.entries(meta.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `- **${lang}** — ${count} file(s)`)
      .join("\n");
    const structure = meta.structure
      .slice(0, 30)
      .map(s => `- \`${s.path}\` — ${s.summary}`)
      .join("\n");

    const now = new Date().toISOString().split("T")[0];

    switch (docType) {
      case "readme":
        return [
          `# ${projectName}`,
          "",
          `> Auto-generated skeleton — review and refine.`,
          "",
          "## Overview",
          "",
          `${projectName} is a project composed of ${meta.fileCount} source file(s) and approximately ${meta.totalLines} lines of code.`,
          "",
          "## Tech Stack",
          "",
          langList || "- (none detected)",
          meta.frameworks.length ? "" : "",
          ...(meta.frameworks.length ? ["### Frameworks", ...meta.frameworks.map(f => `- ${f}`), ""] : []),
          "## Project Structure",
          "",
          structure || "_(no files)_",
          "",
          "## Getting Started",
          "",
          "```bash",
          "# Install dependencies",
          "npm install",
          "",
          "# Run in development",
          "npm run dev",
          "```",
          "",
          "## License",
          "",
          "Specify your license here.",
          "",
          `_Generated on ${now} by CodeInsight AI Documentation Agent._`,
        ].join("\n");

      case "api":
        return [
          `# ${projectName} — API Reference`,
          "",
          "> Auto-generated skeleton — add endpoint details, parameters, and examples.",
          "",
          "## Base URL",
          "",
          "```",
          "http://localhost:3000/api",
          "```",
          "",
          "## Authentication",
          "",
          "Describe the authentication scheme used by this API.",
          "",
          "## Endpoints",
          "",
          apiSkeletonFromFiles(meta.structure),
          "",
          "## Error Responses",
          "",
          "| Status | Meaning |",
          "|---|---|",
          "| 400 | Bad Request |",
          "| 401 | Unauthorized |",
          "| 404 | Not Found |",
          "| 500 | Internal Server Error |",
          "",
          `_Generated on ${now} by CodeInsight AI Documentation Agent._`,
        ].join("\n");

      case "architecture":
        return [
          `# ${projectName} — Architecture`,
          "",
          "> Auto-generated skeleton — describe components, data flow, and decisions.",
          "",
          "## Overview",
          "",
          `The system is composed of ${meta.fileCount} source files totaling ~${meta.totalLines} lines.`,
          "",
          "## Components",
          "",
          structure || "_(no files)_",
          "",
          "## Data Flow",
          "",
          "1. Request enters the system via the entry point.",
          "2. Routed to the appropriate handler.",
          "3. Handler performs business logic using services.",
          "4. Persistence layer is updated if needed.",
          "5. Response is returned to the caller.",
          "",
          "## Tech Stack",
          "",
          langList || "- (none detected)",
          "",
          `_Generated on ${now} by CodeInsight AI Documentation Agent._`,
        ].join("\n");

      case "component":
        return [
          `# ${projectName} — Component Guide`,
          "",
          "> Auto-generated skeleton — describe props, state, and usage of each component.",
          "",
          "## Components",
          "",
          componentSkeletonFromFiles(meta.structure),
          "",
          "## Usage Examples",
          "",
          "```tsx",
          "// TODO: add usage examples for each component",
          "```",
          "",
          `_Generated on ${now} by CodeInsight AI Documentation Agent._`,
        ].join("\n");

      case "deployment":
        return [
          `# ${projectName} — Deployment Guide`,
          "",
          "> Auto-generated skeleton — fill in your environment and platform details.",
          "",
          "## Prerequisites",
          "",
          "- Node.js >= 18",
          "- A supported AI provider API key",
          "",
          "## Environment Variables",
          "",
          "| Name | Required | Description |",
          "|---|---|---|",
          "| `DATABASE_URL` | yes | Database connection string |",
          "| `PORT` | no | Server port (default 3000) |",
          "",
          "## Build",
          "",
          "```bash",
          "npm run build",
          "```",
          "",
          "## Deploy",
          "",
          "Choose one of:",
          "",
          "- **Vercel**: `vercel --prod`",
          "- **Docker**: `docker build -t ${projectName.toLowerCase()} . && docker run -p 3000:3000 ${projectName.toLowerCase()}`",
          "- **Bare metal**: `npm run start`",
          "",
          "## Post-Deploy Checks",
          "",
          "1. Health check `GET /api/health`",
          "2. Smoke-test the main user flow.",
          "",
          `_Generated on ${now} by CodeInsight AI Documentation Agent._`,
        ].join("\n");
    }
  }
}

/* ────────────── Metadata helpers ─────────────️ */

const DOC_BRIEFS: Record<DocType, string> = {
  readme: "Write a complete README.md for this project: project overview, features, tech stack, getting started, project structure, scripts, configuration, and license.",
  api: "Write a thorough API reference document: base URL, authentication, every endpoint (method, path, params, request body, response shape, example request/response), and error responses.",
  architecture: "Write an architecture document: high-level overview, components and their responsibilities, data flow, key design decisions, and tech stack rationale.",
  component: "Write a component guide: for each UI component, document its purpose, props (with types), state, events, and a usage example.",
  deployment: "Write a deployment guide: prerequisites, environment variables, build steps, deployment options (Vercel/Docker/bare metal), and post-deploy verification.",
};

function gatherMetadata(files: SourceFile[]): DocMeta {
  const languages: Record<string, number> = {};
  const frameworks = new Set<string>();
  const structure: DocMeta["structure"] = [];

  for (const f of files) {
    const lang = detectLanguage(f.path);
    languages[lang] = (languages[lang] ?? 0) + 1;

    // Framework detection — naive but useful.
    const c = f.content;
    if (c.includes("next") || c.includes('"next"')) frameworks.add("Next.js");
    if (c.includes('"react"') || c.includes("from 'react'")) frameworks.add("React");
    if (c.includes('"vue"') || c.includes("from 'vue'")) frameworks.add("Vue");
    if (c.includes('"express"') || c.includes("from 'express'")) frameworks.add("Express");
    if (c.includes('"@prisma/client"') || c.includes("prisma")) frameworks.add("Prisma");
    if (c.includes('"fastify"')) frameworks.add("Fastify");
    if (c.includes('"@nestjs')) frameworks.add("NestJS");
    if (c.includes('"tailwindcss"') || c.includes("tailwind")) frameworks.add("Tailwind CSS");
    if (c.includes('"three"') || c.includes("@react-three")) frameworks.add("Three.js");

    structure.push({
      path: f.path,
      lines: f.content.split("\n").length,
      summary: oneLineSummary(f),
    });
  }

  return {
    languages,
    frameworks: Array.from(frameworks),
    fileCount: files.length,
    totalLines: files.reduce((n, f) => n + f.content.split("\n").length, 0),
    structure,
  };
}

function oneLineSummary(f: SourceFile): string {
  const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    // Try to extract the first exported function/component name.
    const m = f.content.match(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/);
    if (m) return `${detectLanguage(f.path)} module — exports ${m[1]}`;
  }
  if (ext === "md") return "Markdown document";
  if (ext === "json") {
    if (f.path.endsWith("package.json")) return "package manifest";
    if (f.path.endsWith("tsconfig.json")) return "TypeScript config";
    return "JSON data";
  }
  return `${detectLanguage(f.path)} source`;
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    c: "c",
    h: "c",
    swift: "swift",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sh: "shell",
    sql: "sql",
    css: "css",
    scss: "scss",
    html: "html",
    vue: "vue",
    svelte: "svelte",
  };
  return map[ext] ?? "text";
}

function apiSkeletonFromFiles(structure: DocMeta["structure"]): string {
  const routes = structure.filter(s => /route\.(ts|js)$|api\/|controller/i.test(s.path));
  if (routes.length === 0) {
    return "_No API route files detected. Add endpoints manually._";
  }
  return routes.map(r => `### \`${r.path}\`\n\n- Method: TODO\n- Path: TODO\n- Description: ${r.summary}\n`).join("\n");
}

function componentSkeletonFromFiles(structure: DocMeta["structure"]): string {
  const components = structure.filter(s => /\.(tsx|jsx)$/.test(s.path) && !s.path.includes("route."));
  if (components.length === 0) return "_No component files detected._";
  return components
    .slice(0, 20)
    .map(c => {
      const name = c.path.split("/").pop() ?? c.path;
      return `### \`${name}\`\n\n- **Path:** \`${c.path}\`\n- **Purpose:** ${c.summary}\n- **Props:** TODO\n- **Example:** TODO\n`;
    })
    .join("\n");
}

/* ────────────── Misc helpers ────────────── */

function clampDocType(t: unknown): DocType {
  const allowed: DocType[] = ["readme", "api", "architecture", "component", "deployment"];
  return typeof t === "string" && (allowed as string[]).includes(t) ? (t as DocType) : "readme";
}

function docOutputPath(docType: DocType, projectName: string): string {
  switch (docType) {
    case "readme":
      return "README.md";
    case "api":
      return "docs/API.md";
    case "architecture":
      return "docs/ARCHITECTURE.md";
    case "component":
      return "docs/COMPONENTS.md";
    case "deployment":
      return "docs/DEPLOYMENT.md";
    default:
      return `docs/${projectName}.md`;
  }
}

function polishMarkdown(md: string, _docType: DocType): string {
  // Ensure exactly one blank line between sections, and trim trailing whitespace per line.
  const trimmed = md
    .split("\n")
    .map(l => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return trimmed + "\n";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… [truncated]";
}

function cancelled(agentName: string): TaskResult {
  return {
    success: false,
    data: null,
    summary: `${agentName} cancelled before completion.`,
    artifacts: [],
  };
}

export const documentationAgent = new DocumentationAgent();
