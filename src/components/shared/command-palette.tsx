"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ScanSearch,
  FolderGit2,
  MessagesSquare,
  History,
  Settings,
  Sparkles,
  Plug,
  Bot,
  Home,
  Search,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { View } from "@/lib/types";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const COMMANDS: { id: View; labelKey: string; icon: typeof Home; group: string }[] = [
  { id: "landing", labelKey: "nav.home", icon: Home, group: "Navigation" },
  { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, group: "Navigation" },
  { id: "analyze", labelKey: "actions.newAnalysis", icon: ScanSearch, group: "Actions" },
  { id: "project", labelKey: "nav.project", icon: FolderGit2, group: "Navigation" },
  { id: "chat", labelKey: "nav.chat", icon: MessagesSquare, group: "Actions" },
  { id: "history", labelKey: "nav.history", icon: History, group: "Navigation" },
  { id: "providers", labelKey: "nav.providers", icon: Plug, group: "Actions" },
  { id: "personalities", labelKey: "nav.personalities", icon: Bot, group: "Actions" },
  { id: "settings", labelKey: "nav.settings", icon: Settings, group: "Navigation" },
];

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const setView = useAppStore((s) => s.setView);
  const activeReport = useAppStore((s) => s.activeReport);
  const { t } = useT();

  const run = (v: View) => {
    if ((v === "project" || v === "chat") && !activeReport) {
      setView("analyze");
    } else {
      setView(v);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden border-white/10 bg-popover/90 p-0 backdrop-blur-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {Object.entries(
            COMMANDS.reduce<Record<string, typeof COMMANDS>>((acc, c) => {
              (acc[c.group] = acc[c.group] || []).push(c);
              return acc;
            }, {})
          ).map(([group, items]) => (
            <div key={group} className="mb-2">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{group}</p>
              {items.map((c) => {
                const Icon = c.icon;
                const disabled = (c.id === "project" || c.id === "chat") && !activeReport;
                return (
                  <button
                    key={c.id}
                    onClick={() => run(c.id)}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-white/5 disabled:opacity-40"
                  >
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <span className="flex-1">{t("common", c.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> CodeInsight AI</span>
          <span>↑↓ navigate · ↵ select</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
