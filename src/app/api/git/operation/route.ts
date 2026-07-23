// POST /api/git/operation — Execute a git operation
import { NextRequest, NextResponse } from "next/server";
import { gitOps, generateCommitMessage, generateChangelog, diffReviewer } from "@/lib/git-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await requireUserId(); if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const body = await req.json();
    const { operation, cwd, ...params } = body;

    if (!operation) {
      return NextResponse.json({ error: "Missing 'operation'" }, { status: 400 });
    }

    const workDir = cwd || process.cwd();

    switch (operation) {
      case "status": {
        const status = await gitOps.getStatus(workDir);
        return NextResponse.json({ status });
      }
      case "diff": {
        const diff = await gitOps.getDiff(workDir, params.staged);
        return NextResponse.json({ diff });
      }
      case "stage": {
        await gitOps.stage(params.paths, workDir);
        return NextResponse.json({ success: true, message: `Staged ${params.paths?.length ?? 0} files` });
      }
      case "unstage": {
        await gitOps.unstage(params.paths, workDir);
        return NextResponse.json({ success: true });
      }
      case "commit": {
        const message = params.message || "Update";
        const result = await gitOps.commit(message, workDir);
        return NextResponse.json({ success: true, ...result });
      }
      case "commit-ai": {
        // AI-generated commit message
        const diff = await gitOps.getDiff(workDir, true);
        if (!diff.trim()) {
          return NextResponse.json({ error: "No staged changes to commit" }, { status: 400 });
        }
        const commitMsg = await generateCommitMessage(diff, params.provider);
        const result = await gitOps.commit(`${commitMsg.title}\n\n${commitMsg.body}`.trim(), workDir);
        return NextResponse.json({ success: true, ...result, generatedMessage: commitMsg });
      }
      case "push": {
        await gitOps.push(workDir, params.remote, params.branch);
        return NextResponse.json({ success: true });
      }
      case "pull": {
        await gitOps.pull(workDir, params.remote, params.branch);
        return NextResponse.json({ success: true });
      }
      case "fetch": {
        await gitOps.fetch(workDir, params.remote);
        return NextResponse.json({ success: true });
      }
      case "stash": {
        await gitOps.stash(workDir, params.message);
        return NextResponse.json({ success: true });
      }
      case "stash-pop": {
        await gitOps.stashPop(workDir);
        return NextResponse.json({ success: true });
      }
      case "create-branch": {
        await gitOps.createBranch(params.name, workDir);
        return NextResponse.json({ success: true, branch: params.name });
      }
      case "checkout": {
        await gitOps.checkoutBranch(params.name, workDir);
        return NextResponse.json({ success: true });
      }
      case "merge": {
        const result = await gitOps.merge(params.branch, workDir);
        return NextResponse.json({ success: result.conflicts.length === 0, conflicts: result.conflicts });
      }
      case "rebase": {
        const result = await gitOps.rebase(params.branch, workDir);
        return NextResponse.json({ success: result.conflicts.length === 0, conflicts: result.conflicts });
      }
      case "recent-commits": {
        const commits = await gitOps.getRecentCommits(params.count ?? 10, workDir);
        return NextResponse.json({ commits });
      }
      case "current-branch": {
        const branch = await gitOps.getCurrentBranch(workDir);
        return NextResponse.json({ branch });
      }
      case "remotes": {
        const remotes = await gitOps.getRemotes(workDir);
        return NextResponse.json({ remotes });
      }
      case "changelog": {
        const commits = await gitOps.getRecentCommits(params.count ?? 20, workDir);
        const changelog = await generateChangelog(commits, params.provider);
        return NextResponse.json({ changelog });
      }
      case "review-diff": {
        const diff = params.diff || await gitOps.getDiff(workDir, params.staged);
        const review = await diffReviewer.reviewDiff(diff, params.provider);
        return NextResponse.json({ review });
      }
      default:
        return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[/api/git/operation] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
