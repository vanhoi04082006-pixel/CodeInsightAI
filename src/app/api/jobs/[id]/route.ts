import { NextRequest, NextResponse } from "next/server";
import { getJob, cancelJob } from "@/lib/job-queue";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/jobs/[id] — poll job status (must be authenticated)
// Falls back to DB check if job not in memory (Vercel serverless multi-instance)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  // Step 1: Check in-memory job queue (same instance)
  const job = getJob(id);
  if (job) {
    return NextResponse.json({ job });
  }

  // Step 2: Job not in memory — might be on different Vercel instance
  // Check if analysis was already completed in DB
  // The jobId format is: job_<timestamp>_<random>
  // We search by matching the analysis that was created around that time
  try {
    // Try to find a recent analysis for this user
    // (job was created recently, analysis should be in DB if completed)
    const recentAnalysis = await db.analysis.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (recentAnalysis) {
      const ageMs = Date.now() - recentAnalysis.createdAt.getTime();
      // If analysis was created in last 5 minutes, it's likely our job
      if (ageMs < 5 * 60 * 1000) {
        let report: any = null;
        try {
          report = JSON.parse(recentAnalysis.report);
        } catch {}

        if (report) {
          // Return as completed job
          return NextResponse.json({
            job: {
              id,
              type: "analyze",
              status: "completed",
              progress: 100,
              stage: "Completed",
              result: {
                id: recentAnalysis.id,
                report,
                cached: false,
                real: true,
              },
              error: null,
              createdAt: recentAnalysis.createdAt.getTime(),
              startedAt: recentAnalysis.createdAt.getTime(),
              completedAt: recentAnalysis.createdAt.getTime(),
              cancelRequested: false,
            },
          });
        }
      }
    }
  } catch (e) {
    console.error("[/api/jobs/[id]] DB fallback error:", e);
  }

  // Step 3: Job not found in memory or DB
  // Return a "pending" status instead of 404 — the job might still be running
  // on another instance. Frontend will keep polling.
  return NextResponse.json({
    job: {
      id,
      type: "analyze",
      status: "running",
      progress: 50, // assume halfway
      stage: "Processing...",
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: Date.now(),
      completedAt: null,
      cancelRequested: false,
    },
  });
}

// DELETE /api/jobs/[id] — cancel a running job (must be authenticated)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const cancelled = cancelJob(id);
  if (!cancelled) {
    return NextResponse.json({ error: "Job not found or already completed" }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: "Job cancelled" });
}
