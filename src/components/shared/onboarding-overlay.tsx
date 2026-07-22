"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ScanSearch, MessagesSquare, Plug, Rocket, Shield,
  Check, ArrowRight, X,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useSession } from "next-auth/react";

const ONBOARDING_KEY = "codeinsight-onboarding-completed";

const STEPS = [
  {
    icon: ScanSearch,
    title: "Analyze Any Repository",
    desc: "Paste a GitHub URL and get a comprehensive analysis with 66 static rules + 7-pass AI deep analysis.",
    color: "#22d3ee",
  },
  {
    icon: Plug,
    title: "Connect Your AI",
    desc: "Bring your own API key (free) or use Platform AI (Pro, $9/mo). 14 providers supported.",
    color: "#a78bfa",
  },
  {
    icon: MessagesSquare,
    title: "Chat with AI CTO",
    desc: "Ask questions about your codebase. AI uses CodeGraph to understand dependencies instantly.",
    color: "#f472b6",
  },
  {
    icon: Rocket,
    title: "Mission Control (Pro)",
    desc: "Autonomous AI agents that plan, code, test, and ship. Upgrade to Pro to unlock.",
    color: "#34d399",
  },
  {
    icon: Shield,
    title: "You're Ready!",
    desc: "Start by analyzing a repository or configuring your AI provider.",
    color: "#fbbf24",
  },
];

/**
 * OnboardingOverlay — shows a 5-step welcome guide for first-time users.
 * Dismissed permanently via localStorage. Only shows after GitHub sign-in.
 */
export function OnboardingOverlay() {
  const { data: session, status } = useSession();
  const setView = useAppStore((s) => s.setView);
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

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const isLast = step === STEPS.length - 1;

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
              {STEPS.map((_, i) => (
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
                <GradientText>{currentStep.title}</GradientText>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {currentStep.desc}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => dismiss()}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Skip tour
              </button>
              {isLast ? (
                <Button
                  onClick={() => dismiss("analyze")}
                  className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Start Analyzing
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                >
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
