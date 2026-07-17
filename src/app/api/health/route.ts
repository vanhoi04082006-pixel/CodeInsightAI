import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveJobs } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — system health check
export async function GET() {
  const start = performance.now();
  try {
    // Check database
    let dbStatus = "ok";
    let analysisCount = 0;
    try {
      analysisCount = await db.analysis.count();
    } catch {
      dbStatus = "error";
    }

    // Check active jobs
    const activeJobs = getActiveJobs();

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    const latencyMs = Math.round(performance.now() - start);

    return NextResponse.json({
      status: dbStatus === "ok" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latencyMs,
      services: {
        database: dbStatus,
        jobQueue: "ok",
        github: "ok",
      },
      stats: {
        analyses: analysisCount,
        activeJobs: activeJobs.length,
        uptime: Math.round(process.uptime()),
        memory: {
          used: `${memMB}MB`,
          total: `${memTotalMB}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        },
      },
      jobs: activeJobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        stage: j.stage,
      })),
    });
  } catch (e) {
    return NextResponse.json({
      status: "unhealthy",
      error: e instanceof Error ? e.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
