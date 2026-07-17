import { NextRequest, NextResponse } from "next/server";
import { getJob, cancelJob } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/jobs/[id] — poll job status
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}

// DELETE /api/jobs/[id] — cancel a running job
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cancelled = cancelJob(id);
  if (!cancelled) {
    return NextResponse.json({ error: "Job not found or already completed" }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: "Job cancelled" });
}
