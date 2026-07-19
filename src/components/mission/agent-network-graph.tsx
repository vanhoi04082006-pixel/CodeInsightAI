"use client";

import * as d3 from "d3-force";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS } from "./agent-meta";
import { useMissionStore, type AgentStatus } from "@/lib/mission-store";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const W = 400;
const H = 400;
const CENTER = { x: 200, y: 200 };
const EXEC_RADIUS = 26;
const NODE_RADIUS = 19;
const MAX_COLLAB_EDGES = 15;
const COLLAB_WINDOW_MS = 10_000; // gap between result & next acting to count as collaboration
const RECENT_WINDOW_MS = 90_000; // age at which collaboration strength has fully decayed

type Status = AgentStatus["status"];

const STATUS_COLORS: Record<Status, string> = {
  idle: "#64748b",
  thinking: "#fbbf24",
  acting: "#22d3ee",
  waiting: "#a78bfa",
  done: "#34d399",
  error: "#f472b6",
};

const STATUS_LABELS: Record<Status, string> = {
  idle: "Idle",
  thinking: "Thinking",
  acting: "Acting",
  waiting: "Waiting",
  done: "Done",
  error: "Error",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  color: string;
  short: string;
  isExecutive: boolean;
  baseRadius: number;
}

interface SimEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
  strength: number;
  key: string;
}

interface RenderNode extends GraphNode {
  status: Status;
  detail?: string;
}

interface RenderEdge {
  source: string;
  target: string;
  strength: number;
  active: boolean;
  key: string;
}

// ── Agent id/name lookup helpers ─────────────────────────────────────────────

const ID_TO_NAME = new Map(AGENTS.map((a) => [a.id, a.name]));
const NAME_LOWER_TO_ID = new Map(AGENTS.map((a) => [a.name.toLowerCase(), a.id]));

function resolveAgentId(name: string): string | null {
  const key = name.toLowerCase().trim();
  if (NAME_LOWER_TO_ID.has(key)) return NAME_LOWER_TO_ID.get(key) ?? null;
  for (const [n, id] of NAME_LOWER_TO_ID) {
    if (key.includes(n) || n.includes(key)) return id;
  }
  return null;
}

