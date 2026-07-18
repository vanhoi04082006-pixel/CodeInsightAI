// CodeInsight AI — AI Terminal: Permission System
// Allowlist / denylist for shell commands executed by the AI agents.
// Anything not on either list falls back to "prompt" — the caller must
// approve via an onPrompt callback before execution.

import * as path from "path";

export type PermissionLevel = "allow" | "deny" | "prompt";

/**
 * Default permission rules. Keys are command prefixes / patterns.
 * Evaluation order is: deny first, then allow, then prompt.
 */
export const DEFAULT_PERMISSIONS: Record<string, PermissionLevel> = {
  // ── Safe read-only commands ──
  ls: "allow",
  pwd: "allow",
  cat: "allow",
  echo: "allow",
  head: "allow",
  tail: "allow",
  wc: "allow",
  find: "allow",
  grep: "allow",
  rg: "allow",
  tree: "allow",
  file: "allow",
  stat: "allow",
  du: "allow",
  df: "allow",
  uname: "allow",
  whoami: "allow",
  date: "allow",
  env: "allow",
  printenv: "allow",
  which: "allow",
  type: "allow",
  "node --version": "allow",
  "node -v": "allow",
  "npm --version": "allow",
  "npm -v": "allow",
  "bun --version": "allow",
  "yarn --version": "allow",
  "pnpm --version": "allow",
  "git --version": "allow",
  "tsc --version": "allow",

  // ── Safe git operations (read-only) ──
  "git status": "allow",
  "git log": "allow",
  "git diff": "allow",
  "git show": "allow",
  "git branch": "allow",
  "git remote -v": "allow",
  "git remote": "allow",
  "git rev-parse": "allow",
  "git stash list": "allow",
  "git config --get": "allow",
  "git blame": "allow",
  "git ls-files": "allow",
  "git ls-remote": "allow",
  "git tag": "allow",
  "git describe": "allow",

  // ── Lint / type-check / test ──
  "npm run lint": "allow",
  "npm run typecheck": "allow",
  "npm run test": "allow",
  "npm run check": "allow",
  "bun run lint": "allow",
  "bun run typecheck": "allow",
  "bun run test": "allow",
  "bun run check": "allow",
  "yarn lint": "allow",
  "yarn test": "allow",
  "pnpm lint": "allow",
  "pnpm test": "allow",
  "tsc --noEmit": "allow",
  "eslint .": "allow",
  "prettier --check": "allow",
  "prettier --write": "allow",

  // ── Dangerous commands ──
  "rm -rf /": "deny",
  "rm -rf /*": "deny",
  "rm -rf ~": "deny",
  "rm -rf ~/*": "deny",
  "rm -rf .": "deny",
  "rm -rf ..": "deny",
  "rm -rf *": "deny",
  mkfs: "deny",
  "mkfs.ext4": "deny",
  "mkfs.btrfs": "deny",
  dd: "deny",
  shutdown: "deny",
  reboot: "deny",
  halt: "deny",
  poweroff: "deny",
  "chmod 777": "deny",
  "chmod -R 777": "deny",
  "chown -R": "deny",
  sudo: "deny",
  su: "deny",
  ":(){:|:&};:": "deny",
  "kill -9 1": "deny",
  "killall": "deny",
  "pkill": "deny",
  "iptables": "deny",
  "ufw": "deny",
  "curl | sh": "deny",
  "curl | bash": "deny",
  "wget | sh": "deny",
  "wget | bash": "deny",
  "npm publish": "deny",
  "npm install -g": "deny",
  "git push --force": "deny",
  "git push -f": "deny",
  "git reset --hard": "deny",
  "git clean -fd": "deny",
};

class PermissionSystem {
  private permissions: Record<string, PermissionLevel> = { ...DEFAULT_PERMISSIONS };
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /** Update the project root used by `isPathSafe`. */
  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  /** Get the configured project root. */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Inspect a command string and decide whether it may run.
   * - Returns "deny" if the command matches any deny pattern or contains a
   *   known dangerous substring.
   * - Returns "allow" if the command matches an allow pattern.
   * - Otherwise returns "prompt".
   */
  checkPermission(command: string): PermissionLevel {
    const cmd = command.trim();
    if (!cmd) return "deny";

    // 1. Check explicit deny patterns.
    for (const [pattern, level] of Object.entries(this.permissions)) {
      if (level === "deny" && this.matchPattern(cmd, pattern)) {
        return "deny";
      }
    }

    // 2. Heuristic dangerous-substring checks (defense in depth).
    if (this.looksDangerous(cmd)) return "deny";

    // 3. Check explicit allow patterns.
    for (const [pattern, level] of Object.entries(this.permissions)) {
      if (level === "allow" && this.matchPattern(cmd, pattern)) {
        return "allow";
      }
    }

    // 4. Default: prompt the user.
    return "prompt";
  }

