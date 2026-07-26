// P3.1 Smoke Test — token budget enforcement
import { db } from "../src/lib/db";
import {
  getTokenUsage,
  checkTokenBudget,
  recordTokenUsage,
  TokenBudgetExceededError,
} from "../src/lib/billing/token-budget";

async function main() {
  const testEmail = "p3-1-smoke@test.local";
  await db.user.deleteMany({ where: { email: testEmail } }).catch(() => {});

  const user = await db.user.create({
    data: { email: testEmail, name: "P3.1 Smoke", plan: "free", role: "user" },
  });
  console.log(`✓ Created test user ${user.id} (plan=free)`);

  // 1. Initial state
  const initial = await getTokenUsage(user.id, "free");
  console.log(`✓ Initial: used=${initial.used}, limit=${initial.limit}, exceeded=${initial.exceeded}`);
  if (initial.exceeded) throw new Error("Expected initial NOT exceeded");
  if (initial.limit !== 1_000_000) throw new Error(`Expected free limit 1_000_000, got ${initial.limit}`);

  // 2. Record usage exceeding the limit
  await recordTokenUsage(user.id, 800_000, 400_000, 1_200_000);
  console.log(`✓ Recorded 1.2M tokens (over 1M free limit)`);

  // 3. Check budget — should be blocked
  const blocked = await checkTokenBudget(user.id, "free");
  if (!blocked.allowed && blocked.status) {
    console.log(`✓ Blocked: used=${blocked.status.used}, limit=${blocked.status.limit}, remaining=${blocked.status.remaining}`);
  } else {
    throw new Error("Expected budget exceeded");
  }

  // 4. Throw the typed error
  try {
    throw new TokenBudgetExceededError(blocked.status);
  } catch (e) {
    if (e instanceof TokenBudgetExceededError) {
      console.log(`✓ TokenBudgetExceededError: ${e.message.slice(0, 80)}...`);
      console.log(`  retryAfterMs=${e.retryAfterMs}`);
    }
  }

  // 5. Enterprise bypass
  const ent = await checkTokenBudget(user.id, "enterprise");
  if (ent.allowed && ent.status?.unlimited) {
    console.log(`✓ Enterprise: allowed=${ent.allowed}, unlimited=${ent.status.unlimited}, limit=${ent.status.limit}`);
  } else {
    throw new Error("Expected enterprise bypass");
  }

  // 6. Missing userId/plan → skip
  const skipped = await checkTokenBudget(null, null);
  if (skipped.allowed && skipped.status === null) {
    console.log(`✓ Missing userId/plan: allowed=true, status=null (skipped)`);
  } else {
    throw new Error("Expected skip when userId/plan missing");
  }

  // 7. Verify TokenUsageRecord row was actually written
  const records = await db.tokenUsageRecord.findMany({ where: { userId: user.id } });
  if (records.length === 1 && records[0].totalTokens === 1_200_000 && records[0].callCount === 1) {
    console.log(`✓ TokenUsageRecord persisted: totalTokens=${records[0].totalTokens}, callCount=${records[0].callCount}`);
  } else {
    throw new Error(`Unexpected records: ${JSON.stringify(records)}`);
  }

  // 8. Cleanup
  await db.tokenUsageRecord.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  console.log(`✓ Cleanup done`);

  console.log("\n✅ ALL P3.1 SMOKE TESTS PASSED");
}

main()
  .catch((e) => {
    console.error("❌ SMOKE TEST FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
