// CodeInsight AI — Analysis Engine v2
import type { AnalysisReport, Issue, ChartPoint } from "./types";
import type { ParsedRepository, ParsedFile } from "./repo-parser";
import { analyzeSecurity } from "./analyzers/security";
import { analyzeBugs } from "./analyzers/bugs";
import { analyzePerformance, getPositiveFindings } from "./analyzers/performance";
import { detectArchitecture, analyzeTechDebt } from "./analyzers/architecture";
import { translate } from "./static-i18n";

export function analyzeParsedRepository(
  parsed: ParsedRepository,
  rawFiles?: { path: string; content: string }[],
  language: string = "en",
): AnalysisReport {
  // Lấy danh sách file để check lỗi
  const filesForAnalysis = rawFiles || parsed.files.map(f => ({ path: f.path, content: generatePseudoContent(f) }));
  
  // FIX: Chỉ chạy quét Bug, Security trên các file code thực sự. Loại bỏ .md, .json, .csv...
  const validCodeFiles = filesForAnalysis.filter(f => {
    const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
    return !['.md', '.json', '.yml', '.yaml', '.txt', '.csv', '.lock'].includes(ext);
  });

  const securityIssues = analyzeSecurity(validCodeFiles, language);
  const bugIssues = analyzeBugs(validCodeFiles, language);
  const perfIssues = analyzePerformance(validCodeFiles, language);
  const perfPositiveFindings = getPositiveFindings(validCodeFiles, language);

  const arch = detectArchitecture(parsed.files, language);
  const techDebt = analyzeTechDebt(parsed.files, language);

  const securityScore = calcScore(securityIssues, 100);
  const performanceScore = calcScore(perfIssues, 100);
  const maintainabilityScore = calcMaintainability(parsed.files, techDebt.score);
  const codeQualityScore = calcCodeQuality(parsed.files, bugIssues);
  const architectureScore = calcArchitecture(arch, parsed);
  const overall = Math.round(
    securityScore * 0.25 + performanceScore * 0.2 + architectureScore * 0.2 +
    maintainabilityScore * 0.2 + codeQualityScore * 0.15
  );

  const fileInsights = parsed.files.map(f => ({
    path: f.path,
    language: f.language,
    lines: f.lines,
    complexity: f.complexity,
    maintainability: clamp(100 - f.complexity * 2, 20, 99),
    description: f.description,
    issues: countIssuesForFile(f.path, securityIssues, bugIssues, perfIssues),
    // IDE-grade Code Explorer fields (backward-compatible)
    functions: f.functions,
    classes: f.classes,
    imports: f.imports,
    exports: f.exports,
    functionSignatures: f.functionSignatures,
  }));

  const activity = genActivity();
  const complexityTrend = genComplexityTrend(parsed.files);
  const maintainabilityTrend = genMaintainabilityTrend();

  const inboundImports = new Set<string>();
  parsed.files.forEach(f => f.imports.forEach(imp => {
    // Match by exact path, endsWith, or basename match (for C# using, Python import, etc.)
    const resolved = parsed.files.find(o =>
      o.path === imp ||
      o.path.endsWith(imp) ||
      imp.endsWith(o.path.split('/').pop() || '') ||
      imp.endsWith(o.path.split('\\').pop() || '')
    );
    if (resolved) inboundImports.add(resolved.path);
  }));

  // Entry points — never mark as dead code
  const entryPointPatterns = [
    "program.cs", "Program.cs", "Main.cs", "main.ts", "main.tsx",
    "index.ts", "index.tsx", "index.js", "index.jsx",
    "app.ts", "app.tsx", "app.js", "App.tsx", "App.cs",
    "server.ts", "server.js", "server.py",
    "package.json", "tsconfig.json", "Cargo.toml", "go.mod",
    "requirements.txt", "pyproject.toml",
  ];

  const deadCode = parsed.files
    .filter(f => {
      // Never flag entry points
      if (entryPointPatterns.some(ep => f.path.endsWith(ep) || f.path === ep)) return false;
      // Never flag config files
      if (f.path.endsWith(".json") || f.path.endsWith(".toml") || f.path.endsWith(".mod")) return false;
      // Flag only if NOT in inbound imports
      return !inboundImports.has(f.path);
    })
    .map(f => ({ path: f.path, lines: f.lines, reason: translate(language, "static", "deadCode.reason") }));

  const funcMap = new Map<string, string[]>();
  parsed.files.forEach(f => f.functions.forEach(fn => {
    const arr = funcMap.get(fn) || [];
    arr.push(f.path);
    funcMap.set(fn, arr);
  }));
  const duplicates: { group: number; files: string[]; lines: number }[] = [];
  let dupGroup = 0;
  for (const [fn, paths] of funcMap) {
    if (paths.length > 2 && !["map","filter","forEach","render","toString"].includes(fn)) {
      dupGroup++;
      duplicates.push({ group: dupGroup, files: [...new Set(paths)], lines: 25 });
    }
  }

  const generatedSnippets: import("./types").CodeSnippet[] = [];
  if (rawFiles && rawFiles.length > 0) {
    const allIssues = [...securityIssues, ...bugIssues, ...perfIssues];
    const complexFiles = [...parsed.files]
      .sort((a, b) => {
        const issuesA = allIssues.filter(i => i.file === a.path).length;
        const issuesB = allIssues.filter(i => i.file === b.path).length;
        return (issuesB * 10 + b.complexity) - (issuesA * 10 + a.complexity);
      })
      .slice(0, 5);
    for (const cf of complexFiles) {
      const raw = rawFiles.find(r => r.path === cf.path);
      if (!raw || !raw.content.trim()) continue;

      const lines = raw.content.split("\n");
      const issuesInFile = allIssues.filter(i => i.file === cf.path);

      let codePreview = "";
      let exp = cf.description || translate(language, "static", "snippet.moduleFallback", { fileName: cf.path.split('/').pop() || "" });
      let startLine = 1;
      let endLine = Math.min(lines.length, 30);
      let primaryIssueId: string | undefined;

      if (issuesInFile.length > 0) {
        const primaryIssue = issuesInFile.sort((a,b) => (a.severity === "critical" ? -1 : 1))[0];
        primaryIssueId = primaryIssue.id;
        exp = translate(language, "static", "snippet.riskDetected", {
          severity: primaryIssue.severity.toUpperCase(),
          title: primaryIssue.title,
          recommendation: primaryIssue.recommendation,
        });

        if (primaryIssue.line && primaryIssue.line > 0 && primaryIssue.line <= lines.length) {
          const lineIdx = primaryIssue.line - 1;
          const start = Math.max(0, lineIdx - 8);
          const end = Math.min(lines.length, lineIdx + 12);
          startLine = start + 1;
          endLine = end;

          codePreview = lines.slice(start, end).map((l, i) => {
            const currentLine = start + i + 1;
            return currentLine === primaryIssue.line ? `${l} // 🔴 [${translate(language, "static", "snippet.aiWarningMarker")}]: ${primaryIssue.title}` : l;
          }).join("\n");

          codePreview = translate(language, "static", "snippet.excerptAroundLine", { line: primaryIssue.line }) + "\n" + codePreview;
        } else {
          codePreview = lines.slice(0, 30).join("\n");
        }
      } else {
        exp = translate(language, "static", "snippet.architectureAnalysis", { complexity: cf.complexity });
        codePreview = lines.slice(0, 30).join("\n");
      }

      generatedSnippets.push({
        file: cf.path,
        language: cf.language.toLowerCase() === "typescript" ? "tsx" : cf.language.toLowerCase(),
        title: cf.path.split('/').pop() || "Code Snippet",
        code: codePreview + (lines.length > 30 && !issuesInFile[0]?.line ? "\n\n" + translate(language, "static", "snippet.truncatedNotice") : ""),
        explanation: exp,
        startLine,
        endLine,
        totalLines: lines.length,
        rawContent: raw.content,
        issueId: primaryIssueId,
      });
    }
  }

  // ── Build fileContents map: full source for every fetched file ──
  // Used by the Agent Code View (`/api/agent/file`) and the file-tree
  // browser in WorkspaceView. Previously only the top-5 most-complex
  // files had `rawContent` saved (in `snippets[]`); every other file
  // returned empty content — making the Code View useless for browsing.
  //
  // Caps:
  //   - per-file: 100KB (already enforced by /api/analyze fetcher)
  //   - total map: 5MB (well under Vercel Hobby's row-size limit; the
  //     `analysis.report` JSON column typically stays <10MB total)
  // Files beyond the cap are silently dropped — they remain in `files`
  // for metadata, just not viewable in Code View.
  const MAX_TOTAL_FILE_CONTENTS_BYTES = 5 * 1024 * 1024; // 5MB
  const fileContents: Record<string, string> = {};
  if (rawFiles && rawFiles.length > 0) {
    let totalBytes = 0;
    // Sort by path for deterministic ordering (so the cap drops the same
    // files on re-analysis, not random ones based on fetch order).
    const sorted = [...rawFiles].sort((a, b) => a.path.localeCompare(b.path));
    for (const r of sorted) {
      if (!r.content) continue;
      const size = r.content.length;
      if (totalBytes + size > MAX_TOTAL_FILE_CONTENTS_BYTES) break;
      fileContents[r.path] = r.content;
      totalBytes += size;
    }
  }

  return {
    repoUrl: parsed.url,
    repoOwner: parsed.owner,
    repoName: parsed.name,
    repoBranch: parsed.branch,
    summary: translate(language, "static", "summary", {
      totalFiles: parsed.totalFiles,
      totalLines: parsed.totalLines.toLocaleString(),
      overall,
      secCount: securityIssues.length,
      bugCount: bugIssues.length,
      perfCount: perfIssues.length,
    }),
    tags: Array.from(new Set([
      ...(parsed.languages[0]?.name ? [parsed.languages[0].name] : []),
      ...(parsed.frameworks[0]?.name ? [parsed.frameworks[0].name] : []),
      arch.pattern.split(" ")[0],
    ].filter(Boolean))),
    scores: { overall, security: securityScore, performance: performanceScore, architecture: architectureScore, maintainability: maintainabilityScore, codeQuality: codeQualityScore },
    scoreBreakdown: [
      { label: translate(language, "static", "scoreLabels.security"), score: securityScore, max: 100, weight: 25 },
      { label: translate(language, "static", "scoreLabels.performance"), score: performanceScore, max: 100, weight: 20 },
      { label: translate(language, "static", "scoreLabels.architecture"), score: architectureScore, max: 100, weight: 20 },
      { label: translate(language, "static", "scoreLabels.maintainability"), score: maintainabilityScore, max: 100, weight: 20 },
      { label: translate(language, "static", "scoreLabels.codeQuality"), score: codeQualityScore, max: 100, weight: 15 },
    ],
    primaryLanguage: parsed.languages[0]?.name ?? "Unknown",
    totalFiles: parsed.totalFiles,
    totalLines: parsed.totalLines,
    languages: parsed.languages,
    frameworks: parsed.frameworks,
    dependencies: parsed.dependencies,
    issues: { bugs: bugIssues, security: securityIssues, performance: perfIssues },
    perfPositiveFindings,
    files: fileInsights,
    snippets: generatedSnippets,
    fileContents,
    diagrams: buildDiagrams(parsed, arch), // Dynamic SVG from real data
    deadCode,
    duplicates,
    maintainabilityTrend,
    architecture: {
      pattern: arch.pattern,
      description: arch.description,
      layers: arch.layers,
      strengths: arch.strengths,
      weaknesses: arch.weaknesses,
      metrics: arch.metrics,
    },
    technicalDebt: { score: techDebt.score, items: techDebt.items },
    roadmap: genRoadmap(securityIssues, perfIssues, arch, language),
    monetization: [
      {
        title: translate(language, "static", "monetization.saas.title"),
        description: translate(language, "static", "monetization.saas.description"),
        potential: "high",
      },
      {
        title: translate(language, "static", "monetization.enterprise.title"),
        description: translate(language, "static", "monetization.enterprise.description"),
        potential: "high",
      },
      {
        title: translate(language, "static", "monetization.premium.title"),
        description: translate(language, "static", "monetization.premium.description"),
        potential: "medium",
      },
    ],
    documentation: {
      readme: genReadme(parsed, language),
      apiDocs: genApiDocs(parsed, language),
      architectureMd: genArchitectureMd(parsed, arch),
      folderGuide: genFolderGuide(parsed),
      componentGuide: genComponentGuide(parsed, language),
      deploymentGuide: genDeploymentGuide(parsed, language),
    },
    activity,
    complexityTrend,
  };
}

