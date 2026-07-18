// CodeInsight AI — Architecture Detector + Tech Debt Analyzer
// Deep analysis: coupling, cohesion, layer violations, real strengths/weaknesses
import type { ParsedFile } from "../repo-parser";
import type { Issue } from "../types";

export interface ArchitectureResult {
  pattern: string;
  description: string;
  layers: { name: string; responsibility: string; files: number }[];
  strengths: string[];
  weaknesses: string[];
}

export function detectArchitecture(files: ParsedFile[]): ArchitectureResult {
  const dirs = new Set<string>();
  files.forEach(f => { const parts = f.path.split("/"); if (parts.length > 1) dirs.add(parts[0]); });

  // ── Compute real metrics from import graph ──
  const { coupling, cohesion, layerViolations, godModules, circularDeps } = computeMetrics(files);

  // Build dynamic strengths/weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Coupling analysis
  const avgCoupling = files.length > 0 ? coupling / files.length : 0;
  if (avgCoupling < 3) strengths.push(`Low average coupling (${avgCoupling.toFixed(1)} imports/file) — modules are well-separated`);
  else if (avgCoupling > 8) weaknesses.push(`High average coupling (${avgCoupling.toFixed(1)} imports/file) — modules depend on too many others`);

  // Cohesion analysis
  const avgCohesion = files.length > 0 ? cohesion / files.length : 0;
  if (avgCohesion > 0.5) strengths.push(`Good internal cohesion — modules group related functionality`);
  else if (avgCohesion < 0.2 && files.length > 10) weaknesses.push(`Low cohesion — files within the same directory don't import each other much`);

  // Layer violations
  if (layerViolations.length > 0) {
    weaknesses.push(`${layerViolations.length} layer violation(s): component files importing DB/infrastructure directly (bypassing service layer)`);
    layerViolations.slice(0, 3).forEach(v => weaknesses.push(`  → ${v}`));
  } else {
    strengths.push(`No layer violations detected — dependency direction is clean`);
  }

  // God modules
  if (godModules.length > 0) {
    weaknesses.push(`${godModules.length} god module(s) with >20 functions: ${godModules.slice(0, 3).join(", ")}`);
  }

  // Circular deps
  if (circularDeps > 0) {
    weaknesses.push(`${circularDeps} circular dependency chain(s) detected — these create tight coupling`);
  } else {
    strengths.push(`No circular dependencies — import graph is acyclic`);
  }

  // Test files
  const hasTests = files.some(f => f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("__tests__"));
  if (hasTests) strengths.push(`Test files detected alongside source — good testing discipline`);
  else weaknesses.push(`No test files detected — reliability risk`);

  // TypeScript usage
  const tsFiles = files.filter(f => f.path.endsWith(".ts") || f.path.endsWith(".tsx")).length;
  if (tsFiles > files.length * 0.5) strengths.push(`Strong TypeScript adoption (${tsFiles}/${files.length} files)`);

  // ── Pattern detection ──
  // Feature-based: src/features/*/...
  if (dirs.has("features") || files.some(f => f.path.includes("features/")))
    return archResult("Feature-based Architecture",
      "Code is organized by feature/domain rather than technical role. Each feature directory contains its own components, services, and types.",
      [l("Features", "Self-contained feature modules", countIn(files,"features"))],
      strengths, weaknesses);

  // Clean Architecture: domain/use-cases/infrastructure
  if (dirs.has("domain")||dirs.has("use-cases")||dirs.has("entities"))
    return archResult("Clean Architecture",
      "Layers are separated by dependency direction — domain is independent of infrastructure.",
      [l("Domain","Business entities & rules",countIn(files,"domain")),l("Use Cases","Application logic",countIn(files,"use-cases")),l("Infrastructure","DB, APIs, external services",countIn(files,"infrastructure"))],
      strengths, weaknesses);

  // MVC
  if (dirs.has("controllers")&&dirs.has("models")&&dirs.has("views"))
    return archResult("MVC (Model-View-Controller)",
      "Classic separation: Models for data, Views for presentation, Controllers for routing.",
      [l("Models","Data models & schemas",countIn(files,"models")),l("Views","UI templates",countIn(files,"views")),l("Controllers","Request handlers",countIn(files,"controllers"))],
      strengths, weaknesses);

  // Layered
  if (dirs.has("presentation")||dirs.has("application")||dirs.has("infrastructure"))
    return archResult("Layered Architecture",
      "Horizontal layers: presentation → application → domain → infrastructure.",
      [l("Presentation","Components & routes",countIn(files,"presentation")),l("Application","Services & hooks",countIn(files,"application")),l("Infrastructure","DB, APIs",countIn(files,"infrastructure"))],
      strengths, weaknesses);

  // Next.js App Router (default)
  if (files.some(f => f.path.startsWith("app/")||f.path.startsWith("src/app/")))
    return archResult("Next.js App Router (Feature-based Modular)",
      "Uses Next.js App Router conventions. Routes are file-system based. Layouts and pages compose the UI tree.",
      [l("App","Routes, layouts, pages",countIn(files,"app")),l("Components","Reusable UI",countIn(files,"components")),l("Lib","Shared utilities",countIn(files,"lib")),l("API","Backend routes",countIn(files,"api"))],
      strengths, weaknesses);

  // Monolith fallback
  return archResult("Modular Monolith",
    "Single-deployment application with module-based organization.",
    [l("Root","Mixed concerns",files.length)],
    strengths, weaknesses);
}