function nameForId(id: string): string | undefined {
  return ID_TO_NAME.get(id);
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentNetworkGraph({ className }: { className?: string }) {
  const agentStatuses = useMissionStore((s) => s.agentStatuses);
  const events = useMissionStore((s) => s.events);
  const missionId = useMissionStore((s) => s.missionId);
  const demoMode = useMissionStore((s) => s.demoMode);

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const hasMission = missionId !== null || demoMode;

  // 1. Stable base nodes (no per-tick status)
  const baseNodes = useMemo<GraphNode[]>(() => {
    return AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      short: a.short,
      isExecutive: a.id === "executive",
      baseRadius: a.id === "executive" ? EXEC_RADIUS : NODE_RADIUS,
    }));
  }, []);

  // 2. Detect collaboration edges from event history.
  //    Rule: if agent A acts soon after agent B's result, strengthen A↔B.
  const collaborationEdges = useMemo(() => {
    const edges = new Map<string, { strength: number; lastSeen: number }>();
    const now = Date.now();
    let prevAgent: string | null = null;
    let prevTime = 0;

    for (const evt of events) {
      if (!evt.agent) continue;
      const agentId = resolveAgentId(evt.agent);
      if (!agentId) continue;

      if (evt.type === "agent:acting" && prevAgent && prevAgent !== agentId) {
        const gap = evt.timestamp - prevTime;
        if (gap < COLLAB_WINDOW_MS) {
          const key = [prevAgent, agentId].sort().join("↔");
          // Strength decays with age so older collaborations fade.
          const age = Math.max(0, 1 - (now - evt.timestamp) / RECENT_WINDOW_MS);
          const prev = edges.get(key);
          edges.set(key, {
            strength: Math.min(1, (prev?.strength ?? 0) + 0.45 * age),
            lastSeen: evt.timestamp,
          });
        }
      }
      prevAgent = agentId;
      prevTime = evt.timestamp;
    }

    return Array.from(edges.entries())
      .map(([key, v]) => {
        const [a, b] = key.split("↔");
        return { source: a, target: b, strength: v.strength, key };
      })
      .sort((a, b) => b.strength - a.strength);
  }, [events]);

  // 3. Full edge list: Executive ↔ each agent (always) + collaboration edges.
  //    Cap total at MAX_COLLAB_EDGES to avoid clutter.
  const edges = useMemo(() => {
    const execId = "executive";
    const base = AGENTS.filter((a) => a.id !== execId).map((a) => ({
      source: execId,
      target: a.id,
      strength: 0.45,
    }));
    const collab = collaborationEdges
      .filter((e) => e.source !== execId && e.target !== execId)
      .slice(0, Math.max(0, MAX_COLLAB_EDGES - base.length));
    return [...base, ...collab];
  }, [collaborationEdges]);

  // 4. Run d3-force simulation when base nodes or edge SET changes.
  //    Re-seeds from prior positions when available to avoid visual jumps.
  useEffect(() => {
    const simNodes: GraphNode[] = baseNodes.map((n) => ({ ...n }));
    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    // Seed positions: reuse previous if present, else place around a circle.
    simNodes.forEach((n, i) => {
      const existing = positionsRef.current.get(n.id);
      if (existing) {
        n.x = existing.x;
        n.y = existing.y;
      } else if (n.isExecutive) {
        n.x = CENTER.x;
        n.y = CENTER.y;
      } else {
        const nonExecCount = simNodes.length - 1;
        const angle = (i / Math.max(1, nonExecCount)) * Math.PI * 2 - Math.PI / 2;
        n.x = CENTER.x + Math.cos(angle) * 120;
        n.y = CENTER.y + Math.sin(angle) * 120;
      }
      // Pin executive to center for a stable hub-and-spoke layout.
      if (n.isExecutive) {
        n.fx = CENTER.x;
        n.fy = CENTER.y;
      }
    });

    const simEdges: SimEdge[] = edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
        strength: e.strength,
        key: `${e.source}↔${e.target}`,
      }));

    const simulation = d3
      .forceSimulation<GraphNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance((d) => {
            const s = d.source as GraphNode;
            const t = d.target as GraphNode;
            return s.isExecutive || t.isExecutive ? 105 : 78;
          })
          .strength((d) => 0.35 + d.strength * 0.25)
      )
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(CENTER.x, CENTER.y))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.baseRadius + 10))
      .force("x", d3.forceX(CENTER.x).strength(0.04))
      .force("y", d3.forceY(CENTER.y).strength(0.04))
      .alphaDecay(0.025);

    // Run a fixed number of ticks synchronously (cheap for ~11 nodes).
    for (let i = 0; i < 300; i++) simulation.tick();
    simulation.stop();

    const newPos = new Map<string, { x: number; y: number }>();
    simNodes.forEach((n) => {
      const p = { x: n.x ?? 0, y: n.y ?? 0 };
      newPos.set(n.id, p);
      positionsRef.current.set(n.id, p);
    });
    setPositions(newPos);

    return () => {
      simulation.stop();
    };
  }, [baseNodes, edges]);

  // 5. Merge live status into render nodes. Does NOT re-trigger simulation.
  const renderNodes = useMemo<RenderNode[]>(() => {
    return baseNodes.map((n) => {
      const name = nameForId(n.id);
      const s = name ? agentStatuses[name] : undefined;
      return {
        ...n,
        status: hasMission ? (s?.status ?? "idle") : "idle",
        detail: s?.detail,
      };
    });
  }, [baseNodes, agentStatuses, hasMission]);

  // 6. Compute render edges with `active` flag (both endpoints thinking/acting).
  const renderEdges = useMemo<RenderEdge[]>(() => {
    const statusById = new Map(renderNodes.map((n) => [n.id, n.status]));
    return edges.map((e) => {
      const s = statusById.get(e.source);
      const t = statusById.get(e.target);
      const active =
        (s === "thinking" || s === "acting") && (t === "thinking" || t === "acting");
      return {
        source: e.source,
        target: e.target,
        strength: e.strength,
        active,
        key: `${e.source}↔${e.target}`,
      };
    });
  }, [edges, renderNodes]);

  const getPos = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  const hoveredNode = hovered ? renderNodes.find((n) => n.id === hovered) : null;
  const activeCount = renderNodes.filter(
    (n) => n.status === "thinking" || n.status === "acting"
  ).length;
  const doneCount = renderNodes.filter((n) => n.status === "done").length;
  const errorCount = renderNodes.filter((n) => n.status === "error").length;

  return (
    <div className={cn("relative", className)}>
      {/* Stats row (compact) */}
      <div className="mb-2 flex items-center justify-end gap-2 text-[9px] text-muted-foreground/70">
        <span className="flex items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          {activeCount} active
        </span>
        <span className="flex items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {doneCount} done
        </span>
        {errorCount > 0 && (
          <span className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            {errorCount} err
          </span>
        )}
      </div>

      {/* Graph SVG */}
      <div className="relative overflow-hidden rounded-lg border border-white/5 bg-black/30">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          style={{ aspectRatio: "1 / 1" }}
          role="img"
          aria-label="Agent network graph showing 11 agents and their collaboration links"
        >
          <defs>
            <radialGradient id="ang-bg-grad" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.12)" />
              <stop offset="55%" stopColor="rgba(167,139,250,0.04)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <filter id="ang-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="ang-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect x="0" y="0" width={W} height={H} fill="url(#ang-bg-grad)" />

          {/* Concentric guide rings (subtle) */}
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={110}
            fill="none"
            stroke="rgba(148,163,184,0.06)"
            strokeWidth={0.5}
          />
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={70}
            fill="none"
            stroke="rgba(148,163,184,0.05)"
            strokeWidth={0.5}
          />

          {/* Edges */}
          {renderEdges.map((e) => {
            const pa = getPos(e.source);
            const pb = getPos(e.target);
            if (!pa.x && !pa.y && !pb.x && !pb.y) return null;
            const isHoveredEdge =
              hovered && (hovered === e.source || hovered === e.target);
            const dim = hovered && !isHoveredEdge;
            return (
              <g key={e.key}>
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={e.active ? "#22d3ee" : "#64748b"}
                  strokeWidth={e.active ? 1.4 : 0.7}
                  strokeOpacity={dim ? 0.04 : e.active ? 0.55 : 0.18}
                />
                {e.active && (
                  <line
                    x1={pa.x}
                    y1={pa.y}
                    x2={pb.x}
                    y2={pb.y}
                    stroke="#67e8f9"
                    strokeWidth={1.1}
                    strokeOpacity={0.85}
                    strokeDasharray="3 6"
                    filter="url(#ang-soft-glow)"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-18"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  </line>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {renderNodes.map((n) => {
            const pos = getPos(n.id);
            const statusColor = STATUS_COLORS[n.status];
            const r = n.baseRadius;
            const isHover = hovered === n.id;
            const isClicked = clicked === n.id;
            const dim = hovered && !isHover;
            const isActive = n.status === "acting" || n.status === "thinking";

            return (
              <g
                key={n.id}
                transform={`translate(${pos.x} ${pos.y})`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setClicked((c) => (c === n.id ? null : n.id))}
                style={{
                  cursor: "pointer",
                  opacity: dim ? 0.35 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {/* Outer glow for active states */}
                {isActive && (
                  <circle
                    r={r + 9}
                    fill={statusColor}
                    opacity={0.18}
                    filter="url(#ang-glow)"
                  >
                    <animate
                      attributeName="r"
                      values={`${r + 6};${r + 12};${r + 6}`}
                      dur="2.2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.28;0.08;0.28"
                      dur="2.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Status ring */}
                <motion.circle
                  r={r + 4}
                  fill="none"
                  stroke={statusColor}
                  strokeWidth={n.status === "idle" ? 1 : 1.6}
                  strokeDasharray={n.status === "idle" ? "3 3" : undefined}
                  animate={{ stroke: statusColor }}
                  transition={{ duration: 0.3 }}
                  opacity={n.status === "idle" ? 0.4 : 0.9}
                >
                  {n.status === "error" && (
                    <animate
                      attributeName="r"
                      values={`${r + 3};${r + 6};${r + 3}`}
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                </motion.circle>

                {/* Click halo */}
                {isClicked && (
                  <motion.circle
                    initial={{ r: r + 4, opacity: 0.6 }}
                    animate={{ r: r + 14, opacity: 0 }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth={1.2}
                  />
                )}

                {/* Node fill */}
                <motion.circle
                  r={r}
                  fill={n.color}
                  animate={{
                    fillOpacity:
                      hasMission && n.status !== "idle" ? 0.38 : 0.16,
                  }}
                  transition={{ duration: 0.3 }}
                  stroke={n.color}
                  strokeWidth={n.isExecutive ? 2 : 1.4}
                />

                {/* Executive crown marker */}
                {n.isExecutive && (
                  <circle
                    r={r - 6}
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.5}
                    strokeDasharray="1 2"
                  />
                )}

                {/* Checkmark for done */}
                {n.status === "done" && (
                  <path
                    d="M -5 0 L -1 4 L 5 -4"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Error cross */}
                {n.status === "error" && (
                  <path
                    d="M -4 -4 L 4 4 M 4 -4 L -4 4"
                    stroke="#f472b6"
                    strokeWidth={1.8}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}

                {/* Initials */}
                {!n.isExecutive &&
                  n.status !== "done" &&
                  n.status !== "error" && (
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize={9}
                      fill="white"
                      className="pointer-events-none font-mono font-semibold select-none"
                    >
                      {n.short}
                    </text>
                  )}

                {/* Label below */}
                <text
                  y={r + 15}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill={isHover ? statusColor : "#94a3b8"}
                  className="pointer-events-none select-none"
                  style={{ fontWeight: isHover ? 600 : 400 }}
                >
                  {n.name.length > 14 ? n.name.slice(0, 13) + "…" : n.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredNode && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute left-1/2 top-2 z-10 w-[200px] -translate-x-1/2 rounded-md border border-white/10 bg-black/85 px-3 py-2 backdrop-blur-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {hoveredNode.name}
                </span>
                <span
                  className="flex items-center gap-1 text-[9px] uppercase tracking-wider"
                  style={{ color: STATUS_COLORS[hoveredNode.status] }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_COLORS[hoveredNode.status] }}
                  />
                  {STATUS_LABELS[hoveredNode.status]}
                </span>
              </div>
              {hoveredNode.detail && (
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-foreground/70">
                  {hoveredNode.detail}
                </p>
              )}
              {hoveredNode.isExecutive && (
                <p className="mt-1 text-[9px] uppercase tracking-wider text-violet-300/70">
                  Hub · coordinates all agents
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Click feedback chip */}
        <AnimatePresence>
          {clicked && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/30 bg-cyan-400/15 px-3 py-0.5 text-[9px] text-cyan-200 backdrop-blur-sm"
            >
              focused:{" "}
              {renderNodes.find((n) => n.id === clicked)?.name ?? clicked}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground/70">
        {(["idle", "thinking", "acting", "done", "error"] as Status[]).map(
          (s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: STATUS_COLORS[s] }}
              />
              {STATUS_LABELS[s]}
            </span>
          )
        )}
        <span className="flex items-center gap-1 text-cyan-300/80">
          <span className="h-0.5 w-3 bg-cyan-400/70" /> active link
        </span>
      </div>
    </div>
  );
}
