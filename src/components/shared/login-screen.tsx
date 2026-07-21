"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Github, Sparkles, ArrowRight, ShieldCheck, Zap, Code2, Loader2 } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

/**
 * Production-grade login screen.
 *
 * Flow:
 * 1. User clicks "Sign in with GitHub"
 * 2. Button shows loading spinner, toast "Redirecting to GitHub…"
 * 3. Browser redirects to GitHub OAuth
 * 4. After callback, AuthStateWatcher (mounted in providers.tsx) toasts
 *    success or surfaces `?error=…` from the URL.
 */
export function LoginScreen({ onBack }: { onBack?: () => void }) {
  const [redirecting, setRedirecting] = useState(false);

  const handleSignIn = async () => {
    if (redirecting) return;
    setRedirecting(true);
    toast.loading("Redirecting to GitHub…", { id: "github-redirect" });
    try {
      // signIn() navigates away — if it returns, the redirect failed
      await signIn("github", { callbackUrl: "/" });
    } catch (e) {
      setRedirecting(false);
      toast.dismiss("github-redirect");
      toast.error("Failed to start GitHub sign-in. Please try again.");
    }
  };

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
            whileHover={{ scale: redirecting ? 1 : 1.02 }}
            whileTap={{ scale: redirecting ? 1 : 0.98 }}
            onClick={handleSignIn}
            disabled={redirecting}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {redirecting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <Github className="h-5 w-5" />
                Sign in with GitHub
                <ArrowRight className="ml-1 h-4 w-4" />
              </>
            )}
          </motion.button>

          {/* Privacy / scope notice */}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              We request <code className="rounded bg-white/5 px-1 text-cyan-300">read:user</code>,{" "}
              <code className="rounded bg-white/5 px-1 text-cyan-300">user:email</code>, and{" "}
              <code className="rounded bg-white/5 px-1 text-cyan-300">repo</code> scopes (so we can analyze your
              private repositories). You can revoke access anytime from your GitHub settings.
            </p>
          </div>

          {/* Features */}
          <div className="mt-6 space-y-2.5">
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
          {onBack && !redirecting && (
            <button
              onClick={onBack}
              className="mt-6 text-xs text-muted-foreground transition hover:text-foreground"
            >
              ← Back to landing
            </button>
          )}

          {/* Privacy note */}
          <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground/60">
            Your API keys are AES-256-GCM encrypted on the server and never exposed to the frontend.
            <Sparkles className="mx-auto mt-2 h-3 w-3 text-cyan-300/40" />
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