function generatePseudoContent(f: ParsedFile): string {
  const parts: string[] = [];
  parts.push(`// ${f.path}`);
  for (const imp of f.imports) parts.push(`import "${imp}";`);
  for (const fn of f.functions) parts.push(`function ${fn}() {}`);
  for (const cl of f.classes) parts.push(`class ${cl} {}`);
  for (const ex of f.exports) parts.push(`export ${ex};`);
  for (const comp of f.components) parts.push(`function ${comp}() { return null; }`);
  for (const r of f.routes) parts.push(`app.get("${r}", handler);`);
  return parts.join("\n");
}

function calcScore(issues: Issue[], base: number): number {
  let score = base;
  for (const i of issues) {
    if (i.severity === "critical") score -= 15;
    else if (i.severity === "high") score -= 8;
    else if (i.severity === "medium") score -= 4;
    else if (i.severity === "low") score -= 1;
  }
  return clamp(score, 0, 100);
}

function calcMaintainability(files: ParsedFile[], debtScore: number): number {
  const avgComplexity = files.length > 0 ? files.reduce((s,f)=>s+f.complexity,0)/files.length : 1;
  return clamp(100 - avgComplexity * 2 - debtScore * 0.3, 10, 99);
}

function calcCodeQuality(files: ParsedFile[], bugs: Issue[]): number {
  const avgComplexity = files.length > 0 ? files.reduce((s,f)=>s+f.complexity,0)/files.length : 1;
  return clamp(100 - avgComplexity * 1.5 - bugs.length * 2, 10, 99);
}

