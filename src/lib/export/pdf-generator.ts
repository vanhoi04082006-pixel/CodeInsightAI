// CodeInsight AI — P3.6 Analysis Snapshots
// Client-side PDF generation for AnalysisReport — no Chromium / no server round-trip.
// Pure JS via `jspdf` + `jspdf-autotable` (~200KB), Vercel-safe.
//
// Supports Unicode Vietnamese via Be Vietnam Pro font (loaded at runtime).
// PDF labels follow the report locale (EN or VI).

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisReport } from "@/lib/types";
import { loadVietnameseFont } from "./font-loader";

// ─── i18n labels ───

type Locale = "en" | "vi";

const PDF_I18N: Record<Locale, Record<string, string>> = {
  en: {
    analysisReport: "Analysis Report",
    summary: "Summary",
    metric: "Metric",
    score: "Score",
    max: "Max",
    overall: "Overall",
    security: "Security",
    performance: "Performance",
    architecture: "Architecture",
    maintainability: "Maintainability",
    codeQuality: "Code Quality",
    securityIssues: "Security Issues",
    bugIssues: "Bug Issues",
    performanceIssues: "Performance Issues",
    severity: "Severity",
    title: "Title",
    file: "File",
    recommendation: "Recommendation",
    aiOverview: "AI Overview",
    topRisks: "Top Risks",
    quickWins: "Quick Wins",
    roadmap: "Roadmap",
    phase: "Phase",
    tasks: "Tasks",
    pageFooter: "CodeInsight AI — Page {page}/{total}",
    languages: "Languages",
    frameworks: "Frameworks",
    codeStats: "Code Statistics",
    files: "Files",
    lines: "Lines",
    languagesCount: "Languages",
    frameworksCount: "Frameworks",
    deadCode: "Dead Code",
    duplicates: "Duplicate Code",
    circularDeps: "Circular Dependencies",
    technicalDebt: "Technical Debt",
    architectureReview: "AI Architecture Review",
    codeQualityReview: "AI Code Quality Review",
    performanceReview: "AI Performance Review",
    bestPractices: "Best Practices Audit",
    duplicateAnalysis: "AI Duplicate Analysis",
    priorities: "AI Priorities",
    executiveSummary: "Executive Summary",
    none: "None",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },
  vi: {
    analysisReport: "Báo cáo phân tích",
    summary: "Tóm tắt",
    metric: "Chỉ số",
    score: "Điểm",
    max: "Tối đa",
    overall: "Tổng thể",
    security: "Bảo mật",
    performance: "Hiệu suất",
    architecture: "Kiến trúc",
    maintainability: "Bảo trì",
    codeQuality: "Chất lượng mã",
    securityIssues: "Vấn đề bảo mật",
    bugIssues: "Lỗi logic",
    performanceIssues: "Vấn đề hiệu suất",
    severity: "Mức độ",
    title: "Tiêu đề",
    file: "Tệp",
    recommendation: "Khuyến nghị",
    aiOverview: "Tổng quan AI",
    topRisks: "Rủi ro chính",
    quickWins: "Cải thiện nhanh",
    roadmap: "Lộ trình",
    phase: "Giai đoạn",
    tasks: "Nhiệm vụ",
    pageFooter: "CodeInsight AI — Trang {page}/{total}",
    languages: "Ngôn ngữ",
    frameworks: "Framework",
    codeStats: "Thống kê mã",
    files: "Tệp",
    lines: "Dòng",
    languagesCount: "Ngôn ngữ",
    frameworksCount: "Framework",
    deadCode: "Mã chết",
    duplicates: "Mã trùng lặp",
    circularDeps: "Phụ thuộc vòng",
    technicalDebt: "Nợ kỹ thuật",
    architectureReview: "Đánh giá kiến trúc AI",
    codeQualityReview: "Đánh giá chất lượng mã AI",
    performanceReview: "Đánh giá hiệu suất AI",
    bestPractices: "Kiểm toán best practices",
    duplicateAnalysis: "Phân tích trùng lặp AI",
    priorities: "Ưu tiên AI",
    executiveSummary: "Tóm tắt điều hành",
    none: "Không",
    critical: "Nghiêm trọng",
    high: "Cao",
    medium: "Trung bình",
    low: "Thấp",
    info: "Thông tin",
  },
};

