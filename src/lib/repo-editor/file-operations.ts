// CodeInsight AI — Repository Editor: File Operations
// Phase 3: Autonomous AI Software Engineer — supporting library for the
// bug-fixer / refactoring-agent / documentation-agent to manipulate files.

import * as fs from "fs/promises";
import * as path from "path";

/** Returns the project root (process.cwd()). */
export function getProjectRoot(): string {
  return process.cwd();
}

/** Check whether a file exists on disk. */
export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read a UTF-8 file from disk. */
export async function readFile(p: string): Promise<string> {
  return await fs.readFile(p, "utf-8");
}

/**
 * Write content to a file, creating parent directories if needed.
 * Replaces `fs.writeFile` while ensuring the directory tree exists.
 */
export async function writeFile(p: string, content: string): Promise<void> {
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, content, "utf-8");
}

/** Alias for writeFile — semantic convenience for callers creating a new file. */
export async function createFile(p: string, content: string): Promise<void> {
  return writeFile(p, content);
}

/** Delete a file. Throws if it does not exist. */
export async function deleteFile(p: string): Promise<void> {
  await fs.unlink(p);
}

/** Rename / move a file. */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath);
}

/** Move a file, ensuring the destination directory exists first. */
export async function moveFile(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(src, dest);
}

/** Directories that should be skipped when walking the project tree. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
  ".turbo",
]);

/** Convert a simple glob pattern into a RegExp for filtering. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** matches across path separators
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // consume trailing /
      } else {
        // * matches a single path segment (no /)
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^$(){}|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re);
}

/**
 * Recursively list all files under `dir`.
 * If `pattern` is provided (glob), filter results to those that match.
 * Common build/cache directories are skipped.
 */
export async function listFiles(dir: string, pattern?: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(d: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(d, entry.name));
      } else if (entry.isFile()) {
        results.push(path.join(d, entry.name));
      }
    }
  }

  await walk(dir);

  if (pattern) {
    const re = globToRegExp(pattern);
    const root = dir.replace(/\\/g, "/");
    return results
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => re.test(f) || re.test(f.slice(root.length + 1)));
  }

  return results;
}
