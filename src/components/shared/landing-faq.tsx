"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import { useT } from "@/lib/i18n";

/**
 * FAQ accordion for the landing page.
 *
 * Why a custom accordion instead of Radix:
 *   Radix UI generates dynamic IDs like `radix-_R_xxx_` via React's useId().
 *   Under Next.js 16 + React 19 + the inline SSR hydration script in
 *   layout.tsx (which mutates <html> classes/dataset before React hydrates),
 *   those IDs can mismatch between server and client and trigger:
 *
 *     "A tree hydrated but some attributes of the server rendered HTML
 *      didn't match the client properties"
 *
 *   This component avoids the issue entirely by:
 *     1. Being mounted only after hydration (client-only) via `mounted` gate.
 *     2. Using deterministic IDs derived from the FAQ index (no useId()).
 *     3. Using a controlled open state instead of Radix's internal state.
 *
 *   The trade-off: the FAQ isn't in the initial SSR HTML — but it's far below
 *   the fold so users see it scroll into view well before it mounts.
 */
const FAQ_KEYS = ["faqQ1", "faqQ2", "faqQ3", "faqQ4", "faqQ5", "faqQ6"];

export function LandingFAQ() {
  const { t } = useT();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [mounted, setMounted] = useState(false);

  // Only render the interactive accordion after hydration to guarantee
  // server HTML === first client render (both empty).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    // SSR placeholder — matches the shape/size of the real card so there's no
    // layout shift when the accordion mounts.
    return (
      <div className="mx-auto max-w-3xl">
        <GlassCard className="p-2">
          <div className="space-y-1">
            {FAQ_KEYS.map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.02]" />
            ))}
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <GlassCard className="p-2">
        <div className="space-y-1">
          {FAQ_KEYS.map((qk, i) => {
            const isOpen = openIndex === i;
            // Deterministic ID — same on server and client (no useId).
            const contentId = `faq-content-${i}`;
            const buttonId = `faq-button-${i}`;
            return (
              <div key={i} className="border-b border-white/5 last:border-b-0">
                <button
                  id={buttonId}
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  className="flex w-full items-start justify-between gap-4 rounded-md px-4 py-4 text-left text-sm font-medium transition hover:bg-white/[0.02]"
                >
                  <span>{t("landing", qk)}</span>
                  <ChevronDown
                    className={`pointer-events-none mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={contentId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-sm text-muted-foreground">
                        {t("landing", `faqA${i + 1}`)}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
