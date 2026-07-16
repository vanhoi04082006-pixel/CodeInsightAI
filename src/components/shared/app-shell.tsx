"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ScanSearch,
  FolderGit2,
  MessagesSquare,
  History,
  Settings,
  Sparkles,
  Github,
  ChevronLeft,
  Command,
  Plug,
  Bot,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProvidersStore } from "@/lib/providers-store";
import { usePersonalityStore } from "@/lib/personality-store";
import type { View } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const NAV: { id: View; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: "landing", label: "Home", icon: Sparkles, hint: "Landing page" },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Overview & scores" },
  { id: "analyze", label: "Analyze", icon: ScanSearch, hint: "Run a new analysis" },
  { id: "project", label: "Project Report", icon: FolderGit2, hint: "Detailed report" },
  { id: "chat", label: "AI Chat", icon: MessagesSquare, hint: "Ask the AI CTO" },
  { id: "history", label: "History", icon: History, hint: "Past analyses" },
  { id: "providers", label: "AI Providers", icon: Plug, hint: "Connect your AI APIs" },
  { id: "personalities", label: "Personalities", icon: Bot, hint: "Customize AI behavior" },
  { id: "settings", label: "Settings", icon: Settings, hint: "Preferences" },
];

export function AppSidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const activeReport = useAppStore((s) => s.activeReport);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="glass-strong sticky top-0 z-30 hidden h-screen flex-col border-r border-white/10 md:flex"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-4">
        <button
          onClick={() => setView("landing")}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 neon-border-cyan"
        >
          <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-md animate-pulse-glow" />
          <Github className="relative h-5 w-5 text-cyan-300" />
        </button>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="flex flex-col leading-tight"
            >
              <span className="text-sm font-bold tracking-tight">CodeInsight</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neon-cyan">AI</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={toggle}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin">
        {NAV.map((item) => {
          const active = view === item.id;
          const disabled = (item.id === "project" || item.id === "chat") && !activeReport;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => !disabled && setView(item.id)}
              disabled={disabled}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-cyan-500/20 to-violet-500/15"
                  style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                />
              )}
              {active && (
                <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-1 rounded-r-full bg-cyan-400 neon-glow-cyan" />
              )}
              <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-cyan-300")} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
              {!collapsed && active && (
                <Sparkles className="ml-auto h-3.5 w-3.5 text-cyan-300" />
              )}
            </button>
          );
        })}
      </nav>

      {/* AI status card (replaces former upgrade card) */}
      {!collapsed && <AIStatusCard onOpen={() => setView("providers")} />}
    </motion.aside>
  );
}

export function AppTopbar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const activeReport = useAppStore((s) => s.activeReport);

  const titleMap: Record<View, string> = {
    landing: "Welcome",
    dashboard: "Dashboard",
    analyze: "New Analysis",
    project: "Project Report",
    chat: "AI Chat",
    history: "History",
    settings: "Settings",
    providers: "AI Providers",
    personalities: "AI Personalities",
  };

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/10 px-4 md:px-6">
      {/* Mobile brand */}
      <button
        onClick={() => setView("landing")}
        className="flex items-center gap-2 md:hidden"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
          <Github className="h-4 w-4 text-cyan-300" />
        </div>
        <span className="text-sm font-bold">CodeInsight</span>
      </button>

      <div className="hidden md:block">
        <h1 className="text-sm font-semibold">{titleMap[view]}</h1>
        <p className="text-[11px] text-muted-foreground">
          {activeReport && (view === "project" || view === "chat")
            ? `${activeReport.repoOwner}/${activeReport.repoName}`
            : "AI-powered repository intelligence"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => useAppStore.getState().setCommandOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-white/5 sm:flex"
        >
          <Command className="h-3.5 w-3.5" />
          <span>Quick search</span>
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <LanguageSwitcher compact />
        <Button
          size="sm"
          onClick={() => setView("analyze")}
          className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
        >
          <ScanSearch className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">New Analysis</span>
          <span className="sm:hidden">Analyze</span>
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40 text-xs font-bold">
          ZA
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const activeReport = useAppStore((s) => s.activeReport);
  const items = NAV.filter((n) => n.id !== "landing");
  return (
    <nav className="glass-strong fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-white/10 px-1 py-1.5 md:hidden">
      {items.map((item) => {
        const active = view === item.id;
        const disabled = (item.id === "project" || item.id === "chat") && !activeReport;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => !disabled && setView(item.id)}
            disabled={disabled}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] transition",
              active ? "text-cyan-300" : "text-muted-foreground",
              disabled && "opacity-40"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label.split(" ")[0]}
            {active && (
              <motion.span
                layoutId="mobile-nav-active"
                className="absolute -top-0.5 h-0.5 w-8 rounded-full bg-cyan-400"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- AI status card (sidebar footer) ---------- */
function AIStatusCard({ onOpen }: { onOpen: () => void }) {
  const providers = useProvidersStore((s) => s.providers);
  const enabled = providers.filter((p) => p.enabled).length;
  const connected = providers.filter((p) => p.status === "connected").length;
  const personality = usePersonalityStore((s) => s.getActive());
  const dotColor = enabled === 0 ? "#64748b" : connected > 0 ? "#34d399" : "#fbbf24";
  return (
    <div className="p-3">
      <div className="gradient-border relative overflow-hidden rounded-xl p-4">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-cyan-500/15 blur-2xl" />
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-cyan-300" />
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: dotColor }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dotColor }} />
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold">
          {enabled === 0 ? "Connect your AI" : `${enabled} provider${enabled === 1 ? "" : "s"} ready`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {enabled === 0
            ? "Use your own AI APIs. No subscriptions."
            : `${connected} connected · switch models freely`}
        </p>
        {/* active personality */}
        <button
          onClick={() => useAppStore.getState().setView("personalities")}
          className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[11px] transition hover:border-cyan-400/30"
        >
          <Bot className="h-3 w-3" style={{ color: personality.accent }} />
          <span className="text-muted-foreground">Personality:</span>
          <span className="ml-auto font-medium" style={{ color: personality.accent }}>{personality.name}</span>
        </button>
        <Button
          size="sm"
          onClick={onOpen}
          className="mt-3 w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
        >
          {enabled === 0 ? "Add AI Provider" : "Manage providers"}
        </Button>
      </div>
    </div>
  );
}
