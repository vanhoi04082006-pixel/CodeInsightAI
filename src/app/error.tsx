"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <GlassCard strong className="max-w-lg p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-400">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold">
            <GradientText>Something went wrong</GradientText>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>
          {error?.message && (
            <details className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Error details
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-rose-300/70">
                {error.message}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              onClick={() => window.location.href = "/"}
              variant="outline"
              className="gap-1.5"
            >
              <Home className="h-4 w-4" />
              Go Home
            </Button>
            <Button
              onClick={reset}
              className="gap-1.5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