function calcArchitecture(arch: { pattern: string; strengths: string[]; weaknesses: string[]; metrics?: any }, parsed: ParsedRepository): number {
  let score = 80;
  score += Math.min(arch.strengths.length * 3, 15);
  score -= Math.min(arch.weaknesses.length * 4, 20);
  if (parsed.dependencies.circular.length > 0) score -= 10;
  if (parsed.frameworks.length > 0) score += 5;

  // Use deep metrics for a more accurate architecture score
  const m = arch.metrics;
  if (m) {
    // Penalize high instability (volatile dependencies)
    if (m.instability > 0.7) score -= 8;
    else if (m.instability < 0.3) score += 5;
    // Reward closeness to Main Sequence
    score -= Math.round(m.distanceFromMain * 15);
    // Penalize directory-level circular deps heavily
    score -= Math.min(m.dirCircularDeps.length * 6, 18);
    // Penalize layer violations
    score -= Math.min(m.layerViolations.length * 4, 12);
    // Penalize god modules
    score -= Math.min(m.godModules.length * 3, 9);
    // Reward good cohesion
    if (m.avgCohesion > 0.5) score += 4;
    else if (m.avgCohesion < 0.2) score -= 4;
  }

  return clamp(score, 20, 99);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function countIssuesForFile(path: string, sec: Issue[], bugs: Issue[], perf: Issue[]): number {
  return [...sec, ...bugs, ...perf].filter(i => i.file === path).length;
}

function genActivity(): ChartPoint[] {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return days.map(d => ({ label: d, value: Math.floor(Math.random()*60)+10 }));
}

function genComplexityTrend(files: ParsedFile[]): ChartPoint[] {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"];
  const avg = files.length > 0 ? files.reduce((s,f)=>s+f.complexity,0)/files.length : 12;
  return months.map(m => ({ label: m, value: clamp(avg + (Math.random()-0.45)*6, 5, 35) }));
}

function genMaintainabilityTrend(): ChartPoint[] {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"];
  let v = 82;
  return months.map(m => { v = clamp(v + (Math.random()-0.55)*4, 60, 95); return { label: m, value: v }; });
}

function genRoadmap(sec: Issue[], perf: Issue[], arch: any, language: string): AnalysisReport["roadmap"] {
  const items: AnalysisReport["roadmap"] = [];
  
  const critSec = sec.filter(i => i.severity === "critical" || i.severity === "high");
  if (critSec.length > 0) {
    items.push({ 
      title: translate(language, "static", "roadmap.phase1.title"), 
      description: translate(language, "static", "roadmap.phase1.description", { count: critSec.length }), 
      priority: "high", 
      category: "Security" 
    });
  }

  const highPerf = perf.filter(i => i.severity === "high" || i.severity === "medium");
  if (highPerf.length > 0) {
    items.push({ 
      title: translate(language, "static", "roadmap.phase2.title"), 
      description: translate(language, "static", "roadmap.phase2.description", { count: highPerf.length }), 
      priority: "medium", 
      category: "Performance" 
    });
  }

  items.push({ 
    title: translate(language, "static", "roadmap.phase3.title"), 
    description: translate(language, "static", "roadmap.phase3.description"), 
    priority: "medium", 
    category: "Maintainability" 
  });
  
  return items;
}

function genReadme(parsed: ParsedRepository, language: string): string {
  const autoNote = translate(language, "static", "docs.readmeAutoNote");
  return `# ${parsed.name} 🚀\n\n${autoNote}\n\n${parsed.totalFiles} files · ${parsed.totalLines.toLocaleString()} lines · ${parsed.languages[0]?.name ?? "Unknown"}\n\n## 🛠 Tech Stack\n${parsed.frameworks.map(f=>`- **${f.name}** ${f.version}`).join("\n")||"- None"}`;
}

function genApiDocs(parsed: ParsedRepository, language: string): string {
  const routes = parsed.files.flatMap(f => f.routes.map(r => ({ path: r, file: f.path })));
  if (routes.length === 0) return translate(language, "static", "docs.apiNoRoutes");
  const entries = routes.map(r => translate(language, "static", "docs.apiRouteEntry", { path: r.path, file: r.file })).join("\n\n");
  return `# API Reference\n\n${entries}\n`;
}

function genArchitectureMd(parsed: ParsedRepository, arch: any): string {
  const layers = arch.layers.map((l: any) => `### ${l.name}\n${l.responsibility} (${l.files} files)`).join("\n\n");
  return `# Architecture\n\n## Pattern: **${arch.pattern}**\n\n${arch.description}\n\n## Layers\n${layers}\n`;
}

function genFolderGuide(parsed: ParsedRepository): string {
  const dirMap = new Map<string, { files: number; lines: number; langs: Set<string> }>();
  for (const f of parsed.files) {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    const existing = dirMap.get(dir) || { files: 0, lines: 0, langs: new Set<string>() };
    existing.files++; existing.lines += f.lines; existing.langs.add(f.language);
    dirMap.set(dir, existing);
  }
  const dirs = Array.from(dirMap.entries()).sort((a, b) => b[1].lines - a[1].lines);
  return `# Folder Guide\n\n| Folder | Files | Lines | Languages |\n|--------|-------|-------|-----------|\n${dirs.map(([dir, info]) => `| \`${dir}/\` | ${info.files} | ${info.lines.toLocaleString()} | ${Array.from(info.langs).join(", ")} |`).join("\n")}\n`;
}

function genComponentGuide(parsed: ParsedRepository, language: string): string {
  // Gom các component theo file (.tsx/.jsx/.vue/.svelte) — dựa trên dữ liệu parse thật.
  const UI_EXTS = [".tsx", ".jsx", ".vue", ".svelte"];
  const rows: { file: string; components: string[]; lines: number }[] = [];
  for (const f of parsed.files) {
    const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
    if (!UI_EXTS.includes(ext) || f.components.length === 0) continue;
    rows.push({ file: f.path, components: f.components, lines: f.lines });
  }

  if (rows.length === 0) {
    return translate(language, "static", "docs.componentNoneFound");
  }

  const total = rows.reduce((s, r) => s + r.components.length, 0);
  const table = rows
    .slice(0, 60) // giới hạn để tài liệu không quá dài
    .map(r => `| \`${r.components.join("`, `")}\` | ${r.lines.toLocaleString()} | \`${r.file}\` |`)
    .join("\n");

  const summary = translate(language, "static", "docs.componentSummary", { total, files: rows.length });
  const tableHeader = translate(language, "static", "docs.componentTableHeader");
  return `# Component Guide\n\n${summary}\n\n${tableHeader}\n${table}\n`;
}

