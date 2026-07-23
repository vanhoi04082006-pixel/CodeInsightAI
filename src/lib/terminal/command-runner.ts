// CodeInsight AI — AI Terminal: Command Runner
// Sandboxed shell runner with permission enforcement, streaming stdout/stderr,
// timeout + AbortSignal support, and automatic history recording.

import { spawn, execSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import { permissionSystem } from "./permission-system";
import { commandHistory, type CommandHistoryEntry } from "./command-history";

export interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cancelled: boolean;
}

export interface RunCommandOptions {
  /** Working directory (defaults to project root). */
  cwd?: string;
  /** Timeout in milliseconds; on expiry the process is killed. */
  timeout?: number;
  /** Extra environment variables (merged over process.env). */
  env?: Record<string, string>;
  /** Streaming callback for stdout chunks. */
  onStdout?: (data: string) => void;
  /** Streaming callback for stderr chunks. */
  onStderr?: (data: string) => void;
  /** Cancellation signal. Triggers SIGTERM → SIGKILL. */
  signal?: AbortSignal;
  /** Override the shell binary (default: auto-detected per platform). */
  shell?: string;
  /** Called when permission is "prompt". Return true to allow, false to deny. */
  onPrompt?: (command: string) => Promise<boolean>;
  /** Whether to record the execution in `commandHistory` (default: true). */
  recordHistory?: boolean;
}

export interface CommandChunk {
  stream: "stdout" | "stderr";
  data: string;
}

function getProjectRoot(): string {
  return permissionSystem.getProjectRoot() || process.cwd();
}

/**
 * Detect the default shell for the current platform.
 * - Windows: prefer Git Bash if installed (COMSPEC points to cmd.exe usually),
 *   fall back to cmd.exe. PowerShell is avoided due to quoting complexity.
 * - Unix (Linux/macOS): use $SHELL env var, fall back to /bin/bash, then /bin/sh.
 */
function defaultShell(): string {
  // Unix: respect $SHELL, fall back to bash then sh.
  if (process.platform !== "win32") {
    return process.env.SHELL || "/bin/bash";
  }
  // Windows: prefer Git Bash (common in dev setups via Git for Windows).
  // Check common install paths.
  const gitBashCandidates = [
    process.env.SHELL,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ].filter(Boolean) as string[];
  for (const candidate of gitBashCandidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore — try next candidate
    }
  }
  // Fall back to cmd.exe (always present on Windows).
  return process.env.COMSPEC || "cmd.exe";
}

/**
 * Build spawn args for the given shell.
 * - bash/sh: ["-c", command]
 * - cmd.exe: ["/c", command]
 * - PowerShell: ["-NoProfile", "-Command", command]
 */
function shellSpawnArgs(shell: string, command: string): string[] {
  const lower = shell.toLowerCase();
  if (lower.endsWith("cmd.exe") || lower.endsWith("cmd")) {
    return ["/c", command];
  }
  if (lower.includes("powershell") || lower.includes("pwsh")) {
    return ["-NoProfile", "-Command", command];
  }
  // bash / sh / zsh / fish — all use -c
  return ["-c", command];
}

/** Ensure a command is permitted, prompting the caller if necessary. */
async function authorize(
  command: string,
  options: RunCommandOptions
): Promise<void> {
  const level = permissionSystem.checkPermission(command);
  if (level === "deny") {
    throw new Error(`Command denied by permission system: ${command}`);
  }
  if (level === "prompt") {
    if (options.onPrompt) {
      const allowed = await options.onPrompt(command);
      if (!allowed) {
        throw new Error(`Command not approved by user: ${command}`);
      }
    } else {
      throw new Error(
        `Command requires approval but no onPrompt handler provided: ${command}`
      );
    }
  }
}

