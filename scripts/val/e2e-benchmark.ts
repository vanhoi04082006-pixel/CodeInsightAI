// Validation 10 + Benchmark — End-to-End Scenarios + Performance Benchmark
// This is a VALIDATION HARNESS, not an agent feature. Reads-only against agent code.
// Runs 4 E2E scenarios + measures performance of all agent layers.

import { buildIndexes } from "@/lib/agent/indexes";
import { createQueryService } from "@/lib/agent/query";
import { createServices } from "@/lib/agent/services";
import { createRegistries } from "@/lib/agent/tools";
import { createContextBuilder, TokenBudgetManager } from "@/lib/agent/context";
import { createPlanner, ExecutionGraphBuilder, PlanValidator, defaultPolicy } from "@/lib/agent/planner";
import { createRuntime } from "@/lib/agent/runtime";
import { createAgentMemory } from "@/lib/agent/memory";
import { createSkillRegistry } from "@/lib/agent/skills";
import type {
  SemanticProjectModel,
  SemanticFile,
  SemanticSymbol,
  SemanticEdge,
  SemanticIssue,
  SemanticArchitecture,
  SemanticMetrics,
  AgentContext,
  ExecutionPlan,
  AgentEvent,
} from "@/lib/agent/contracts";

// ─── Helpers ──────────────────────────────────────────────────────────
function nowMs() { return performance.now(); }
function fmtMs(ms: number) { return ms < 1 ? `${ms.toFixed(3)}ms` : `${ms.toFixed(1)}ms`; }
function memMB() {
  const m = process.memoryUsage();
  return { rss: (m.rss / 1048576).toFixed(1), heapUsed: (m.heapUsed / 1048576).toFixed(1), heapTotal: (m.heapTotal / 1048576).toFixed(1) };
}

