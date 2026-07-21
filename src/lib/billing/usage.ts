// CodeInsight AI — Usage tracking + quota enforcement
import { db } from "@/lib/db";

export interface PlanLimits {
  analysesPerMonth: number;
  chatMessagesPerMonth: number;
  agentTasksPerMonth: number;
  maxProviders: number;
  streaming: boolean;
  exportFormats: string[];
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    analysesPerMonth: 5,
    chatMessagesPerMonth: 50,
    agentTasksPerMonth: 10,
    maxProviders: 3,
    streaming: false,
    exportFormats: ["markdown"],
  },
  pro: {
    analysesPerMonth: 100,
    chatMessagesPerMonth: 2000,
    agentTasksPerMonth: 500,
    maxProviders: 20,
    streaming: true,
    exportFormats: ["markdown", "json", "pdf"],
  },
  team: {
    analysesPerMonth: 500,
    chatMessagesPerMonth: 10000,
    agentTasksPerMonth: 2500,
    maxProviders: 50,
    streaming: true,
    exportFormats: ["markdown", "json", "pdf"],
  },
  enterprise: {
    analysesPerMonth: -1, // unlimited
    chatMessagesPerMonth: -1,
    agentTasksPerMonth: -1,
    maxProviders: -1,
    streaming: true,
    exportFormats: ["markdown", "json", "pdf", "csv"],
  },
};

export function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Increment usage for a user + type. Returns the new count.
 */
export async function incrementUsage(userId: string, type: "analysis" | "chat" | "agent_task"): Promise<number> {
  const month = getMonthKey();

  const record = await db.usageRecord.upsert({
    where: {
      userId_type_month: { userId, type, month },
    },
    create: {
      userId,
      type,
      month,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });

  return record.count;
}

/**
 * Get current usage for a user.
 */
export async function getUsage(userId: string): Promise<Record<string, number>> {
  const month = getMonthKey();
  const records = await db.usageRecord.findMany({
    where: { userId, month },
  });

  const usage: Record<string, number> = {
    analysis: 0,
    chat: 0,
    agent_task: 0,
  };

  for (const r of records) {
    usage[r.type] = r.count;
  }

  return usage;
}

/**
 * Check if user can perform an action (quota not exceeded).
 *
 * Admins (role === "admin") always bypass quotas — they have unlimited
 * access to all features.
 */
export async function checkQuota(userId: string, type: "analysis" | "chat" | "agent_task"): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
}> {
  // Get user's plan + role
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true },
  });

  const plan = user?.plan ?? "free";
  const role = user?.role ?? "user";

  // Admin bypass — unlimited everything
  if (role === "admin") {
    const usage = await getUsage(userId);
    return { allowed: true, used: usage[type] ?? 0, limit: -1, plan: "enterprise" };
  }

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // Map type to limit field
  const limitMap: Record<string, number> = {
    analysis: limits.analysesPerMonth,
    chat: limits.chatMessagesPerMonth,
    agent_task: limits.agentTasksPerMonth,
  };

  const limit = limitMap[type] ?? 0;
  if (limit === -1) {
    // Unlimited
    const usage = await getUsage(userId);
    return { allowed: true, used: usage[type] ?? 0, limit: -1, plan };
  }

  const usage = await getUsage(userId);
  const used = usage[type] ?? 0;

  return {
    allowed: used < limit,
    used,
    limit,
    plan,
  };
}
