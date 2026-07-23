// CodeInsight AI — Architecture Detector + Tech Debt Analyzer
// Deep analysis: coupling, cohesion, layer violations, directory-level circular deps,
// instability/abstractness metrics (Robert C. Martin's Distance from Main Sequence),
// god modules, fan-in/fan-out, real strengths/weaknesses.
import type { ParsedFile } from "../repo-parser";
import type { Issue } from "../types";

export interface ArchitectureMetrics {
  avgCoupling: number;
  avgCohesion: number;
  instability: number;        // 0 (stable) → 1 (unstable), per top-level dir average
  abstractness: number;       // 0 (concrete) → 1 (abstract)
  distanceFromMain: number;   // |A + I - 1|, 0 = optimal, 1 = worst
  fanInAvg: number;
  fanOutAvg: number;
  layerViolations: string[];
  godModules: string[];
  dirCircularDeps: string[];
  fileCircularDeps: number;
}

export interface ArchitectureResult {
  pattern: string;
  description: string;
  layers: { name: string; responsibility: string; files: number }[];
  strengths: string[];
  weaknesses: string[];
  metrics: ArchitectureMetrics;
}

export function detectArchitecture(files: ParsedFile[]): ArchitectureResult {
  const dirs = new Set<string>();
  files.forEach(f => { const parts = f.path.split("/"); if (parts.length > 1) dirs.add(parts[0]); });

  // ── Compute real metrics from import graph ──
  const metrics = computeMetrics(files);
  const { layerViolations, godModules, dirCircularDeps, fileCircularDeps, avgCoupling, avgCohesion, instability, abstractness, distanceFromMain, fanInAvg, fanOutAvg } = metrics;

  // Build dynamic strengths/weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Coupling analysis (fan-out)
  if (avgCoupling < 3) strengths.push(`Low average coupling (${avgCoupling.toFixed(1)} imports/file) — modules are well-separated`);
  else if (avgCoupling > 8) weaknesses.push(`High average coupling (${avgCoupling.toFixed(1)} imports/file) — modules depend on too many others`);

  // Fan-in analysis (how many depend on me)
  if (fanInAvg > 5 && fanOutAvg < 3) strengths.push(`Good fan-in/fan-out ratio — modules are reused without being overly dependent`);

  // Cohesion analysis
  if (avgCohesion > 0.5) strengths.push(`Good internal cohesion (${(avgCohesion * 100).toFixed(0)}%) — modules group related functionality`);
  else if (avgCohesion < 0.2 && files.length > 10) weaknesses.push(`Low cohesion (${(avgCohesion * 100).toFixed(0)}%) — files within the same directory don't import each other much`);

  // Instability (Robert C. Martin): I = Ce / (Ca + Ce)
  if (instability < 0.3 && files.length > 10) strengths.push(`Stable dependency direction — most modules depend inward toward stable cores (I=${instability.toFixed(2)})`);
  else if (instability > 0.7 && files.length > 10) weaknesses.push(`High instability (I=${instability.toFixed(2)}) — too many modules depend on volatile/concrete layers`);

  // Abstractness
  if (abstractness > 0.3 && files.length > 10) strengths.push(`Good abstraction layering (${(abstractness * 100).toFixed(0)}% abstract modules) — interfaces/types decouple consumers`);

  // Distance from Main Sequence |A + I - 1|
  if (distanceFromMain < 0.2 && files.length > 10) strengths.push(`Close to the Main Sequence (D=${distanceFromMain.toFixed(2)}) — architecture follows stable dependencies principle`);
  else if (distanceFromMain > 0.5 && files.length > 10) weaknesses.push(`Far from the Main Sequence (D=${distanceFromMain.toFixed(2)}) — some modules are both concrete AND unstable (pain zone) or abstract AND stable (useless zone)`);

  // Layer violations
  if (layerViolations.length > 0) {
    weaknesses.push(`${layerViolations.length} layer violation(s): component files importing DB/infrastructure directly (bypassing service layer)`);
    layerViolations.slice(0, 3).forEach(v => weaknesses.push(`  → ${v}`));
  } else if (files.length > 5) {
    strengths.push(`No layer violations detected — dependency direction is clean`);
  }

  // God modules
  if (godModules.length > 0) {
    weaknesses.push(`${godModules.length} god module(s) with >20 functions: ${godModules.slice(0, 3).join(", ")}`);
  }

  // File-level circular deps (A→B→A)
  if (fileCircularDeps > 0) {
    weaknesses.push(`${fileCircularDeps} direct circular dependency pair(s) detected — these create tight coupling`);
  } else if (files.length > 5) {
    strengths.push(`No direct circular dependencies — file-level import graph is acyclic`);
  }

  // Directory-level circular deps (A/→B/→A/)
  if (dirCircularDeps.length > 0) {
    weaknesses.push(`${dirCircularDeps.length} directory-level circular dependency chain(s):`);
    dirCircularDeps.slice(0, 4).forEach(c => weaknesses.push(`  → ${c}`));
  }

  // Test files
  const hasTests = files.some(f => f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("__tests__"));
  if (hasTests) strengths.push(`Test files detected alongside source — good testing discipline`);
  else weaknesses.push(`No test files detected — reliability risk`);

  // TypeScript usage
  const tsFiles = files.filter(f => f.path.endsWith(".ts") || f.path.endsWith(".tsx")).length;
  if (tsFiles > files.length * 0.5) strengths.push(`Strong TypeScript adoption (${tsFiles}/${files.length} files)`);

  // Config files present (linting, formatting)
  const hasLinting = files.some(f => /(\.eslintrc|eslint\.config|biome\.json|prettier)/.test(f.path));
  if (hasLinting) strengths.push(`Linting/formatting config detected — enforces consistent code style`);

  // CI/CD config
  const hasCI = files.some(f => f.path.includes(".github/workflows") || f.path.includes(".gitlab-ci") || f.path.includes("Jenkinsfile"));
  if (hasCI) strengths.push(`CI/CD pipeline configured — automated builds and tests`);

  // ── Pattern detection ──
  // Feature-based: src/features/*/...
  if (dirs.has("features") || files.some(f => f.path.includes("features/")))
    return archResult("Feature-based Architecture",
      "Code is organized by feature/domain rather than technical role. Each feature directory contains its own components, services, and types.",
      [l("Features", "Self-contained feature modules", countIn(files,"features"))],
      strengths, weaknesses, metrics);

  // Clean Architecture: domain/use-cases/infrastructure
  if (dirs.has("domain")||dirs.has("use-cases")||dirs.has("entities"))
    return archResult("Clean Architecture",
      "Layers are separated by dependency direction — domain is independent of infrastructure.",
      [l("Domain","Business entities & rules",countIn(files,"domain")),l("Use Cases","Application logic",countIn(files,"use-cases")),l("Infrastructure","DB, APIs, external services",countIn(files,"infrastructure"))],
      strengths, weaknesses, metrics);

  // MVC
  if (dirs.has("controllers")&&dirs.has("models")&&dirs.has("views"))
    return archResult("MVC (Model-View-Controller)",
      "Classic separation: Models for data, Views for presentation, Controllers for routing.",
      [l("Models","Data models & schemas",countIn(files,"models")),l("Views","UI templates",countIn(files,"views")),l("Controllers","Request handlers",countIn(files,"controllers"))],
      strengths, weaknesses, metrics);

  // Layered
  if (dirs.has("presentation")||dirs.has("application")||dirs.has("infrastructure"))
    return archResult("Layered Architecture",
      "Horizontal layers: presentation → application → domain → infrastructure.",
      [l("Presentation","Components & routes",countIn(files,"presentation")),l("Application","Services & hooks",countIn(files,"application")),l("Infrastructure","DB, APIs",countIn(files,"infrastructure"))],
      strengths, weaknesses, metrics);

  // Next.js App Router (default)
  if (files.some(f => f.path.startsWith("app/")||f.path.startsWith("src/app/")))
    return archResult("Next.js App Router (Feature-based Modular)",
      "Uses Next.js App Router conventions. Routes are file-system based. Layouts and pages compose the UI tree.",
      [l("App","Routes, layouts, pages",countIn(files,"app")),l("Components","Reusable UI",countIn(files,"components")),l("Lib","Shared utilities",countIn(files,"lib")),l("API","Backend routes",countIn(files,"api"))],
      strengths, weaknesses, metrics);

  // Monolith fallback
  return archResult("Modular Monolith",
    "Single-deployment application with module-based organization.",
    [l("Root","Mixed concerns",files.length)],
    strengths, weaknesses, metrics);
}

