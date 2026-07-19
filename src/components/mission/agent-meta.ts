"use client";

import {
  Crown,
  ListTodo,
  FolderSearch,
  Network,
  Bug,
  Wrench,
  BookOpen,
  FlaskConical,
  ShieldAlert,
  Gauge,
  Server,
  Bot,
  type LucideIcon,
} from "lucide-react";

export interface AgentMeta {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  short: string;
}

export const AGENTS: AgentMeta[] = [
  { id: "executive", name: "Executive", icon: Crown, color: "#a78bfa", short: "EX" },
  { id: "planner", name: "Planner", icon: ListTodo, color: "#22d3ee", short: "PL" },
  { id: "repo-analyst", name: "Repository Analyst", icon: FolderSearch, color: "#34d399", short: "RA" },
  { id: "code-reviewer", name: "Code Reviewer", icon: Network, color: "#fbbf24", short: "CR" },
  { id: "bug-fixer", name: "Bug Fixer", icon: Bug, color: "#f472b6", short: "BF" },
  { id: "refactoring", name: "Refactoring", icon: Wrench, color: "#22d3ee", short: "RF" },
  { id: "documentation", name: "Documentation", icon: BookOpen, color: "#34d399", short: "DO" },
  { id: "test", name: "Test", icon: FlaskConical, color: "#a78bfa", short: "TE" },
  { id: "security", name: "Security", icon: ShieldAlert, color: "#f472b6", short: "SE" },
  { id: "performance", name: "Performance", icon: Gauge, color: "#fbbf24", short: "PF" },
  { id: "devops", name: "DevOps", icon: Server, color: "#22d3ee", short: "DV" },
];

export const AGENT_BY_NAME: Record<string, AgentMeta> = Object.fromEntries(
  AGENTS.map((a) => [a.name.toLowerCase(), a])
);

export function resolveAgent(name?: string): AgentMeta {
  if (!name) {
    return { id: "unknown", name: "System", icon: Bot, color: "#94a3b8", short: "SY" };
  }
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(AGENT_BY_NAME)) {
    if (key.includes(k) || k.includes(key.split(" ")[0])) return v;
  }
  return { id: "unknown", name, icon: Bot, color: "#94a3b8", short: name.slice(0, 2).toUpperCase() };
}
