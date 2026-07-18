// CodeInsight AI — AI Terminal: Command Runner
// Sandboxed shell runner with permission enforcement, streaming stdout/stderr,
// timeout + AbortSignal support, and automatic history recording.

import { spawn, type ChildProcess } from "child_process";
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
  /** Override the shell binary (default: process.env.SHELL || "/bin/bash"). */
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

function defaultShell(): string {
  return process.env.SHELL || "/bin/bash";
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
  return spawn(shell, ["-c", command], {
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
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      // Escalate to SIGKILL after 1s if still alive.
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
