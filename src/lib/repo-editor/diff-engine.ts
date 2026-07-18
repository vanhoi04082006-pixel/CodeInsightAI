// CodeInsight AI — Repository Editor: Diff Engine
// Computes line-level diffs (LCS-based), formats them as unified diff / HTML,
// and can apply a diff back onto original content.

export type DiffLineType = "add" | "del" | "ctx";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** Line number in the old file (set for ctx / del). */
  oldLine?: number;
  /** Line number in the new file (set for ctx / add). */
  newLine?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

const DEFAULT_CONTEXT = 3;

/** Split content into lines, preserving the presence/absence of a trailing newline. */
function splitLines(content: string): string[] {
  if (content === "") return [];
  // Splitting with a trailing "\n" produces a trailing "" element — keep it
  // so the diff engine can model the final newline correctly.
  return content.split("\n");
}

/**
 * Compute the LCS table (bottom-up) for oldLines and newLines.
 * Returns a (m+1) x (n+1) table where dp[i][j] = LCS length of
 * oldLines[i..] and newLines[j..].
 */
function buildLCSTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  return dp;
}

/** Trace through the LCS table to produce a flat list of DiffLines. */
function traceDiff(oldLines: string[], newLines: string[], dp: number[][]): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  const m = oldLines.length;
  const n = newLines.length;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "ctx", content: oldLines[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", content: oldLines[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ type: "add", content: newLines[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < m) {
    out.push({ type: "del", content: oldLines[i], oldLine: i + 1 });
    i++;
  }
  while (j < n) {
    out.push({ type: "add", content: newLines[j], newLine: j + 1 });
    j++;
  }
  return out;
}

/**
 * Group flat diff lines into hunks with up to `contextSize` lines of
 * surrounding context. Adjacent changes within 2*contextSize+1 lines are
 * merged into a single hunk.
 */
function groupIntoHunks(diffLines: DiffLine[], contextSize: number = DEFAULT_CONTEXT): DiffHunk[] {
  if (diffLines.length === 0) return [];

  const changeIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== "ctx") changeIndices.push(i);
  }
  if (changeIndices.length === 0) return [];

  // Cluster change indices that are close enough to belong to one hunk.
  const clusters: number[][] = [[changeIndices[0]]];
  for (let k = 1; k < changeIndices.length; k++) {
    const prev = changeIndices[k - 1];
    const curr = changeIndices[k];
    if (curr - prev > 2 * contextSize + 1) {
      clusters.push([curr]);
    } else {
      clusters[clusters.length - 1].push(curr);
    }
  }

  const hunks: DiffHunk[] = [];
  for (const cluster of clusters) {
    const firstChange = cluster[0];
    const lastChange = cluster[cluster.length - 1];

    const startIdx = Math.max(0, firstChange - contextSize);
    const endIdx = Math.min(diffLines.length - 1, lastChange + contextSize);

    const lines = diffLines.slice(startIdx, endIdx + 1);

    // Compute hunk start positions.
    // oldStart = oldLine of first ctx/del line (or 0 if hunk begins with add-only).
    // newStart = newLine of first ctx/add line (or 0 if hunk begins with del-only).
    let oldStart: number | undefined;
    let newStart: number | undefined;

    for (const l of lines) {
      if (l.oldLine !== undefined) {
        oldStart = l.oldLine - (l.type === "ctx" ? 0 : 0);
        // If the first line is an add, then oldStart is one less than the
        // next ctx/del's oldLine minus the count of adds before it. Adjust below.
        break;
      }
    }
    for (const l of lines) {
      if (l.newLine !== undefined) {
        newStart = l.newLine;
        break;
      }
    }

    // If the hunk begins with adds, oldStart is the line BEFORE the first add
    // in the old file. That equals (first ctx/del oldLine) - (count of adds before it).
    if (lines[0].type === "add") {
      let addCount = 0;
      for (const l of lines) {
        if (l.type === "add") addCount++;
        else break;
      }
      if (oldStart !== undefined) {
        oldStart = oldStart - addCount;
      } else {
        oldStart = 0;
      }
    }
    if (lines[0].type === "del") {
      let delCount = 0;
      for (const l of lines) {
        if (l.type === "del") delCount++;
        else break;
      }
      if (newStart !== undefined) {
        newStart = newStart - delCount;
      } else {
        newStart = 0;
      }
    }

    // Compute end positions.
    let oldEnd = oldStart ?? 0;
    let newEnd = newStart ?? 0;
    for (const l of lines) {
      if (l.oldLine !== undefined) oldEnd = l.oldLine;
      if (l.newLine !== undefined) newEnd = l.newLine;
    }

    hunks.push({
      oldStart: oldStart ?? 0,
      oldEnd,
      newStart: newStart ?? 0,
      newEnd,
      lines,
    });
  }

  return hunks;
}

