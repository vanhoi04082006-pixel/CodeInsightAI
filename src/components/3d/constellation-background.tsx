"use client";

/**
 * CodeInsight AI — Plexus / Constellation Network Background
 *
 * Sparse connected-node network resembling a dependency graph or neural mesh:
 *   - ~40 scattered nodes (cyan dots)
 *   - proximity-based line connections (faint blue)
 *   - slow drift + parallax toward pointer
 *   - one "active" node pulses with a glowing ring
 *
 * Rendered on a 2D canvas (not WebGL) — this effect is light enough that
 * Three.js would be overkill, and canvas keeps the bundle small.
 */

import { useEffect, useRef } from "react";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  phase: number;
}

const NODE_COUNT = 42;
const CONNECT_DIST = 180; // px — max distance for a line to be drawn
const ACTIVE_NODE_INDEX = 17; // deterministic "highlighted" node

export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentId = usePersonalizationStore((s) => s.accent);
  const animation = usePersonalizationStore((s) => s.animation);
  const reducedMotion = usePersonalizationStore((s) => s.reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let nodes: Node[] = [];

    const palette = ACCENT_PALETTES[accentId];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNodes();
    };

    const seedNodes = () => {
      nodes = Array.from({ length: NODE_COUNT }, () => {
        const x = Math.random() * w;
        const y = Math.random() * h;
        return {
          x,
          y,
          baseX: x,
          baseY: y,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          phase: Math.random() * Math.PI * 2,
        };
      });
    };

    // Parse "rgb(r, g, b)" → [r, g, b]
    const parseRgb = (str: string): [number, number, number] => {
      const m = str.match(/\d+/g);
      if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
      return [34, 211, 238]; // fallback cyan
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      // Smooth pointer follow
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      const speedFactor = animation === "performance" ? 0.3 : 1;

      // Update node positions
      for (const n of nodes) {
        n.x += n.vx * speedFactor;
        n.y += n.vy * speedFactor;
        // Wrap around edges
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }

      const [pr, pg, pb] = parseRgb(palette.primary);
      const [ar, ag, ab] = parseRgb(palette.accent);

      // Draw connection lines (proximity-based)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.35;
            ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isActive = i === ACTIVE_NODE_INDEX;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n.phase);

        if (isActive) {
          // Glowing ring for the active node
          const ringR = 6 + pulse * 4;
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.6 + pulse * 0.4})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, ringR, 0, Math.PI * 2);
          ctx.stroke();

          // Inner glow
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14);
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.5)`);
          grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node dot
        const dotR = isActive ? 2.5 + pulse : 1.8;
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${isActive ? 1 : 0.75})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [accentId, animation, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}
