"use client";

import { motion } from "framer-motion";
import { Sun, Moon, Monitor } from "lucide-react";
import { usePersonalizationStore, type ThemeMode } from "@/lib/personalization-store";
import { cn } from "@/lib/utils";

const OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeSwitcher() {
  const theme = usePersonalizationStore((s) => s.theme);
  const setTheme = usePersonalizationStore((s) => s.setTheme);
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
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