/** Spawn a child process running `command` in the chosen shell. */
function spawnChild(
  command: string,
  options: RunCommandOptions
): ChildProcess {
  const cwd = options.cwd || getProjectRoot();
  const shell = options.shell || defaultShell();
  const env = { ...process.env, ...options.env };
  const args = shellSpawnArgs(shell, command);
  return spawn(shell, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Run a shell command, capture its output, and return a `CommandResult`.
 * Throws on permission denial or spawn errors. Non-zero exit codes are
 * returned in `exitCode` rather than thrown.
 */
export class CommandRunner {
  async runCommand(command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
    await authorize(command, options);

    const start = Date.now();
    const cwd = options.cwd || getProjectRoot();
    const child = spawnChild(command, options);

    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const onAbort = () => {
      cancelled = true;
      // Windows doesn't support SIGTERM/SIGKILL signals — child.kill() without
      // a signal sends a graceful termination, and we escalate with taskkill /F /T /PID.
      if (process.platform === "win32") {
        try {
          // /F = force, /T = kill child tree, /PID = process id
          execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" });
        } catch {
          try { child.kill(); } catch { /* ignore */ }
        }
      } else {
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        // Escalate to SIGKILL after 1s if still alive.
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
        }, 1000);
      }
    };

    if (options.timeout) {
      timer = setTimeout(onAbort, options.timeout);
    }
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort);
      }
    }

    return new Promise<CommandResult>((resolve, reject) => {
      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        try { options.onStdout?.(text); } catch { /* ignore */ }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        try { options.onStderr?.(text); } catch { /* ignore */ }
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();

        const result: CommandResult = {
          command,
          stdout,
          stderr,
          exitCode: code ?? (cancelled ? 137 : 1),
          durationMs: Date.now() - start,
          cancelled,
        };

        if (options.recordHistory !== false) {
          const entry: CommandHistoryEntry = {
            id: `${start}-${Math.random().toString(36).slice(2, 10)}`,
            command,
            cwd,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            timestamp: start,
          };
          commandHistory.add(entry);
        }

        resolve(result);
      });
    });
  }

  /**
   * Run a shell command and yield stdout/stderr chunks as they arrive.
   * The generator completes when the process exits. Throws on spawn errors
   * or permission denial.
   */
  async *runCommandStream(
    command: string,
    options: RunCommandOptions = {}
  ): AsyncGenerator<CommandChunk, void, void> {
    await authorize(command, options);

    const start = Date.now();
    const cwd = options.cwd || getProjectRoot();
    const child = spawnChild(command, options);

    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const onAbort = () => {
      cancelled = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }, 1000);
    };

    if (options.timeout) {
      timer = setTimeout(onAbort, options.timeout);
    }
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort);
      }
    }

    // Simple async queue: producers push chunks; consumer awaits them.
    const queue: CommandChunk[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;
    let spawnError: Error | null = null;
    let finalExitCode = 0;

    const enqueue = (chunk: CommandChunk) => {
      queue.push(chunk);
      if (resolveWait) {
        const r = resolveWait;
        resolveWait = null;
        r();
      }
    };

    const finish = () => {
      done = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
      if (resolveWait) {
        const r = resolveWait;
        resolveWait = null;
        r();
      }
    };

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      try { options.onStdout?.(text); } catch { /* ignore */ }
      enqueue({ stream: "stdout", data: text });
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      try { options.onStderr?.(text); } catch { /* ignore */ }
      enqueue({ stream: "stderr", data: text });
    });

    child.on("error", (err) => {
      spawnError = err;
      finish();
    });

    child.on("close", (code) => {
      finalExitCode = code ?? (cancelled ? 137 : 1);
      finish();
    });

    while (true) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }

    // Record into history.
    if (options.recordHistory !== false) {
      const entry: CommandHistoryEntry = {
        id: `${start}-${Math.random().toString(36).slice(2, 10)}`,
        command,
        cwd,
        exitCode: finalExitCode,
        durationMs: Date.now() - start,
        timestamp: start,
      };
      commandHistory.add(entry);
    }

    if (spawnError) throw spawnError;
  }
}

/** Singleton command runner. */
export const commandRunner = new CommandRunner();