/**
 * Compute deep architecture metrics from the import graph.
 * Implements Robert C. Martin's component metrics:
 *   - Ca (Afferent Coupling): how many depend on me
 *   - Ce (Efferent Coupling): how many I depend on
 *   - I (Instability) = Ce / (Ca + Ce)
 *   - A (Abstractness) = Na / Nc (abstract modules / total modules)
 *   - D (Distance from Main Sequence) = |A + I - 1|
 */
function computeMetrics(files: ParsedFile[]): ArchitectureMetrics {
  let totalCoupling = 0;       // total imports across all files
  let intraCount = 0;          // intra-directory imports
  let totalCount = 0;          // total resolved imports
  const layerViolations: string[] = [];
  const godModules: string[] = [];

  const fileMap = new Map(files.map(f => [f.path, f]));

  // Build resolved import edges (file → file)
  const edges: { from: string; to: string; fromDir: string; toDir: string }[] = [];

  // Helper: get top-level directory of a file path
  const topDir = (path: string): string => {
    const parts = path.split("/");
    if (parts.length <= 1) return "(root)";
    // For src/xxx, use the second segment as the "logical" dir
    if (parts[0] === "src" && parts.length > 2) return parts[1];
    return parts[0];
  };

  // Helper: resolve an import string to a file path
  const resolveImport = (fromFile: ParsedFile, imp: string): string | null => {
    if (!imp) return null;
    // Skip bare module imports (node_modules)
    if (!imp.startsWith(".") && !imp.startsWith("/") && !imp.startsWith("@/") && !imp.startsWith("~")) return null;

    // Normalize alias
    let normalized = imp;
    if (normalized.startsWith("@/")) normalized = normalized.slice(2);
    else if (normalized.startsWith("~/")) normalized = normalized.slice(2);
    else if (normalized.startsWith("./")) normalized = normalized.slice(2);
    else if (normalized.startsWith("../")) {
      // resolve relative
      const fromParts = fromFile.path.split("/").slice(0, -1);
      const rel = normalized.split("/");
      for (const seg of rel) {
        if (seg === "..") fromParts.pop();
        else if (seg !== ".") fromParts.push(seg);
      }
      normalized = fromParts.join("/");
    }

    // Try exact match + extensions
    const candidates = [
      normalized,
      normalized + ".ts",
      normalized + ".tsx",
      normalized + ".js",
      normalized + ".jsx",
      normalized + "/index.ts",
      normalized + "/index.tsx",
      normalized + "/index.js",
    ];
    for (const c of candidates) {
      if (fileMap.has(c)) return c;
    }
    // Fuzzy: file ends with this path
    const fuzzy = files.find(f => f.path.endsWith(normalized) || f.path.endsWith(normalized + ".ts") || f.path.endsWith(normalized + ".tsx"));
    return fuzzy?.path ?? null;
  };

  for (const f of files) {
    totalCoupling += f.imports.length;

    const fDir = f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : "root";

    for (const imp of f.imports) {
      const resolvedPath = resolveImport(f, imp);
      if (!resolvedPath) {
        totalCount += f.imports.length; // count unresolved too for cohesion ratio
        continue;
      }
      const resolved = fileMap.get(resolvedPath);
      if (!resolved) continue;

      totalCount++;

      const rDir = resolved.path.includes("/") ? resolved.path.substring(0, resolved.path.lastIndexOf("/")) : "root";
      if (rDir === fDir || rDir.startsWith(fDir + "/") || fDir.startsWith(rDir + "/")) {
        intraCount++;
      }

      edges.push({ from: f.path, to: resolvedPath, fromDir: topDir(f.path), toDir: topDir(resolvedPath) });

      // Layer violation: component/app file importing DB/infrastructure directly
      const isComponent = f.path.includes("components/") || f.path.includes("app/") || f.components.length > 0;
      const isInfrastructure =
        resolved.path.includes("lib/db") ||
        resolved.path.includes("lib/prisma") ||
        resolved.path.includes("infrastructure/") ||
        resolved.path.includes("/db/") ||
        resolved.path.includes("/prisma/") ||
        resolved.imports.some(i => i.includes("prisma") || i.includes("mongoose") || i.includes("typeorm") || i.includes("sequelize") || i.includes("knex"));
      if (isComponent && isInfrastructure) {
        layerViolations.push(`${f.path} → ${resolvedPath} (component importing DB layer)`);
      }
    }

    // God module detection
    if (f.functions.length > 20) {
      godModules.push(f.path);
    }
  }

  const avgCoupling = files.length > 0 ? totalCoupling / files.length : 0;
  const avgCohesion = totalCount > 0 ? intraCount / totalCount : 0;

  // ── File-level circular deps (A→B→A) ──
  let fileCircularDeps = 0;
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i], b = files[j];
      const aImportsB = edges.some(e => e.from === a.path && e.to === b.path);
      const bImportsA = edges.some(e => e.from === b.path && e.to === a.path);
      if (aImportsB && bImportsA) fileCircularDeps++;
    }
  }

  // ── Directory-level circular deps (dirA → dirB → dirA, or longer chains) ──
  // Build directory adjacency from edges (cross-directory only)
  const dirEdges = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.fromDir === e.toDir) continue; // skip intra-dir
    if (!dirEdges.has(e.fromDir)) dirEdges.set(e.fromDir, new Set());
    dirEdges.get(e.fromDir)!.add(e.toDir);
  }

  // DFS to find cycles of length ≥ 2 between directories
  const dirCircularDeps: string[] = [];
  const allDirs = Array.from(new Set(edges.flatMap(e => [e.fromDir, e.toDir])));
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const findCycles = (start: string, current: string, path: string[]): void => {
    if (path.length > 6) return; // limit depth to avoid explosion
    recStack.add(current);
    path.push(current);
    const neighbors = dirEdges.get(current);
    if (neighbors) {
      for (const next of neighbors) {
        if (next === start && path.length >= 2) {
          // Found a cycle
          dirCircularDeps.push(path.join(" → ") + ` → ${start}`);
        } else if (!recStack.has(next) && !visited.has(next)) {
          findCycles(start, next, path);
        }
      }
    }
    path.pop();
    recStack.delete(current);
  };

  for (const dir of allDirs) {
    visited.clear();
    recStack.clear();
    findCycles(dir, dir, []);
  }
  // Deduplicate cycles (same cycle may be found from different start points)
  const uniqueCycles = new Set<string>();
  const dedupedDirCycles: string[] = [];
  for (const c of dirCircularDeps) {
    // Normalize: extract the set of dirs involved
    const dirsInCycle = c.split(" → ").filter(Boolean).sort().join("|");
    if (!uniqueCycles.has(dirsInCycle)) {
      uniqueCycles.add(dirsInCycle);
      dedupedDirCycles.push(c);
    }
  }

  // ── Instability (I = Ce / (Ca + Ce)) per top-level directory ──
  // Ca (Afferent) = how many other dirs depend on me
  // Ce (Efferent) = how many other dirs I depend on
  const dirCa = new Map<string, number>();
  const dirCe = new Map<string, number>();
  for (const e of edges) {
    if (e.fromDir === e.toDir) continue;
    dirCe.set(e.fromDir, (dirCe.get(e.fromDir) || 0) + 1);
    dirCa.set(e.toDir, (dirCa.get(e.toDir) || 0) + 1);
  }
  let instabilitySum = 0;
  let instabilityCount = 0;
  for (const dir of allDirs) {
    const ce = dirCe.get(dir) || 0;
    const ca = dirCa.get(dir) || 0;
    if (ce + ca > 0) {
      instabilitySum += ce / (ce + ca);
      instabilityCount++;
    }
  }
  const instability = instabilityCount > 0 ? instabilitySum / instabilityCount : 0;

  // ── Abstractness (A = abstract modules / total modules) ──
  // A module is "abstract" if it only exports types/interfaces (no runtime code)
  let abstractCount = 0;
  let concreteCount = 0;
  for (const f of files) {
    const isTypeOnly =
      f.functions.length === 0 &&
      f.classes.length === 0 &&
      f.components.length === 0 &&
      (f.exports.length > 0 || f.interfaces.length > 0);
    if (isTypeOnly) abstractCount++;
    else concreteCount++;
  }
  const totalMods = abstractCount + concreteCount;
  const abstractness = totalMods > 0 ? abstractCount / totalMods : 0;

  // Distance from Main Sequence: D = |A + I - 1|
  const distanceFromMain = Math.abs(abstractness + instability - 1);

  // ── Fan-in / Fan-out averages ──
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of edges) {
    fanOut.set(e.from, (fanOut.get(e.from) || 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1);
  }
  const fanInAvg = files.length > 0 ? Array.from(fanIn.values()).reduce((a, b) => a + b, 0) / files.length : 0;
  const fanOutAvg = files.length > 0 ? Array.from(fanOut.values()).reduce((a, b) => a + b, 0) / files.length : 0;

  return {
    avgCoupling,
    avgCohesion,
    instability,
    abstractness,
    distanceFromMain,
    fanInAvg,
    fanOutAvg,
    layerViolations,
    godModules,
    dirCircularDeps: dedupedDirCycles.slice(0, 8),
    fileCircularDeps,
  };
}

