# Critical Findings Verification Report

**Date:** 2026-08-03
**Method:** Each finding verified with an executable PoC against REAL production code (no mocks of the code under test). All PoCs are in `src/lib/agent/__tests__/audit/verify-critical.test.ts` and pass.

---

# VERIFICATION TABLE

| # | Finding | Status | Confidence | Evidence |
|---|---------|--------|:---:|----------|
| C1 | Path traversal via apply-patch | **CONFIRMED** | 100% | PoC wrote file to `/tmp/verify-c1-*/pwned-by-llm.txt` (outside project root) |
| C2 | Shell injection via git-revert | **CONFIRMED** | 100% | PoC executed `touch` via `;` in commitSha |
| C3 | Shell injection via git-history | **CONFIRMED** | 100% | PoC executed `touch` via `$()` in file param |
| C4 | run-script RCE + denylist bypass | **CONFIRMED** | 100% | PoC wrote file via `echo >`; deleted file via `rm` (denylist bypassed) |
| C5 | Cancel taskId mismatch | **CONFIRMED** | 100% | PoC: route taskId → task.completed (not cancelled); correct taskId → task.cancelled |
| C6 | Parallel events buffered (fake streaming) | **CONFIRMED** | 100% | PoC: n1.completed arrived at t=301ms (same as n2), not at ~5ms |
| C7 | Rollback partial failure inconsistent state | **CONFIRMED** | 100% | PoC: f3 deleted, f2+f1 remain, changes=3 (not cleared on failure) |

**All 7 Critical findings are REPRODUCIBLE.**

---

# DETAILED EVIDENCE

## C1 — Path traversal via apply-patch
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/tools/definitions/write-tools.ts:81-91` → `src/lib/agent/services/repo-service.ts:104-121` → `src/lib/repo-editor/file-operations.ts:31-35`

**Execution path:**
1. `applyPatchTool.execute({file, content})` (write-tools.ts:81)
2. `repo.writeFileAsync(file, content)` (repo-service.ts:104)
3. `fileOps.writeFile(p, content)` (file-operations.ts:31)
4. `fs.mkdir(dir, {recursive: true})` + `fs.writeFile(p, content)` — NO path validation

**Expected behavior (secure):** Reject paths outside project root.
**Actual behavior (vulnerable):** Writes to any path.

**PoC output:**
```json
{
  "targetFile": "/tmp/verify-c1-Icty30/pwned-by-llm.txt",
  "outsideProjectRoot": true,
  "resultOk": true,
  "fileExists": true,
  "fileContent": "ARBITRARY CONTENT FROM LLM"
}
```

**Exploitability:** High — LLM-controlled `file` param. Prompt injection → write to `~/.ssh/authorized_keys` or `/etc/cron.d/`.
**Production impact:** Full server compromise.
**Severity: Critical (RCE-equivalent)**

---

## C2 — Shell injection via git-revert
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/services/git-service.ts:104-118`

**Execution path:**
1. `gitRevertTool.execute({commitSha})` (additional-tools.ts:71-83)
2. `git.revertAsync(commitSha)` (git-service.ts:104)
3. `execSync(`git revert --no-edit ${commitSha}`)` — `commitSha` UNQUOTED

**Expected behavior (secure):** `commitSha` quoted/sanitized; shell metacharacters rejected.
**Actual behavior (vulnerable):** Shell metacharacters in `commitSha` are evaluated.

**PoC output:**
```json
{
  "maliciousSha": "nonexistent; touch /tmp/verify-c2-marker-1785761855083.txt",
  "resultOk": true,
  "markerCreated": true
}
```

**Exploitability:** High — LLM-controlled `commitSha`. `commitSha = "abc; rm -rf /"` → arbitrary command.
**Production impact:** Full server compromise.
**Severity: Critical (RCE)**

---

## C3 — Shell injection via git-history
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/services/git-service.ts:76-102`

**Execution path:**
1. `gitHistoryTool.execute({file})` (additional-tools.ts:47-60)
2. `git.historyAsync(file, limit)` (git-service.ts:76)
3. `execSync(`git log -- ... -- ${JSON.stringify(file)}`)` — `JSON.stringify` wraps in `"` but `$()` evaluates inside double quotes

**Expected behavior (secure):** `$()` not evaluated.
**Actual behavior (vulnerable):** `$()` evaluated as command substitution.

