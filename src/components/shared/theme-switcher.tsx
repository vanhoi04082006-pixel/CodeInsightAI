"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Monitor, ChevronDown, Check } from "lucide-react";
import { usePersonalizationStore, type ThemeMode } from "@/lib/personalization-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const OPTIONS: { id: ThemeMode; icon: typeof Sun }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
  light: "appearance.themeLight",
  dark: "appearance.themeDark",
  system: "appearance.themeSystem",
};

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const theme = usePersonalizationStore((s) => s.theme);
  const setTheme = usePersonalizationStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeOption = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[1];
  const ActiveIcon = activeOption.icon;
  const activeLabel = t("settings", THEME_LABEL_KEYS[activeOption.id]);

  // Compact = dropdown, Full = inline toggle (original behavior)
  if (compact) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/5"
          aria-label={t("settings", "appearance.theme")}
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{activeLabel}</span>
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="glass-strong absolute right-0 top-full z-50 mt-2 w-36 overflow-hidden rounded-xl border border-white/10 p-1 shadow-2xl"
            >
              {OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = theme === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => { setTheme(o.id); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                      active ? "bg-white/5 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">{t("settings", THEME_LABEL_KEYS[o.id])}</span>
                    {active && <Check className="h-3 w-3 text-cyan-300" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full = inline toggle (original)
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = theme === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setTheme(o.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-active"
                className="absolute inset-0 -z-10 rounded-md bg-gradient-to-r from-cyan-500/20 to-violet-500/20"
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
              />
            )}
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("settings", THEME_LABEL_KEYS[o.id])}</span>
          </button>
        );
      })}
    </div>
  );
}
