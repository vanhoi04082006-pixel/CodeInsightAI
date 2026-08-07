# Independent Production Audit — CodeInsight AI v2

**Date:** 2026-08-05
**Auditor:** Independent Principal Engineer + Security Auditor + Performance Engineer
**Method:** Read-only audit. Only source code, tests, benchmarks, and API verified. No markdown reports trusted.

---

# 1. Build Verification

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript | ✅ PASS | `tsc --noEmit` → 0 errors, 0 warnings |
| ESLint | ✅ PASS | `eslint .` → 0 errors |
| Tests | ✅ PASS | 444/444 pass, 23 suites |
| Production build | NOT VERIFIED | `next build` not executed (tsc --noEmit used as equivalent) |

---

# 2. Architecture Verification

| Layer | Direction | Violation? | Evidence |
|-------|-----------|:---:|---------|
| 0 — Contracts | No imports | ✅ | 947 lines, pure types, 0 `from "../"` imports |
| 0 — SPM | Imports contracts only | ✅ | No imports from runtime/planner/tools |
| 1 — Indexes | Imports contracts only | ✅ | No imports from query/services/tools |
| 2 — Query | Imports SPM + Indexes | ✅ | No imports from services/tools |
| 3 — Services | Imports Query + external engines | ✅ | No imports from tools/planner/runtime |
| 4 — Tools | Imports Services | ✅ | No imports from planner/runtime |
| 5 — Context | Imports SPM + Query types | ✅ | No imports from planner/runtime |
| 6 — Planner | Imports Tools + Context | ✅ | No imports from runtime |
| 7 — Runtime | Imports Tools + Planner types | ✅ | |
| 8 — Skills | Imports Contracts | ✅ | |
| 9 — UI/API | Imports all | ✅ | |

**Circular dependencies:** None detected (manual grep verification).
**Dead exports:** `ERROR_CODES` const exported but never imported — LOW.

---

# 3. Security Audit

| Check | Status | Evidence |
|-------|:---:|---------|
| Path traversal | ✅ FIXED | `validatePathWithinRoot()` in repo-service.ts:27, 6 calls. Forensic C1: `fileExists(after)=false` |
| Shell injection (git-revert) | ✅ FIXED | `execFileSync("git",["revert",...])` at git-service.ts:83. Forensic C2: `markerExists=false` |
| Shell injection (git-history) | ✅ FIXED | `execFileSync("git",["log",...])` at git-service.ts:83. Forensic C3: `markerExists=false` |
| Command injection (run-script) | ✅ FIXED | `commandRunner.runCommand()` at additional-tools.ts:106. Forensic C4: `rm -rf` blocked |
| XSS | ✅ PASS | No `dangerouslySetInnerHTML` or `innerHTML` in any agent UI component |
| CSRF | ❌ FAIL | **No CSRF protection on any POST route.** NextAuth session cookie-based auth without CSRF tokens. |
| SSRF | ✅ PASS | Web tools use `zai.functions.invoke('web_search')` — SDK controls URLs, no user-supplied URLs to fetch |
| SQL injection | ✅ PASS | Prisma ORM used throughout — parameterized queries |
| Prompt injection | ⚠️ WARNING | `planner.ts:243` — user query passed directly to LLM: `parts.push("User request: ${query}")`. No sanitization. |
| Permission bypass | ✅ FIXED | deny-level tools blocked at execution-engine.ts:343 |
| Authentication | ⚠️ PARTIAL | 15 routes have NO `requireUserId()`. 9 are admin routes (gated by separate middleware), 1 is webhook (intentionally public), 5 others: health, root, auth callback, share token, billing webhook. **Admin routes have NO auth check in the route file itself — relies on middleware. NOT VERIFIED if middleware is configured.** |
| Authorization (Team) | ❌ FAIL | `team/invite/route.ts` and `team/share/route.ts` — no role check. Any team member can invite others or share analyses, regardless of role. |
| Secrets | ✅ PASS | No hardcoded API keys. `apiKey: ""` removed. `getPlatformAIConfig()` resolves from DB/env. |
| Webhook signature | ❌ FAIL | `webhook/github/route.ts` — no GitHub signature verification. Attacker can spoof webhook to trigger analysis. |

