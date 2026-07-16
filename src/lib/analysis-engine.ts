// CodeInsight AI — Analysis engine
// Generates deterministic, realistic AI analysis reports from a GitHub repo URL.
// Uses a seeded PRNG so the same repo always yields the same report.

import type {
  AnalysisReport,
  AnalysisStage,
  ChartPoint,
  DependencyEdge,
  DependencyNode,
  FileInsight,
  FrameworkInfo,
  Issue,
  LanguageStat,
  ScoreBreakdown,
} from "./types";

/* ---------- Seeded PRNG (mulberry32) ---------- */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Repo URL parsing ---------- */
export interface ParsedRepo {
  owner: string;
  name: string;
  branch: string;
  url: string;
  valid: boolean;
}

export function parseRepoUrl(input: string): ParsedRepo {
  const raw = input.trim();
  const match = raw.match(
    /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?]|$)/i
  );
  if (match) {
    return {
      owner: match[1],
      name: match[2],
      branch: "main",
      url: raw.startsWith("http") ? raw : `https://github.com/${match[1]}/${match[2]}`,
      valid: true,
    };
  }
  // shorthand owner/name
  const short = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) {
    return {
      owner: short[1],
      name: short[2],
      branch: "main",
      url: `https://github.com/${short[1]}/${short[2]}`,
      valid: true,
    };
  }
  return { owner: "", name: "", branch: "main", url: raw, valid: false };
}

/* ---------- Curated repo knowledge ---------- */
interface RepoProfile {
  primary: string;
  languages: { name: string; color: string }[];
  frameworks: { name: string; version: string; category: string }[];
  pattern: string;
  summary: string;
  tags: string[];
}

const PROFILES: Record<string, RepoProfile> = {
  react: {
    primary: "JavaScript",
    languages: [
      { name: "JavaScript", color: "#f1e05a" },
      { name: "TypeScript", color: "#3178c6" },
      { name: "HTML", color: "#e34c26" },
      { name: "CSS", color: "#563d7c" },
    ],
    frameworks: [
      { name: "React", version: "19.0", category: "UI Library" },
      { name: "Rollup", version: "4.x", category: "Bundler" },
      { name: "Jest", version: "29.x", category: "Testing" },
    ],
    pattern: "Monorepo / Library Core",
    summary:
      "A battle-tested UI library with a layered reconciler architecture. The codebase favours immutable data flow, functional composition, and a custom fiber-based scheduler. Strong test coverage on the reconciler and renderer packages.",
    tags: ["UI Library", "Fiber", "Reconciler", "Monorepo", "Open Source"],
  },
  next: {
    primary: "TypeScript",
    languages: [
      { name: "TypeScript", color: "#3178c6" },
      { name: "JavaScript", color: "#f1e05a" },
      { name: "Rust", color: "#dea584" },
      { name: "CSS", color: "#563d7c" },
    ],
    frameworks: [
      { name: "Next.js", version: "16.x", category: "Framework" },
      { name: "SWC", version: "Rust", category: "Compiler" },
      { name: "Turbopack", version: "Alpha", category: "Bundler" },
      { name: "React", version: "19.0", category: "UI Library" },
    ],
    pattern: "Layered Framework / Turborepo",
    summary:
      "A full-stack React framework with a Rust-powered toolchain. Architecture cleanly separates the compiler (SWC), bundler (Turbopack), runtime, and server components. Strong type-safety across the public API surface.",
    tags: ["Framework", "Rust", "SSR", "RSC", "Turbopack"],
  },
  vue: {
    primary: "TypeScript",
    languages: [
      { name: "TypeScript", color: "#3178c6" },
      { name: "JavaScript", color: "#f1e05a" },
      { name: "HTML", color: "#e34c26" },
    ],
    frameworks: [
      { name: "Vue", version: "3.x", category: "UI Library" },
      { name: "Vite", version: "5.x", category: "Bundler" },
      { name: "Rollup", version: "4.x", category: "Bundler" },
    ],
    pattern: "Reactive Core / Compiler",
    summary:
      "A progressive UI framework built on a fine-grained reactivity system. The compiler-first approach enables aggressive optimisations and a small runtime footprint.",
    tags: ["UI Library", "Reactivity", "Compiler", "Vite"],
  },
};

