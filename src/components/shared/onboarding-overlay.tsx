"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ScanSearch, MessagesSquare, Plug, Shield,
  Check, ArrowRight, X,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useSession } from "next-auth/react";
import { STATIC_RULES_TOTAL } from "@/lib/static-analysis-stats";
import { ANALYSIS_PASSES } from "@/lib/analysis-manifest";
import { PROVIDER_PRESETS } from "@/lib/providers";
import { useT } from "@/lib/i18n";

const ONBOARDING_KEY = "codeinsight-onboarding-completed";

const STEP_KEYS = [
  { icon: ScanSearch, titleKey: "step1Title", descKey: "step1Desc", color: "#22d3ee" },
  { icon: Plug, titleKey: "step2Title", descKey: "step2Desc", color: "#a78bfa" },
  { icon: MessagesSquare, titleKey: "step3Title", descKey: "step3Desc", color: "#f472b6" },
  { icon: Shield, titleKey: "step4Title", descKey: "step4Desc", color: "#fbbf24" },
] as const;

/**
 * OnboardingOverlay — shows a 4-step welcome guide for first-time users.
 * Dismissed permanently via localStorage. Only shows after GitHub sign-in.
 */
export function OnboardingOverlay() {
  const { data: session, status } = useSession();
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    // Check if onboarding was already completed
    try {
      const completed = localStorage.getItem(ONBOARDING_KEY);
      if (!completed) {
        // Small delay so the dashboard loads first
        const timer = setTimeout(() => setShow(true), 800);
        return () => clearTimeout(timer);
      }
    } catch { /* localStorage not available */ }
  }, [status, session]);

  const dismiss = (gotoView?: string) => {
    try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch {}
    setShow(false);
    if (gotoView) setView(gotoView as any);
  };

  if (!show) return null;

  const currentStep = STEP_KEYS[step];
  const Icon = currentStep.icon;
  const isLast = step === STEP_KEYS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => dismiss()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md px-4"
        >
          <GlassCard strong className="relative overflow-hidden p-8">
            {/* Close button */}
            <button
              onClick={() => dismiss()}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Step indicator */}
            <div className="mb-4 flex items-center justify-center gap-1.5">
              {STEP_KEYS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6" : i < step ? "w-1.5 opacity-60" : "w-1.5 opacity-30"
                  }`}
                  style={{ background: i <= step ? currentStep.color : "#ffffff20" }}
                />
              ))}
            </div>

            {/* Step content */}
            <div className="text-center">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: `${currentStep.color}1a`, border: `1px solid ${currentStep.color}33` }}
              >
                <Icon className="h-8 w-8" style={{ color: currentStep.color }} />
              </div>

              <h2 className="mt-5 text-xl font-bold">
                <GradientText>{t("common", `onboarding.${currentStep.titleKey}`)}</GradientText>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("common", `onboarding.${currentStep.descKey}`, {
                  rules: STATIC_RULES_TOTAL,
                  passes: ANALYSIS_PASSES.length,
                  providers: PROVIDER_PRESETS.length,
                })}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => dismiss()}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                {t("common", "onboarding.skipTour")}
              </button>
              {isLast ? (
                <Button
                  onClick={() => dismiss("analyze")}
                  className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> {t("common", "onboarding.startAnalyzing")}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                >
                  {t("common", "onboarding.next")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
