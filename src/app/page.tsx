"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { CustomCursor } from "@/components/shared/custom-cursor";
import { AppSidebar, AppTopbar, MobileNav } from "@/components/shared/app-shell";
import dynamic from "next/dynamic";
import { LandingView } from "@/components/views/landing-view";

// Lazy-load all non-landing views for code splitting
const DashboardView = dynamic(() => import("@/components/views/dashboard-view").then(m => ({ default: m.DashboardView })), { ssr: false });
const AnalyzeView = dynamic(() => import("@/components/views/analyze-view").then(m => ({ default: m.AnalyzeView })), { ssr: false });
const ProjectView = dynamic(() => import("@/components/views/project-view").then(m => ({ default: m.ProjectView })), { ssr: false });
const ChatView = dynamic(() => import("@/components/views/chat-view").then(m => ({ default: m.ChatView })), { ssr: false });
const HistoryView = dynamic(() => import("@/components/views/history-view").then(m => ({ default: m.HistoryView })), { ssr: false });
const SettingsView = dynamic(() => import("@/components/views/settings-view").then(m => ({ default: m.SettingsView })), { ssr: false });
const ProvidersView = dynamic(() => import("@/components/views/providers-view").then(m => ({ default: m.ProvidersView })), { ssr: false });
const PersonalitiesView = dynamic(() => import("@/components/views/personalities-view").then(m => ({ default: m.PersonalitiesView })), { ssr: false });
const MissionControlView = dynamic(() => import("@/components/views/mission-control-view").then(m => ({ default: m.MissionControlView })), { ssr: false });
import { CommandPalette } from "@/components/shared/command-palette";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Heart, Sparkles } from "lucide-react";

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘K — Command palette
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAppStore.getState().setCommandOpen(true);
        return;
      }

      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if (isTyping) {
        // Esc to blur/exit input
        if (e.key === "Escape") {
          (e.target as HTMLElement)?.blur();
        }
        return;
      }

      // Navigation shortcuts (no modifier)
      if (e.key === "Escape" && view !== "landing") {
        setView("landing");
        return;
      }

      if (mod) {
        // ⌘D — Dashboard
        if (e.key.toLowerCase() === "d") { e.preventDefault(); setView("dashboard"); return; }
        // ⌘A — Analyze
        if (e.key.toLowerCase() === "a") { e.preventDefault(); setView("analyze"); return; }
        // ⌘H — History
        if (e.key.toLowerCase() === "h") { e.preventDefault(); setView("history"); return; }
        // ⌘, — Settings
        if (e.key === ",") { e.preventDefault(); setView("settings"); return; }
        // ⌘P — Providers
        if (e.key.toLowerCase() === "p") { e.preventDefault(); setView("providers"); return; }
        // ⌘M — Mission Control
        if (e.key.toLowerCase() === "m") { e.preventDefault(); setView("mission"); return; }
        // ⌘C — Chat (only if not selecting text)
        if (e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
          e.preventDefault(); setView("chat"); return;
        }
      } else {
        // Single key shortcuts (no modifier, not typing)
        // g then d = go dashboard (vim-style)
        if (e.key === "g") {
          const handler = (e2: KeyboardEvent) => {
            const map: Record<string, string> = {
              d: "dashboard", a: "analyze", p: "project", c: "chat",
              h: "history", s: "settings", m: "mission", l: "landing",
            };
            const target = map[e2.key.toLowerCase()];
            if (target) {
              e2.preventDefault();
              setView(target as any);
            }
            window.removeEventListener("keydown", handler);
          };
          window.addEventListener("keydown", handler, { once: true });
          setTimeout(() => window.removeEventListener("keydown", handler), 1000);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, setView]);

  const isLanding = view === "landing";

  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground />

      {isLanding ? (
        /* Landing = full bleed with its own nav + footer */
        <div className="flex min-h-screen flex-col">
          {/* Landing top nav */}
          <header className="glass sticky top-0 z-40 flex h-16 items-center justify-between px-4 md:px-8">
            <button onClick={() => setView("landing")} className="flex items-center gap-2">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
                <img src="/logo.png" alt="CodeInsight AI" className="h-7 w-7 rounded-lg object-contain" />
              </div>
              <div className="leading-tight">
                <span className="text-sm font-bold">CodeInsight</span>
                <span className="ml-1 text-[10px] uppercase tracking-[0.2em] text-neon-cyan">AI</span>
              </div>
            </button>
            <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
              <button onClick={() => setView("providers")} className="hover:text-foreground">{t("common", "nav.providers")}</button>
              <button onClick={() => setView("history")} className="hover:text-foreground">{t("common", "nav.history")}</button>
              <button onClick={() => setView("settings")} className="hover:text-foreground">{t("common", "nav.settings")}</button>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher />
              <button
                onClick={() => setView("analyze")}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" /> {t("common", "actions.analyzeRepo")}
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
      <CustomCursor />
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
