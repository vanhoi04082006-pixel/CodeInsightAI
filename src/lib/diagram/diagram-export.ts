// CodeInsight AI — Diagram Export Engine
// Provider pattern: register new exporters without modifying engine.

import type { Diagram } from "./types";
import { computeViewBox } from "./diagram-layout";

export type ExportFormat = "svg" | "mermaid" | "plantuml";

export interface ExportResult {
  format: ExportFormat;
  content: string;
  mimeType: string;
  filename: string;
}

export type ExportFn = (diagram: Diagram) => ExportResult;

// ─── Registry ───

const REGISTRY = new Map<ExportFormat, ExportFn>();

export function registerExporter(format: ExportFormat, fn: ExportFn): void {
  REGISTRY.set(format, fn);
}

export function getExporter(format: ExportFormat): ExportFn | undefined {
  return REGISTRY.get(format);
}

export function getAvailableFormats(): ExportFormat[] {
  return [...REGISTRY.keys()];
}

// ─── SVG Exporter ───

registerExporter("svg", (diagram: Diagram): ExportResult => {
  const { width, height } = computeViewBox(diagram);
  const parts: string[] = [`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="monospace">`];
  // Edges
  for (const e of diagram.edges) {
    const from = diagram.layout?.get(e.source);
    const to = diagram.layout?.get(e.target);
    if (!from || !to) continue;
    const x1 = from.x + from.width / 2, y1 = from.y + from.height;
    const x2 = to.x + to.width / 2, y2 = to.y;
    parts.push(`<path d="M ${x1} ${y1} C ${x1} ${(y1+y2)/2}, ${x2} ${(y1+y2)/2}, ${x2} ${y2}" fill="none" stroke="#64748b" stroke-width="1.5" opacity="0.6"/>`);
  }
  // Nodes
  for (const n of diagram.nodes) {
    const pos = diagram.layout?.get(n.id);
    if (!pos) continue;
    parts.push(`<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>`);
    parts.push(`<text x="${pos.x + pos.width/2}" y="${pos.y + 16}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="bold">${n.label}</text>`);
  }
  parts.push("</svg>");
  return { format: "svg", content: parts.join("\n"), mimeType: "image/svg+xml", filename: `${diagram.type}-diagram.svg` };
});

// ─── Mermaid Exporter ───

registerExporter("mermaid", (diagram: Diagram): ExportResult => {
  const lines: string[] = [];
  const typeMap: Record<string, string> = {
    uml: "classDiagram", sequence: "sequenceDiagram", erd: "erDiagram",
    architecture: "graph TB", module: "graph LR", component: "graph TB",
  };
  lines.push(typeMap[diagram.type] || "graph TB");
  if (diagram.type === "sequence") {
    for (const n of diagram.nodes) lines.push(`  participant ${n.label}`);
    for (const e of diagram.edges) {
      const src = diagram.nodes.find(n => n.id === e.source)?.label || e.source;
      const tgt = diagram.nodes.find(n => n.id === e.target)?.label || e.target;
      lines.push(`  ${src} ->> ${tgt}: ${e.label || e.type}`);
    }
  } else {
    for (const n of diagram.nodes) lines.push(`  ${n.id}["${n.label}"]`);
    for (const e of diagram.edges) {
      const arrow = e.metadata?.dashed ? "-.->" : "-->";
      lines.push(`  ${e.source} ${arrow} ${e.target}${e.label ? ` : ${e.label}` : ""}`);
    }
  }
  return { format: "mermaid", content: lines.join("\n"), mimeType: "text/plain", filename: `${diagram.type}-diagram.mmd` };
});

// ─── PlantUML Exporter ───

registerExporter("plantuml", (diagram: Diagram): ExportResult => {
  const lines: string[] = ["@startuml", "skinparam backgroundColor #1e293b", "skinparam defaultFontColor #e2e8f0"];
  for (const n of diagram.nodes) {
    if (n.type === "class" || n.type === "entity") lines.push(`class "${n.label}" {`);
    else if (n.type === "interface") lines.push(`interface "${n.label}" {`);
    else lines.push(`rectangle "${n.label}" {`);
    for (const a of (n.metadata?.attributes ?? [])) lines.push(`  ${a}`);
    for (const m of (n.metadata?.methods ?? [])) lines.push(`  ${m}`);
    lines.push("}");
  }
  for (const e of diagram.edges) {
    const src = diagram.nodes.find(n => n.id === e.source)?.label || e.source;
    const tgt = diagram.nodes.find(n => n.id === e.target)?.label || e.target;
    if (e.type === "extends") lines.push(`"${src}" <|-- "${tgt}"`);
    else if (e.type === "implements") lines.push(`"${src}" ..|> "${tgt}"`);
    else if (e.type === "composition") lines.push(`"${src}" *-- "${tgt}"`);
    else if (e.type === "aggregation") lines.push(`"${src}" o-- "${tgt}"`);
    else lines.push(`"${src}" --> "${tgt}"${e.label ? ` : ${e.label}` : ""}`);
  }
  lines.push("@enduml");
  return { format: "plantuml", content: lines.join("\n"), mimeType: "text/plain", filename: `${diagram.type}-diagram.puml` };
});

// ─── Public API ───

export function exportDiagram(diagram: Diagram, format: ExportFormat): ExportResult | null {
  const fn = getExporter(format);
  if (!fn) return null;
  return fn(diagram);
}
