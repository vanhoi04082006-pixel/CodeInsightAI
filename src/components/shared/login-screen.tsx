"use client";

import { motion } from "framer-motion";
import { Github, Sparkles, ArrowRight, ShieldCheck, Zap, Code2 } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { signIn } from "next-auth/react";

export function LoginScreen({ onBack }: { onBack?: () => void }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/3 top-1/3 h-[300px] w-[300px] rounded-full bg-violet-500/10 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <GlassCard strong className="p-8 text-center md:p-10">
          {/* Logo */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
            <img src="/logo.png" alt="CodeInsight AI" className="h-12 w-12 rounded-xl object-contain" />
          </div>

          <h1 className="mt-5 text-2xl font-bold">
            Welcome to <GradientText>CodeInsight AI</GradientText>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with GitHub to analyze repositories, chat with AI agents, and ship code autonomously.
          </p>

          {/* GitHub Login Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Github className="h-5 w-5" />
            Sign in with GitHub
            <ArrowRight className="ml-1 h-4 w-4" />
          </motion.button>

          {/* Features */}
          <div className="mt-8 space-y-2.5">
            {[
              { icon: Code2, text: "Analyze any GitHub repository with 12 AI agents" },
              { icon: ShieldCheck, text: "66 static analysis rules (security, bugs, performance)" },
              { icon: Zap, text: "Bring your own API key — or use Platform AI (Pro)" },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-3 text-left"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
                    <Icon className="h-3.5 w-3.5 text-cyan-300" />
                  </div>
                  <span className="text-xs text-muted-foreground">{f.text}</span>
                </motion.div>
              );
            })}
          </div>

          {/* Back to landing */}
          {onBack && (
            <button
              onClick={onBack}
              className="mt-6 text-xs text-muted-foreground transition hover:text-foreground"
            >
              ← Back to landing
            </button>
          )}

          {/* Privacy note */}
          <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground/60">
            We only request read access to your public repositories. Your API keys are encrypted and never exposed.
            <Sparkles className="mx-auto mt-2 h-3 w-3 text-cyan-300/40" />
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
