"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Keyboard,
  X,
  Command,
  ArrowRight,
  Search,
  LayoutDashboard,
  ScanSearch,
  FolderGit2,
  MessagesSquare,
  History,
  Settings,
  Plug,
  Rocket,
  Home,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";

type Shortcut = {
  keys: string[];
  label: string;
  icon: typeof Command;
  category: "navigation" | "actions";
};

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ["⌘", "K"], label: "Open command palette", icon: Search, category: "navigation" },
  { keys: ["⌘", "D"], label: "Go to Dashboard", icon: LayoutDashboard, category: "navigation" },
  { keys: ["⌘", "A"], label: "New analysis", icon: ScanSearch, category: "navigation" },
  { keys: ["⌘", "P"], label: "Providers", icon: Plug, category: "navigation" },
  { keys: ["⌘", "H"], label: "History", icon: History, category: "navigation" },
  { keys: ["⌘", "M"], label: "Mission Control", icon: Rocket, category: "navigation" },
  { keys: ["⌘", "C"], label: "Chat (when no text selected)", icon: MessagesSquare, category: "navigation" },
  { keys: ["⌘", ","], label: "Settings", icon: Settings, category: "navigation" },
  // Vim-style
  { keys: ["g", "d"], label: "Go to Dashboard (vim)", icon: LayoutDashboard, category: "navigation" },
  { keys: ["g", "a"], label: "Go to Analyze (vim)", icon: ScanSearch, category: "navigation" },
  { keys: ["g", "p"], label: "Go to Project (vim)", icon: FolderGit2, category: "navigation" },
  { keys: ["g", "c"], label: "Go to Chat (vim)", icon: MessagesSquare, category: "navigation" },
  { keys: ["g", "h"], label: "Go to History (vim)", icon: History, category: "navigation" },
  { keys: ["g", "s"], label: "Go to Settings (vim)", icon: Settings, category: "navigation" },
  { keys: ["g", "m"], label: "Go to Mission (vim)", icon: Rocket, category: "navigation" },
  { keys: ["g", "l"], label: "Go to Landing (vim)", icon: Home, category: "navigation" },
  // Actions
  { keys: ["Esc"], label: "Back to landing / blur input", icon: X, category: "actions" },
  { keys: ["?"], label: "Show this help", icon: Keyboard, category: "actions" },
];

/**
 * KeyboardShortcutsHelp
 *
 * A dialog that shows all available keyboard shortcuts.
 * Triggered by pressing `?` (when not typing in an input).
 *
 * Mounted globally in AppShell so it's available on every view.
 */
export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const setView = useAppStore((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only trigger on `?` (Shift + /) when NOT typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isTyping) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      // Esc closes the dialog (Dialog handles this, but also if open)
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navShortcuts = SHORTCUTS.filter((s) => s.category === "navigation");
  const actionShortcuts = SHORTCUTS.filter((s) => s.category === "actions");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-strong max-w-2xl border-white/10 p-0">
        <DialogHeader className="border-b border-white/5 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Keyboard className="h-5 w-5 text-cyan-300" />
            Keyboard Shortcuts
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">?</kbd> anytime to toggle this panel.
            On macOS use <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">⌘</kbd>, on Windows/Linux use{" "}
            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">Ctrl</kbd>.
          </p>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-6 overflow-y-auto px-6 py-5 scrollbar-thin md:grid-cols-2">
          {/* Navigation shortcuts */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5 text-cyan-300" />
              Navigation
            </h3>
            <ul className="space-y-1.5">
              {navShortcuts.map((s) => {
                const Icon = s.icon;
                return (
                  <li
                    key={s.label}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition hover:border-cyan-400/20 hover:bg-white/[0.04]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-xs text-foreground/90">{s.label}</span>
                    <span className="flex items-center gap-0.5">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Action shortcuts */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Command className="h-3.5 w-3.5 text-violet-300" />
              Actions
            </h3>
            <ul className="space-y-1.5">
              {actionShortcuts.map((s) => {
                const Icon = s.icon;
                return (
                  <li
                    key={s.label}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition hover:border-violet-400/20 hover:bg-white/[0.04]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-xs text-foreground/90">{s.label}</span>
                    <span className="flex items-center gap-0.5">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Pro tip */}
            <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-3">
              <p className="text-[11px] font-medium text-cyan-200">💡 Pro tip</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Vim-style <code className="rounded bg-white/5 px-1 text-cyan-200">g</code> then a letter lets you
                navigate single-handedly without holding modifiers.
              </p>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-3">
          <span className="text-[10px] text-muted-foreground">
            {SHORTCUTS.length} shortcuts available
          </span>
          <button
            onClick={() => {
              setOpen(false);
              setView("landing");
            }}
            className="text-[11px] text-cyan-300 hover:text-cyan-200"
          >
            Back to home →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
