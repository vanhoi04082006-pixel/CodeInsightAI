// GET /api/agents/status — Get agent system status (registered agents, queue stats, recent events)
import { NextResponse } from "next/server";
import { registerAllAgents, agentRegistry, taskQueue, eventBus } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  registerAllAgents();

  const agents = agentRegistry.list().map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    color: a.color,
    capabilities: a.capabilities,
  }));

  const tasks = taskQueue.getAll();
  const queueStats = {
    pending: tasks.filter(t => t.status === "pending").length,
    running: tasks.filter(t => t.status === "running").length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed: tasks.filter(t => t.status === "failed").length,
    cancelled: tasks.filter(t => t.status === "cancelled").length,
    retrying: tasks.filter(t => t.status === "retrying").length,
    total: tasks.length,
  };

  const recentEvents = eventBus.getBuffer().slice(-20);

  return NextResponse.json({
    agents,
    agentCount: agents.length,
    queue: queueStats,
    recentEvents,
    timestamp: Date.now(),
  });
}
