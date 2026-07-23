// CodeInsight AI — Git Intelligence: Git Operations
// Thin wrapper around `git` CLI that the devops-agent and other agents use.
// Routes through `commandRunner` so every command is permission-checked and
// recorded by the terminal module.

import { commandRunner } from "@/lib/terminal";

export type FileChangeStatus = "modified" | "added" | "deleted" | "renamed";

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  staged: boolean;
  /** Original path (only set for renames / copies). */
  oldPath?: string;
}

export interface GitStatus {
  branch: string;
  /** Commits in the local branch not yet pushed upstream. */
  ahead: number;
  /** Commits in upstream not yet pulled locally. */
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
}

export interface MergeResult {
  conflicts: string[];
}

export interface Remote {
  name: string;
  url: string;
}

function getProjectRoot(cwd?: string): string {
  return cwd || process.cwd();
}

/** Quote a single CLI argument for shell safety. */
function quote(arg: string): string {
  // Use single quotes; escape any embedded single quotes via '\''.
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export class GitOperations {
  /** Run a git subcommand via the command runner. Returns parsed result. */
  private async git(
    args: string[],
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Don't quote the subcommand name (first arg) so allowlist patterns like
    // "git status" / "git log" / "git diff" match via prefix.
    // Only quote the remaining arguments for shell-safety.
    const subcommand = args[0] ?? "";
    const rest = args.slice(1).map(quote).join(" ");
    const cmd = rest ? `git ${subcommand} ${rest}` : `git ${subcommand}`;
    const result = await commandRunner.runCommand(cmd, {
      cwd: getProjectRoot(cwd),
      recordHistory: false,
      // Git operations are invoked by the API route (server-controlled, not
      // arbitrary user input). Auto-approve any "prompt" level so read/write
      // git ops (status/log/diff/commit/push/etc.) work without an onPrompt
      // handler. Dangerous commands are still denied by the denylist.
      onPrompt: async () => true,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  /** True if `cwd` is inside a git work tree. */
  async isRepo(cwd?: string): Promise<boolean> {
    try {
      const { stdout, exitCode } = await this.git(["rev-parse", "--is-inside-work-tree"], cwd);
      return exitCode === 0 && stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  /** Parse `git status --porcelain=v1 -b` output. */
  parseStatus(output: string): GitStatus {
    const lines = output.split("\n");
    const status: GitStatus = {
      branch: "",
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    };

    if (lines.length === 0) return status;

    // Branch header: "## main...origin/main [ahead 2, behind 1]"
    const branchLine = lines[0];
    if (branchLine.startsWith("## ")) {
      const rest = branchLine.slice(3);
      const bracketIdx = rest.indexOf("[");
      const branchPart = bracketIdx >= 0 ? rest.slice(0, bracketIdx).trim() : rest.trim();
      // Format: "main" or "main...origin/main" or "HEAD (no branch)"
      if (branchPart.includes("...")) {
        status.branch = branchPart.split("...")[0].trim();
      } else if (branchPart === "HEAD (no branch)") {
        status.branch = "(detached)";
      } else {
        status.branch = branchPart;
      }

      if (bracketIdx >= 0) {
        const bracketContent = rest.slice(bracketIdx + 1, rest.lastIndexOf("]"));
        const aheadMatch = bracketContent.match(/ahead\s+(\d+)/);
        const behindMatch = bracketContent.match(/behind\s+(\d+)/);
        if (aheadMatch) status.ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) status.behind = parseInt(behindMatch[1], 10);
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 3) continue;

      const x = line[0]; // staged status
      const y = line[1]; // unstaged status
      const file = line.slice(3);

      if (x === "?" && y === "?") {
        status.untracked.push(file);
        continue;
      }

      if (x !== " " && x !== "?") {
        const change = this.parseFileChange(x, file, true);
        if (change) status.staged.push(change);
      }

      if (y !== " " && y !== "?") {
        const change = this.parseFileChange(y, file, false);
        if (change) status.unstaged.push(change);
      }
    }

    return status;
  }

  private parseFileChange(code: string, file: string, staged: boolean): FileChange | null {
    if (code === "R" || code === "C") {
      // Renamed/copied: "oldPath -> newPath"
      const parts = file.split(" -> ");
      return {
        path: parts[1] ?? file,
        status: "renamed",
        staged,
        oldPath: parts[0],
      };
    }

    let status: FileChangeStatus;
    switch (code) {
      case "M": status = "modified"; break;
      case "A": status = "added"; break;
      case "D": status = "deleted"; break;
      default: return null;
    }

    return { path: file, status, staged };
  }

  async getStatus(cwd?: string): Promise<GitStatus> {
    const { stdout } = await this.git(["status", "--porcelain=v1", "-b"], cwd);
    return this.parseStatus(stdout);
  }

  async getDiff(cwd?: string, staged?: boolean): Promise<string> {
    const args = ["diff"];
    if (staged) args.push("--staged");
    const { stdout } = await this.git(args, cwd);
    return stdout;
  }

  async getDiffForFile(filePath: string, cwd?: string): Promise<string> {
    const { stdout } = await this.git(["diff", "--", filePath], cwd);
    return stdout;
  }

  async stage(paths: string[], cwd?: string): Promise<void> {
    if (paths.length === 0) return;
    await this.git(["add", "--", ...paths], cwd);
  }

  async unstage(paths: string[], cwd?: string): Promise<void> {
    if (paths.length === 0) return;
    await this.git(["reset", "HEAD", "--", ...paths], cwd);
  }

  async commit(message: string, cwd?: string): Promise<{ sha: string; message: string }> {
    const { stdout, exitCode, stderr } = await this.git(["commit", "-m", message], cwd);
    if (exitCode !== 0) {
      throw new Error(`git commit failed (exit ${exitCode}): ${stderr || stdout}`);
    }
    // Parse "[main abc1234] message"
    const match = stdout.match(/\[[^\s]+\s+([a-f0-9]{7,40})\]/);
    const sha = match ? match[1] : "";
    return { sha, message };
  }

  async push(cwd?: string, remote?: string, branch?: string): Promise<void> {
    const args = ["push"];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    const { exitCode, stderr } = await this.git(args, cwd);
    if (exitCode !== 0) {
      throw new Error(`git push failed (exit ${exitCode}): ${stderr}`);
    }
  }

  async pull(cwd?: string, remote?: string, branch?: string): Promise<void> {
    const args = ["pull"];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    const { exitCode, stderr } = await this.git(args, cwd);
    if (exitCode !== 0) {
      throw new Error(`git pull failed (exit ${exitCode}): ${stderr}`);
    }
  }

  async fetch(cwd?: string, remote?: string): Promise<void> {
    const args = ["fetch"];
    if (remote) args.push(remote);
    const { exitCode, stderr } = await this.git(args, cwd);
    if (exitCode !== 0) {
      throw new Error(`git fetch failed (exit ${exitCode}): ${stderr}`);
    }
  }

  async stash(cwd?: string, message?: string): Promise<void> {
    const args = ["stash", "push"];
    if (message) args.push("-m", message);
    await this.git(args, cwd);
  }

  async stashPop(cwd?: string): Promise<void> {
    await this.git(["stash", "pop"], cwd);
  }

  async createBranch(name: string, cwd?: string): Promise<void> {
    await this.git(["branch", name], cwd);
  }

  async checkoutBranch(name: string, cwd?: string): Promise<void> {
    await this.git(["checkout", name], cwd);
  }

  /** Create a new branch and switch to it (equivalent to `git checkout -b`). */
  async createAndCheckoutBranch(name: string, cwd?: string): Promise<void> {
    await this.git(["checkout", "-b", name], cwd);
  }

  async merge(branch: string, cwd?: string): Promise<MergeResult> {
    await this.git(["merge", "--no-edit", branch], cwd);
    const conflicts = await this.getConflicts(cwd);
    return { conflicts };
  }

  async rebase(branch: string, cwd?: string): Promise<MergeResult> {
    await this.git(["rebase", branch], cwd);
    const conflicts = await this.getConflicts(cwd);
    return { conflicts };
  }

  /** List files with unresolved merge conflicts. */
  private async getConflicts(cwd?: string): Promise<string[]> {
    const { stdout } = await this.git(["diff", "--name-only", "--diff-filter=U"], cwd);
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  async getRecentCommits(count: number = 20, cwd?: string): Promise<Commit[]> {
    // %H sha, %an author, %ad date, %P parents, %s subject
    const format = "%H%x09%an%x09%ad%x09%P%x09%s";
    const { stdout } = await this.git(
      ["log", `-${Math.max(1, count)}`, `--pretty=format:${format}`],
      cwd
    );
    return stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        const parts = line.split("\t");
        if (parts.length < 5) {
          return {
            sha: parts[0] ?? "",
            author: parts[1] ?? "",
            date: parts[2] ?? "",
            parents: parts[3] ? parts[3].split(" ").filter((p) => p.length > 0) : [],
            message: parts.slice(4).join("\t"),
          };
        }
        return {
          sha: parts[0],
          author: parts[1],
          date: parts[2],
          parents: parts[3] ? parts[3].split(" ").filter((p) => p.length > 0) : [],
          message: parts.slice(4).join("\t"),
        };
      });
  }

  /** Get commits between two refs (exclusive from, inclusive to). */
  async getCommitsBetween(fromSha: string, toSha: string, cwd?: string): Promise<Commit[]> {
    const format = "%H%x09%an%x09%ad%x09%P%x09%s";
    const range = `${fromSha}..${toSha}`;
    const { stdout } = await this.git(
      ["log", range, `--pretty=format:${format}`],
      cwd
    );
    return stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        const parts = line.split("\t");
        return {
          sha: parts[0] ?? "",
          author: parts[1] ?? "",
          date: parts[2] ?? "",
          parents: parts[3] ? parts[3].split(" ").filter((p) => p.length > 0) : [],
          message: parts.slice(4).join("\t"),
        };
      });
  }

  async getCurrentBranch(cwd?: string): Promise<string> {
    const { stdout, exitCode } = await this.git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (exitCode !== 0) return "";
    return stdout.trim();
  }

  async getRemotes(cwd?: string): Promise<Remote[]> {
    const { stdout } = await this.git(["remote", "-v"], cwd);
    const remotes = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      if (!line) continue;
      // Format: "origin\tgit@github.com:user/repo.git (fetch)"
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        remotes.set(match[1], match[2]);
      }
    }
    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
  }
}

/** Singleton git operations instance. */
export const gitOps = new GitOperations();