export function analyzeTechDebt(files: ParsedFile[]): { score: number; items: { title: string; impact: string; estimate: string }[] } {
  const items: { title: string; impact: string; estimate: string }[] = [];
  let debtScore = 0;

  for (const f of files) {
    if (f.complexity > 15) { items.push({ title: `High complexity in ${f.path} (Cx=${f.complexity})`, impact: "Maintainability", estimate: "1 day" }); debtScore += 10; }
    if (f.lines > 300) { items.push({ title: `Large file: ${f.path} (${f.lines} lines)`, impact: "Readability", estimate: "2 days" }); debtScore += 8; }
    if (f.functions.length > 20) { items.push({ title: `God module: ${f.path} (${f.functions.length} functions)`, impact: "Cohesion", estimate: "3 days" }); debtScore += 12; }
    if (f.imports.length > 15) { items.push({ title: `High coupling: ${f.path} (${f.imports.length} imports)`, impact: "Coupling", estimate: "1 day" }); debtScore += 6; }
    if (f.complexity > 25) { items.push({ title: `Deep nesting in ${f.path}`, impact: "Readability", estimate: "1 day" }); debtScore += 5; }
  }

  // Duplicated function names
  const funcNames = new Map<string, string[]>();
  for (const f of files) { for (const fn of f.functions) { const arr = funcNames.get(fn) || []; arr.push(f.path); funcNames.set(fn, arr); } }
  for (const [fn, paths] of funcNames) {
    if (paths.length > 2 && !["map","filter","forEach","render","toString","valueOf","constructor","init","main"].includes(fn)) {
      items.push({ title: `Duplicated function '${fn}' in ${paths.length} files`, impact: "DRY", estimate: "1 day" }); debtScore += 5;
    }
  }

  // Missing tests
  if (!files.some(f => f.path.includes(".test.")||f.path.includes(".spec.")||f.path.includes("__tests__"))) {
    items.push({ title: "No test files detected", impact: "Reliability", estimate: "5 days" }); debtScore += 20;
  }
  // Missing README
  if (!files.some(f => f.path.toLowerCase() === "readme.md")) {
    items.push({ title: "Missing README.md", impact: "Onboarding", estimate: "0.5 days" }); debtScore += 5;
  }
  // Missing .gitignore
  if (!files.some(f => f.path === ".gitignore")) {
    items.push({ title: "Missing .gitignore", impact: "Security", estimate: "0.1 days" }); debtScore += 3;
  }
  // Missing TypeScript config
  if (!files.some(f => f.path === "tsconfig.json") && files.some(f => f.path.endsWith(".ts"))) {
    items.push({ title: "Missing tsconfig.json", impact: "Type Safety", estimate: "0.5 days" }); debtScore += 5;
  }
  // Missing ESLint config
  if (!files.some(f => /(\.eslintrc|eslint\.config|biome\.json)/.test(f.path)) && files.some(f => f.path.endsWith(".ts") || f.path.endsWith(".tsx"))) {
    items.push({ title: "Missing ESLint/Biome config", impact: "Code Quality", estimate: "0.5 days" }); debtScore += 4;
  }

  return { score: Math.min(debtScore, 100), items: items.slice(0, 15) };
}

function archResult(p:string,d:string,layers:{name:string;responsibility:string;files:number}[],s:string[],w:string[],m:ArchitectureMetrics):ArchitectureResult{
  return {pattern:p,description:d,layers,strengths:s,weaknesses:w,metrics:m};
}
function l(name:string,responsibility:string,files:number){return{name,responsibility,files};}
function countIn(files:ParsedFile[],dir:string):number{return files.filter(f=>f.path.startsWith(dir+"/")||f.path.startsWith("src/"+dir+"/")).length;}