function profileFor(owner: string, name: string): RepoProfile {
  const key = name.toLowerCase();
  if (key === "react" || key === "react-native") return PROFILES.react;
  if (key === "next.js" || key === "nextjs") return PROFILES.next;
  if (key === "vue" || key === "vue-next" || key === "core") return PROFILES.vue;
  // default generic profile
  return {
    primary: "TypeScript",
    languages: [
      { name: "TypeScript", color: "#3178c6" },
      { name: "JavaScript", color: "#f1e05a" },
      { name: "CSS", color: "#563d7c" },
      { name: "Python", color: "#3572A5" },
      { name: "Shell", color: "#89e051" },
    ],
    frameworks: [
      { name: "React", version: "19.0", category: "UI Library" },
      { name: "Vite", version: "5.x", category: "Bundler" },
      { name: "Vitest", version: "2.x", category: "Testing" },
      { name: "Tailwind CSS", version: "4.x", category: "Styling" },
    ],
    pattern: "Feature-based Modular Monolith",
    summary: `A well-structured ${name} project with clear module boundaries. The codebase follows conventional patterns with reasonable separation of concerns. There are clear opportunities to improve type-safety and reduce coupling between modules.`,
    tags: ["Web App", "TypeScript", "Modular", "Active"],
  };
}

/* ---------- Stage definitions ---------- */
export const ANALYSIS_STAGES: AnalysisStage[] = [
  {
    id: "clone",
    label: "Cloning Repository",
    description: "Fetching source tree & commit history",
    icon: "git-branch",
    duration: 1400,
  },
  {
    id: "scan",
    label: "Scanning File Tree",
    description: "Indexing files, detecting languages",
    icon: "scan",
    duration: 1200,
  },
  {
    id: "ast",
    label: "Generating AST",
    description: "Parsing source into abstract syntax trees",
    icon: "binary",
    duration: 1600,
  },
  {
    id: "deps",
    label: "Building Dependency Graph",
    description: "Resolving imports & module relationships",
    icon: "network",
    duration: 1500,
  },
  {
    id: "embed",
    label: "Creating Embeddings",
    description: "Vectorising code for semantic search",
    icon: "brain",
    duration: 1400,
  },
  {
    id: "static",
    label: "Static Analysis",
    description: "Complexity, duplication, dead code",
    icon: "search-code",
    duration: 1500,
  },
  {
    id: "ai",
    label: "AI Analysis",
    description: "Security, performance & architecture review",
    icon: "sparkles",
    duration: 1800,
  },
  {
    id: "report",
    label: "Generating Reports",
    description: "Synthesising insights & diagrams",
    icon: "file-text",
    duration: 1300,
  },
];

