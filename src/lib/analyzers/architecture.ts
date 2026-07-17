// CodeInsight AI — Architecture Detector + Tech Debt Analyzer
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

  // Feature-based: src/features/*/...
  if (dirs.has("features") || files.some(f => f.path.includes("features/")))
    return archResult("Feature-based Architecture",
      "Code is organized by feature/domain rather than technical role. Each feature directory contains its own components, services, and types.",
      [l("Features", "Self-contained feature modules", countIn(files,"features"))],
      ["Clear domain boundaries","Easy to add/remove features","Good for scaling teams"],
      ["Risk of duplication across features","Cross-feature communication needs careful design"]);

  // Clean Architecture: domain/use-cases/infrastructure
  if (dirs.has("domain")||dirs.has("use-cases")||dirs.has("entities"))
    return archResult("Clean Architecture",
      "Layers are separated by dependency direction — domain is independent of infrastructure.",
      [l("Domain","Business entities & rules",countIn(files,"domain")),l("Use Cases","Application logic",countIn(files,"use-cases")),l("Infrastructure","DB, APIs, external services",countIn(files,"infrastructure"))],
      ["Domain is framework-agnostic","High testability","Clear dependency direction"],
      ["More boilerplate","Steeper learning curve","Can be overkill for small projects"]);

  // MVC
  if (dirs.has("controllers")&&dirs.has("models")&&dirs.has("views"))
    return archResult("MVC (Model-View-Controller)",
      "Classic separation: Models for data, Views for presentation, Controllers for routing.",
      [l("Models","Data models & schemas",countIn(files,"models")),l("Views","UI templates",countIn(files,"views")),l("Controllers","Request handlers",countIn(files,"controllers"))],
      ["Well-understood pattern","Good for server-rendered apps","Clear separation"],
      ["Fat controllers risk","Tight coupling between model and view","Not ideal for SPA"]);

  // Layered
  if (dirs.has("presentation")||dirs.has("application")||dirs.has("infrastructure"))
    return archResult("Layered Architecture",
      "Horizontal layers: presentation → application → domain → infrastructure.",
      [l("Presentation","Components & routes",countIn(files,"presentation")),l("Application","Services & hooks",countIn(files,"application")),l("Infrastructure","DB, APIs",countIn(files,"infrastructure"))],
      ["Clear layer boundaries","Good testability","Familiar pattern"],
      ["Can lead to anemic domain model","Over-abstraction for simple CRUD"]);

  // Next.js App Router (default)
  if (files.some(f => f.path.startsWith("app/")||f.path.startsWith("src/app/")))
    return archResult("Next.js App Router (Feature-based Modular)",
      "Uses Next.js App Router conventions. Routes are file-system based. Layouts and pages compose the UI tree.",
      [l("App","Routes, layouts, pages",countIn(files,"app")),l("Components","Reusable UI",countIn(files,"components")),l("Lib","Shared utilities",countIn(files,"lib")),l("API","Backend routes",countIn(files,"api"))],
      ["File-system routing","Server/client component split","Good DX with hot reload"],
      ["Server/client boundary can be confusing","Large app/ dir can get unwieldy","Need discipline for state management"]);

  // Monolith fallback
  return archResult("Modular Monolith",
    "Single-deployment application with module-based organization.",
    [l("Root","Mixed concerns",files.length)],
    ["Simple to deploy","Easy to develop","No distributed complexity"],
    ["Risk of tight coupling","Harder to scale independently","Module boundaries need discipline"]);
}

export function analyzeTechDebt(files: ParsedFile[]): { score: number; items: { title: string; impact: string; estimate: string }[] } {
  const items: { title: string; impact: string; estimate: string }[] = [];
  let debtScore = 0;

  for (const f of files) {
    // High complexity
    if (f.complexity > 15) {
      items.push({ title: `High complexity in ${f.path}`, impact: "Maintainability", estimate: "1 day" });
      debtScore += 10;
    }
    // Long file
    if (f.lines > 300) {
      items.push({ title: `Large file: ${f.path} (${f.lines} lines)`, impact: "Readability", estimate: "2 days" });
      debtScore += 8;
    }
    // Many functions (god module)
    if (f.functions.length > 20) {
      items.push({ title: `God module: ${f.path} (${f.functions.length} functions)`, impact: "Cohesion", estimate: "3 days" });
      debtScore += 12;
    }
    // Many imports (high coupling)
    if (f.imports.length > 15) {
      items.push({ title: `High coupling: ${f.path} (${f.imports.length} imports)`, impact: "Coupling", estimate: "1 day" });
      debtScore += 6;
    }
  }

  // Check for duplicated patterns (simplified)
  const funcNames = new Map<string, string[]>();
  for (const f of files) {
    for (const fn of f.functions) {
      const existing = funcNames.get(fn) || [];
      existing.push(f.path);
      funcNames.set(fn, existing);
    }
  }
  for (const [fn, paths] of funcNames) {
    if (paths.length > 2 && !["map","filter","forEach","render","toString","valueOf","constructor"].includes(fn)) {
      items.push({ title: `Duplicated function '${fn}' in ${paths.length} files`, impact: "DRY", estimate: "1 day" });
      debtScore += 5;
    }
  }

  // Missing test files
  const hasTests = files.some(f => f.path.includes(".test.")||f.path.includes(".spec.")||f.path.includes("__tests__"));
  if (!hasTests) {
    items.push({ title: "No test files detected", impact: "Reliability", estimate: "5 days" });
    debtScore += 20;
  }

  // Missing README
  if (!files.some(f => f.path.toLowerCase() === "readme.md")) {
    items.push({ title: "Missing README.md", impact: "Onboarding", estimate: "0.5 days" });
    debtScore += 5;
  }

  return { score: Math.min(debtScore, 100), items: items.slice(0, 15) };
}

function archResult(p:string,d:string,layers:{name:string;responsibility:string;files:number}[],s:string[],w:string[]):ArchitectureResult{
  return {pattern:p,description:d,layers,strengths:s,weaknesses:w};
}
function l(name:string,responsibility:string,files:number){return{name,responsibility,files};}
function countIn(files:ParsedFile[],dir:string):number{return files.filter(f=>f.path.startsWith(dir+"/")||f.path.startsWith("src/"+dir+"/")).length;}