/**
 * Compute real architecture metrics from the import graph.
 */
function computeMetrics(files: ParsedFile[]) {
  let coupling = 0; // total cross-directory imports
  let cohesion = 0; // intra-directory imports / total imports
  let intraCount = 0, totalCount = 0;
  const layerViolations: string[] = [];
  const godModules: string[] = [];
  let circularDeps = 0;

  const fileMap = new Map(files.map(f => [f.path, f]));

  // Detect coupling + cohesion + layer violations
  for (const f of files) {
    coupling += f.imports.length;
    totalCount += f.imports.length;

    const fDir = f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : "root";

    for (const imp of f.imports) {
      // Try to resolve import to a file
      const resolved = files.find(other =>
        other.path === imp ||
        other.path.endsWith(imp) ||
        other.path.endsWith(imp + ".ts") ||
        other.path.endsWith(imp + ".tsx") ||
        other.path.endsWith(imp + "/index.ts")
      );

      if (resolved) {
        const rDir = resolved.path.includes("/") ? resolved.path.substring(0, resolved.path.lastIndexOf("/")) : "root";
        if (rDir === fDir || rDir.startsWith(fDir + "/") || fDir.startsWith(rDir + "/")) {
          intraCount++;
        }

        // Layer violation: component importing DB/infrastructure directly
        const isComponent = f.path.includes("components/") || f.path.includes("app/") || f.components.length > 0;
        const isInfrastructure = resolved.path.includes("lib/db") || resolved.path.includes("lib/prisma") ||
          resolved.path.includes("infrastructure/") || resolved.imports.some(i => i.includes("prisma") || i.includes("mongoose"));
        if (isComponent && isInfrastructure) {
          layerViolations.push(`${f.path} → ${resolved.path} (component importing DB layer)`);
        }
      }
    }

    // God module detection
    if (f.functions.length > 20) {
      godModules.push(f.path);
    }
  }

  cohesion = totalCount > 0 ? intraCount / totalCount : 0;

  // Simple circular dependency count (A imports B, B imports A)
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i], b = files[j];
      const aImportsB = a.imports.some(imp => b.path === imp || b.path.endsWith(imp) || b.path.endsWith(imp + ".ts"));
      const bImportsA = b.imports.some(imp => a.path === imp || a.path.endsWith(imp) || a.path.endsWith(imp + ".ts"));
      if (aImportsB && bImportsA) circularDeps++;
    }
  }

  return { coupling, cohesion, layerViolations, godModules, circularDeps };
}

export function analyzeTechDebt(files: ParsedFile[]): { score: number; items: { title: string; impact: string; estimate: string }[] } {
  const items: { title: string; impact: string; estimate: string }[] = [];
  let debtScore = 0;

  for (const f of files) {
    if (f.complexity > 15) { items.push({ title: `High complexity in ${f.path} (Cx=${f.complexity})`, impact: "Maintainability", estimate: "1 day" }); debtScore += 10; }
    if (f.lines > 300) { items.push({ title: `Large file: ${f.path} (${f.lines} lines)`, impact: "Readability", estimate: "2 days" }); debtScore += 8; }
    if (f.functions.length > 20) { items.push({ title: `God module: ${f.path} (${f.functions.length} functions)`, impact: "Cohesion", estimate: "3 days" }); debtScore += 12; }
    if (f.imports.length > 15) { items.push({ title: `High coupling: ${f.path} (${f.imports.length} imports)`, impact: "Coupling", estimate: "1 day" }); debtScore += 6; }
    // Deep nesting (simplified: many if/for/while in description)
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

  return { score: Math.min(debtScore, 100), items: items.slice(0, 15) };
}

function archResult(p:string,d:string,layers:{name:string;responsibility:string;files:number}[],s:string[],w:string[]):ArchitectureResult{
  return {pattern:p,description:d,layers,strengths:s,weaknesses:w};
}
function l(name:string,responsibility:string,files:number){return{name,responsibility,files};}
function countIn(files:ParsedFile[],dir:string):number{return files.filter(f=>f.path.startsWith(dir+"/")||f.path.startsWith("src/"+dir+"/")).length;}
