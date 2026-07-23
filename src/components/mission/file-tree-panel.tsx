"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCode2,
  FileText,
  FileJson,
  FileCog,
  FileTerminal,
  FileImage,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Filter,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileTreeEntry {
  path: string;
  action: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

interface FileTreePanelProps {
  /** Files modified — `action` is accepted as a string for compatibility with mission-store's FileModified type. */
  filesModified: Array<{
    path: string;
    action: string;
    additions: number;
    deletions: number;
  }>;
  onSelectFile: (path: string) => void;
  selectedPath?: string;
  className?: string;
}

// ── Tree building ────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
  entry?: FileTreePanelProps["filesModified"][number]; // set on file leaves
}

function buildTree(files: FileTreePanelProps["filesModified"]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: new Map(),
  };

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          path: childPath,
          isDir: !isLeaf,
          children: new Map(),
          entry: isLeaf ? f : undefined,
        });
      }
      cursor = cursor.children.get(part)!;
    }
  }
  return root;
}

// ── File icon by extension (module-level lookup map) ─────────────────────────

const FILE_ICONS: Record<string, LucideIcon> = {
  ts: FileCode2,
  tsx: FileCode2,
  js: FileCode2,
  jsx: FileCode2,
  mjs: FileCode2,
  cjs: FileCode2,
  json: FileJson,
  jsonc: FileJson,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  rst: FileText,
  sh: FileTerminal,
  bash: FileTerminal,
  zsh: FileTerminal,
  fish: FileTerminal,
  yml: FileCog,
  yaml: FileCog,
  toml: FileCog,
  ini: FileCog,
  env: FileCog,
  conf: FileCog,
  config: FileCog,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
};

// Lookup is done via direct property access on the FILE_ICONS map at render
// time (no function call), to satisfy the react-hooks/static-components rule.

// ── Action badge ─────────────────────────────────────────────────────────────

const ACTION_BADGE: Record<
  FileTreeEntry["action"],
  { color: string; label: string }
> = {
  modified: { color: "#a78bfa", label: "M" },
  added: { color: "#34d399", label: "A" },
  deleted: { color: "#f472b6", label: "D" },
};

function normalizeAction(
  action: string
): FileTreeEntry["action"] {
  if (action === "added" || action === "deleted" || action === "modified") {
    return action;
  }
  // Treat unknown actions (renamed, copied, etc.) as modified.
  return "modified";
}

function actionBadge(action: string) {
  return ACTION_BADGE[normalizeAction(action)];
}

// ── Component ────────────────────────────────────────────────────────────────

export function FileTreePanel({
  filesModified,
  onSelectFile,
  selectedPath,
  className,
}: FileTreePanelProps) {
  const [onlyModified, setOnlyModified] = useState(false);
  // Track collapsed state per directory path.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // When `onlyModified` is on, we still show full paths but auto-expand all
  // directories (so the user sees the modified files without clicking).
  const effectiveFiles = useMemo(() => filesModified, [filesModified]);

  const root = useMemo(() => buildTree(effectiveFiles), [effectiveFiles]);

  const toggleDir = (path: string) => {
    setCollapsed((c) => ({ ...c, [path]: !c[path] }));
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-cyan-300" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            File Tree
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {filesModified.length}
          </span>
          <Button
            size="sm"
            variant={onlyModified ? "secondary" : "ghost"}
            onClick={() => setOnlyModified((v) => !v)}
            className="h-6 gap-1 px-2 text-[10px]"
            title="Show only modified files"
          >
            <Filter className="h-3 w-3" />
            <span className="hidden lg:inline">Modified</span>
          </Button>
        </div>
      </div>

      {/* Tree body */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1">
        {filesModified.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground/60">
            <File className="h-6 w-6" />
            <p className="text-xs">No files modified yet.</p>
            <p className="text-[10px] text-muted-foreground/40">
              Files edited by the AI team will appear here.
            </p>
          </div>
        ) : (
          <TreeChildren
            node={root}
            depth={0}
            collapsed={collapsed}
            onToggleDir={toggleDir}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            forceExpand={onlyModified}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-1.5 text-[9px] text-muted-foreground">
        <LegendDot color={ACTION_BADGE.modified.color} label="Modified" />
        <LegendDot color={ACTION_BADGE.added.color} label="Added" />
        <LegendDot color={ACTION_BADGE.deleted.color} label="Deleted" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-flex h-3 w-3 items-center justify-center rounded text-[8px] font-bold"
        style={{ background: `${color}1a`, color }}
      >
        {label[0]}
      </span>
      <span className="text-[9px] text-muted-foreground/60">{label}</span>
    </span>
  );
}

function TreeChildren({
  node,
  depth,
  collapsed,
  onToggleDir,
  onSelectFile,
  selectedPath,
  forceExpand,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedPath?: string;
  forceExpand?: boolean;
}) {
  // Sort: directories first, then files; both alphabetical.
  const entries = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col">
      <AnimatePresence initial={false}>
        {entries.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth}
            collapsed={collapsed}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            forceExpand={forceExpand}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggleDir,
  onSelectFile,
  selectedPath,
  forceExpand,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedPath?: string;
  forceExpand?: boolean;
}) {
  const isCollapsed = forceExpand ? false : collapsed[node.path] ?? false;

  if (node.isDir) {
    const FolderIcon = isCollapsed ? Folder : FolderOpen;
    const childCount = countDescendants(node);

    return (
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] transition hover:bg-white/[0.04]"
          style={{ paddingLeft: depth * 12 + 6 }}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
          <span className="min-w-0 flex-1 truncate text-foreground/90">
            {node.name}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/50">
            {childCount}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <TreeChildren
                node={node}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
                forceExpand={forceExpand}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // File row
  const entry = node.entry;
  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
  const Icon = FILE_ICONS[ext] ?? File;
  const badge = entry ? actionBadge(entry.action) : null;
  const selected = selectedPath === node.path;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      onClick={() => entry && onSelectFile(node.path)}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition",
        selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
      )}
      style={{ paddingLeft: depth * 12 + 6 + 16 }} // +16 to align with folder label
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono",
          selected ? "text-foreground" : "text-foreground/80"
        )}
      >
        {node.name}
      </span>
      {badge && (
        <span
          className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded text-[8px] font-bold"
          style={{ background: `${badge.color}1a`, color: badge.color }}
          title={entry?.action}
        >
          {badge.label}
        </span>
      )}
      {entry && entry.additions > 0 && (
        <span className="font-mono text-[9px] text-emerald-400">
          +{entry.additions}
        </span>
      )}
      {entry && entry.deletions > 0 && (
        <span className="font-mono text-[9px] text-rose-400">
          −{entry.deletions}
        </span>
      )}
    </motion.button>
  );
}

function countDescendants(node: TreeNode): number {
  let count = 0;
  for (const child of node.children.values()) {
    if (child.isDir) {
      count += countDescendants(child);
    } else {
      count += 1;
    }
  }
  return count;
}
