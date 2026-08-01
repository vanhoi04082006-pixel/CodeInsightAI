// Client-side guard preventing concurrent AI-pass runs on the same analysis.
// Shared by analyze-view (runAIPasses) and dashboard-view (openRecent resume)
// so a double-invocation can never double-spend tokens or clobber results.

let activeAnalysisId: string | null = null;

export function acquireAnalysisRunGuard(analysisId: string): boolean {
  if (activeAnalysisId !== null) return false;
  activeAnalysisId = analysisId;
  return true;
}

export function releaseAnalysisRunGuard(analysisId: string): void {
  if (activeAnalysisId === analysisId) activeAnalysisId = null;
}
