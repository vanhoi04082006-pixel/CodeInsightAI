// CodeInsight AI — Repository Parser Engine
// Parses repository structure, extracts files, imports, exports, functions,
// classes, dependencies, and builds a dependency graph.

import type { AnalysisReport, FileInsight, DependencyNode, DependencyEdge } from "./types";

export interface ParsedFile {
  path: string;
  language: string;
  size: number;
  lines: number;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  interfaces: string[];
  components: string[];
  routes: string[];
  complexity: number;
  description: string;
}

export interface ParsedRepository {
  owner: string;
  name: string;
  branch: string;
  url: string;
  totalFiles: number;
  totalLines: number;
  languages: { name: string; percentage: number; color: string; files: number; lines: number }[];
  frameworks: { name: string; version: string; category: string; confidence: number }[];
  files: ParsedFile[];
  dependencies: { nodes: DependencyNode[]; edges: DependencyEdge[]; circular: { nodes: string[] }[] };
  packageManager: string;
  configFiles: string[];
  entryPoints: string[];
}

// Language detection by file extension
const EXT_LANGUAGES: Record<string, { name: string; color: string }> = {
  ".ts": { name: "TypeScript", color: "#3178c6" },
  ".tsx": { name: "TypeScript", color: "#3178c6" },
  ".js": { name: "JavaScript", color: "#f1e05a" },
  ".jsx": { name: "JavaScript", color: "#f1e05a" },
  ".py": { name: "Python", color: "#3572A5" },
  ".go": { name: "Go", color: "#00ADD8" },
  ".rs": { name: "Rust", color: "#dea584" },
  ".java": { name: "Java", color: "#b07219" },
  ".cs": { name: "C#", color: "#178600" },
  ".cpp": { name: "C++", color: "#f34b7d" },
  ".c": { name: "C", color: "#555555" },
  ".php": { name: "PHP", color: "#4F5D95" },
  ".vue": { name: "Vue", color: "#41b883" },
  ".svelte": { name: "Svelte", color: "#ff3e00" },
  ".css": { name: "CSS", color: "#563d7c" },
  ".scss": { name: "SCSS", color: "#c6538c" },
  ".html": { name: "HTML", color: "#e34c26" },
  ".json": { name: "JSON", color: "#292929" },
  ".yml": { name: "YAML", color: "#cb171e" },
  ".yaml": { name: "YAML", color: "#cb171e" },
  ".md": { name: "Markdown", color: "#083fa1" },
  ".sh": { name: "Shell", color: "#89e051" },
  ".sql": { name: "SQL", color: "#e38c00" },
  ".rb": { name: "Ruby", color: "#701516" },
  ".swift": { name: "Swift", color: "#F05138" },
  ".kt": { name: "Kotlin", color: "#A97BFF" },
};

// Framework detection patterns
const FRAMEWORK_PATTERNS: { name: string; version: string; category: string; files: string[]; deps: string[] }[] = [
  { name: "Next.js", version: "16.x", category: "Framework", files: ["next.config"], deps: ["next"] },
  { name: "React", version: "19.0", category: "UI Library", files: [], deps: ["react", "react-dom"] },
  { name: "Vue", version: "3.x", category: "UI Library", files: ["vue.config"], deps: ["vue"] },
  { name: "Angular", version: "17.x", category: "Framework", files: ["angular.json"], deps: ["@angular/core"] },
  { name: "Svelte", version: "5.x", category: "UI Library", files: ["svelte.config"], deps: ["svelte"] },
  { name: "Express", version: "4.x", category: "Backend", files: [], deps: ["express"] },
  { name: "NestJS", version: "10.x", category: "Backend", files: ["nest-cli.json"], deps: ["@nestjs/core"] },
  { name: "Fastify", version: "4.x", category: "Backend", files: [], deps: ["fastify"] },
  { name: "Django", version: "5.x", category: "Backend", files: ["manage.py"], deps: ["django"] },
  { name: "Flask", version: "3.x", category: "Backend", files: [], deps: ["flask"] },
  { name: "FastAPI", version: "0.x", category: "Backend", files: [], deps: ["fastapi"] },
  { name: "Prisma", version: "6.x", category: "ORM", files: ["prisma/schema.prisma"], deps: ["@prisma/client", "prisma"] },
  { name: "Drizzle", version: "0.x", category: "ORM", files: ["drizzle.config"], deps: ["drizzle-orm"] },
  { name: "Tailwind CSS", version: "4.x", category: "Styling", files: ["tailwind.config"], deps: ["tailwindcss"] },
  { name: "shadcn/ui", version: "latest", category: "UI Components", files: ["components.json"], deps: [] },
  { name: "Zustand", version: "5.x", category: "State", files: [], deps: ["zustand"] },
  { name: "TanStack Query", version: "5.x", category: "State", files: [], deps: ["@tanstack/react-query"] },
  { name: "tRPC", version: "11.x", category: "API", files: [], deps: ["@trpc/server", "@trpc/client"] },
  { name: "GraphQL", version: "16.x", category: "API", files: [], deps: ["graphql"] },
  { name: "Three.js", version: "0.x", category: "3D", files: [], deps: ["three"] },
  { name: "Framer Motion", version: "12.x", category: "Animation", files: [], deps: ["framer-motion"] },
];

