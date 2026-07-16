"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Globe, ChevronDown } from "lucide-react";
import { useI18nStore, SUPPORTED_LOCALES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SUPPORTED_LOCALES.find((l) => l.id === locale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/[0.06]"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {!compact && <span className="hidden sm:inline">{current.flag}</span>}
        <span className="font-medium">{compact ? current.flag : current.label}</span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-white/10 p-1"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.id}
                onClick={() => { setLocale(l.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-white/5",
                  l.id === locale && "bg-white/[0.04]"
                )}
              >
                <span className="text-base">{l.flag}</span>
                <span className="flex-1 font-medium">{l.label}</span>
                {l.id === locale && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
