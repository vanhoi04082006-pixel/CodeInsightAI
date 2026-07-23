// CodeInsight AI — Background Job Queue
// In-memory job store with status tracking, cancellation, and progress.
// Jobs run asynchronously without blocking the request.

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "analyze" | "parse" | "search" | "chat";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  stage: string;
  result: any;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  cancelRequested: boolean;
}

// In-memory job store (survives within server session)
const jobs = new Map<string, Job>();
const MAX_JOBS = 50;

// Clean up old completed jobs (> 1 hour)
function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt && now - job.completedAt > 3600000) {
      jobs.delete(id);
    }
  }
  // Also limit total count
  if (jobs.size > MAX_JOBS) {
    const oldest = Array.from(jobs.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, jobs.size - MAX_JOBS);
    for (const [id] of oldest) jobs.delete(id);
  }
}

export function createJob(type: JobType): Job {
  cleanup();
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id, type, status: "pending", progress: 0, stage: "Queued",
    result: null, error: null,
    createdAt: Date.now(), startedAt: null, completedAt: null,
    cancelRequested: false,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function getActiveJobs(): Job[] {
  return Array.from(jobs.values()).filter(j => j.status === "running" || j.status === "pending");
}

export function updateJob(id: string, patch: Partial<Job>): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

export function setJobProgress(id: string, progress: number, stage: string): void {
  updateJob(id, { progress, stage });
}

export function completeJob(id: string, result: any): void {
  updateJob(id, { status: "completed", result, progress: 100, stage: "Completed", completedAt: Date.now() });
}

export function failJob(id: string, error: string): void {
  updateJob(id, { status: "failed", error, stage: "Failed", completedAt: Date.now() });
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === "completed" || job.status === "failed") return false;
  job.cancelRequested = true;
  job.status = "cancelled";
  job.completedAt = Date.now();
  jobs.set(id, job);
  return true;
}

export function startJob(id: string): void {
  updateJob(id, { status: "running", startedAt: Date.now(), stage: "Starting..." });
}

export function isCancelled(id: string): boolean {
  return jobs.get(id)?.cancelRequested ?? false;
}