// ─── Build a small synthetic SPM (mock auth system, ~12 files, ~50 symbols) ─
function buildSmallSPM(): SemanticProjectModel {
  const files: SemanticFile[] = [
    { path: "src/auth/login.ts", language: "typescript", lines: 45, content: "export async function login(email, password) {\n  const user = await db.user.findUnique({ where: { email } });\n  if (!user) throw new Error('not found');\n  const ok = await bcrypt.compare(password, user.passwordHash);\n  if (!ok) throw new Error('bad password');\n  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);\n  return { token, user };\n}", symbols: ["src/auth/login.ts::login::function"], imports: ["bcrypt", "jsonwebtoken", "@/lib/db"] },
    { path: "src/auth/register.ts", language: "typescript", lines: 38, content: "export async function register(email, password) {\n  const existing = await db.user.findUnique({ where: { email } });\n  if (existing) throw new Error('exists');\n  const hash = await bcrypt.hash(password, 10);\n  const user = await db.user.create({ data: { email, passwordHash: hash } });\n  return login(email, password);\n}", symbols: ["src/auth/register.ts::register::function"], imports: ["bcrypt", "@/lib/db", "./login"] },
    { path: "src/auth/middleware.ts", language: "typescript", lines: 30, content: "export function authMiddleware(req, res, next) {\n  const token = req.headers.authorization?.replace('Bearer ', '');\n  if (!token) return res.status(401).json({ error: 'no token' });\n  try {\n    const payload = jwt.verify(token, process.env.JWT_SECRET);\n    req.userId = payload.userId;\n    next();\n  } catch {\n    res.status(401).json({ error: 'invalid token' });\n  }\n}", symbols: ["src/auth/middleware.ts::authMiddleware::function"], imports: ["jsonwebtoken"] },
    { path: "src/auth/session.ts", language: "typescript", lines: 25, content: "export class SessionManager {\n  private sessions = new Map();\n  create(userId) { const id = crypto.randomUUID(); this.sessions.set(id, { userId, createdAt: Date.now() }); return id; }\n  get(id) { return this.sessions.get(id); }\n  destroy(id) { this.sessions.delete(id); }\n}", symbols: ["src/auth/session.ts::SessionManager::class"], imports: [] },
    { path: "src/lib/db.ts", language: "typescript", lines: 15, content: "import { PrismaClient } from '@prisma/client';\nexport const db = new PrismaClient();", symbols: ["src/lib/db.ts::db::variable"], imports: ["@prisma/client"] },
    { path: "src/lib/jwt.ts", language: "typescript", lines: 20, content: "import jwt from 'jsonwebtoken';\nexport function signToken(payload) { return jwt.sign(payload, process.env.JWT_SECRET); }\nexport function verifyToken(token) { return jwt.verify(token, process.env.JWT_SECRET); }", symbols: ["src/lib/jwt.ts::signToken::function", "src/lib/jwt.ts::verifyToken::function"], imports: ["jsonwebtoken"] },
    { path: "src/api/auth/route.ts", language: "typescript", lines: 40, content: "import { login } from '@/lib/auth/login';\nimport { register } from '@/lib/auth/register';\nexport async function POST(req) {\n  const { action, email, password } = await req.json();\n  if (action === 'login') return Response.json(await login(email, password));\n  if (action === 'register') return Response.json(await register(email, password));\n  return Response.json({ error: 'unknown action' }, { status: 400 });\n}", symbols: ["src/api/auth/route.ts::POST::function"], imports: ["@/lib/auth/login", "@/lib/auth/register"] },
    { path: "src/api/user/route.ts", language: "typescript", lines: 35, content: "import { authMiddleware } from '@/lib/auth/middleware';\nimport { db } from '@/lib/db';\nexport async function GET(req) {\n  authMiddleware(req, null, () => {});\n  const user = await db.user.findUnique({ where: { id: req.userId } });\n  return Response.json(user);\n}", symbols: ["src/api/user/route.ts::GET::function"], imports: ["@/lib/auth/middleware", "@/lib/db"] },
    { path: "src/utils/password.ts", language: "typescript", lines: 18, content: "import bcrypt from 'bcrypt';\nexport async function hashPassword(pw) { return bcrypt.hash(pw, 10); }\nexport async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }", symbols: ["src/utils/password.ts::hashPassword::function", "src/utils/password.ts::verifyPassword::function"], imports: ["bcrypt"] },
    { path: "src/utils/token.ts", language: "typescript", lines: 12, content: "import { signToken, verifyToken } from '@/lib/jwt';\nexport function issueToken(userId) { return signToken({ userId }); }\nexport function decodeToken(token) { return verifyToken(token); }", symbols: ["src/utils/token.ts::issueToken::function", "src/utils/token.ts::decodeToken::function"], imports: ["@/lib/jwt"] },
    { path: "src/lib/config.ts", language: "typescript", lines: 10, content: "export const config = { jwtSecret: process.env.JWT_SECRET, dbUrl: process.env.DATABASE_URL, bcryptRounds: 10 };", symbols: ["src/lib/config.ts::config::variable"], imports: [] },
    { path: "src/middleware.ts", language: "typescript", lines: 22, content: "import { authMiddleware } from '@/lib/auth/middleware';\nexport function middleware(req) {\n  if (req.nextUrl.pathname.startsWith('/api/')) {\n    return authMiddleware(req, null, () => {});\n  }\n}", symbols: ["src/middleware.ts::middleware::function"], imports: ["@/lib/auth/middleware"] },
  ];

  const symbols: SemanticSymbol[] = [];
  for (const f of files) {
    for (const sid of f.symbols) {
      const parts = sid.split("::");
      symbols.push({
        id: sid,
        name: parts[1],
        kind: parts[2] as any,
        file: f.path,
        line: 1,
        exported: true,
      });
    }
  }

  const edges: SemanticEdge[] = [
    { id: "e1", type: "calls", source: "src/auth/login.ts::login::function", target: "src/utils/password.ts::verifyPassword::function", file: "src/auth/login.ts", line: 1 },
    { id: "e2", type: "calls", source: "src/auth/login.ts::login::function", target: "src/lib/jwt.ts::signToken::function", file: "src/auth/login.ts", line: 1 },
    { id: "e3", type: "imports", source: "src/api/auth/route.ts::POST::function", target: "src/auth/login.ts", file: "src/api/auth/route.ts" },
    { id: "e4", type: "imports", source: "src/api/auth/route.ts::POST::function", target: "src/auth/register.ts", file: "src/api/auth/route.ts" },
    { id: "e5", type: "imports", source: "src/api/user/route.ts::GET::function", target: "src/auth/middleware.ts", file: "src/api/user/route.ts" },
    { id: "e6", type: "calls", source: "src/auth/register.ts::register::function", target: "src/auth/login.ts::login::function", file: "src/auth/register.ts", line: 1 },
    { id: "e7", type: "depends_on", source: "src/middleware.ts", target: "src/auth/middleware.ts" },
    { id: "e8", type: "uses", source: "src/api/user/route.ts::GET::function", target: "src/lib/db.ts::db::variable", file: "src/api/user/route.ts" },
  ];

  const issues: SemanticIssue[] = [
    { id: "i1", category: "security", severity: "high", title: "Hardcoded JWT secret fallback", description: "JWT secret may fall back to empty string if env var missing", file: "src/lib/config.ts", line: 1, recommendation: "Throw if JWT_SECRET is not set", effort: "trivial" },
    { id: "i2", category: "security", severity: "critical", title: "SQL injection in login", description: "Raw query used in login", file: "src/auth/login.ts", line: 2, recommendation: "Use parameterized Prisma queries", effort: "small" },
    { id: "i3", category: "performance", severity: "medium", title: "N+1 query in user route", description: "User route fetches user then profile separately", file: "src/api/user/route.ts", line: 5, recommendation: "Use Prisma include", effort: "small" },
    { id: "i4", category: "bugs", severity: "high", title: "Login doesn't handle DB errors", description: "DB failure throws unhandled", file: "src/auth/login.ts", line: 3, recommendation: "Wrap in try/catch", effort: "small" },
    { id: "i5", category: "architecture", severity: "low", title: "Auth logic spread across 4 files", description: "Login, register, middleware, session all separate", file: "src/auth/login.ts", line: 1, recommendation: "Consolidate into AuthService class", effort: "medium" },
  ];

  const architecture: SemanticArchitecture = {
    pattern: "Layered (API → Auth → Data)",
    strengths: ["Clear separation of auth concerns", "Centralized config"],
    weaknesses: ["Auth logic fragmented", "No auth service abstraction"],
    layers: ["API", "Auth", "Utils", "Data"],
    layerViolations: [],
  };

  const metrics: SemanticMetrics = {
    totalFiles: files.length,
    totalLines: files.reduce((s, f) => s + f.lines, 0),
    totalSymbols: symbols.length,
    totalEdges: edges.length,
    cyclomaticComplexity: 12,
    maintainabilityIndex: 72,
    couplingScore: 0.4,
    cohesionScore: 0.7,
  };

  return {
    id: "synthetic/auth-system/1",
    repoOwner: "synthetic",
    repoName: "auth-system",
    branch: "main",
    commitSha: "abc123",
    createdAt: new Date().toISOString(),
    files,
    symbols,
    edges,
    issues,
    insights: [{ type: "overview", data: { summary: "Auth system mock" } }],
    architecture,
    metrics,
    schemaVersion: 1,
  };
}

