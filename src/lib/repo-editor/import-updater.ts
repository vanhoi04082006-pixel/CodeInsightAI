// CodeInsight AI — Repository Editor: Import Updater
// Rewrites import statements after a file rename / move / delete.
// Supports relative ("./", "../") and alias ("@/", "~/") imports.

import * as path from "path";
import { listFiles, readFile, writeFile } from "./file-operations";

export interface UpdateResult {
  filesUpdated: string[];
  changes: number;
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

/** Strip a code extension from a path (imports usually omit extensions). */
function stripExt(p: string): string {
  return p.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, "");
}

/** Escape a string for safe inclusion in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve an alias import path (`@/...`, `~/...`, `./...`, `../...`)
 * to an absolute path on disk. Returns `null` if it cannot be resolved
 * (e.g. relative paths require a base directory).
 *
 * The default `@/` alias maps to `<projectRoot>/src` (Next.js convention).
 */
export function resolveAlias(importPath: string, projectRoot: string): string | null {
  if (importPath.startsWith("@/")) {
    return path.join(projectRoot, "src", importPath.slice(2));
  }
  if (importPath.startsWith("~/")) {
    return path.join(projectRoot, importPath.slice(2));
  }
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    // Cannot resolve without a base directory.
    return null;
  }
  return null;
}

interface ImportReference {
  /** The matched import-path string as it appears in source. */
  raw: string;
  /** The character start index in the source string. */
  start: number;
  /** The character end index (exclusive). */
  end: number;
  /** The resolved absolute path (no extension) that this import points at. */
  resolvedAbs: string;
}

/** Find all `from "..."` / `require("...")` / `import("...")` references in source. */
function findImportReferences(source: string, importerDir: string, projectRoot: string): ImportReference[] {
  const refs: ImportReference[] = [];

  // Matches: from "X" | from 'X' | require("X") | require('X') | import("X") | import('X')
  // Captures the quote char and the path.
  const importRegex =
    /(?:\bfrom\s+|=\s*require\s*\(\s*|\bimport\s*\(\s*)(["'])([^"']+)\1/g;

  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) {
    const importPath = m[2];
    const pathStart = m.index + m[0].length - importPath.length - 1; // index of opening quote
    const pathEnd = pathStart + 1 + importPath.length; // index of closing quote (exclusive +1)

    let resolvedAbs: string | null = null;

    if (importPath.startsWith("@/")) {
      resolvedAbs = path.join(projectRoot, "src", importPath.slice(2));
    } else if (importPath.startsWith("~/")) {
      resolvedAbs = path.join(projectRoot, importPath.slice(2));
    } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
      resolvedAbs = path.resolve(importerDir, importPath);
    } else {
      // Bare specifier (e.g. "react") — not a project file. Skip.
      continue;
    }

    refs.push({
      raw: importPath,
      start: pathStart + 1, // skip opening quote
      end: pathEnd - 1, // skip closing quote
      resolvedAbs: stripExt(resolvedAbs.replace(/\\/g, "/")),
    });
  }

  return refs;
}

/** Build the new import path string for a renamed file. */
function buildNewImportPath(
  importerDir: string,
  newPath: string,
  originalAliasKind: "@" | "~" | "." | null
): string {
  if (originalAliasKind === "@") {
    // Try to express as @/ alias if newPath is under src/
    const srcDir = path.join(process.cwd(), "src").replace(/\\/g, "/");
    const normNew = newPath.replace(/\\/g, "/");
    if (normNew.startsWith(srcDir + "/")) {
      return "@/" + normNew.slice(srcDir.length + 1).replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, "");
    }
  } else if (originalAliasKind === "~") {
    const root = process.cwd().replace(/\\/g, "/");
    const normNew = newPath.replace(/\\/g, "/");
    if (normNew.startsWith(root + "/")) {
      return "~/" + normNew.slice(root.length + 1).replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, "");
    }
  }

  // Fall back to relative path from importer's directory.
  let rel = path.relative(importerDir, newPath).replace(/\\/g, "/");
  rel = rel.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, "");
  if (!rel.startsWith(".")) {
    rel = "./" + rel;
  }
  return rel;
}

/** Determine which alias style the original import path used. */
function getAliasKind(raw: string): "@" | "~" | "." | null {
  if (raw.startsWith("@/")) return "@";
  if (raw.startsWith("~/")) return "~";
  if (raw.startsWith("./") || raw.startsWith("../")) return ".";
  return null;
}

/**
 * After a file is renamed / moved, scan every code file under `projectRoot`
 * and rewrite imports that referenced the old path so they point at the new one.
 */