/**
 * Compute a line-based diff between two strings.
 * Uses a simple Longest-Common-Subsequence algorithm.
 */
export function computeDiff(oldContent: string, newContent: string, filePath: string): FileDiff {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const dp = buildLCSTable(oldLines, newLines);
  const flat = traceDiff(oldLines, newLines, dp);
  const hunks = groupIntoHunks(flat);

  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") additions++;
      else if (line.type === "del") deletions++;
    }
  }

  return { path: filePath, hunks, additions, deletions };
}

/** Escape a string for inclusion in HTML. */
function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format a FileDiff as a unified-diff string (with --- / +++ / @@ headers). */
export function formatDiffAsUnified(diff: FileDiff): string {
  if (diff.hunks.length === 0) {
    return `--- a/${diff.path}\n+++ b/${diff.path}\n`;
  }

  const lines: string[] = [];
  lines.push(`--- a/${diff.path}`);
  lines.push(`+++ b/${diff.path}`);

  for (const hunk of diff.hunks) {
    const oldCount = Math.max(0, hunk.oldEnd - hunk.oldStart + 1);
    const newCount = Math.max(0, hunk.newEnd - hunk.newStart + 1);
    const oldStart = hunk.oldStart === 0 ? 0 : hunk.oldStart;
    const newStart = hunk.newStart === 0 ? 0 : hunk.newStart;
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const l of hunk.lines) {
      if (l.type === "ctx") lines.push(` ${l.content}`);
      else if (l.type === "add") lines.push(`+${l.content}`);
      else if (l.type === "del") lines.push(`-${l.content}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Format a FileDiff as HTML with `<span class="add">` and `<span class="del">`
 * markers per line. Suitable for rendering in a code-review panel.
 */
export function formatDiffAsHTML(diff: FileDiff): string {
  const parts: string[] = [];
  parts.push(`<div class="diff" data-path="${escapeHTML(diff.path)}">`);
  parts.push(`<div class="diff-path">${escapeHTML(diff.path)}</div>`);

  if (diff.hunks.length === 0) {
    parts.push(`<div class="diff-empty">No changes</div>`);
    parts.push(`</div>`);
    return parts.join("\n");
  }

  for (const hunk of diff.hunks) {
    const oldCount = Math.max(0, hunk.oldEnd - hunk.oldStart + 1);
    const newCount = Math.max(0, hunk.newEnd - hunk.newStart + 1);
    parts.push(
      `<div class="diff-hunk">@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@</div>`
    );
    for (const l of hunk.lines) {
      const cls = l.type === "ctx" ? "ctx" : l.type === "add" ? "add" : "del";
      const prefix = l.type === "ctx" ? " " : l.type === "add" ? "+" : "-";
      parts.push(
        `<div class="diff-line ${cls}"><span class="diff-prefix">${prefix}</span><span class="diff-content">${escapeHTML(
          l.content
        )}</span></div>`
      );
    }
  }

  parts.push(`</div>`);
  return parts.join("\n");
}

/**
 * Apply a FileDiff to `originalContent`, returning the new content.
 * The hunks are applied in `oldStart` order. Each hunk's ctx/add lines
 * are emitted, del lines are skipped, and original lines outside the
 * hunks are passed through unchanged.
 */
export function applyDiff(originalContent: string, diff: FileDiff): string {
  if (diff.hunks.length === 0) return originalContent;

  // The original content split into lines (1-indexed conceptually).
  // We use "" as a sentinel for "no line at this index".
  const originalLines = originalContent.split("\n");

  const sortedHunks = [...diff.hunks].sort((a, b) => a.oldStart - b.oldStart);

  const out: string[] = [];
  let cursor = 1; // 1-indexed position in originalLines

  for (const hunk of sortedHunks) {
    // Copy original lines up to hunk.oldStart - 1.
    while (cursor < hunk.oldStart) {
      out.push(originalLines[cursor - 1] ?? "");
      cursor++;
    }

    // Apply the hunk.
    for (const l of hunk.lines) {
      if (l.type === "ctx") {
        out.push(l.content);
        cursor++;
      } else if (l.type === "add") {
        out.push(l.content);
      } else if (l.type === "del") {
        // Skip this original line.
        cursor++;
      }
    }
  }

  // Copy any remaining original lines.
  while (cursor - 1 < originalLines.length) {
    out.push(originalLines[cursor - 1] ?? "");
    cursor++;
  }

  // Preserve trailing newline behavior of the original.
  const hadTrailingNewline = originalContent.endsWith("\n");
  let result = out.join("\n");
  if (hadTrailingNewline && !result.endsWith("\n")) result += "\n";
  if (!hadTrailingNewline && result.endsWith("\n")) result = result.slice(0, -1);

  return result;
}