// ─── Scenario runner ──────────────────────────────────────────────────
async function runScenario(name: string, spm: SemanticProjectModel, query: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`SCENARIO: ${name}`);
  console.log(`QUERY: "${query}"`);
  console.log("═".repeat(70));

  const events: AgentEvent[] = [];
  let taskEnded = false;
  let taskOutcome = "(no terminal event)";

  const t0 = nowMs();
  const memBefore = memMB();

  // Build indexes
  const tIdx0 = nowMs();
  const indexes = buildIndexes(spm);
  const tIdx = nowMs() - tIdx0;

  // Query service
  const querySvc = createQueryService(spm, indexes);

  // Services
  const services = createServices(spm);

  // Registries
  const { toolRegistry, capabilityRegistry } = createRegistries();
  const allCapabilities = Array.from(new Set((toolRegistry as any).listAllManifests().flatMap(m => m.capabilities))) as any[];

  // Memory
  const memory = createAgentMemory();
  memory.project.setSPM(spm);
  memory.project.setIndexes(indexes);

  // Context
  const context: AgentContext = {
    spm,
    query: querySvc,
    memory,
    analysisId: "synthetic-1",
    locale: "en",
  };

  // Planner
  const tPlan0 = nowMs();
  const planner = createPlanner(allCapabilities);
  const planResult = await planner.plan(query, context);
  const tPlan = nowMs() - tPlan0;

  console.log(`\n[Planner] ${tPlan < 1 ? fmtMs(tPlan) : fmtMs(tPlan)} | ok=${planResult.ok}`);
  if (!planResult.ok) {
    console.log(`  ERROR: ${planResult.error.code} — ${planResult.error.message}`);
    return { name, planOk: false, tPlan, tIdx, events: 0, taskOutcome: "plan failed" };
  }
  const plan = planResult.value;
  console.log(`  Plan: ${plan.graph.nodes.length} nodes, ${plan.graph.edges.length} edges, ${plan.graph.entryPoints.length} entry points`);
  console.log(`  Policy: maxParallel=${plan.policy.maxParallel}, timeout=${plan.policy.defaultTimeout}ms, retries=${plan.policy.defaultRetries}`);
  for (const node of plan.graph.nodes) {
    console.log(`    - ${node.id}: ${node.step} [cap=${node.capability}, tool=${node.toolName || "(runtime-resolve)"}, deps=[${node.dependsOn.join(",")}], group=${node.parallelGroup || "(none)"}]`);
  }

  // Validate plan
  const validator = new PlanValidator();
  const valid = validator.validate(plan, allCapabilities);
  console.log(`  Validation: ${valid.ok ? "PASS" : "FAIL"}`);
  if (!valid.ok) console.log(`    ${valid.error.message}`);

  // Runtime
  const runtime = createRuntime(toolRegistry);
  const tRun0 = nowMs();
  try {
    // Set a hard timeout to avoid hanging on permission.requested
    const timeoutMs = 15000;
    const runPromise = (async () => {
      for await (const event of runtime.run(plan, context)) {
        events.push(event);
        const ev = event as any;
        if (ev.type === "task.completed" || ev.type === "task.failed" || ev.type === "task.cancelled") {
          taskEnded = true;
          taskOutcome = ev.type;
        }
        // Log event
        if (ev.type === "node.started") console.log(`  [node.started] ${ev.nodeId} tool=${ev.tool}`);
        else if (ev.type === "node.completed") console.log(`  [node.completed] ${ev.nodeId}`);
        else if (ev.type === "node.failed") console.log(`  [node.failed] ${ev.nodeId} ${ev.error?.code}`);
        else if (ev.type === "node.skipped") console.log(`  [node.skipped] ${ev.nodeId} ${ev.reason}`);
        else if (ev.type === "permission.requested") console.log(`  [permission.requested] ${ev.nodeId} tool=${ev.tool}`);
        else if (ev.type === "task.completed") console.log(`  [task.completed] ${ev.summary?.substring(0, 80)}`);
        else if (ev.type === "task.failed") console.log(`  [task.failed] ${ev.error?.code} ${ev.error?.message?.substring(0, 80)}`);
        else if (ev.type === "task.cancelled") console.log(`  [task.cancelled] ${ev.reason}`);
      }
    })();

    await Promise.race([
      runPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`HARD TIMEOUT ${timeoutMs}ms`)), timeoutMs)),
    ]);
  } catch (e: any) {
    console.log(`  ⚠️ ${e.message}`);
    taskOutcome = `timeout/hang: ${e.message}`;
    runtime.cancel("e2e");
  }
  const tRun = nowMs() - tRun0;
  const memAfter = memMB();

  // Event tally
  const tally: Record<string, number> = {};
  for (const e of events) tally[(e as any).type] = (tally[(e as any).type] || 0) + 1;
  console.log(`\n[Runtime] ${fmtMs(tRun)} | ${events.length} events | outcome=${taskOutcome}`);
  console.log(`  Event tally: ${JSON.stringify(tally)}`);
  console.log(`  Memory: ${memBefore.heapUsed} → ${memAfter.heapUsed} MB heap`);

  return { name, planOk: true, tPlan, tIdx, tRun, events: events.length, tally, taskOutcome, planNodeCount: plan.graph.nodes.length };
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  VALIDATION 10 — End-to-End Scenarios + Benchmark              ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  const spm = buildSmallSPM();
  console.log(`SPM: ${spm.files.length} files, ${spm.symbols.length} symbols, ${spm.edges.length} edges, ${spm.issues.length} issues`);

  const results: any[] = [];

  // Scenario 1: Explain Authentication Architecture
  results.push(await runScenario("S1: Explain Authentication Architecture", spm, "Explain the authentication architecture of this project"));

  // Scenario 2: Find Performance Issues
  results.push(await runScenario("S2: Find Performance Issues", spm, "Find performance issues in this codebase"));

  // Scenario 3: Fix Login Bug (would need write tools + permission — expected to hang/fail)
  results.push(await runScenario("S3: Fix Login Bug", spm, "Fix the login bug where DB errors are unhandled"));

  // Scenario 4: Refactor Repository
  results.push(await runScenario("S4: Refactor Repository", spm, "Refactor the authentication code into a consolidated AuthService class"));

  // Summary
  console.log("\n\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  E2E SUMMARY                                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log("Scenario | Plan OK | Plan ms | Run ms | Events | Outcome");
  for (const r of results) {
    console.log(`${r.name.substring(0, 40).padEnd(40)} | ${r.planOk ? "✓" : "✗"} | ${fmtMs(r.tPlan).padStart(8)} | ${fmtMs(r.tRun || 0).padStart(8)} | ${String(r.events).padStart(6)} | ${r.taskOutcome}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