function genDeploymentGuide(parsed: ParsedRepository, language: string): string {
  // Gói gọn package manager; hiển thị thân thiện khi không xác định được.
  const pm = parsed.packageManager && parsed.packageManager !== "unknown"
    ? parsed.packageManager
    : null;

  const hasNode = parsed.languages.some(l => l.name === "TypeScript" || l.name === "JavaScript");
  const inferredPm = pm ?? (hasNode ? "npm" : null);

  const installCmd = inferredPm === "bun" ? "bun install"
    : inferredPm === "pnpm" ? "pnpm install"
    : inferredPm === "yarn" ? "yarn"
    : inferredPm === "pip" ? "pip install -r requirements.txt"
    : inferredPm === "go mod" ? "go mod download"
    : inferredPm === "cargo" ? "cargo build"
    : inferredPm === "npm" ? "npm install"
    : null;

  const devCmd = inferredPm === "bun" ? "bun dev"
    : inferredPm === "pnpm" ? "pnpm dev"
    : inferredPm === "yarn" ? "yarn dev"
    : inferredPm === "cargo" ? "cargo run"
    : inferredPm && inferredPm !== "pip" && inferredPm !== "go mod" ? `${inferredPm} run dev`
    : null;

  const hasDocker = parsed.configFiles.some(c => /(^|\/)Dockerfile(\.|$)/i.test(c));
  const fwNames = parsed.frameworks.map(f => f.name).filter(Boolean);
  const isNext = fwNames.some(n => /next/i.test(n));

  const lines: string[] = [];
  lines.push(translate(language, "static", "docs.deployment.title"));
  lines.push("");
  lines.push(pm
    ? translate(language, "static", "docs.deployment.packageManagerKnown", { pm })
    : translate(language, "static", "docs.deployment.packageManagerUnknown"));
  lines.push("");
  lines.push(translate(language, "static", "docs.deployment.sectionInstall"));
  if (installCmd) {
    lines.push("");
    lines.push("```bash");
    lines.push(installCmd);
    lines.push("```");
  } else {
    lines.push("");
    lines.push(translate(language, "static", "docs.deployment.installUnknown"));
  }

  if (devCmd) {
    lines.push("");
    lines.push(translate(language, "static", "docs.deployment.sectionDev"));
    lines.push("");
    lines.push("```bash");
    lines.push(devCmd);
    lines.push("```");
  }

  lines.push("");
  lines.push(translate(language, "static", "docs.deployment.sectionBuild"));
  if (isNext) {
    lines.push("");
    lines.push("```bash");
    lines.push(translate(language, "static", "docs.deployment.buildProduction"));
    lines.push(inferredPm === "bun" ? "bun run build" : inferredPm === "pnpm" ? "pnpm build" : "npm run build");
    lines.push(translate(language, "static", "docs.deployment.startProduction"));
    lines.push(inferredPm === "bun" ? "bun start" : inferredPm === "pnpm" ? "pnpm start" : "npm start");
    lines.push("```");
    lines.push("");
    lines.push(translate(language, "static", "docs.deployment.vercelRecommend"));
  } else if (hasDocker) {
    lines.push("");
    lines.push(translate(language, "static", "docs.deployment.dockerDetected"));
    lines.push("");
    lines.push("```bash");
    lines.push("docker build -t app .");
    lines.push("docker run -p 3000:3000 app");
    lines.push("```");
  } else {
    lines.push("");
    lines.push(translate(language, "static", "docs.deployment.dockerMissing"));
  }

  return lines.join("\n") + "\n";
}

