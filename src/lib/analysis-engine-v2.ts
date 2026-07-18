// CodeInsight AI — Analysis Engine v2
import type { AnalysisReport, Issue, ChartPoint } from "./types";
import type { ParsedRepository, ParsedFile } from "./repo-parser";
import { analyzeSecurity } from "./analyzers/security";
import { analyzeBugs } from "./analyzers/bugs";
import { analyzePerformance, getPositiveFindings } from "./analyzers/performance";
import { detectArchitecture, analyzeTechDebt } from "./analyzers/architecture";

export function analyzeParsedRepository(parsed: ParsedRepository, rawFiles?: { path: string; content: string }[]): AnalysisReport {
  // Lấy danh sách file để check lỗi
  const filesForAnalysis = rawFiles || parsed.files.map(f => ({ path: f.path, content: generatePseudoContent(f) }));
  
  // FIX: Chỉ chạy quét Bug, Security trên các file code thực sự. Loại bỏ .md, .json, .csv...
  const validCodeFiles = filesForAnalysis.filter(f => {
    const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
    return !['.md', '.json', '.yml', '.yaml', '.txt', '.csv', '.lock'].includes(ext);
  });

  const securityIssues = analyzeSecurity(validCodeFiles);
  const bugIssues = analyzeBugs(validCodeFiles);
  const perfIssues = analyzePerformance(validCodeFiles);
  const perfPositiveFindings = getPositiveFindings(validCodeFiles);

  const arch = detectArchitecture(parsed.files);
  const techDebt = analyzeTechDebt(parsed.files);

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
  }));

  const activity = genActivity();
  const complexityTrend = genComplexityTrend(parsed.files);
  const maintainabilityTrend = genMaintainabilityTrend();

  const inboundImports = new Set<string>();
  parsed.files.forEach(f => f.imports.forEach(imp => {
    const resolved = parsed.files.find(o => o.path === imp || o.path.endsWith(imp));
    if (resolved) inboundImports.add(resolved.path);
  }));
  const deadCode = parsed.files
    .filter(f => !inboundImports.has(f.path) && !f.path.endsWith("package.json") && !f.path.endsWith("tsconfig.json"))
    .map(f => ({ path: f.path, lines: f.lines, reason: "Tệp này không được import ở bất kỳ đâu trong dự án." }));

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
      let exp = cf.description || `Mô-đun chức năng cho ${cf.path.split('/').pop()}`;

      if (issuesInFile.length > 0) {
        const primaryIssue = issuesInFile.sort((a,b) => (a.severity === "critical" ? -1 : 1))[0];
        exp = `**Phát hiện rủi ro [${primaryIssue.severity.toUpperCase()}]:** ${primaryIssue.title}.\n\n💡 **AI Gợi ý:** ${primaryIssue.recommendation}`;
        
        if (primaryIssue.line && primaryIssue.line > 0 && primaryIssue.line <= lines.length) {
          const lineIdx = primaryIssue.line - 1;
          const start = Math.max(0, lineIdx - 8);
          const end = Math.min(lines.length, lineIdx + 12);
          
          codePreview = lines.slice(start, end).map((l, i) => {
            const currentLine = start + i + 1;
            return currentLine === primaryIssue.line ? `${l} // 🔴 [AI CẢNH BÁO]: ${primaryIssue.title}` : l;
          }).join("\n");
          
          codePreview = `// Trích đoạn quanh dòng số ${primaryIssue.line}\n` + codePreview;
        } else {
          codePreview = lines.slice(0, 30).join("\n");
        }
      } else {
        exp = `**Phân tích Kiến trúc:** Tệp có độ phức tạp cao (Điểm Complexity: ${cf.complexity}). CodeInsight AI khuyến nghị bạn nên áp dụng nguyên tắc S.O.L.I.D để tách nhỏ các hàm tại đây.`;
        codePreview = lines.slice(0, 30).join("\n");
      }

      generatedSnippets.push({
        file: cf.path,
        language: cf.language.toLowerCase() === "typescript" ? "tsx" : cf.language.toLowerCase(),
        title: cf.path.split('/').pop() || "Code Snippet",
        code: codePreview + (lines.length > 30 && !issuesInFile[0]?.line ? "\n\n// ... (đã rút gọn để hiển thị)" : ""),
        explanation: exp
      });
    }
  }

  return {
    repoUrl: parsed.url,
    repoOwner: parsed.owner,
    repoName: parsed.name,
    repoBranch: parsed.branch,
    summary: `Repository quy mô ${parsed.totalFiles} tệp với ${parsed.totalLines.toLocaleString()} dòng mã. Phân tích bởi CodeInsight AI cho thấy điểm sức khỏe đạt ${overall}/100. Đã phát hiện ${securityIssues.length} vấn đề bảo mật, ${bugIssues.length} bugs logic và ${perfIssues.length} điểm nghẽn hiệu năng.`,
    tags: Array.from(new Set([
      ...(parsed.languages[0]?.name ? [parsed.languages[0].name] : []),
      ...(parsed.frameworks[0]?.name ? [parsed.frameworks[0].name] : []),
      arch.pattern.split(" ")[0],
    ].filter(Boolean))),
    scores: { overall, security: securityScore, performance: performanceScore, architecture: architectureScore, maintainability: maintainabilityScore, codeQuality: codeQualityScore },
    scoreBreakdown: [
      { label: "Security", score: securityScore, max: 100, weight: 25 },
      { label: "Performance", score: performanceScore, max: 100, weight: 20 },
      { label: "Architecture", score: architectureScore, max: 100, weight: 20 },
      { label: "Maintainability", score: maintainabilityScore, max: 100, weight: 20 },
      { label: "Code Quality", score: codeQualityScore, max: 100, weight: 15 },
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
    },
    technicalDebt: { score: techDebt.score, items: techDebt.items },
    roadmap: genRoadmap(securityIssues, perfIssues, arch),
    monetization: [
      { title: "SaaS API / Usage-based tier", description: "Cung cấp quyền truy cập API có tính phí dựa trên giới hạn request (Stripe Billing).", potential: "high" },
      { title: "Gói Enterprise / B2B", description: "Bổ sung SSO, Audit logs và hỗ trợ riêng cho tổ chức.", potential: "high" },
      { title: "Sản phẩm mã nguồn mở trả phí", description: "Bán các bản Template Premium hoặc module nâng cao mở rộng.", potential: "medium" },
    ],
    documentation: {
      readme: genReadme(parsed),
      apiDocs: genApiDocs(parsed),
      architectureMd: genArchitectureMd(parsed, arch),
      folderGuide: genFolderGuide(parsed),
      componentGuide: genComponentGuide(parsed),
      deploymentGuide: genDeploymentGuide(parsed),
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

function calcArchitecture(arch: { pattern: string; strengths: string[]; weaknesses: string[] }, parsed: ParsedRepository): number {
  let score = 80;
  score += Math.min(arch.strengths.length * 3, 15);
  score -= Math.min(arch.weaknesses.length * 4, 20);
  if (parsed.dependencies.circular.length > 0) score -= 10;
  if (parsed.frameworks.length > 0) score += 5;
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

function genRoadmap(sec: Issue[], perf: Issue[], arch: any): AnalysisReport["roadmap"] {
  const items: AnalysisReport["roadmap"] = [];
  
  const critSec = sec.filter(i => i.severity === "critical" || i.severity === "high");
  if (critSec.length > 0) {
    items.push({ 
      title: "Giai đoạn 1: Vá lổ hổng bảo mật", 
      description: `Xử lý ${critSec.length} cảnh báo bảo mật nguy hiểm (Hardcoded Secrets, Injection).`, 
      priority: "high", 
      category: "Security" 
    });
  }

  const highPerf = perf.filter(i => i.severity === "high" || i.severity === "medium");
  if (highPerf.length > 0) {
    items.push({ 
      title: "Giai đoạn 2: Tối ưu hiệu năng", 
      description: `Xử lý ${highPerf.length} vấn đề làm chậm ứng dụng (N+1 Query, Re-render).`, 
      priority: "medium", 
      category: "Performance" 
    });
  }

  items.push({ 
    title: "Giai đoạn 3: Giảm Technical Debt", 
    description: "Tái cấu trúc các tệp phức tạp, gộp mã trùng lặp và xóa Dead Code.", 
    priority: "medium", 
    category: "Maintainability" 
  });
  
  return items;
}

function genReadme(parsed: ParsedRepository): string {
  return `# ${parsed.name} 🚀\n\n> **Báo cáo tự động bởi CodeInsight AI.**\n\n${parsed.totalFiles} files · ${parsed.totalLines.toLocaleString()} lines · ${parsed.languages[0]?.name ?? "Unknown"}\n\n## 🛠 Tech Stack\n${parsed.frameworks.map(f=>`- **${f.name}** ${f.version}`).join("\n")||"- None"}`;
}

function genApiDocs(parsed: ParsedRepository): string {
  const routes = parsed.files.flatMap(f => f.routes.map(r => ({ path: r, file: f.path })));
  if (routes.length === 0) return `# API Reference\nKhông tìm thấy API route.\n`;
  return `# API Reference\n\n${routes.map(r=>`### \`${r.path}\`\nĐịnh nghĩa tại: \`${r.file}\``).join("\n\n")}\n`;
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

function genComponentGuide(parsed: ParsedRepository): string {
  return `# Component Guide\n\nDanh sách các UI components đang phân tích...`;
}

function genDeploymentGuide(parsed: ParsedRepository): string {
  return `# Deployment Guide\n\nSử dụng ${parsed.packageManager} để cài đặt và triển khai.`;
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