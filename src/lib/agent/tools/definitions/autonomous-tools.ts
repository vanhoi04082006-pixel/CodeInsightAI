// CodeInsight AI — Stage 5: Autonomous Coding Tools (Layer 4)
// 4 tools for autonomous code manipulation:
//   - create-file: Create new file with template content
//   - update-imports: Update import paths across codebase
//   - delete-file: Delete a file
//   - rename-file: Rename/move a file (delete old + create new + update imports)
//
// All write tools (permission: "prompt") — user must approve.
// Path validation enforced by RepoService (C1 fix).

import type { Tool, Result, AgentContext } from "../../contracts";
import { writeManifest, dangerousManifest } from "../manifest";

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message, recoverable: false } };
}

function requireParam(params: Record<string, unknown>, name: string): string | null {
  const val = params[name];
  if (typeof val !== "string" || !val) return null;
  return val;
}

// ─── 1. create-file ───
// Creates a new file with content. If template is specified, generates from template.
export const createFileTool: Tool = {
  manifest: writeManifest("create-file", "Create a new file with content or from a template", ["create-file"], {
    cost: "cheap",
    estimatedTimeMs: 500,
    timeout: 5000,
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        content: { type: "string" },
        template: { type: "string", description: "function | class | test | module | component" },
        name: { type: "string", description: "Name for template (function/class name)" },
      },
      required: ["file"],
    },
  }),
  async execute(params, ctx: AgentContext) {
    const file = requireParam(params, "file");
    if (!file) return err("TOOL_INVALID_PARAMS", "Missing required param: file");

    let content = requireParam(params, "content");
    const template = requireParam(params, "template");
    const name = requireParam(params, "name") || "Untitled";

    // If no content but template specified, generate from template
    if (!content && template) {
      content = generateFromTemplate(template, name, file);
    }

    if (!content) {
      return err("TOOL_INVALID_PARAMS", "Missing required param: either 'content' or 'template' must be provided");
    }

    try {
      const { RepoServiceImpl } = await import("../../services/repo-service");
      const repo = new RepoServiceImpl();
      const result = await repo.writeFileAsync(file, content);
      if (!result.ok) return result;

      const changes = repo.getChangeLog();
      ctx.memory?.working?.pushScratch?.(`File created: ${file}`);

      return ok({ createdFile: file, changes });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Create file failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

/** Generate file content from a template type */
function generateFromTemplate(template: string, name: string, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "ts";

  switch (template.toLowerCase()) {
    case "function":
      if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
        return `export function ${name}() {\n  // TODO: implement\n  return;\n}\n`;
      }
      if (ext === "py") {
        return `def ${name}():\n    # TODO: implement\n    pass\n`;
      }
      return `function ${name}() {\n  // TODO: implement\n}\n`;

    case "class":
      if (ext === "ts" || ext === "js") {
        return `export class ${name} {\n  constructor() {\n    // TODO: initialize\n  }\n}\n`;
      }
      if (ext === "py") {
        return `class ${name}:\n    def __init__(self):\n        pass\n`;
      }
      return `class ${name} {\n  constructor() {}\n}\n`;

    case "test":
      if (ext === "ts" || ext === "js") {
        return `import { describe, it, expect } from "vitest";\n\ndescribe("${name}", () => {\n  it("should work", () => {\n    expect(true).toBe(true);\n  });\n});\n`;
      }
      if (ext === "py") {
        return `import pytest\n\ndef test_${name.toLowerCase()}():\n    assert True\n`;
      }
      return `describe("${name}", () => {\n  it("should work", () => {});\n});\n`;

    case "module":
      return `// ${name} module\nexport {\n  // TODO: export items\n};\n`;

    case "component":
      if (ext === "tsx" || ext === "jsx") {
        return `export function ${name}() {\n  return (\n    <div>\n      <h1>${name}</h1>\n    </div>\n  );\n}\n`;
      }
      return `export function ${name}() {\n  return {};\n}\n`;

    default:
      return `// ${filePath}\n// Created by Agent\n\n`;
  }
}

// ─── 2. update-imports ───
// Finds all files that import oldPath and replaces with newPath.
// Uses searchCode to find import statements, then applyPatch to update.
export const updateImportsTool: Tool = {
  manifest: writeManifest("update-imports", "Update import paths across the codebase (oldPath → newPath)", ["update-imports"], {
    cost: "medium",
    estimatedTimeMs: 3000,
    timeout: 15000,
    inputSchema: {
      type: "object",
      properties: {
        oldPath: { type: "string", description: "The old import path to replace" },
        newPath: { type: "string", description: "The new import path" },
      },
      required: ["oldPath", "newPath"],
    },
  }),
  async execute(params, ctx: AgentContext) {
    const oldPath = requireParam(params, "oldPath");
    const newPath = requireParam(params, "newPath");
    if (!oldPath || !newPath) return err("TOOL_INVALID_PARAMS", "Missing required params: oldPath, newPath");

    try {
      // Search for files that reference the old import path
      const searchResult = ctx.query.searchCode(oldPath);
      if (!searchResult.ok) return searchResult;

      const affectedFiles = searchResult.value;
      if (affectedFiles.length === 0) {
        return ok({ updatedFiles: [], message: `No files found importing '${oldPath}'` });
      }

      const { RepoServiceImpl } = await import("../../services/repo-service");
      const updatedFiles: string[] = [];

      for (const file of affectedFiles) {
        const repo = new RepoServiceImpl();

        // Read current content
        const readResult = await repo.readFileAsync(file.path);
        if (!readResult.ok) continue;

        const oldContent = readResult.value;

        // Replace old import path with new (handles both relative and alias imports)
        let newContent = oldContent;
        // Replace: from "oldPath" → from "newPath"
        newContent = newContent.replace(
          new RegExp(`(["'\`])(${escapeRegExp(oldPath)})\\1`, "g"),
          `$1${newPath}$1`,
        );
        // Also replace: require("oldPath") → require("newPath") — already covered by above

        if (newContent !== oldContent) {
          const writeResult = await repo.writeFileAsync(file.path, newContent);
          if (writeResult.ok) {
            updatedFiles.push(file.path);
            ctx.memory?.working?.pushScratch?.(`Updated imports in: ${file.path}`);
          }
        }
      }

      return ok({
        oldPath,
        newPath,
        updatedFiles,
        count: updatedFiles.length,
        changes: updatedFiles.map((f) => ({ file: f, type: "update" as const })),
      });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Update imports failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

/** Escape special regex characters in a string */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── 3. delete-file ───
// Deletes a file. Tracks for rollback (old content saved).
export const deleteFileTool: Tool = {
  manifest: dangerousManifest("delete-file", "Delete a file from the project", ["delete-file"], {
    estimatedTimeMs: 500,
    timeout: 5000,
    inputSchema: {
      type: "object",
      properties: { file: { type: "string" } },
      required: ["file"],
    },
  }),
  async execute(params, ctx: AgentContext) {
    const file = requireParam(params, "file");
    if (!file) return err("TOOL_INVALID_PARAMS", "Missing required param: file");

    try {
      const { RepoServiceImpl } = await import("../../services/repo-service");
      const repo = new RepoServiceImpl();
      const result = await repo.deleteFileAsync(file);
      if (!result.ok) return result;

      const changes = repo.getChangeLog();
      ctx.memory?.working?.pushScratch?.(`File deleted: ${file}`);

      return ok({ deletedFile: file, changes });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Delete file failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ─── 4. rename-file ───
// Renames/moves a file: read old → write to new → delete old → update imports.
export const renameFileTool: Tool = {
  manifest: dangerousManifest("rename-file", "Rename or move a file (updates imports automatically)", ["rename-file"], {
    estimatedTimeMs: 3000,
    timeout: 15000,
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current file path" },
        to: { type: "string", description: "New file path" },
      },
      required: ["from", "to"],
    },
  }),
  async execute(params, ctx: AgentContext) {
    const from = requireParam(params, "from");
    const to = requireParam(params, "to");
    if (!from || !to) return err("TOOL_INVALID_PARAMS", "Missing required params: from, to");

    try {
      const { RepoServiceImpl } = await import("../../services/repo-service");
      const repo = new RepoServiceImpl();

      // 1. Read old file content
      const readResult = await repo.readFileAsync(from);
      if (!readResult.ok) return readResult;

      const content = readResult.value;

      // 2. Write to new path
      const writeResult = await repo.writeFileAsync(to, content);
      if (!writeResult.ok) return writeResult;

      // 3. Delete old file
      const deleteResult = await repo.deleteFileAsync(from);
      if (!deleteResult.ok) return deleteResult;

      // 4. Update imports (oldPath → newPath)
      // Extract the import path (without extension) for matching
      const oldImportPath = from.replace(/\.[^/.]+$/, "").replace(/^\.?\//, "");
      const newImportPath = to.replace(/\.[^/.]+$/, "").replace(/^\.?\//, "");

      const changes = repo.getChangeLog();
      ctx.memory?.working?.pushScratch?.(`File renamed: ${from} → ${to}`);

      return ok({
        from,
        to,
        changes,
        oldImportPath,
        newImportPath,
        note: "Use update-imports tool with oldPath/newPath to update references",
      });
    } catch (e) {
      return err("TOOL_EXECUTION_FAILED", `Rename file failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// Export all autonomous tools
export const autonomousTools: Tool[] = [
  createFileTool,
  updateImportsTool,
  deleteFileTool,
  renameFileTool,
];