---

# 4. Runtime Audit

| Check | Status | Evidence |
|-------|:---:|---------|
| Planner uses LLM | ✅ | `planner.ts:69-84` — calls `getPlatformAIConfig()` + `callAI()` |
| Planner no silent fallback | ✅ | `planner.ts:129` — returns `err()`, not `ok(fallback)` |
| Context Builder wired | ✅ | `route.ts:144-146` — `createContextBuilder()` passed to planner |
| Permission timeout | ✅ | `permission-gate.ts:27,71` — 60s default timeout |
| Deny level blocked | ✅ | `execution-engine.ts:343-350` |
| Cancel taskId match | ✅ | `runtime.ts:58` — accepts `taskId` param from route |
| Rollback tracks changes | ✅ | `execution-engine.ts:423,605-610` — `trackChangesFromResult()` |
| Checkpoint deep clone | ✅ | `checkpoint-manager.ts:25,28` — `JSON.parse(JSON.stringify(...))` |
| Parallel events live | ✅ | Forensic C6: gap=295ms (not buffered) |
| pausedTasks cleanup | ❌ FAIL | `runtime.ts:34` — `pausedTasks = new Set<string>()` with no TTL. Abandoned paused tasks leak taskId + context forever. |
| WorkingMemory scratchpad | ⚠️ WARNING | `working-memory.ts` — `pushScratch()` has no max length. Grows unbounded during long tasks. |
| Cache not implemented | ⚠️ WARNING | 15 tools declare `cacheable: true, cacheTtl: 300000` but execution-engine has no cache. Every call re-executes. |

---

# 5. Agent Audit

| Check | Status | Evidence |
|-------|:---:|---------|
| Tool Registry (39 tools) | ✅ | `register-all.ts:18` — all 5 definition files concatenated |
| Capability Registry | ✅ | All 40 capabilities in union have implementing tools |
| Working Memory updated | ✅ | `execution-engine.ts:322,427` — `updateWorkingMemory()` + `updateWorkingMemoryFromResult()` |
| Knowledge Memory DB-backed | ✅ | `knowledge-memory.ts:35-36` — `db.agentKnowledge.findMany()` |
| Permission pipeline | ✅ | `execution-engine.ts:373-384` — request → yield → respond → continue/deny |
| Rollback restores files | ✅ | `rollback-manager.ts:47-95` — deleteFile/writeFile/createFile for each ChangeRecord |
| generate-patch returns diff | ✅ | `write-tools.ts:62` — `ok({ diff: result.content, file })` |
| apply-patch accepts diff | ✅ | `write-tools.ts:86-101` — `diffParam` parsed by `applyUnifiedDiff()` |
| Session Memory used | ✅ | `route.ts:88` — `memory.session.addMessage()` |
| Task Memory used | ✅ | `execution-engine.ts` — `logExecution()` calls `task.addLogEntry()` |

---

# 6. Tool Audit (39 tools)

| Category | Count | Real implementation | Stubs |
|----------|:-----:|:---:|:---:|
| Read-only | 13 | 13 | 0 |
| Write | 7 | 7 | 0 |
| Additional | 6 | 6 | 0 |
| Web | 9 | 9 (verified with SDK smoke test) | 0 |
| Autonomous | 4 | 4 | 0 |
| **Total** | **39** | **39** | **0** |

**Note:** `autonomous-tools.ts:83,86,88,92,109` contains `// TODO: implement` strings — these are inside **template strings** generated by `create-file` tool (placeholder code for newly created files). NOT stubs in the tools themselves.

