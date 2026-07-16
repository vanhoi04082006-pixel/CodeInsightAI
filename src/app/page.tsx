"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { AppSidebar, AppTopbar, MobileNav } from "@/components/shared/app-shell";
import { LandingView } from "@/components/views/landing-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { AnalyzeView } from "@/components/views/analyze-view";
import { ProjectView } from "@/components/views/project-view";
import { ChatView } from "@/components/views/chat-view";
import { HistoryView } from "@/components/views/history-view";
import { SettingsView } from "@/components/views/settings-view";
import { PricingView } from "@/components/views/pricing-view";
import { CommandPalette } from "@/components/shared/command-palette";
import { Github, Sparkles, Heart } from "lucide-react";

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  // ⌘K to open command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAppStore.getState().setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isLanding = view === "landing";

  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground />

      {isLanding ? (
        /* Landing = full bleed, own layout with footer */
        <div className="flex min-h-screen flex-col">
          {/* landing top nav */}
          <header className="glass sticky top-0 z-40 flex h-16 items-center justify-between px-4 md:px-8">
            <button onClick={() => setView("landing")} className="flex items-center gap-2">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 neon-border-cyan">
                <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-md animate-pulse-glow" />
                <Github className="relative h-4 w-4 text-cyan-300" />
              </div>
              <div className="leading-tight">
                <span className="text-sm font-bold">CodeInsight</span>
                <span className="ml-1 text-[10px] uppercase tracking-[0.2em] text-neon-cyan">AI</span>
              </div>
            </button>
            <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
              <button onClick={() => setView("pricing")} className="hover:text-foreground">Pricing</button>
              <button onClick={() => setView("history")} className="hover:text-foreground">History</button>
              <button onClick={() => setView("settings")} className="hover:text-foreground">Settings</button>
            </nav>
            <div className="flex items-center gap-2">
              <button onClick={() => setView("dashboard")} className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
                Dashboard
              </button>
              <button
                onClick={() => setView("analyze")}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" /> Start Analysis
              </button>
            </div>
          </header>

          <main className="flex-1">
            <LandingView />
          </main>

          <Footer />
        </div>
      ) : (
        /* App shell with sidebar + topbar */
        <div className="flex flex-1">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopbar />
            <main className="flex-1 pb-20 md:pb-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {view === "dashboard" && <DashboardView />}
                  {view === "analyze" && <AnalyzeView />}
                  {view === "project" && <ProjectView />}
                  {view === "chat" && <ChatView />}
                  {view === "history" && <HistoryView />}
                  {view === "settings" && <SettingsView />}
                  {view === "pricing" && <PricingView />}
                </motion.div>
              </AnimatePresence>
            </main>
            <Footer />
          </div>
        </div>
      )}

      <MobileNav />
      <CommandPalette />
    </div>
  );
}

function Footer() {
  const setView = useAppStore((s) => s.setView);
  return (
    <footer className="mt-auto border-t border-white/5 bg-background/40 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
              <Github className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <span>CodeInsight <span className="text-neon-cyan">AI</span></span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-xs">v1.0</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <button onClick={() => setView("landing")} className="hover:text-foreground">Home</button>
            <button onClick={() => setView("dashboard")} className="hover:text-foreground">Dashboard</button>
            <button onClick={() => setView("pricing")} className="hover:text-foreground">Pricing</button>
            <button onClick={() => setView("history")} className="hover:text-foreground">History</button>
            <button onClick={() => setView("settings")} className="hover:text-foreground">Settings</button>
          </nav>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Built with <Heart className="h-3 w-3 fill-rose-400 text-rose-400" /> for developers
          </p>
        </div>
      </div>
    </footer>
  );
}