// 💡 HÀM TẠO SƠ ĐỒ SVG ĐÃ ĐƯỢC KHÔI PHỤC (Lấy từ bản v1 gốc)
function buildDiagrams(parsed: ParsedRepository, arch: any): import("@/lib/types").DiagramSet {
  // ── UML Class Diagram ── generated from real classes/interfaces
  const modulesWithClasses = parsed.files
    .filter(f => f.classes.length > 0 || f.interfaces.length > 0)
    .slice(0, 10);

  let hasUml = modulesWithClasses.length > 0;
  let uml = "";
  let umlExplanation = "No classes or interfaces detected — UML diagram hidden.";

  if (hasUml) {
    const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];
    const boxW = 200, boxH = 100, gapX = 240, gapY = 130;
    const cols = Math.min(modulesWithClasses.length, 4);
    let svgParts: string[] = [];
    modulesWithClasses.forEach((f, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 20 + col * gapX, y = 20 + row * gapY;
      const color = colors[i % colors.length];
      const name = f.path.split("/").pop()?.replace(/\.\w+$/, "") || f.path;
      const fields = f.classes.slice(0, 3).map(c => `+ ${c}`).join("\n  ");
      svgParts.push(`
        <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="6" fill="${color}15" stroke="${color}" stroke-width="1.5"/>
        <rect x="${x}" y="${y}" width="${boxW}" height="22" rx="6" fill="${color}30"/>
        <text x="${x + boxW/2}" y="${y + 15}" text-anchor="middle" fill="${color}" font-weight="bold" font-size="12">${name}</text>
        <text x="${x + 8}" y="${y + 40}" fill="#cbd5e1" font-size="10">${fields.split("\n").join('</text>\n        <text x="' + (x+8) + '" y="' + (y+55) + '" fill="#cbd5e1" font-size="10">')}</text>
        <text x="${x + 8}" y="${y + 75}" fill="#86efac" font-size="10">${f.functions.slice(0,2).map(fn => `+ ${fn}()`).join("  ")}</text>`);
    });
    // Add dependency edges
    parsed.dependencies.edges.slice(0, 15).forEach(e => {
      const fromIdx = modulesWithClasses.findIndex(f => f.path === e.from);
      const toIdx = modulesWithClasses.findIndex(f => f.path === e.to);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        const fromCol = fromIdx % cols, fromRow = Math.floor(fromIdx / cols);
        const toCol = toIdx % cols, toRow = Math.floor(toIdx / cols);
        const x1 = 20 + fromCol * gapX + boxW, y1 = 20 + fromRow * gapY + boxH/2;
        const x2 = 20 + toCol * gapX, y2 = 20 + toRow * gapY + boxH/2;
        svgParts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#67e8f9" stroke-width="0.8" stroke-opacity="0.4" marker-end="url(#arr)"/>`);
      }
    });
    const svgH = Math.ceil(modulesWithClasses.length / cols) * gapY + 20;
    uml = `<svg viewBox="0 0 ${cols * gapX + 20} ${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="monospace"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#67e8f9"/></marker></defs>${svgParts.join("")}</svg>`;
    umlExplanation = `UML diagram showing ${modulesWithClasses.length} modules with their classes, methods, and dependency relationships.`;
  }

  // ── Sequence Diagram ── generated from real routes
  const routes = parsed.files.flatMap(f => f.routes.map(r => ({ path: r, file: f.path, functions: f.functions })));
  const hasSequence = routes.length > 0;
  let sequence = "";
  let sequenceExplanation = "No API routes detected — Sequence diagram hidden.";

  if (hasSequence) {
    const topRoutes = routes.slice(0, 6);
    const actorW = 120, actorGap = 200;
    const actors = ["Client", "API", "Service", "DB"];
    let parts: string[] = [];
    // Actor headers
    actors.forEach((a, i) => {
      const x = 40 + i * actorGap;
      parts.push(`<rect x="${x}" y="10" width="${actorW}" height="24" rx="4" fill="rgba(34,211,238,0.15)" stroke="#22d3ee"/>`);
      parts.push(`<text x="${x + actorW/2}" y="26" text-anchor="middle" fill="#a5f3fc" font-size="11">${a}</text>`);
      parts.push(`<line x1="${x + actorW/2}" y1="34" x2="${x + actorW/2}" y2="${topRoutes.length * 50 + 50}" stroke="#475569" stroke-dasharray="3 3"/>`);
    });
    // Messages
    topRoutes.forEach((r, i) => {
      const y = 50 + i * 50;
      const x1 = 40 + actorW/2, x2 = 40 + actorGap + actorW/2;
      parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#67e8f9" stroke-width="1" marker-end="url(#sarr)"/>`);
      parts.push(`<text x="${(x1+x2)/2}" y="${y-4}" text-anchor="middle" fill="#cbd5e1" font-size="10">${r.path}</text>`);
      // Response
      parts.push(`<line x1="${x2}" y1="${y+20}" x2="${x1}" y2="${y+20}" stroke="#67e8f9" stroke-width="1" stroke-dasharray="3 2" marker-end="url(#sarr)"/>`);
      parts.push(`<text x="${(x1+x2)/2}" y="${y+16}" text-anchor="middle" fill="#94a3b8" font-size="9">200 OK</text>`);
    });
    const svgH = topRoutes.length * 50 + 60;
    sequence = `<svg viewBox="0 0 720 ${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="monospace"><defs><marker id="sarr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#67e8f9"/></marker></defs>${parts.join("")}</svg>`;
    sequenceExplanation = `Sequence diagram showing ${topRoutes.length} API routes and their request/response flow between Client → API → Service layers.`;
  }

  // ── ERD ── detect database schemas from file contents
  const dbFiles = parsed.files.filter(f =>
    f.path.includes("schema.prisma") ||
    f.path.includes("model") ||
    f.path.includes("entity") ||
    f.classes.some(c => c.includes("Entity") || c.includes("Model") || c.includes("Schema"))
  );

  // Also detect Prisma models from file descriptions
  const prismaModels: { name: string; fields: string[] }[] = [];
  for (const f of parsed.files) {
    if (f.path.endsWith(".prisma") || f.path.includes("schema.prisma")) {
      // Detect model names from functions (simplified)
      f.classes.forEach(c => prismaModels.push({ name: c, fields: ["id", "createdAt"] }));
    }
    // Detect Mongoose schemas
    if (f.imports.some(i => i.includes("mongoose"))) {
      f.classes.forEach(c => prismaModels.push({ name: c, fields: ["_id", "createdAt"] }));
    }
    // Detect TypeORM entities
    if (f.imports.some(i => i.includes("typeorm"))) {
      f.classes.forEach(c => prismaModels.push({ name: c, fields: ["id", "createdAt"] }));
    }
  }

  const hasErd = prismaModels.length > 0 || dbFiles.length > 0;
  let erd = "";
  let erdExplanation = "No database schema detected — ERD diagram hidden.";

  if (hasErd) {
    const models = prismaModels.slice(0, 6);
    const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"];
    const boxW = 180, boxH = 100, gapX = 220, gapY = 130;
    const cols = Math.min(models.length, 3);
    let parts: string[] = [];
    models.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 20 + col * gapX, y = 20 + row * gapY;
      const color = colors[i % colors.length];
      const fields = m.fields.map(f => `  ${f}`).join("\n  ");
      parts.push(`
        <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="6" fill="${color}10" stroke="${color}" stroke-width="1.5"/>
        <rect x="${x}" y="${y}" width="${boxW}" height="22" rx="6" fill="${color}25"/>
        <text x="${x + boxW/2}" y="${y + 15}" text-anchor="middle" fill="${color}" font-weight="bold" font-size="11">${m.name}</text>
        <text x="${x + 8}" y="${y + 38}" fill="#fde68a" font-size="10">🔑 id</text>
        ${m.fields.slice(1).map((f, j) => `<text x="${x + 8}" y="${y + 54 + j * 14}" fill="#cbd5e1" font-size="10">${f}</text>`).join("")}`);
    });
    const svgH = Math.ceil(models.length / cols) * gapY + 20;
    erd = `<svg viewBox="0 0 ${cols * gapX + 20} ${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">${parts.join("")}</svg>`;
    erdExplanation = `ERD showing ${models.length} database entities with their fields and primary keys.`;
  }

  return {
    uml, sequence, erd,
    umlExplanation, sequenceExplanation, erdExplanation,
    hasUml, hasSequence, hasErd,
  };
}