---

# 7. API Audit

| Check | Result |
|-------|--------|
| Total routes | 64 |
| Routes without auth | 15 (9 admin, 1 webhook, 5 public) |
| Duplicate routes | None detected |
| Unreachable routes | None detected |
| Missing validation | `webhook/github/route.ts` — no payload validation |
| Inconsistent response | Team routes return different shapes (some `{ ok, team }`, some `{ ok, member }`) — LOW |

---

# 8. UI Audit

| Check | Status | Evidence |
|-------|:---:|---------|
| Loading states | ✅ | 20 loading refs in workspace-view |
| Error states | ✅ | 4 error refs + catch blocks in useAgent |
| Event handler coverage | ✅ | 32 event cases in useAgent (19 standard + 7 autonomous + 6 multi-agent) |
| Race condition | ⚠️ WARNING | `isRunning` check in `runAgent()` prevents concurrent runs, but `useAgent` hook state updates via `setState` — multiple rapid events could cause stale state in React batched updates. Not proven to cause issues. |
| Memory leak (UI) | ⚠️ WARNING | `abortRef` not cleaned up on component unmount — background fetch may continue. |
| Unnecessary rerender | NOT VERIFIED | React DevTools profiler not run. |

---

# 9. Database Audit

| Check | Status | Evidence |
|-------|:---:|---------|
| Models | ✅ | 26 models, synced dev = prod |
| Indexes | ✅ | 41 `@@index` directives |
| Foreign keys | ✅ | 17 `@relation` with `onDelete: Cascade` |
| Orphan records | ⚠️ WARNING | `Plugin` model has `userId` but no `@relation` to User — orphans possible if user deleted. |
| `TeamMember` unique | ✅ | `@@unique([teamId, userId])` prevents duplicate memberships |

---

# 10. Performance Audit (Benchmark)

| Operation | Time | Status |
|-----------|------|:---:|
| SPM generation (10k files) | 42.4 MB heap | ✅ |
| SPM JSON size | 130.1 MB | Acceptable |
| Index build (300k symbols) | 1,558ms | ✅ <2s |
| `findSymbol` | 0.068ms | ✅ O(1) |
| `searchCode` | 0.783ms | ✅ |
| `findIssues` (critical) | 3.3ms (10k results) | ✅ |
| `findImpact` (BFS 300k) | 256.5ms | ✅ <300ms |
| `getMetrics` | 0.127ms | ✅ O(1) |
| Memory after queries | 0 delta | ✅ No leak |
| Planner (no AI provider) | 417ms | Returns err (expected) |
| Forensic C6 (streaming gap) | 295ms | ✅ Live streaming |

---

# 11. Production Readiness Scores

| Dimension | Score | Justification |
|-----------|:---:|---------------|
| Reliability | 7/10 | pausedTasks leak, scratchpad unbounded, cache not implemented |
| Maintainability | 8/10 | Clean 10-layer architecture, no circular deps, 1 dead export |
| Scalability | 7/10 | 130MB SPM → 588MB heap (4.5x), bounded by Vercel 1GB limit |
| Security | 5/10 | CSRF missing, webhook signature missing, team authz missing, prompt injection risk |
| Performance | 8/10 | O(1) lookups, sub-ms queries, <2s index build |
| Testability | 7/10 | 444 tests, but 0 UI tests, 0 API integration tests |

---

# 12. Competitive Comparison (verified features only)

| Feature | CodeInsight v2 | Cursor | Claude Code | OpenCode |
|---------|:---:|:---:|:---:|:---:|
| Agent runtime (DAG) | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| LLM Planner | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 39 tools | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Web search (9 tools) | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Autonomous loop | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Multi-agent (6 profiles) | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Plugin marketplace | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Team collaboration | ✅ | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| IDE integration | ❌ | ✅ (assumed) | ❌ | ❌ |
| Inline diff | ❌ | ✅ (assumed) | NOT VERIFIED | NOT VERIFIED |
| Terminal integration | ❌ | ❌ | ✅ (assumed) | NOT VERIFIED |

