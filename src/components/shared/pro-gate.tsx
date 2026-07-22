"use client";

import { motion } from "framer-motion";
import { Crown, Lock, Rocket, Loader2, Check } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useUpgrade } from "@/hooks/use-upgrade";
import { isProduction } from "@/lib/env";

/**
 * ProGate — gates a feature behind Pro plan (production only).
 *
 * In local development: ALL features are unlocked (no gating).
 * In production: Free users see a lock screen with upgrade CTA.
 * Pro + Admin users: full access.
 *
 * Usage:
 *   <ProGate feature="Mission Control" icon={Rocket}>
 *     <MissionControlView />
 *   </ProGate>
 */
export function ProGate({
  feature,
  icon: Icon = Lock,
  children,
}: {
  feature: string;
  icon?: typeof Lock;
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const { upgrade, loading } = useUpgrade();

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const isPro = plan !== "free" || role === "admin";
  const isAdmin = role === "admin";

  // In local development, all features are unlocked
  if (!isProduction) {
    return <>{children}</>;
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pro/Admin: full access
  if (isPro) {
    return <>{children}</>;
  }

  // Free user in production: show lock screen
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <GlassCard strong className="relative overflow-hidden p-10">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400/30 to-cyan-400/30">
              <Icon className="h-8 w-8 text-violet-300" />
            </div>

            <h1 className="mt-6 text-2xl font-bold">
              <GradientText>{feature}</GradientText> is a Pro Feature
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Upgrade to Pro to unlock {feature} and all other premium features.
              Pro members get unlimited access to AI agents, streaming chat,
              priority queue, and more.
            </p>

            {/* Features list */}
            <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
              {[
                "Unlimited AI agents",
                "Platform AI (no key needed)",
                "Streaming chat (SSE)",
                "Priority queue",
                "100 analyses/month",
                "2000 chat messages/month",
                "PDF / JSON export",
                "Priority support",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {f}
                </div>
              ))}
            </div>

            <Button
              onClick={() => upgrade("pro")}
              disabled={loading}
              size="lg"
              className="mt-6 w-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:opacity-90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Redirecting…
                </>
              ) : (
                <>
                  <Crown className="mr-1.5 h-4 w-4" /> Upgrade to Pro — $9/month
                </>
              )}
            </Button>

            <p className="mt-3 text-[10px] text-muted-foreground">
              Cancel anytime. Secure payment via Stripe.
            </p>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
