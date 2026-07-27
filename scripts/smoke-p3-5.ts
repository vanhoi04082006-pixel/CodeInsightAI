// P3.5 Smoke Test — policy engine (catalog + evaluator + loader + cache).
//
// Exercises the pure evaluator against each of the 8 fixed-catalog policy
// types, plus the DB-backed loader (create via db.policy.createMany,
// loadPolicies, clearPolicyCache). Does NOT exercise the admin API or the
// /api/analyze checkpoint integration — those require a running Next.js
// server and are verified by the audit table in worklog P3.5.
import { db } from "../src/lib/db";
import {
  evaluatePolicies,
  hasBlockingViolation,
  blockingViolations,
} from "../src/lib/policies/evaluator";
import {
  POLICY_CATALOG,
  defaultConfigForType,
  isPolicyType,
  type Policy,
} from "../src/lib/policies/types";
import { loadPolicies, clearPolicyCache } from "../src/lib/policies/policy-loader";

async function main() {
  // ── 1. Catalog integrity ──
  if (POLICY_CATALOG.length !== 8) {
    throw new Error(`Expected 8 catalog entries, got ${POLICY_CATALOG.length}`);
  }
  console.log(`✓ Catalog has ${POLICY_CATALOG.length} policy types`);

  // Each catalog entry has a unique type.
  const types = POLICY_CATALOG.map((e) => e.type);
  if (new Set(types).size !== types.length) {
    throw new Error("Duplicate policy types in catalog");
  }
  console.log(`✓ All catalog types are unique: ${types.join(", ")}`);

  // ── 2. defaultConfigForType ──
  const maxFilesDefault = defaultConfigForType("max-files");
  if (maxFilesDefault.maxFiles !== 1000) {
    throw new Error(
      `Expected max-files default maxFiles=1000, got ${maxFilesDefault.maxFiles}`,
    );
  }
  console.log(
    `✓ defaultConfigForType('max-files') = ${JSON.stringify(maxFilesDefault)}`,
  );

  // require-auth has empty configSchema → empty default config.
  const authDefault = defaultConfigForType("require-auth");
  if (Object.keys(authDefault).length !== 0) {
    throw new Error(
      `Expected empty config for require-auth, got ${JSON.stringify(authDefault)}`,
    );
  }
  console.log(`✓ defaultConfigForType('require-auth') = {} (no config)`);

  // ── 3. isPolicyType guard ──
  if (!isPolicyType("max-files")) throw new Error("isPolicyType should accept 'max-files'");
  if (isPolicyType("evil-eval")) throw new Error("isPolicyType should reject 'evil-eval'");
  console.log(`✓ isPolicyType accepts known, rejects unknown`);

  // ── 4. Evaluator — max-files BLOCK ──
  const maxFilesPolicy: Policy = {
    id: "p1",
    type: "max-files",
    enabled: true,
    config: { maxFiles: 5 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let v = evaluatePolicies([maxFilesPolicy], { fileCount: 10 });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(
      `Expected 1 block violation for fileCount=10 > maxFiles=5, got ${JSON.stringify(v)}`,
    );
  }
  console.log(`✓ max-files: fileCount=10 > maxFiles=5 → BLOCK (${v[0].reason})`);

  // Below threshold → no violation.
  v = evaluatePolicies([maxFilesPolicy], { fileCount: 3 });
  if (v.length !== 0) {
    throw new Error(`Expected 0 violations for fileCount=3 <= 5, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ max-files: fileCount=3 <= maxFiles=5 → no violation`);

  // Missing fileCount → skipped (no false-positive).
  v = evaluatePolicies([maxFilesPolicy], {});
  if (v.length !== 0) {
    throw new Error(`Expected 0 violations when fileCount missing, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ max-files: missing fileCount → skipped`);

  // ── 5. Evaluator — block-provider BLOCK ──
  const blockProvider: Policy = {
    id: "p2",
    type: "block-provider",
    enabled: true,
    config: { providerId: "openai" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([blockProvider], { providerId: "openai" });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for openai, got ${JSON.stringify(v)}`);
  }
  v = evaluatePolicies([blockProvider], { providerId: "anthropic" });
  if (v.length !== 0) {
    throw new Error(`Expected no block for anthropic, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ block-provider: openai blocked, anthropic passes`);

  // ── 6. Evaluator — block-language BLOCK (case-insensitive) ──
  const blockLang: Policy = {
    id: "p3",
    type: "block-language",
    enabled: true,
    config: { languages: "PHP,Perl" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([blockLang], { languages: ["TypeScript", "php"] });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for php (case-insensitive), got ${JSON.stringify(v)}`);
  }
  console.log(`✓ block-language: 'php' matches blocked 'PHP' (case-insensitive)`);

  // ── 7. Evaluator — block-private-repos BLOCK ──
  const blockPriv: Policy = {
    id: "p4",
    type: "block-private-repos",
    enabled: true,
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([blockPriv], { isPrivateRepo: true });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for private repo, got ${JSON.stringify(v)}`);
  }
  v = evaluatePolicies([blockPriv], { isPrivateRepo: false });
  if (v.length !== 0) {
    throw new Error(`Expected no block for public repo, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ block-private-repos: private blocked, public passes`);

  // ── 8. Evaluator — max-tokens-per-call WARN (not block) ──
  const maxTokensPolicy: Policy = {
    id: "p5",
    type: "max-tokens-per-call",
    enabled: true,
    config: { maxTokens: 4000 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([maxTokensPolicy], { maxTokens: 8000 });
  if (v.length !== 1 || v[0].severity !== "warn") {
    throw new Error(`Expected WARN for maxTokens=8000 > 4000, got ${JSON.stringify(v)}`);
  }
  if (hasBlockingViolation(v)) {
    throw new Error(`max-tokens-per-call should NOT be a blocking violation`);
  }
  console.log(`✓ max-tokens-per-call: maxTokens=8000 > 4000 → WARN (not block)`);

  // ── 9. Evaluator — allowed-models-only BLOCK ──
  const allowedModels: Policy = {
    id: "p6",
    type: "allowed-models-only",
    enabled: true,
    config: { models: "gpt-4o-mini,claude-3-haiku" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([allowedModels], { model: "gpt-4" });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for gpt-4 not in allowed, got ${JSON.stringify(v)}`);
  }
  v = evaluatePolicies([allowedModels], { model: "gpt-4o-mini" });
  if (v.length !== 0) {
    throw new Error(`Expected pass for gpt-4o-mini in allowed, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ allowed-models-only: 'gpt-4' blocked, 'gpt-4o-mini' passes`);

  // ── 10. Evaluator — require-auth BLOCK ──
  const requireAuth: Policy = {
    id: "p7",
    type: "require-auth",
    enabled: true,
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  v = evaluatePolicies([requireAuth], {});
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for missing userId, got ${JSON.stringify(v)}`);
  }
  v = evaluatePolicies([requireAuth], { userId: "u1" });
  if (v.length !== 0) {
    throw new Error(`Expected pass for userId set, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ require-auth: missing userId → BLOCK, present → passes`);

  // ── 11. Evaluator — max-file-size BLOCK ──
  const maxSize: Policy = {
    id: "p8",
    type: "max-file-size",
    enabled: true,
    config: { maxMb: 5 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // 6 MB > 5 MB limit
  v = evaluatePolicies([maxSize], { fileSizeBytes: 6 * 1024 * 1024 });
  if (v.length !== 1 || v[0].severity !== "block") {
    throw new Error(`Expected block for 6MB > 5MB, got ${JSON.stringify(v)}`);
  }
  // 4 MB < 5 MB limit
  v = evaluatePolicies([maxSize], { fileSizeBytes: 4 * 1024 * 1024 });
  if (v.length !== 0) {
    throw new Error(`Expected pass for 4MB <= 5MB, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ max-file-size: 6MB > 5MB → BLOCK, 4MB <= 5MB → passes`);

  // ── 12. Disabled policies are skipped ──
  const disabled: Policy = { ...maxFilesPolicy, enabled: false };
  v = evaluatePolicies([disabled], { fileCount: 1000 });
  if (v.length !== 0) {
    throw new Error(`Expected disabled policy to be skipped, got ${JSON.stringify(v)}`);
  }
  console.log(`✓ Disabled policies are skipped`);

  // ── 13. hasBlockingViolation + blockingViolations helpers ──
  const mixed = evaluatePolicies(
    [maxFilesPolicy, maxTokensPolicy],
    { fileCount: 10, maxTokens: 8000 },
  );
  if (mixed.length !== 2) {
    throw new Error(`Expected 2 violations (block + warn), got ${mixed.length}`);
  }
  if (!hasBlockingViolation(mixed)) {
    throw new Error(`Expected hasBlockingViolation=true`);
  }
  if (blockingViolations(mixed).length !== 1) {
    throw new Error(`Expected 1 blocking violation, got ${blockingViolations(mixed).length}`);
  }
  console.log(
    `✓ hasBlockingViolation + blockingViolations: 1 block + 1 warn = 2 total, 1 blocking`,
  );

  // ── 14. DB-backed loader (loadPolicies + clearPolicyCache) ──
  // Clean up any prior rows from a previous failed run.
  await db.policy.deleteMany({ where: { type: "max-files" } }).catch(() => {});
  await db.policy.create({
    data: {
      type: "max-files",
      enabled: true,
      config: JSON.stringify({ maxFiles: 5 }),
    },
  });
  clearPolicyCache();
  const loaded = await loadPolicies();
  const loadedMaxFiles = loaded.find((p) => p.type === "max-files");
  if (!loadedMaxFiles || loadedMaxFiles.config.maxFiles !== 5) {
    throw new Error(
      `Expected to load max-files policy with maxFiles=5, got ${JSON.stringify(loadedMaxFiles)}`,
    );
  }
  console.log(
    `✓ loadPolicies: loaded ${loaded.length} enabled policies from DB (max-files maxFiles=5)`,
  );

  // ── 15. Cache: second call doesn't hit DB (returns same ref) ──
  const loaded2 = await loadPolicies();
  if (loaded2 !== loaded) {
    throw new Error(`Expected cached policies to return same ref`);
  }
  console.log(`✓ Policy cache: 2nd loadPolicies() returns cached ref (no DB hit)`);

  // ── 16. Disabled policies are filtered by the loader ──
  await db.policy.updateMany({
    where: { type: "max-files" },
    data: { enabled: false },
  });
  clearPolicyCache();
  const loadedDisabled = await loadPolicies();
  if (loadedDisabled.some((p) => p.type === "max-files")) {
    throw new Error(`Disabled max-files policy should not be loaded`);
  }
  console.log(`✓ loadPolicies: disabled policies filtered out`);

  // ── 17. Cleanup ──
  await db.policy.deleteMany({ where: { type: "max-files" } });
  clearPolicyCache();
  console.log(`✓ Cleanup done`);

  console.log("\n✅ ALL P3.5 SMOKE TESTS PASSED");
}

main()
  .catch((e) => {
    console.error("❌ SMOKE TEST FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