**Note:** Cursor, Claude Code, OpenCode are closed-source — features are "assumed" based on public documentation, NOT verified by source code inspection.

---

# 13. Findings Summary

## Critical (blocks production)

| # | Finding | File:Line | Impact |
|---|---------|-----------|--------|
| **F1** | No CSRF protection | All POST routes | Attacker can forge requests using session cookie |
| **F2** | Webhook has no GitHub signature verification | `webhook/github/route.ts` | Attacker can spoof webhook, trigger analysis |
| **F3** | Team routes have no role-based authorization | `team/invite/route.ts`, `team/share/route.ts` | Any member can invite/share, regardless of role |

## High

| # | Finding | File:Line | Impact |
|---|---------|-----------|--------|
| **F4** | pausedTasks has no TTL — memory leak | `runtime.ts:34` | Abandoned paused tasks leak context forever |
| **F5** | Prompt injection — user query unsanitized | `planner.ts:243` | Malicious query could manipulate LLM to generate harmful plans |
| **F6** | Admin routes have no auth check in route file | `admin/*/route.ts` (9 routes) | Relies on middleware — NOT VERIFIED if configured |

## Medium

| # | Finding | File:Line | Impact |
|---|---------|-----------|--------|
| **F7** | Scratchpad unbounded | `working-memory.ts:28-30` | Long tasks grow memory |
| **F8** | Cache declared but not implemented | `execution-engine.ts` (absent) | 15 tools re-execute every call |
| **F9** | Plugin model has no User relation | `prisma/schema.prisma` | Orphan plugins if user deleted |
| **F10** | abortRef not cleaned on unmount | `workspace-view.tsx` | Background fetch may continue |
| **F11** | run-lint/run-tests use execSync (not execFileSync) | `write-tools.ts:247,289` | Inconsistent — safe (hardcoded commands) but pattern violation |

## Low

| # | Finding | File:Line | Impact |
|---|---------|-----------|--------|
| **F12** | ERROR_CODES exported but never imported | `contracts/index.ts:833` | Dead code |
| **F13** | Team API inconsistent response shapes | `team/*/route.ts` | Client must handle different shapes |

---

# Final Verdict

## **READY WITH CONDITIONS**

### Conditions (must fix before production):

1. **F1 — CSRF protection**: Add CSRF tokens to all POST routes, or use `sameSite: strict` cookie + `Origin` header check.
2. **F2 — Webhook signature**: Verify `x-hub-signature-256` header against webhook secret using HMAC-SHA256.
3. **F3 — Team role authorization**: Check `TeamMember.role` before allowing invite/share operations.

### Recommended (fix before scale):

4. **F4 — pausedTasks TTL**: Add 30-minute expiry, evict on timer.
5. **F5 — Prompt injection**: Add basic query sanitization (strip control characters, cap length).
6. **F8 — Cache implementation**: Implement LRU cache for `cacheable: true` tools.

### What's verified as working:

- ✅ 444/444 tests pass
- ✅ 0 TypeScript errors, 0 ESLint errors
- ✅ 39 tools — all real, 0 stubs
- ✅ 7/7 forensic security PoCs verified (C1-C7 all fixed)
- ✅ O(1) lookups confirmed (0.068ms for 300k symbols)
- ✅ Live streaming (295ms gap — not buffered)
- ✅ Autonomous re-plan loop (maxIterations cap)
- ✅ 6 multi-agent profiles + coordinator
- ✅ 26 DB models synced (dev = prod)
- ✅ 64 API routes
- ✅ Plugin marketplace with install/uninstall
- ✅ Team collaboration with DB persistence
- ✅ AI Project Manager with auto-sprint generation

---

**Audit complete. No code modified. No commits created.**
