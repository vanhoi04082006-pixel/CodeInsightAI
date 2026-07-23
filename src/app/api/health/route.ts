import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveJobs } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — system health check (with detailed DB error for debugging)
export async function GET() {
  const start = performance.now();
  try {
    // Check database — capture the error message so we can debug on Vercel
    let dbStatus: "ok" | "error" = "ok";
    let dbError: string | undefined;
    let analysisCount = 0;
    try {
      analysisCount = await db.analysis.count();
    } catch (e) {
      dbStatus = "error";
      dbError = e instanceof Error ? e.message : String(e);
    }

    // Check active jobs
    const activeJobs = getActiveJobs();

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    const latencyMs = Math.round(performance.now() - start);

    // Detect environment for debugging
    const envInfo = {
      nodeEnv: process.env.NODE_ENV,
      appEnv: process.env.APP_ENV ?? "(not set)",
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      nextAuthUrl: process.env.NEXTAUTH_URL ?? "(not set)",
      vercelUrl: process.env.VERCEL_URL ?? "(not set)",
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlProtocol: process.env.DATABASE_URL?.split("://")[0] ?? "(not set)",
      hasGithubId: !!process.env.GITHUB_ID,
      hasGithubSecret: !!process.env.GITHUB_SECRET,
      hasPlatformAiKey: !!process.env.PLATFORM_AI_API_KEY,
    };

    return NextResponse.json({
      status: dbStatus === "ok" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latencyMs,
      services: {
        database: dbStatus,
        ...(dbError ? { databaseError: dbError.slice(0, 300) } : {}),
        jobQueue: "ok",
        github: "ok",
      },
      env: envInfo,
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