// Directories to ignore
const IGNORE_DIRS = ["node_modules", "dist", "build", "coverage", "vendor", ".cache", ".git", ".next", ".turbo", ".vercel", "__pycache__", ".pytest_cache", "target", "bin", "obj"];

// Parse import statements from source code
export function parseImports(source: string, language: string): string[] {
  const imports: string[] = [];
  // ES6/TypeScript imports: import X from 'Y'
  const es6Match = source.matchAll(/import\s+(?:[\w*{}\s,]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g);
  for (const m of es6Match) imports.push(m[1]);
  // CommonJS: require('Y')
  const cjsMatch = source.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  for (const m of cjsMatch) imports.push(m[1]);
  // Python: import X, from X import Y
  if (language === "Python") {
    const pyImport = source.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm);
    for (const m of pyImport) imports.push(m[1]);
  }
  // Go: import "X" or import ( ... "X" ... )
  if (language === "Go") {
    const goImport = source.matchAll(/import\s*(?:\(\s*)?["`]([^"`]+)["`]/g);
    for (const m of goImport) imports.push(m[1]);
  }
  // Rust: use X
  if (language === "Rust") {
    const rustUse = source.matchAll(/^use\s+([\w:]+)/gm);
    for (const m of rustUse) imports.push(m[1]);
  }
  return [...new Set(imports)];
}

// Parse exports from source code
export function parseExports(source: string): string[] {
  const exports: string[] = [];
  // ES6 exports
  const exportMatch = source.matchAll(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g);
  for (const m of exportMatch) exports.push(m[1]);
  // CommonJS
  const moduleExports = source.matchAll(/module\.exports\s*=\s*(\w+)/g);
  for (const m of moduleExports) exports.push(m[1]);
  return [...new Set(exports)];
}

// Parse function names
export function parseFunctions(source: string, language: string): string[] {
  const funcs: string[] = [];
  // JS/TS: function X, const X = (), X: () =>, async function X
  const jsFunc = source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const m of jsFunc) funcs.push(m[1]);
  const arrowFunc = source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
  for (const m of arrowFunc) funcs.push(m[1]);
  const methodFunc = source.matchAll(/(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g);
  for (const m of methodFunc) if (!["if", "for", "while", "switch", "catch", "else", "return"].includes(m[1])) funcs.push(m[1]);
  // Python: def X
  if (language === "Python") {
    const pyFunc = source.matchAll(/^\s*def\s+(\w+)/gm);
    for (const m of pyFunc) funcs.push(m[1]);
  }
  // Go: func X
  if (language === "Go") {
    const goFunc = source.matchAll(/func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/g);
    for (const m of goFunc) funcs.push(m[1]);
  }
  return [...new Set(funcs)].slice(0, 30); // limit
}

// Parse class names
export function parseClasses(source: string, language: string): string[] {
  const classes: string[] = [];
  const classMatch = source.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g);
  for (const m of classMatch) classes.push(m[1]);
  if (language === "Python") {
    const pyClass = source.matchAll(/^\s*class\s+(\w+)/gm);
    for (const m of pyClass) classes.push(m[1]);
  }
  return [...new Set(classes)];
}

