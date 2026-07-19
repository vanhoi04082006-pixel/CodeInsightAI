"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { AppSidebar, AppTopbar, MobileNav } from "@/components/shared/app-shell";
import { LandingView } from "@/components/views/landing-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { AnalyzeView } from "@/components/views/analyze-view";
import { ProjectView } from "@/components/views/project-view";
import { ChatView } from "@/components/views/chat-view";
import { HistoryView } from "@/components/views/history-view";
import { SettingsView } from "@/components/views/settings-view";
import { ProvidersView } from "@/components/views/providers-view";
import { PersonalitiesView } from "@/components/views/personalities-view";
import { MissionControlView } from "@/components/views/mission-control-view";
import { CommandPalette } from "@/components/shared/command-palette";
import { Heart } from "lucide-react";

export default function Home() {
  const view = useAppStore((s) => s.view);

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
        /* Landing = full bleed, owns its own cinematic nav + footer */
        <LandingView />
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
                  {view === "providers" && <ProvidersView />}
                  {view === "personalities" && <PersonalitiesView />}
                  {view === "mission" && <MissionControlView />}
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
  const { t } = useT();
  return (
    <footer className="mt-auto border-t border-white/5 bg-background/40 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
              <img src="/logo.png" alt="CodeInsight AI" className="h-5 w-5 rounded-lg object-contain" />
            </div>
            <span>CodeInsight <span className="text-neon-cyan">AI</span></span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-xs">v1.0</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <button onClick={() => setView("landing")} className="hover:text-foreground">{t("common", "nav.home")}</button>
            <button onClick={() => setView("dashboard")} className="hover:text-foreground">{t("common", "nav.dashboard")}</button>
            <button onClick={() => setView("providers")} className="hover:text-foreground">{t("common", "nav.providers")}</button>
            <button onClick={() => setView("history")} className="hover:text-foreground">{t("common", "nav.history")}</button>
            <button onClick={() => setView("settings")} className="hover:text-foreground">{t("common", "nav.settings")}</button>
          </nav>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Built with <Heart className="h-3 w-3 fill-rose-400 text-rose-400" /> for developers
          </p>
        </div>
      </div>
    </footer>
  );
}