**PoC output:**
```json
{
  "maliciousFile": "$(touch /tmp/verify-c3-marker-1785761855114.txt)",
  "jsonStringified": "\"$(touch /tmp/verify-c3-marker-1785761855114.txt)\"",
  "resultOk": false,
  "markerCreated": true
}
```
Note: `resultOk: false` (git log failed) but `markerCreated: true` (the `touch` ran BEFORE git, via command substitution).

**Exploitability:** High — LLM-controlled `file` param.
**Production impact:** Full server compromise.
**Severity: Critical (RCE)**

---

## C4 — run-script RCE + denylist bypass
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/tools/definitions/additional-tools.ts:87-116`

**Execution path:**
1. `runScriptTool.execute({command})` (additional-tools.ts:95)
2. `execSync(command, ...)` — raw LLM-controlled command, NO allowlist/denylist check

**Expected behavior (secure):** Command routed through `commandRunner` + permission-system (allowlist/denylist).
**Actual behavior (vulnerable):** `execSync` runs ANY command directly.

**PoC output (RCE):**
```json
{
  "cmd": "sh -c 'echo PWNED > \"/tmp/verify-c4-marker-1785761855122.txt\"'",
  "resultOk": true,
  "markerCreated": true,
  "content": "PWNED"
}
```

**PoC output (denylist bypass):**
```json
{
  "resultOk": true,
  "deleted": true
}
```
The `rm` command ran despite the terminal permission-system's denylist — `run-script` uses `execSync` directly, NOT `commandRunner`.

**Exploitability:** High — LLM-controlled `command` param. Once user approves (or auto-approves), ANY command runs.
**Production impact:** Full server compromise.
**Severity: Critical (RCE + denylist bypass)**

---

## C5 — Cancel taskId mismatch
**Status: CONFIRMED (Critical)**

**Source:** `src/app/api/agent/run/route.ts:159` vs `src/lib/agent/runtime/runtime.ts:52`

**Execution path (route's cancel flow):**
1. Route generates `taskId = task-${Date.now()}` (route.ts:159)
2. Route registers runtime: `activeRuntimes.set(routeTaskId, { cancel: (tid) => runtime.cancel(tid) })` (route.ts:163-166)
3. Runtime internally generates a DIFFERENT `taskId = task-${Date.now()}` (runtime.ts:52)
4. Runtime registers engine under INTERNAL taskId: `activeEngines.set(internalTaskId, engine)` (runtime.ts:61)
5. Cancel endpoint calls `entry.cancel(routeTaskId)` → `runtime.cancel(routeTaskId)` (cancel/route.ts:48)
6. `runtime.cancel(routeTaskId)` does `activeEngines.get(routeTaskId)` → returns `undefined` (taskId mismatch)
7. `engine.cancel()` is NEVER called → execution continues

**Expected behavior:** Cancel stops the running task.
**Actual behavior:** Cancel is a no-op for the engine (only `permissionGate.cancelAll()` works).

**PoC output (route-style taskId — BROKEN):**
```json
{
  "routeTaskId": "task-route-1785761855139",
  "internalTaskIdsAfterCancel": [],
  "eventTypes": ["plan.generated", "node.started", "node.completed", "checkpoint.saved", "task.completed"],
  "taskCancelled": false,
  "taskCompleted": true
}
```

**PoC output (CORRECT internal taskId — WORKS):**
```json
{
  "realTaskId": "task-1785761857144",
  "taskCancelled": true,
  "completedCount": 3
}
```
With the correct taskId, cancel works (task.cancelled emitted, only 3/5 nodes completed). This PROVES the mismatch is the cause.

**Additional finding:** Cancel is only checked at the TOP of the while loop (execution-engine.ts:92), NOT during node execution. A long-running node cannot be interrupted — cancel only takes effect between waves. This is a separate but related reliability issue.

**Exploitability:** Medium — user cannot cancel runaway tasks.
**Production impact:** DoS — stuck tasks consume resources; user has no recourse.
**Severity: Critical (correctness + DoS)**

---

## C6 — Parallel events buffered (fake streaming)
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/runtime/execution-engine.ts:141-151, 259-279`

**Execution path:**
1. `executePlan` groups ready nodes (line 133)
2. `Promise.all(batch.map(drainNode))` (line 142) — runs all nodes in parallel
3. `drainNode` (line 259) runs `executeNodeGen` to completion, pushing events into `buffer`
4. Main loop `await Promise.all(...)` blocks until ALL nodes in batch complete
5. Events flushed AFTER all nodes finish (line 147-151)