/* ---------- Builders ---------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function buildScores(rng: () => number): AnalysisReport["scores"] {
  const r = (min: number, max: number) => clamp(min + rng() * (max - min), 0, 100);
  const security = r(62, 96);
  const performance = r(58, 95);
  const architecture = r(60, 94);
  const maintainability = r(55, 93);
  const codeQuality = r(60, 95);
  const overall = Math.round(
    (security * 0.25 +
      performance * 0.2 +
      architecture * 0.2 +
      maintainability * 0.2 +
      codeQuality * 0.15)
  );
  return { overall, security, performance, architecture, maintainability, codeQuality };
}

function buildBreakdown(scores: AnalysisReport["scores"]): ScoreBreakdown[] {
  return [
    { label: "Security", score: scores.security, max: 100, weight: 25 },
    { label: "Performance", score: scores.performance, max: 100, weight: 20 },
    { label: "Architecture", score: scores.architecture, max: 100, weight: 20 },
    { label: "Maintainability", score: scores.maintainability, max: 100, weight: 20 },
    { label: "Code Quality", score: scores.codeQuality, max: 100, weight: 15 },
  ];
}

function buildLanguages(
  rng: () => number,
  profile: RepoProfile
): LanguageStat[] {
  const base = profile.languages.map((l) => ({
    name: l.name,
    color: l.color,
    raw: 20 + rng() * 80,
  }));
  const total = base.reduce((s, l) => s + l.raw, 0);
  return base
    .map((l) => ({
      ...l,
      percentage: Math.round((l.raw / total) * 1000) / 10,
      files: clamp(l.raw * 3 + rng() * 20, 5, 1200),
      lines: clamp(l.raw * 200 + rng() * 2000, 500, 80000),
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

function buildFrameworks(rng: () => number, profile: RepoProfile): FrameworkInfo[] {
  return profile.frameworks.map((f) => ({
    ...f,
    confidence: clamp(80 + rng() * 20, 0, 100),
  }));
}

function buildDependencyGraph(
  rng: () => number,
  name: string
): AnalysisReport["dependencies"] {
  const groups = 4;
  const nodesPerGroup = 4;
  const nodes: DependencyNode[] = [];
  const types: DependencyNode["type"][] = [
    "entry",
    "core",
    "service",
    "util",
    "component",
    "config",
  ];
  // central entry node
  nodes.push({
    id: "entry",
    label: `index.ts`,
    type: "entry",
    group: 0,
    x: 50,
    y: 50,
    size: 22,
  });
  let id = 0;
  for (let g = 1; g <= groups; g++) {
    for (let n = 0; n < nodesPerGroup; n++) {
      id++;
      const angle = (g / groups) * Math.PI * 2;
      const radius = 22 + n * 6;
      const jitter = (rng() - 0.5) * 8;
      nodes.push({
        id: `n${id}`,
        label: `${["auth", "api", "ui", "store", "lib", "utils", "hooks", "db"][g - 1]}/${["index", "service", "controller", "model"][n]}.ts`,
        type: types[(g + n) % types.length],
        group: g,
        x: 50 + Math.cos(angle) * (radius + jitter),
        y: 50 + Math.sin(angle) * (radius + jitter),
        size: 12 + rng() * 8,
      });
    }
  }
  // edges
  const edges: DependencyEdge[] = [];
  // entry connects to each group root
  for (let g = 1; g <= groups; g++) {
    const rootIdx = 1 + (g - 1) * nodesPerGroup;
    edges.push({ from: "entry", to: nodes[rootIdx].id, weight: 3 });
  }
  // intra-group edges
  for (let g = 1; g <= groups; g++) {
    for (let n = 0; n < nodesPerGroup - 1; n++) {
      const a = 1 + (g - 1) * nodesPerGroup + n;
      const b = a + 1;
      edges.push({ from: nodes[a].id, to: nodes[b].id, weight: 2 });
      // occasional cross link
      if (rng() > 0.7) {
        const otherGroup = (g % groups) + 1;
        const otherIdx = 1 + (otherGroup - 1) * nodesPerGroup + Math.floor(rng() * nodesPerGroup);
        edges.push({ from: nodes[b].id, to: nodes[otherIdx].id, weight: 1, circular: rng() > 0.8 });
      }
    }
  }
  return {
    nodes,
    edges,
    circular: [
      { nodes: ["n3", "n7", "n11"] },
    ].filter(() => rng() > 0.4),
  };
}

const FILE_TEMPLATES = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/lib/auth.ts",
  "src/lib/db.ts",
  "src/lib/utils.ts",
  "src/components/Header.tsx",
  "src/components/Sidebar.tsx",
  "src/services/api.ts",
  "src/hooks/useUser.ts",
  "src/store/index.ts",
  "src/server/router.ts",
  "src/utils/crypto.ts",
  "src/utils/logger.ts",
  "config/database.ts",
  "middleware.ts",
];

function buildFiles(rng: () => number, profile: RepoProfile): FileInsight[] {
  return FILE_TEMPLATES.map((path) => {
    const lang = path.endsWith(".ts") || path.endsWith(".tsx")
      ? profile.primary
      : path.endsWith(".css")
      ? "CSS"
      : "Config";
    const complexity = clamp(rng() * 30, 1, 30);
    return {
      path,
      language: lang,
      lines: clamp(40 + rng() * 400, 20, 500),
      complexity,
      maintainability: clamp(100 - complexity * 2 - rng() * 10, 20, 99),
      description: FILE_DESCRIPTIONS[path] ?? "Utility module providing shared helpers.",
      issues: clamp(Math.floor(rng() * 4), 0, 4),
    };
  });
}

const FILE_DESCRIPTIONS: Record<string, string> = {
  "src/app/layout.tsx": "Root layout composing global providers, fonts, and the application shell.",
  "src/app/page.tsx": "Primary entry route rendering the dashboard and orchestrating data fetching.",
  "src/lib/auth.ts": "Authentication helpers wrapping session validation and token verification.",
  "src/lib/db.ts": "Database client singleton initialising the ORM connection pool.",
  "src/lib/utils.ts": "Shared utility functions for class merging and formatting.",
  "src/components/Header.tsx": "Top navigation bar with responsive menu and user menu dropdown.",
  "src/components/Sidebar.tsx": "Collapsible sidebar navigation with active route highlighting.",
  "src/services/api.ts": "API client layer abstracting fetch calls with retry and auth injection.",
  "src/hooks/useUser.ts": "Hook returning the current user with TanStack Query caching.",
  "src/store/index.ts": "Zustand store managing global client state slices.",
  "src/server/router.ts": "tRPC-style router aggregating procedure definitions.",
  "src/utils/crypto.ts": "Cryptographic helpers for hashing and secure random generation.",
  "src/utils/logger.ts": "Structured logger with log levels and request correlation IDs.",
  "config/database.ts": "Database configuration loader reading environment variables.",
  "middleware.ts": "Next.js middleware handling auth redirects and locale negotiation.",
};

function buildIssues(rng: () => number): AnalysisReport["issues"] {
  const bugs: Issue[] = [
    {
      id: "b1",
      severity: "high",
      category: "Null Reference",
      title: "Potential null dereference in user resolver",
      description:
        "The resolver accesses `ctx.user.id` without verifying that `ctx.user` is defined. When called from an unauthenticated context this throws a runtime error.",
      file: "src/server/router.ts",
      line: 42,
      recommendation:
        "Guard with `if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })` before accessing user properties.",
      effort: "small",
    },
    {
      id: "b2",
      severity: "medium",
      category: "Race Condition",
      title: "Async state update after unmount",
      description:
        "useEffect triggers an async fetch and sets state in the callback without an abort/cleanup, risking state updates on unmounted components.",
      file: "src/hooks/useUser.ts",
      line: 18,
      recommendation:
        "Track a mounted flag or use AbortController and ignore updates after unmount.",
      effort: "small",
    },
    {
      id: "b3",
      severity: "low",
      category: "Logic",
      title: "Off-by-one in pagination slice",
      description: "Array slice uses `page` instead of `page - 1` producing an empty first page.",
      file: "src/services/api.ts",
      line: 87,
      recommendation: "Use `slice((page - 1) * size, page * size)` for zero-based pagination.",
      effort: "trivial",
    },
  ];
  const security: Issue[] = [
    {
      id: "s1",
      severity: "critical",
      category: "Secrets",
      title: "Hardcoded API key in configuration",
      description:
        "A production API key is committed in `config/database.ts`. Anyone with repo access can exfiltrate the credential.",
      file: "config/database.ts",
      line: 12,
      recommendation:
        "Move secrets to environment variables and rotate the exposed key immediately. Add a pre-commit secret scanner.",
      effort: "small",
    },
    {
      id: "s2",
      severity: "high",
      category: "XSS",
      title: "Unescaped HTML rendered via dangerouslySetInnerHTML",
      description:
        "User-supplied markdown is rendered without sanitisation, allowing stored XSS attacks.",
      file: "src/components/Header.tsx",
      line: 64,
      recommendation:
        "Sanitise with DOMPurify before rendering, or use a sandboxed markdown renderer.",
      effort: "medium",
    },
    {
      id: "s3",
      severity: "medium",
      category: "Auth",
      title: "Weak password hashing (MD5)",
      description: "Passwords are hashed with MD5 which is cryptographically broken and trivially brute-forced.",
      file: "src/utils/crypto.ts",
      line: 23,
      recommendation:
        "Migrate to bcrypt or argon2 with a work factor ≥ 12. Re-hash on next login.",
      effort: "medium",
    },
    {
      id: "s4",
      severity: "low",
      category: "Headers",
      title: "Missing security headers",
      description: "CSP, X-Frame-Options and Referrer-Policy are not set.",
      file: "middleware.ts",
      recommendation: "Add a security-headers middleware or use `next.config.js` headers config.",
      effort: "trivial",
    },
  ];
  const performance: Issue[] = [
    {
      id: "p1",
      severity: "high",
      category: "Bundle",
      title: "Entire lodash imported",
      description: "`import _ from 'lodash'` ships ~70KB to the client instead of tree-shaken imports.",
      file: "src/lib/utils.ts",
      line: 3,
      recommendation: "Use `import debounce from 'lodash/debounce'` or switch to es-toolkit.",
      effort: "trivial",
    },
    {
      id: "p2",
      severity: "medium",
      category: "Render",
      title: "Missing memoisation on expensive list",
      description: "A 500-item list re-renders on every parent update because items aren't memoised.",
      file: "src/components/Sidebar.tsx",
      line: 120,
      recommendation: "Wrap items in React.memo and stabilise callback references with useCallback.",
      effort: "small",
    },
    {
      id: "p3",
      severity: "medium",
      category: "Query",
      title: "N+1 query in user listing",
      description: "Each row fetches its role in a separate DB query inside a map.",
      file: "src/server/router.ts",
      line: 156,
      recommendation: "Use a single join or a batched `findMany({ where: { id: { in } } })`.",
      effort: "medium",
    },
    {
      id: "p4",
      severity: "low",
      category: "Memory",
      title: "Event listener never removed",
      description: "A window resize listener is added on mount but never cleaned up, causing leaks.",
      file: "src/hooks/useUser.ts",
      line: 33,
      recommendation: "Return a cleanup function from useEffect that calls removeEventListener.",
      effort: "trivial",
    },
  ];
  return { bugs, security, performance };
}

function buildActivity(rng: () => number): ChartPoint[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((d) => ({ label: d, value: clamp(8 + rng() * 60, 0, 80) }));
}

function buildComplexityTrend(rng: () => number): ChartPoint[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  let v = 12;
  return months.map((m) => {
    v = clamp(v + (rng() - 0.45) * 6, 5, 35);
    return { label: m, value: v };
  });
}

function buildArchitecture(rng: () => number, profile: RepoProfile): AnalysisReport["architecture"] {
  return {
    pattern: profile.pattern,
    description:
      "The project follows a layered architecture with clear separation between presentation, domain, and data layers. Dependency direction flows inward, with the domain layer isolated from framework concerns. The module boundaries are enforced through explicit barrel exports.",
    layers: [
      { name: "Presentation", responsibility: "UI components, routes, layouts", files: clamp(40 + rng() * 30, 20, 90) },
      { name: "Application", responsibility: "Hooks, state, orchestration", files: clamp(20 + rng() * 20, 10, 50) },
      { name: "Domain", responsibility: "Business logic, entities", files: clamp(15 + rng() * 15, 8, 40) },
      { name: "Infrastructure", responsibility: "DB, API clients, external services", files: clamp(10 + rng() * 10, 5, 25) },
    ],
    strengths: [
      "Clear module boundaries with barrel exports",
      "Type-safe API contracts end-to-end",
      "Consistent error handling patterns",
      "Good test coverage on domain logic",
    ],
    weaknesses: [
      "Some leakage of infrastructure concerns into the domain layer",
      "A few god-components exceeding 500 lines",
      "Inconsistent state management between Zustand and React Context",
    ],
  };
}

function buildTechnicalDebt(scores: AnalysisReport["scores"]): AnalysisReport["technicalDebt"] {
  return {
    score: clamp(100 - scores.maintainability, 5, 95),
    items: [
      { title: "Migrate class components to hooks", impact: "Maintainability", estimate: "2 days" },
      { title: "Replace deprecated API routes with App Router handlers", impact: "Future-proofing", estimate: "3 days" },
      { title: "Consolidate duplicate validation logic", impact: "DRY", estimate: "1 day" },
      { title: "Upgrade to TypeScript 5 strict mode", impact: "Type-safety", estimate: "4 days" },
    ],
  };
}

function buildRoadmap(): AnalysisReport["roadmap"] {
  return [
    {
      title: "Add real-time collaboration",
      description: "Introduce WebSocket-based live cursors and presence for shared dashboards.",
      priority: "high",
      category: "Feature",
    },
    {
      title: "Implement RBAC with fine-grained permissions",
      description: "Move from role checks to capability-based authorisation with audit logging.",
      priority: "high",
      category: "Security",
    },
    {
      title: "Edge-render public marketing pages",
      description: "Move static pages to the edge for sub-50ms TTFB worldwide.",
      priority: "medium",
      category: "Performance",
    },
    {
      title: "Add observability stack",
      description: "Ship OpenTelemetry traces + structured logs to a managed backend.",
      priority: "medium",
      category: "Reliability",
    },
    {
      title: "Component playground with Storybook",
      description: "Document and visually test the design system in isolation.",
      priority: "low",
      category: "DX",
    },
  ];
}

function buildMonetization(): AnalysisReport["monetization"] {
  return [
    {
      title: "Usage-based API tier",
      description: "Offer metered API access with Stripe billing for power users exceeding the free quota.",
      potential: "high",
    },
    {
      title: "Team & Enterprise plans",
      description: "SSO, audit logs, and dedicated support for organisations.",
      potential: "high",
    },
    {
      title: "Premium templates marketplace",
      description: "Curated starter templates with revenue share for community authors.",
      potential: "medium",
    },
  ];
}

function buildDocs(name: string, owner: string): AnalysisReport["documentation"] {
  const readme = `# ${name}

> AI-generated README — produced by CodeInsight AI.

${owner}/${name} is a ${"modern"} project built with a focus on developer experience and performance.

## Features
- Modular, layered architecture
- End-to-end type safety
- Comprehensive test suite
- First-class developer tooling

## Getting Started
\`\`\`bash
git clone https://github.com/${owner}/${name}.git
cd ${name}
bun install
bun run dev
\`\`\`

## Architecture
The codebase follows a clean, layered structure. See the Architecture report for a full diagram.

## License
MIT © ${owner}
`;
  const apiDocs = `# API Reference — ${name}

## Authentication
All protected routes require a Bearer token.

## Endpoints

### GET /api/users
Returns a paginated list of users.

### POST /api/users
Creates a new user. Requires admin scope.

### GET /api/projects/:id
Returns a single project with its latest analysis.

### POST /api/analyze
Triggers a new repository analysis. Returns a job id for polling.
`;
  return { readme, apiDocs };
}

/* ---------- Main generator ---------- */
export function generateReport(repoUrl: string): AnalysisReport {
  const parsed = parseRepoUrl(repoUrl);
  const profile = profileFor(parsed.owner, parsed.name);
  const seed = hashString(`${parsed.owner}/${parsed.name}`);
  const rng = mulberry32(seed);

  const scores = buildScores(rng);
  return {
    repoUrl: parsed.url,
    repoOwner: parsed.owner,
    repoName: parsed.name,
    repoBranch: parsed.branch,
    summary: profile.summary,
    tags: profile.tags,
    scores,
    scoreBreakdown: buildBreakdown(scores),
    primaryLanguage: profile.primary,
    totalFiles: clamp(120 + rng() * 400, 50, 1500),
    totalLines: clamp(8000 + rng() * 60000, 2000, 120000),
    languages: buildLanguages(rng, profile),
    frameworks: buildFrameworks(rng, profile),
    dependencies: buildDependencyGraph(rng, parsed.name),
    issues: buildIssues(rng),
    files: buildFiles(rng, profile),
    architecture: buildArchitecture(rng, profile),
    technicalDebt: buildTechnicalDebt(scores),
    roadmap: buildRoadmap(),
    monetization: buildMonetization(),
    documentation: buildDocs(parsed.name, parsed.owner),
    activity: buildActivity(rng),
    complexityTrend: buildComplexityTrend(rng),
  };
}
