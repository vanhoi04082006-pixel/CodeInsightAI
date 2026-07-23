"use client";

import { useEffect, useRef, useState } from "react";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";

/* Aurora + neural-network canvas background with accent color support */
export function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const accentId = usePersonalizationStore((s) => s.accent);
  const animation = usePersonalizationStore((s) => s.animation);

  // Mount guard — prevents hydration mismatch from perfMode being different
  // on server (default "en"/"ultra") vs client (from localStorage).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const perfMode = mounted && animation === "performance";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const palette = ACCENT_PALETTES[accentId];
    // Use only hex colors for canvas — glow is rgba, so use primary/accent instead
    const bgColor1 = toRgba(palette.primary, 0.06);
    const bgColor2 = toRgba(palette.accent, 0.05);
    const bgColor3 = toRgba(palette.primary, 0.04);
    const nodeColor = toRgba(palette.accent, 0.55);
    const lineColorBase = palette.accent;
    const particleColor = toRgba(palette.primary, 0.3);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Neural nodes
    const NODE_COUNT = perfMode ? 0 : Math.min(46, Math.floor((w * h) / 28000));
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
    }));

    // Floating particles
    const PARTICLE_COUNT = perfMode ? 0 : 30;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.2 - Math.random() * 0.3,
      r: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.4 + 0.1,
    }));

    const mouse = { x: -9999, y: -9999 };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("mousemove", onMove);

    let t = 0;
    const render = () => {
      t += 0.005;
      ctx.clearRect(0, 0, w, h);

      if (!perfMode) {
        // Aurora blobs
        const blobs = [
          { x: w * (0.2 + Math.sin(t) * 0.05), y: h * 0.3, r: w * 0.4, c: bgColor1 },
          { x: w * (0.8 + Math.cos(t * 0.8) * 0.05), y: h * 0.6, r: w * 0.45, c: bgColor2 },
          { x: w * 0.5, y: h * (0.2 + Math.sin(t * 1.2) * 0.08), r: w * 0.35, c: bgColor3 },
        ];
        blobs.forEach((b) => {
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, b.c);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        });

        // Neural net
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;

          const dxm = n.x - mouse.x;
          const dym = n.y - mouse.y;
          const dm = Math.hypot(dxm, dym);
          if (dm < 140) {
            n.x += (dxm / dm) * 0.6;
            n.y += (dym / dm) * 0.6;
          }

          for (let j = i + 1; j < nodes.length; j++) {
            const m = nodes[j];
            const dx = n.x - m.x;
            const dy = n.y - m.y;
            const d = Math.hypot(dx, dy);
            if (d < 150) {
              const op = (1 - d / 150) * 0.22;
              ctx.strokeStyle = toRgba(lineColorBase, op);
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(m.x, m.y);
              ctx.stroke();
            }
          }

          ctx.fillStyle = nodeColor;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Floating particles
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;

          ctx.fillStyle = toRgba(palette.primary, p.alpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [accentId, perfMode]);

  // Always render the same structure on server and client to avoid hydration
  // mismatch. The grid-bg div is always present but hidden via CSS when perfMode.
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={ref} className="h-full w-full" />
      <div className="absolute inset-0 grid-bg opacity-40" style={{ display: perfMode ? "none" : undefined }} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
    </div>
  );
}

/**
 * Convert any color string (hex like #3b82f6 or rgba like rgba(59,130,246,0.45))
 * to an rgba string with the specified alpha. Handles both formats safely.
 */
function toRgba(color: string, alpha: number): string {
  // If it's already rgba/rgb, parse the numbers
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${alpha})`;
  }
  // If it's a hex string
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }
  // Fallback: return a safe default
  return `rgba(59,130,246,${alpha})`;
}