**Expected behavior (live streaming):** n1 (fast, 5ms) events arrive at ~5ms; n2 (slow, 300ms) events arrive at ~300ms.
**Actual behavior (buffered):** ALL events arrive at ~301ms (after slowest completes).

**PoC output:**
```json
{
  "events": [
    {"type": "plan.generated", "t": 1},
    {"type": "node.started", "nodeId": "n1", "t": 301},
    {"type": "node.completed", "nodeId": "n1", "t": 301},
    {"type": "node.started", "nodeId": "n2", "t": 301},
    {"type": "node.completed", "nodeId": "n2", "t": 301}
  ],
  "n1StartedAt": 301,
  "n1CompletedAt": 301,
  "gap_n1_started_to_n1_completed": 0
}
```
n1 (5ms tool) completed at t=301ms, NOT t=5ms. All events batched.

**Exploitability:** N/A (UX issue, not security).
**Production impact:** User sees no progress for duration of slowest parallel node. "Streaming" is false advertising.
**Severity: Critical (false contract — "streaming" doesn't stream for parallel groups)**

---

## C7 — Rollback partial failure inconsistent state
**Status: CONFIRMED (Critical)**

**Source:** `src/lib/agent/runtime/rollback-manager.ts:47-85`

**Execution path:**
1. `rollback()` iterates `this.changes` in reverse (line 55-75)
2. If step N throws, `catch` returns `err` (line 79-84)
3. `this.changes = []` (line 77) is INSIDE the `try` — only runs on full success
4. On failure: `this.changes` still contains ALL changes (rolled-back + failed + not-attempted)

**Expected behavior (safe):** Either all-or-nothing, or `changes` array reflects actual state (remove successfully-rolled-back entries).
**Actual behavior (vulnerable):** `changes` retains all entries; filesystem is half-modified; second `rollback()` call would re-attempt already-rolled-back files.

**PoC output (partial failure):**
```json
{
  "resultOk": false,
  "f1Exists": true,   // never attempted
  "f2Exists": true,   // rollback failed
  "f3Exists": false,  // rolled back successfully
  "changesRemaining": 3  // NOT cleared — inconsistent
}
```

**PoC output (success case — for comparison):**
```json
{
  "firstAttempts": 1,
  "secondAttempts": 0,      // changes cleared on success
  "changesAfterFirst": 0
}
```
On SUCCESS, `changes` IS cleared (line 77 runs). The bug is ONLY on failure — but that's exactly when you need consistency most.

**Exploitability:** N/A (reliability issue, not security — but an attacker could trigger a failing rollback to corrupt state).
**Production impact:** After a failed rollback, filesystem is in an unknown state. A retry causes further damage. No recovery path.
**Severity: Critical (data integrity)**

---

# SUMMARY

## All 7 Critical findings are REPRODUCIBLE with executable proof.

| Finding | Reproducible? | Severity | Exploitability | Production Impact |
|---------|:---:|:---:|:---:|:---:|
| C1 Path traversal | ✅ YES | Critical | High (LLM → RCE) | Full server compromise |
| C2 git-revert injection | ✅ YES | Critical | High (LLM → RCE) | Full server compromise |
| C3 git-history injection | ✅ YES | Critical | High (LLM → RCE) | Full server compromise |
| C4 run-script RCE | ✅ YES | Critical | High (LLM → RCE + denylist bypass) | Full server compromise |
| C5 Cancel broken | ✅ YES | Critical | Medium (DoS) | Stuck tasks, no recourse |
| C6 Fake streaming | ✅ YES | Critical | N/A (UX) | False "streaming" contract |
| C7 Rollback inconsistency | ✅ YES | Critical | N/A (reliability) | Filesystem corruption |

## Were any findings REFUTED?

**No.** All 7 Critical findings from the Independent Audit are confirmed by executable PoCs against real production code.

## Were any findings PARTIAL?

**No.** All 7 are fully reproducible. One nuance discovered during verification:
- **C5 addendum:** Cancel is ALSO broken for mid-node execution (not just taskId mismatch). The `cancelled` flag is only checked between waves (execution-engine.ts:92), not during `executeNodeGen`. Even with the correct taskId, a long-running node cannot be interrupted. This makes C5 more severe than initially reported.

## Test artifacts

- **Verification tests:** `src/lib/agent/__tests__/audit/verify-critical.test.ts` (11 tests, all pass)
- **Full suite:** 436/436 tests pass (425 existing + 11 verification)
- **No production code modified** (read-only verification)

---

**Verification complete. All 7 Critical findings confirmed. The Independent Audit's conclusions are accurate.**