// Parse interfaces and types
export function parseInterfaces(source: string): { interfaces: string[]; types: string[] } {
  const interfaces: string[] = [];
  const types: string[] = [];
  const intMatch = source.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
  for (const m of intMatch) interfaces.push(m[1]);
  const typeMatch = source.matchAll(/(?:export\s+)?type\s+(\w+)\s*=/g);
  for (const m of typeMatch) types.push(m[1]);
  return { interfaces: [...new Set(interfaces)], types: [...new Set(types)] };
}

// Parse React components (functions returning JSX)
export function parseComponents(source: string): string[] {
  const components: string[] = [];
  // Function components: function MyComponent(
  const funcComp = source.matchAll(/function\s+([A-Z]\w*)\s*\(/g);
  for (const m of funcComp) components.push(m[1]);
  // Arrow const MyComponent = (
  const arrowComp = source.matchAll(/(?:const|export)\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)\s*=>|function)/g);
  for (const m of arrowComp) components.push(m[1]);
  return [...new Set(components)];
}

// Parse route definitions
export function parseRoutes(source: string): string[] {
  const routes: string[] = [];
  // Next.js app router: file paths like page.tsx, route.ts, layout.tsx
  // Express: app.get('/path'), router.post('/path')
  const expressRoute = source.matchAll(/(?:app|router)\.(?:get|post|put|delete|patch|use)\s*\(\s*['"`]([^'"`]+)['"`]/g);
  for (const m of expressRoute) routes.push(m[1]);
  // tRPC: .query/.mutation
  const trpcRoute = source.matchAll(/\.query\s*\(\s*['"`]([^'"`]+)['"`]/g);
  for (const m of trpcRoute) routes.push(m[1]);
  return [...new Set(routes)];
}

// Calculate simple cyclomatic complexity
export function calculateComplexity(source: string): number {
  let complexity = 1;
  const patterns = [
    /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g,
    /\bcase\s+/g, /\bcatch\s*\(/g, /\?\s*[^:]+:/g, // ternary
    /\b&&\b/g, /\b\|\|\b/g,
  ];
  for (const p of patterns) {
    const matches = source.match(p);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

// Generate file description based on path and content
export function describeFile(path: string, language: string, functions: string[], classes: string[]): string {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts[parts.length - 2] : "root";

  if (fileName === "page.tsx" || fileName === "page.jsx") return `Route page component for the ${dir} route.`;
  if (fileName === "layout.tsx" || fileName === "layout.jsx") return `Layout component wrapping the ${dir} route section.`;
  if (fileName === "route.ts" || fileName === "route.js") return `API route handler for ${dir}.`;
  if (fileName === "middleware.ts") return "Next.js middleware — runs before route completion, handles auth/redirects.";
  if (fileName === "schema.prisma") return "Prisma ORM schema — defines database models and relations.";
  if (fileName === "package.json") return "Project manifest — dependencies, scripts, and metadata.";
  if (fileName.endsWith(".env") || fileName.startsWith(".env")) return "Environment variables configuration.";
  if (fileName === "tsconfig.json") return "TypeScript compiler configuration.";
  if (fileName === "tailwind.config.ts" || fileName === "tailwind.config.js") return "Tailwind CSS configuration.";
  if (dir === "components" || dir === "ui") return `UI component: ${fileName}.`;
  if (dir === "lib" || dir === "utils") return `Utility module: ${fileName}.`;
  if (dir === "hooks") return `Custom React hook: ${fileName}.`;
  if (dir === "services" || dir === "api") return `Service/API module: ${fileName}.`;
  if (dir === "store") return `State management store: ${fileName}.`;
  if (dir === "server" || dir === "backend") return `Server-side logic: ${fileName}.`;
  if (dir === "models") return `Data model: ${fileName}.`;
  if (dir === "config") return `Configuration file: ${fileName}.`;

  if (classes.length > 0) return `Defines ${classes.join(", ")}.`;
  if (functions.length > 0) return `Exports ${functions.slice(0, 3).join(", ")}${functions.length > 3 ? "..." : ""}.`;
  return `${language} module in ${dir}/.`;
}

// Detect frameworks from file list and package.json
export function detectFrameworks(files: ParsedFile[], packageJsonContent?: string): { name: string; version: string; category: string; confidence: number }[] {
  const detected: { name: string; version: string; category: string; confidence: number }[] = [];
  const filePaths = files.map((f) => f.path.toLowerCase());

  for (const fw of FRAMEWORK_PATTERNS) {
    let found = false;
    // Check config files
    for (const cf of fw.files) {
      if (filePaths.some((p) => p.includes(cf.toLowerCase()))) {
        detected.push({ name: fw.name, version: fw.version, category: fw.category, confidence: 100 });
        found = true;
        break;
      }
    }
    if (found) continue;
    // Check dependencies in package.json
    if (packageJsonContent) {
      for (const dep of fw.deps) {
        if (packageJsonContent.includes(`"${dep}"`)) {
          detected.push({ name: fw.name, version: fw.version, category: fw.category, confidence: 90 });
          found = true;
          break;
        }
      }
    }
    // Check imports
    if (!found) {
      for (const f of files) {
        if (f.imports.some((imp) => fw.deps.some((d) => imp.includes(d)))) {
          detected.push({ name: fw.name, version: fw.version, category: fw.category, confidence: 75 });
          found = true;
          break;
        }
      }
    }
  }
  return detected;
}

// Detect package manager
export function detectPackageManager(files: ParsedFile[]): string {
  const paths = files.map((f) => f.path);
  if (paths.includes("bun.lock") || paths.includes("bun.lockb")) return "bun";
  if (paths.includes("pnpm-lock.yaml")) return "pnpm";
  if (paths.includes("yarn.lock")) return "yarn";
  if (paths.includes("package-lock.json")) return "npm";
  if (paths.includes("requirements.txt") || paths.includes("Pipfile")) return "pip";
  if (paths.includes("go.mod")) return "go mod";
  if (paths.includes("Cargo.toml")) return "cargo";
  return "unknown";
}

// Build dependency graph from parsed files
export function buildDependencyGraph(files: ParsedFile[]): { nodes: DependencyNode[]; edges: DependencyEdge[]; circular: { nodes: string[] }[] } {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const nodeMap = new Map<string, number>();

  // CHỈ lấy các file code thực sự để vẽ đồ thị, loại bỏ .md, .json, .lock để đỡ rác
  const codeFiles = files.filter(f => {
    const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
    return !['.md', '.txt', '.json', '.lock', '.csv', '.yml', '.yaml'].includes(ext);
  });

  // Create nodes using Golden Spiral distribution for better layout
  const golden_ratio = (Math.sqrt(5) + 1) / 2 - 1;
  const golden_angle = golden_ratio * 2 * Math.PI;

  codeFiles.forEach((f, i) => {
    const parts = f.path.split("/");
    const label = parts[parts.length - 1];
    
    const type: DependencyNode["type"] =
      f.routes.length > 0 ? "entry" :
      f.components.length > 0 ? "component" :
      f.functions.length > 5 ? "service" :
      f.functions.length > 0 ? "core" :
      f.path.includes("config") ? "config" : "util";

    const group = Math.min(i % 4 + 1, 4);
    
    // Thuật toán Golden Spiral (toạ độ x, y rải đều từ tâm ra ngoài, không bị đè)
    const ratio = i / codeFiles.length;
    const angle = i * golden_angle;
    // Bán kính từ 10 đến 45 (để không bị tràn ra ngoài viền viewBox 100x100)
    const radius = 10 + Math.sqrt(ratio) * 35; 

    nodes.push({
      id: f.path,
      label,
      type,
      group,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      size: 10 + Math.min(f.lines / 50, 15),
    });
    nodeMap.set(f.path, nodes.length - 1);
  });

  // Create edges from imports
  codeFiles.forEach((f) => {
    for (const imp of f.imports) {
      const resolved = codeFiles.find(
        (other) =>
          other.path === imp ||
          other.path.endsWith(imp) ||
          other.path.endsWith(imp + ".ts") ||
          other.path.endsWith(imp + ".tsx") ||
          other.path.endsWith(imp + ".js") ||
          other.path.endsWith(imp + ".jsx") ||
          other.path.endsWith(imp + "/index.ts") ||
          other.path.endsWith(imp + "/index.tsx")
      );
      if (resolved && resolved.path !== f.path) {
        const exists = edges.some((e) => e.from === f.path && e.to === resolved.path);
        if (!exists) {
          edges.push({ from: f.path, to: resolved.path, weight: 2 });
        }
      }
    }
  });

  // Detect circular dependencies
  const circular: { nodes: string[] }[] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].from === edges[j].to && edges[i].to === edges[j].from) {
        circular.push({ nodes: [edges[i].from, edges[i].to] });
        edges[i].circular = true;
        edges[j].circular = true;
      }
    }
  }

  return { nodes, edges, circular };
}

// Main parse function — takes file list and returns structured repository data
export function parseRepository(
  repoUrl: string,
  owner: string,
  name: string,
  branch: string,
  fileContents: { path: string; content: string }[]
): ParsedRepository {
  const parsedFiles: ParsedFile[] = [];
  let packageJsonContent: string | undefined;

  for (const { path, content } of fileContents) {
    // Skip ignored directories
    if (IGNORE_DIRS.some((d) => path.includes(`${d}/`))) continue;

    const ext = path.substring(path.lastIndexOf("."));
    const langInfo = EXT_LANGUAGES[ext] ?? { name: "Other", color: "#cccccc" };
    const lines = content.split("\n").length;

    if (path === "package.json") packageJsonContent = content;

    const imports = parseImports(content, langInfo.name);
    const exports = parseExports(content);
    const functions = parseFunctions(content, langInfo.name);
    const classes = parseClasses(content, langInfo.name);
    const { interfaces } = parseInterfaces(content);
    const components = parseComponents(content);
    const routes = parseRoutes(content);
    const complexity = calculateComplexity(content);
    const description = describeFile(path, langInfo.name, functions, classes);

    parsedFiles.push({
      path, language: langInfo.name, size: content.length, lines,
      imports, exports, functions, classes, interfaces, components, routes,
      complexity, description,
    });
  }

  // Aggregate languages
  const langMap = new Map<string, { name: string; color: string; files: number; lines: number }>();
  for (const f of parsedFiles) {
    const ext = ext2(f.path);
    const existing = langMap.get(f.language) ?? { name: f.language, color: EXT_LANGUAGES[ext]?.color ?? "#ccc", files: 0, lines: 0 };
    existing.files++;
    existing.lines += f.lines;
    langMap.set(f.language, existing);
  }
  const totalLines = parsedFiles.reduce((s, f) => s + f.lines, 0);
  const languages = Array.from(langMap.values())
    .map((l) => ({ ...l, percentage: Math.round((l.lines / totalLines) * 1000) / 10 }))
    .sort((a, b) => b.percentage - a.percentage);

  // Detect frameworks
  const frameworks = detectFrameworks(parsedFiles, packageJsonContent);
  const packageManager = detectPackageManager(parsedFiles);

  // Find entry points
  const entryPoints = parsedFiles
    .filter((f) => f.path.endsWith("index.ts") || f.path.endsWith("index.tsx") || f.path.endsWith("main.ts") || f.path.endsWith("app.tsx") || f.path === "package.json")
    .map((f) => f.path);

  // Build dependency graph
  const dependencies = buildDependencyGraph(parsedFiles);

  // Config files
  const configFiles = parsedFiles
    .filter((f) => f.path.endsWith(".json") || f.path.endsWith(".yml") || f.path.endsWith(".yaml") || f.path.endsWith(".env") || f.path.includes("config"))
    .map((f) => f.path);

  return {
    owner, name, branch, url: repoUrl,
    totalFiles: parsedFiles.length,
    totalLines,
    languages,
    frameworks,
    files: parsedFiles,
    dependencies,
    packageManager,
    configFiles,
    entryPoints,
  };
}

function ext2(path: string): string {
  return path.substring(path.lastIndexOf("."));
}

// Convert ParsedRepository to AnalysisReport format (for UI compatibility)
export function parsedToReport(parsed: ParsedRepository): Partial<AnalysisReport> {
  return {
    repoUrl: parsed.url,
    repoOwner: parsed.owner,
    repoName: parsed.name,
    repoBranch: parsed.branch,
    summary: `Repository contains ${parsed.totalFiles} files across ${parsed.languages.length} languages. Primary language: ${parsed.languages[0]?.name ?? "Unknown"}. Frameworks detected: ${parsed.frameworks.map((f) => f.name).join(", ") || "none"}. Package manager: ${parsed.packageManager}.`,
    primaryLanguage: parsed.languages[0]?.name ?? "Unknown",
    totalFiles: parsed.totalFiles,
    totalLines: parsed.totalLines,
    languages: parsed.languages,
    frameworks: parsed.frameworks.map((f) => ({ ...f, confidence: f.confidence })),
    dependencies: parsed.dependencies,
  };
}