export async function updateImportsForRename(
  projectRoot: string,
  oldPath: string,
  newPath: string
): Promise<UpdateResult> {
  const filesUpdated: string[] = [];
  let changes = 0;

  const oldAbsNoExt = stripExt(path.resolve(oldPath).replace(/\\/g, "/"));
  const newAbs = path.resolve(newPath);

  const candidates = (await listFiles(projectRoot)).filter((f) =>
    CODE_EXTENSIONS.some((e) => f.endsWith(e))
  );

  for (const file of candidates) {
    let content: string;
    try {
      content = await readFile(file);
    } catch {
      continue;
    }

    const importerDir = path.dirname(file);
    const refs = findImportReferences(content, importerDir, projectRoot);
    if (refs.length === 0) continue;

    // Filter to refs that point at the old file path.
    const matching = refs.filter((r) => r.resolvedAbs === oldAbsNoExt);
    if (matching.length === 0) continue;

    // Apply replacements from end-to-start so indices stay valid.
    let modified = content;
    for (let i = matching.length - 1; i >= 0; i--) {
      const ref = matching[i];
      const aliasKind = getAliasKind(ref.raw);
      const newImportPath = buildNewImportPath(importerDir, newAbs, aliasKind);
      modified = modified.slice(0, ref.start) + newImportPath + modified.slice(ref.end);
      changes++;
    }

    if (modified !== content) {
      await writeFile(file, modified);
      filesUpdated.push(file);
    }
  }

  return { filesUpdated, changes };
}

/**
 * After a file is deleted, scan every code file under `projectRoot`
 * and remove import statements that referenced the deleted file.
 *
 * The removal is conservative: we delete the entire `import ... from "...";`
 * (or `const x = require("...");`) statement so the file remains syntactically
 * valid. Callers are responsible for cleaning up references to the removed
 * bindings (e.g. usages of imported symbols).
 */
export async function updateImportsForDelete(
  projectRoot: string,
  deletedPath: string
): Promise<UpdateResult> {
  const filesUpdated: string[] = [];
  let changes = 0;

  const deletedAbsNoExt = stripExt(path.resolve(deletedPath).replace(/\\/g, "/"));

  const candidates = (await listFiles(projectRoot)).filter((f) =>
    CODE_EXTENSIONS.some((e) => f.endsWith(e))
  );

  for (const file of candidates) {
    let content: string;
    try {
      content = await readFile(file);
    } catch {
      continue;
    }

    const importerDir = path.dirname(file);
    const refs = findImportReferences(content, importerDir, projectRoot);
    if (refs.length === 0) continue;

    const matching = refs.filter((r) => r.resolvedAbs === deletedAbsNoExt);
    if (matching.length === 0) continue;

    // For each matching reference, find the full statement line(s) and remove them.
    const lines = content.split("\n");
    const linesToRemove = new Set<number>();

    for (const ref of matching) {
      // Find which line the reference appears on.
      let pos = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineStart = pos;
        const lineEnd = pos + lines[i].length;
        if (ref.start >= lineStart && ref.start < lineEnd + 1) {
          // Check if this is a single-line import statement.
          const line = lines[i];
          if (
            /^\s*import\s/.test(line) ||
            /^\s*import\s*type\s/.test(line) ||
            /\brequire\s*\(/.test(line)
          ) {
            linesToRemove.add(i);
          } else {
            // Multi-line import — find the start (import ...) and end (from "...").
            // Walk backwards for the import keyword.
            let startLine = i;
            while (startLine > 0 && !/^\s*import\b/.test(lines[startLine]) && !/\brequire\s*\(/.test(lines[startLine])) {
              startLine--;
            }
            // Walk forwards for the closing quote + semicolon.
            let endLine = i;
            while (endLine < lines.length - 1) {
              if (/["'];?\s*$/.test(lines[endLine]) && lines[endLine].includes('"') || lines[endLine].includes("'")) {
                if (endLine >= i && /["']/.test(lines[endLine])) {
                  // Check this is the line with the closing quote
                  const afterRef = lines[endLine].slice(ref.start - lineStart);
                  if (afterRef.includes("'") || afterRef.includes('"')) break;
                }
              }
              endLine++;
            }
            for (let j = startLine; j <= endLine; j++) {
              linesToRemove.add(j);
            }
          }
          break;
        }
        pos = lineEnd + 1; // +1 for the newline
      }
    }

    if (linesToRemove.size === 0) continue;

    const newLines = lines.filter((_, idx) => !linesToRemove.has(idx));
    const modified = newLines.join("\n");

    if (modified !== content) {
      await writeFile(file, modified);
      filesUpdated.push(file);
      changes += linesToRemove.size;
    }
  }

  return { filesUpdated, changes };
}

// Re-export for convenience.
export { escapeRegExp };
