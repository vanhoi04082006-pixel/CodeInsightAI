// CodeInsight AI — useAnalysisManifest hook
// React hook that builds AnalysisManifest from the active report.
// All UI components should use this instead of reading report fields directly.

"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { buildManifest, type AnalysisManifest } from "@/lib/analysis-manifest";

export function useAnalysisManifest(): AnalysisManifest {
  const report = useAppStore((s) => s.activeReport);
  const analysisId = useAppStore((s) => s.activeAnalysisId);
  const aiPending = useAppStore((s) => s.aiPending);

  return useMemo(() => {
    const manifest = buildManifest(report, analysisId);
    // Override status if frontend knows AI is pending (more realtime than DB)
    if (aiPending && manifest.status !== "running") {
      manifest.status = "running";
    }
    return manifest;
  }, [report, analysisId, aiPending]);
}
