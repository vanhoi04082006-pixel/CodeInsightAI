// CodeInsight AI — P3.6 Analysis Snapshots
// Client-side PDF generation for AnalysisReport — no Chromium / no server round-trip.
// Pure JS via `jspdf` + `jspdf-autotable` (~200KB), Vercel-safe.
//
// IMPORTANT: this module is imported DYNAMICICALLY (`await import(...)`) from
// `project-view.tsx` so that jspdf's ~200KB bundle stays out of the initial
// client payload. It MUST NOT be imported at module top-level by any component
// that renders on first paint.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisReport } from "@/lib/types";

/**
 * Generate a structured compliance-ready PDF snapshot of an AnalysisReport.
 *
 * Layout:
 *   Page 1: Title (owner/name) + date + Summary paragraph + Scores table
 *   Page 1+: Security issues table, Bug issues table, Performance issues table
 *   Page N: AI Overview (if present) — healthAssessment + topRisks + quickWins
 *   Page N+1: Roadmap (if present) — phase × tasks matrix
 *   Every page: footer with "CodeInsight AI — Page X/Y"
 *
 * @returns Blob (application/pdf) suitable for `<a download>` or `URL.createObjectURL`.
 */
export function generateAnalysisPDF(report: AnalysisReport): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  // ---------- Title block ----------
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${report.repoOwner}/${report.repoName}`, 40, y);
  y += 24;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Analysis Report — ${new Date().toLocaleDateString()}`, 40, y);
  y += 20;

  // ---------- Summary ----------
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 40, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const summaryLines = doc.splitTextToSize(report.summary || "", pageWidth - 80);
  doc.text(summaryLines, 40, y);
  y += summaryLines.length * 12 + 10;

  // ---------- Scores table ----------
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Score", "Max"]],
    body: [
      ["Overall", String(report.scores.overall), "100"],
      ["Security", String(report.scores.security), "100"],
      ["Performance", String(report.scores.performance), "100"],
      ["Architecture", String(report.scores.architecture), "100"],
      ["Maintainability", String(report.scores.maintainability), "100"],
      ["Code Quality", String(report.scores.codeQuality), "100"],
    ],
    theme: "striped",
    headStyles: { fillColor: [34, 211, 238] },
  });
  y = getLastAutoTableFinalY(doc, y) + 20;

  // ---------- Issues — Security ----------
  if (report.issues.security.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Security Issues", 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [["Severity", "Title", "File", "Recommendation"]],
      body: report.issues.security.slice(0, 20).map((i) => [
        i.severity,
        i.title,
        i.file,
        (i.recommendation || "").slice(0, 80),
      ]),
      theme: "grid",
      headStyles: { fillColor: [244, 114, 182] },
      styles: { fontSize: 8, cellPadding: 4 },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  }

  // ---------- Issues — Bugs ----------
  if (report.issues.bugs.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Bug Issues", 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [["Severity", "Title", "File", "Recommendation"]],
      body: report.issues.bugs.slice(0, 20).map((i) => [
        i.severity,
        i.title,
        i.file,
        (i.recommendation || "").slice(0, 80),
      ]),
      theme: "grid",
      headStyles: { fillColor: [251, 191, 36] },
      styles: { fontSize: 8, cellPadding: 4 },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  }

  // ---------- Issues — Performance ----------
  if (report.issues.performance.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Performance Issues", 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [["Severity", "Title", "File", "Recommendation"]],
      body: report.issues.performance.slice(0, 20).map((i) => [
        i.severity,
        i.title,
        i.file,
        (i.recommendation || "").slice(0, 80),
      ]),
      theme: "grid",
      headStyles: { fillColor: [52, 211, 153] },
      styles: { fontSize: 8, cellPadding: 4 },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  }

  // ---------- AI Overview (optional — present when deep AI analysis ran) ----------
  // `deepAnalysis` is attached at runtime by the AI deep-analysis pipeline; it
  // is intentionally NOT part of the static `AnalysisReport` type, so we cast.
  const deep = (report as AnalysisReport & { deepAnalysis?: any }).deepAnalysis;
  if (deep?.aiOverview) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("AI Overview", 40, y);
    y += 20;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const aiLines = doc.splitTextToSize(
      deep.aiOverview.healthAssessment || "",
      pageWidth - 80,
    );
    doc.text(aiLines, 40, y);
    y += aiLines.length * 12 + 10;

    if (deep.aiOverview.topRisks?.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Top Risks", "Severity"]],
        body: deep.aiOverview.topRisks.map((r: any) => [r.title, r.severity]),
        theme: "striped",
        headStyles: { fillColor: [239, 68, 68] },
      });
      y = getLastAutoTableFinalY(doc, y) + 15;
    }

    if (deep.aiOverview.quickWins?.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Quick Wins", "Effort"]],
        body: deep.aiOverview.quickWins.map((w: any) => [w.title, w.effort]),
        theme: "striped",
        headStyles: { fillColor: [34, 197, 94] },
      });
    }
  }

  // ---------- Roadmap (optional — enhanced Phase 2 roadmap) ----------
  if (deep?.roadmap?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Roadmap", 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [["Phase", "Tasks"]],
      body: deep.roadmap.map((p: any) => [p.phase, p.tasks.join(", ")]),
      theme: "striped",
      headStyles: { fillColor: [34, 211, 238] },
    });
  }

  // ---------- Footer: page numbers on every page ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `CodeInsight AI — Page ${i}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  // `output("blob")` returns `Blob` in the browser; cast for TS (jsPDF's
  // overloaded `output()` return type is a union of Blob | string | ArrayBuffer).
  return doc.output("blob") as unknown as Blob;
}

/**
 * Read `finalY` from the last autoTable call. jsPDF v3+ exposes this on
 * `doc.lastAutoTable.finalY`. Fall back to the input `y` if the plugin
 * hasn't drawn anything yet (defensive — should never trigger in practice).
 */
function getLastAutoTableFinalY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === "number" ? last.finalY : fallback;
}