  /** Pattern matching: exact match, prefix match, or glob (with `*`). */
  private matchPattern(command: string, pattern: string): boolean {
    if (command === pattern) return true;
    // Normalize: strip single quotes around args so patterns like "git status"
    // match commands built as `git 'status' '--porcelain=v1' '-b'`.
    const normalized = command.replace(/'(\w[\w-]*)'/g, "$1");
    if (normalized === pattern) return true;
    // Prefix match — "git status" matches "git status --porcelain".
    if (normalized.startsWith(pattern + " ") || normalized.startsWith(pattern + "\t")) return true;
    if (normalized.startsWith(pattern + " |") || normalized.startsWith(pattern + "&&")) return true;
    // Also check the original (un-normalized) command for prefix match.
    if (command.startsWith(pattern + " ") || command.startsWith(pattern + "\t")) return true;
    if (command.startsWith(pattern + " |") || command.startsWith(pattern + "&&")) return true;
    if (pattern.includes("*")) {
      const re = this.globToRegExp(pattern);
      if (re.test(command) || re.test(normalized)) return true;
    }
    return false;
  }

  private globToRegExp(glob: string): RegExp {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i];
      if (c === "*") {
        if (glob[i + 1] === "*") {
          re += "[\\s\\S]*";
          i++;
        } else {
          re += "[^\\s]*";
        }
      } else if (".+^${}()|[]\\".includes(c)) {
        re += "\\" + c;
      } else {
        re += c;
      }
    }
    return new RegExp("^" + re);
  }

  /** Heuristic check for dangerous substrings not covered by the deny list. */
  private looksDangerous(cmd: string): boolean {
    // rm -rf on root or home
    if (/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(?:\/|~|\*|\.\.?)\b/.test(cmd)) return true;
    if (/\brm\s+-[a-zA-Z]*f[a-zA-Z]*r?\s+(?:\/|~|\*|\.\.?)\b/.test(cmd)) return true;
    if (/\bmkfs(?:\.\w+)?\b/.test(cmd)) return true;
    if (/\bdd\b.*\bif=/.test(cmd)) return true;
    if (/\b(?:shutdown|reboot|halt|poweroff)\b/.test(cmd)) return true;
    // Fork bomb
    if (/:\s*\(\)\s*\{.*:.*\|.*:.*&\s*\}\s*;\s*:/.test(cmd)) return true;
    if (/\bsudo\b/.test(cmd)) return true;
    // Pipe-to-shell
    if (/\b(?:curl|wget)\b[^|]*\|\s*(?:sh|bash|zsh|fish)\b/.test(cmd)) return true;
    // Force-push to main / master
    if (/git\s+push\s+(?:--force|-f)\b.*\b(?:main|master)\b/.test(cmd)) return true;
    return false;
  }

  /** Add or override a permission rule. */
  setPermission(pattern: string, level: PermissionLevel): void {
    this.permissions[pattern] = level;
  }

  /** Remove a permission rule. */
  removePermission(pattern: string): void {
    delete this.permissions[pattern];
  }

  /** Return a shallow copy of the current permission table. */
  getPermissions(): Record<string, PermissionLevel> {
    return { ...this.permissions };
  }

  /** Restore the default permission table. */
  resetPermissions(): void {
    this.permissions = { ...DEFAULT_PERMISSIONS };
  }

  /**
   * Verify that `targetPath` resolves to a location inside the project root.
   * Used to prevent the agent from writing/reading outside the workspace.
   */
  isPathSafe(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    const root = path.resolve(this.projectRoot);
    if (resolved === root) return true;
    return resolved.startsWith(root + path.sep);
  }
}

/** Singleton permission system used by the command runner. */
export const permissionSystem = new PermissionSystem();