/**
 * Generate a structured compliance-ready PDF snapshot of an AnalysisReport.
 *
 * @param report - The AnalysisReport to export
 * @param locale - "en" or "vi" — labels follow this locale
 * @returns Blob (application/pdf) suitable for `<a download>` or `URL.createObjectURL`.
 */
export async function generateAnalysisPDF(report: AnalysisReport, locale: Locale = "en"): Promise<Blob> {
  const tr = (key: string, vars?: Record<string, string | number>): string => {
    let str = PDF_I18N[locale]?.[key] ?? PDF_I18N.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };

  // Load Vietnamese font (returns null if fetch fails → fallback to Helvetica)
  const fontBase64 = await loadVietnameseFont();
  const useCustomFont = !!fontBase64;

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Register custom font if available
  if (useCustomFont && fontBase64) {
    doc.addFileToVFS("BeVietnamPro.ttf", fontBase64);
    doc.addFont("BeVietnamPro.ttf", "BeVietnamPro", "normal");
    doc.addFont("BeVietnamPro.ttf", "BeVietnamPro", "bold");
    doc.setFont("BeVietnamPro", "normal");
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  const setBold = () => doc.setFont(useCustomFont ? "BeVietnamPro" : "helvetica", "bold");
  const setNormal = () => doc.setFont(useCustomFont ? "BeVietnamPro" : "helvetica", "normal");

  // ---------- Page 1: Title + Summary + Scores ----------
  doc.setFontSize(20);
  setBold();
  doc.text(`${report.repoOwner}/${report.repoName}`, 40, y);
  y += 24;

  doc.setFontSize(10);
  setNormal();
  doc.text(`${tr("analysisReport")} — ${new Date().toLocaleDateString()}`, 40, y);
  y += 20;

  // Summary
  doc.setFontSize(12);
  setBold();
  doc.text(tr("summary"), 40, y);
  y += 16;
  doc.setFontSize(9);
  setNormal();
  const summaryText = (report as any).deepAnalysis?.executiveSummary || report.summary || "";
  const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 80);
  doc.text(summaryLines, 40, y);
  y += summaryLines.length * 12 + 10;

  // Scores table
  autoTable(doc, {
    startY: y,
    head: [[tr("metric"), tr("score"), tr("max")]],
    body: [
      [tr("overall"), String(report.scores.overall), "100"],
      [tr("security"), String(report.scores.security), "100"],
      [tr("performance"), String(report.scores.performance), "100"],
      [tr("architecture"), String(report.scores.architecture), "100"],
      [tr("maintainability"), String(report.scores.maintainability), "100"],
      [tr("codeQuality"), String(report.scores.codeQuality), "100"],
    ],
    theme: "striped",
    headStyles: { fillColor: [34, 211, 238] },
    styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 9 },
  });
  y = getLastAutoTableFinalY(doc, y) + 20;

  // Code stats
  doc.setFontSize(12);
  setBold();
  doc.text(tr("codeStats"), 40, y);
  y += 14;
  autoTable(doc, {
    startY: y,
    head: [[tr("metric"), tr("score")]],
    body: [
      [tr("files"), String(report.totalFiles ?? 0)],
      [tr("lines"), (report.totalLines ?? 0).toLocaleString()],
      [tr("languagesCount"), String(report.languages?.length ?? 0)],
      [tr("frameworksCount"), String(report.frameworks?.length ?? 0)],
      [tr("deadCode"), String(report.deadCode?.length ?? 0)],
      [tr("duplicates"), String(report.duplicates?.length ?? 0)],
      [tr("circularDeps"), String(report.dependencies?.circular?.length ?? 0)],
    ],
    theme: "grid",
    headStyles: { fillColor: [167, 139, 250] },
    styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8, cellPadding: 4 },
  });
  y = getLastAutoTableFinalY(doc, y) + 20;

  // Languages breakdown
  if (report.languages?.length > 0) {
    doc.setFontSize(12);
    setBold();
    doc.text(tr("languages"), 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [[tr("title"), "%"]],
      body: report.languages.slice(0, 15).map((l: any) => [l.name, String(l.percentage ?? 0)]),
      theme: "grid",
      headStyles: { fillColor: [52, 211, 153] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8, cellPadding: 4 },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  }

  // Frameworks
  if (report.frameworks?.length > 0) {
    doc.setFontSize(12);
    setBold();
    doc.text(tr("frameworks"), 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [[tr("title"), "Version"]],
      body: report.frameworks.slice(0, 15).map((f: any) => [f.name, f.version || "—"]),
      theme: "grid",
      headStyles: { fillColor: [251, 191, 36] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8, cellPadding: 4 },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  }

  // ---------- Issues tables (all, no 20-row limit) ----------
  const issueTable = (title: string, issues: any[], headColor: [number, number, number]) => {
    if (issues.length === 0) return;
    if (y > pageHeight - 80) { doc.addPage(); y = 40; }
    doc.setFontSize(12);
    setBold();
    doc.text(title, 40, y);
    y += 14;
    autoTable(doc, {
      startY: y,
      head: [[tr("severity"), tr("title"), tr("file"), tr("recommendation")]],
      body: issues.map((i) => [
        tr(i.severity),
        i.title,
        i.file + (i.line ? `:${i.line}` : ""),
        (i.recommendation || "").slice(0, 250),
      ]),
      theme: "grid",
      headStyles: { fillColor: headColor },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 3: { cellWidth: 180 } },
    });
    y = getLastAutoTableFinalY(doc, y) + 20;
  };

  issueTable(tr("securityIssues"), report.issues.security, [244, 114, 182]);
  issueTable(tr("bugIssues"), report.issues.bugs, [251, 191, 36]);
  issueTable(tr("performanceIssues"), report.issues.performance, [52, 211, 153]);

  // ---------- AI Deep Analysis sections ----------
  const deep = (report as AnalysisReport & { deepAnalysis?: any }).deepAnalysis;

  if (deep?.aiOverview) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("aiOverview"), 40, y);
    y += 20;
    doc.setFontSize(9);
    setNormal();
    const aiLines = doc.splitTextToSize(deep.aiOverview.healthAssessment || "", pageWidth - 80);
    doc.text(aiLines, 40, y);
    y += aiLines.length * 12 + 10;

    if (deep.aiOverview.topRisks?.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [[tr("topRisks"), tr("severity")]],
        body: deep.aiOverview.topRisks.map((r: any) => [r.title, tr(r.severity)]),
        theme: "striped",
        headStyles: { fillColor: [239, 68, 68] },
        styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8 },
      });
      y = getLastAutoTableFinalY(doc, y) + 15;
    }

    if (deep.aiOverview.quickWins?.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [[tr("quickWins"), "Effort"]],
        body: deep.aiOverview.quickWins.map((w: any) => [w.title, w.effort]),
        theme: "striped",
        headStyles: { fillColor: [34, 197, 94] },
        styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8 },
      });
    }
  }

  // AI Architecture Review
  if (deep?.architectureReview) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("architectureReview"), 40, y);
    y += 20;
    doc.setFontSize(9);
    setNormal();
    const archLines = doc.splitTextToSize(deep.architectureReview.summary || deep.architectureReview || "", pageWidth - 80);
    doc.text(archLines, 40, y);
  }

  // AI Code Quality Review
  if (deep?.codeQualityReview?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("codeQualityReview"), 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("severity"), tr("title"), tr("file"), tr("recommendation")]],
      body: deep.codeQualityReview.map((r: any) => [
        tr(r.severity || "medium"),
        r.title || r.issue || "",
        r.file || r.evidence?.[0] || "",
        (r.recommendation || r.fixPlan?.join("; ") || "").slice(0, 250),
      ]),
      theme: "grid",
      headStyles: { fillColor: [251, 191, 36] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 3: { cellWidth: 180 } },
    });
  }

  // AI Performance Review
  if (deep?.performanceReview?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("performanceReview"), 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("severity"), tr("title"), tr("file"), tr("recommendation")]],
      body: deep.performanceReview.map((r: any) => [
        tr(r.severity || "medium"),
        r.title || r.issue || "",
        r.file || r.evidence?.[0] || "",
        (r.recommendation || r.fixPlan?.join("; ") || "").slice(0, 250),
      ]),
      theme: "grid",
      headStyles: { fillColor: [52, 211, 153] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 3: { cellWidth: 180 } },
    });
  }

  // AI Security Review
  if (deep?.securityReview?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("securityIssues") + " (AI)", 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("severity"), tr("title"), tr("file"), tr("recommendation")]],
      body: deep.securityReview.map((r: any) => [
        tr(r.severity || "high"),
        r.title || r.issue || "",
        r.file || r.evidence?.[0] || "",
        (r.recommendation || r.fixPlan?.join("; ") || "").slice(0, 250),
      ]),
      theme: "grid",
      headStyles: { fillColor: [244, 114, 182] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 3: { cellWidth: 180 } },
    });
  }

  // Best Practices Audit
  if (deep?.bestPracticesAudit) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("bestPractices"), 40, y);
    y += 20;
    doc.setFontSize(9);
    setNormal();
    const bpLines = doc.splitTextToSize(
      typeof deep.bestPracticesAudit === "string"
        ? deep.bestPracticesAudit
        : JSON.stringify(deep.bestPracticesAudit, null, 2),
      pageWidth - 80,
    );
    doc.text(bpLines, 40, y);
  }

  // Duplicate Analysis
  if (deep?.duplicateAnalysis?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("duplicateAnalysis"), 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("title"), "Files", "Lines Saved"]],
      body: deep.duplicateAnalysis.map((d: any) => [
        d.title || d.pattern || "",
        (d.files || []).join(", "),
        String(d.estimatedLinesSaved || 0),
      ]),
      theme: "striped",
      headStyles: { fillColor: [34, 211, 238] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8 },
    });
  }

  // Priorities
  if (deep?.priorities?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("priorities"), 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("title"), tr("severity"), "Effort", tr("recommendation")]],
      body: deep.priorities.map((p: any) => [
        p.title || "",
        tr(p.severity || "medium"),
        p.effort || "medium",
        (p.recommendation || p.description || "").slice(0, 200),
      ]),
      theme: "striped",
      headStyles: { fillColor: [167, 139, 250] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8 },
    });
  }

  // Roadmap
  if (deep?.roadmap?.length > 0) {
    doc.addPage();
    y = 40;
    doc.setFontSize(14);
    setBold();
    doc.text(tr("roadmap"), 40, y);
    y += 20;
    autoTable(doc, {
      startY: y,
      head: [[tr("phase"), tr("tasks")]],
      body: deep.roadmap.map((p: any) => [p.phase || p.title || "", (p.tasks || []).join(", ")]),
      theme: "striped",
      headStyles: { fillColor: [34, 211, 238] },
      styles: { font: useCustomFont ? "BeVietnamPro" : "helvetica", fontSize: 8 },
    });
  }

  // ---------- Footer: page numbers on every page ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    setNormal();
    doc.text(
      tr("pageFooter", { page: i, total: pageCount }),
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  return doc.output("blob") as unknown as Blob;
}

function getLastAutoTableFinalY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === "number" ? last.finalY : fallback;
}
