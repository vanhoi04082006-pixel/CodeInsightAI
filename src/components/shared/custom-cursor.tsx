"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * CustomCursor v2 — Premium SaaS Cursor Interaction System
 *
 * Features:
 * - Dual-layer ring (outer lerp 0.28 + inner glow lerp 0.5) → responsive yet smooth
 * - Dynamic glow intensity based on mouse velocity
 * - Spotlight lighting (radial gradient follows cursor, illuminates nearby cards)
 * - Morphing cursor: circle → ring → I-beam → crosshair based on context
 * - Velocity-based comet trail (single SVG path, not discrete particles)
 * - Click burst: ripple + glow flash + scale
 * - Magnetic hover: subtle snap toward interactive element centers (max 6px)
 * - Ambient breathing animation when idle (>1.5s no movement)
 * - Context-aware colors: cyan (default), violet (button/link), emerald (success),
 *   amber (input), pink (danger), rainbow (chart hover)
 * - AI loading state: spinning dashed ring
 * - GPU-accelerated (transform only, no layout)
 * - Passive events, rAF-batched, target-change-only hover detection
 * - prefers-reduced-motion: disable trail + ripple, keep ring + dot
 * - Touch devices: completely hidden
 */

type CursorContext = "default" | "button" | "link" | "input" | "code" | "chart" | "danger" | "loading";

const CONTEXT_COLORS: Record<CursorContext, { ring: string; dot: string; glow: string }> = {
  default: { ring: "#22d3ee", dot: "#22d3ee", glow: "rgba(34,211,238,0.4)" },
  button: { ring: "#a78bfa", dot: "#a78bfa", glow: "rgba(167,139,250,0.5)" },
  link: { ring: "#60a5fa", dot: "#60a5fa", glow: "rgba(96,165,250,0.5)" },
  input: { ring: "#fbbf24", dot: "#fbbf24", glow: "rgba(251,191,36,0.4)" },
  code: { ring: "#34d399", dot: "#34d399", glow: "rgba(52,211,153,0.4)" },
  chart: { ring: "#f472b6", dot: "#f472b6", glow: "rgba(244,114,182,0.5)" },
  danger: { ring: "#ff5470", dot: "#ff5470", glow: "rgba(255,84,112,0.5)" },
  loading: { ring: "#a78bfa", dot: "#a78bfa", glow: "rgba(167,139,250,0.6)" },
};

const RIPLE_LIFETIME = 600;

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const glowRingRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGSVGElement>(null);
  const trailPathRef = useRef<SVGPathElement>(null);
  const rippleContainerRef = useRef<HTMLDivElement>(null);

  const [hidden, setHidden] = useState(true);
  const [context, setContext] = useState<CursorContext>("default");
  const [clicking, setClicking] = useState(false);
  const [idle, setIdle] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Refs for animation loop (avoid re-renders)
  const mouseRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, speed: 0 });
  const ringPosRef = useRef({ x: 0, y: 0 });
  const glowPosRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(Date.now());
  const lastTargetRef = useRef<HTMLElement | null>(null);
  const trailPointsRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const rafIdRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const magneticTargetRef = useRef<{ el: HTMLElement; cx: number; cy: number } | null>(null);

  // Check for AI loading state (global loading indicator)
  useEffect(() => {
    const checkLoading = () => {
      const loadingEls = document.querySelectorAll('[data-loading="true"], [data-cursor="loading"]');
      setAiLoading(loadingEls.length > 0);
    };
    const interval = setInterval(checkLoading, 300);
    return () => clearInterval(interval);
  }, []);

  // Spawn ripple on click
  const spawnRipple = useCallback((x: number, y: number, color: string) => {
    if (reducedMotionRef.current) return;
    if (!rippleContainerRef.current) return;
    const ripple = document.createElement("div");
    ripple.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 0;
      height: 0;
      border-radius: 50%;
      border: 2px solid ${color};
      box-shadow: 0 0 20px ${color};
      pointer-events: none;
      z-index: 9998;
      transform: translate(-50%, -50%);
      animation: cursor-ripple ${RIPLE_LIFETIME}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;
    rippleContainerRef.current.appendChild(ripple);
    setTimeout(() => ripple.remove(), RIPLE_LIFETIME + 50);
  }, []);

  useEffect(() => {
    // Skip on touch devices
    if (window.matchMedia("(hover: none)").matches) return;
    // Check reduced motion
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reduced;

    const showTimer = requestAnimationFrame(() => setHidden(false));

    let mouseX = 0, mouseY = 0;
    let prevX = 0, prevY = 0;
    let prevTime = performance.now();

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - prevTime);
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt * 16; // px per frame (~16ms)

      mouseRef.current = {
        x: e.clientX,
        y: e.clientY,
        vx: dx,
        vy: dy,
        speed: Math.min(speed, 100), // cap for glow calc
      };

      // Instant dot follow
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }

      // Spotlight follow
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }

      // Trail points (for velocity trail)
      if (!reducedMotionRef.current && speed > 2) {
        trailPointsRef.current.push({ x: e.clientX, y: e.clientY, t: now });
        // Keep only last 500ms of points
        const cutoff = now - 500;
        trailPointsRef.current = trailPointsRef.current.filter((p) => p.t > cutoff);
      }

      mouseX = e.clientX;
      mouseY = e.clientY;
      prevX = e.clientX;
      prevY = e.clientY;
      prevTime = now;
      lastMoveTimeRef.current = Date.now();
      if (idle) setIdle(false);
    };

    // Context detection — only when target changes (throttled)
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === lastTargetRef.current) return;
      lastTargetRef.current = target;

      // Detect context by element type + attributes
      if (aiLoading) {
        setContext("loading");
        return;
      }
      if (target.closest("[data-cursor='loading'], [data-loading='true']")) {
        setContext("loading");
      } else if (target.closest("[data-cursor='danger'], button[class*='destructive'], button[class*='rose']")) {
        setContext("danger");
      } else if (target.closest("pre, code, [data-cursor='code']")) {
        setContext("code");
      } else if (target.closest("[data-cursor='chart'], .recharts-wrapper, .recharts-surface")) {
        setContext("chart");
      } else if (target.closest("input, textarea, [contenteditable], [role='textbox']")) {
        setContext("input");
      } else if (target.closest("a, [role='link']")) {
        setContext("link");
      } else if (target.closest("button, [role='button'], [data-cursor='hover']")) {
        setContext("button");
      } else {
        setContext("default");
      }
    };

    // Magnetic hover — subtle snap toward button center
    const onMagneticMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const magnetic = target.closest("button, a, [data-magnetic]") as HTMLElement | null;
      if (magnetic && magnetic.offsetWidth < 200) {
        const rect = magnetic.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (dist < 60 && dist > 5) {
          magneticTargetRef.current = { el: magnetic, cx, cy };
        } else {
          magneticTargetRef.current = null;
        }
      } else {
        magneticTargetRef.current = null;
      }
    };

    const onDown = (e: MouseEvent) => {
      setClicking(true);
      const color = CONTEXT_COLORS[context];
      spawnRipple(e.clientX, e.clientY, color.ring);
    };
    const onUp = () => setClicking(false);
    const onLeave = () => setHidden(true);
    const onEnter = () => setHidden(false);

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousemove", onMagneticMove, { passive: true });
    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    // Idle detection
    const idleInterval = setInterval(() => {
      const elapsed = Date.now() - lastMoveTimeRef.current;
      setIdle(elapsed > 1500);
    }, 500);

    // Animation loop
    const animate = () => {
      const { x: mx, y: my, speed } = mouseRef.current;

      // Magnetic offset (subtle, max 6px)
      let magX = 0, magY = 0;
      if (magneticTargetRef.current) {
        const { cx, cy } = magneticTargetRef.current;
        magX = (cx - mx) * 0.15;
        magY = (cy - my) * 0.15;
        const magDist = Math.hypot(magX, magY);
        if (magDist > 6) {
          magX = (magX / magDist) * 6;
          magY = (magY / magDist) * 6;
        }
      }

      // Outer ring — lerp 0.28 (responsive)
      ringPosRef.current.x += (mx + magX - ringPosRef.current.x) * 0.28;
      ringPosRef.current.y += (my + magY - ringPosRef.current.y) * 0.28;

      // Inner glow ring — lerp 0.5 (trailing)
      glowPosRef.current.x += (mx - glowPosRef.current.x) * 0.5;
      glowPosRef.current.y += (my - glowPosRef.current.y) * 0.5;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px, ${ringPosRef.current.y}px, 0)`;
      }
      if (glowRingRef.current) {
        glowRingRef.current.style.transform = `translate3d(${glowPosRef.current.x}px, ${glowPosRef.current.y}px, 0)`;
      }

      // Velocity-based glow intensity
      const glowIntensity = Math.min(1, speed / 30);
      if (ringRef.current) {
        ringRef.current.style.setProperty("--glow-intensity", String(glowIntensity));
      }

      // Update trail path
      if (trailPathRef.current && trailPointsRef.current.length > 1) {
        const points = trailPointsRef.current;
        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          pathData += ` L ${points[i].x} ${points[i].y}`;
        }
        trailPathRef.current.setAttribute("d", pathData);
        // Fade trail based on age
        const now = performance.now();
        const opacity = Math.min(0.6, speed / 40);
        trailPathRef.current.style.opacity = String(opacity);
      } else if (trailPathRef.current) {
        trailPathRef.current.style.opacity = "0";
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousemove", onMagneticMove);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      cancelAnimationFrame(rafIdRef.current);
      cancelAnimationFrame(showTimer);
      clearInterval(idleInterval);
    };
  }, [context, aiLoading, idle, spawnRipple]);

  // Inject keyframes for ripple animation
  useEffect(() => {
    if (document.getElementById("cursor-styles")) return;
    const style = document.createElement("style");
    style.id = "cursor-styles";
    style.textContent = `
      @keyframes cursor-ripple {
        0% { width: 0; height: 0; opacity: 1; border-width: 2px; }
        100% { width: 80px; height: 80px; opacity: 0; border-width: 1px; }
      }
      @keyframes cursor-breathe {
        0%, 100% { transform: scale(1); opacity: 0.8; }
        50% { transform: scale(1.15); opacity: 1; }
      }
      @keyframes cursor-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  if (hidden) return null;

  const colors = CONTEXT_COLORS[context];
  const isInteractive = context === "button" || context === "link";
  const isText = context === "input";
  const isCode = context === "code";
  const isLoading = context === "loading" || aiLoading;

  // Ring size by context
  const ringSize = isLoading ? 32 : isInteractive ? 44 : isCode ? 36 : 24;
  const dotSize = clicking ? 3 : isInteractive ? 5 : 4;

  return (
    <>
      {/* Spotlight — radial gradient follows cursor, illuminates nearby UI */}
      <div
        ref={spotlightRef}
        className="pointer-events-none fixed left-0 top-0 z-[9990] hidden md:block"
        style={{
          width: 400,
          height: 400,
          marginLeft: -200,
          marginTop: -200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
          opacity: isInteractive ? 0.15 : 0.08,
          mixBlendMode: "screen",
          transition: "opacity 0.3s, background 0.3s",
        }}
      />

      {/* Velocity trail — SVG path, not discrete particles */}
      <svg
        ref={trailRef}
        className="pointer-events-none fixed left-0 top-0 z-[9992] hidden md:block"
        style={{ width: "100vw", height: "100vh", opacity: 0 }}
      >
        <defs>
          <linearGradient id="trail-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.ring} stopOpacity="0" />
            <stop offset="100%" stopColor={colors.ring} stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path
          ref={trailPathRef}
          d=""
          fill="none"
          stroke="url(#trail-gradient)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0, transition: "opacity 0.2s" }}
        />
      </svg>

      {/* Outer ring — lerp follow, main cursor body */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999] flex items-center justify-center"
        style={{
          width: ringSize,
          height: ringSize,
          marginLeft: -ringSize / 2,
          marginTop: -ringSize / 2,
          borderRadius: isText ? "2px" : "50%",
          border: `1.5px solid ${colors.ring}`,
          boxShadow: `0 0 ${12 + (mouseRef.current.speed / 2)}px ${colors.glow}`,
          transition: "width 0.2s cubic-bezier(0.16,1,0.3,1), height 0.2s cubic-bezier(0.16,1,0.3,1), margin 0.2s, border-radius 0.2s, border-color 0.3s, box-shadow 0.3s",
          opacity: clicking ? 0.6 : idle ? 0.7 : 1,
          transform: "translate3d(0,0,0)",
          animation: idle && !isLoading ? "cursor-breathe 2.5s ease-in-out infinite" : isLoading ? `cursor-spin 1.5s linear infinite` : undefined,
          // For I-beam (text input) — show vertical bar shape
          ...(isText ? {
            width: 2,
            height: 24,
            marginLeft: -1,
            marginTop: -12,
            borderRadius: 0,
            background: colors.ring,
            border: "none",
            boxShadow: `0 0 8px ${colors.glow}`,
          } : {}),
        }}
      />

      {/* Inner glow ring — trailing layer */}
      {!isText && (
        <div
          ref={glowRingRef}
          className="pointer-events-none fixed left-0 top-0 z-[9998] flex items-center justify-center"
          style={{
            width: ringSize * 0.6,
            height: ringSize * 0.6,
            marginLeft: -(ringSize * 0.6) / 2,
            marginTop: -(ringSize * 0.6) / 2,
            borderRadius: "50%",
            border: `1px solid ${colors.ring}`,
            opacity: 0.3,
            transition: "width 0.3s, height 0.3s, margin 0.3s, border-color 0.3s",
            transform: "translate3d(0,0,0)",
          }}
        />
      )}

      {/* Inner dot — instant follow */}
      {!isText && (
        <div
          ref={dotRef}
          className="pointer-events-none fixed left-0 top-0 z-[10000]"
          style={{
            width: dotSize,
            height: dotSize,
            marginLeft: -dotSize / 2,
            marginTop: -dotSize / 2,
            borderRadius: "50%",
            background: colors.dot,
            boxShadow: `0 0 ${6 + (mouseRef.current.speed / 4)}px ${colors.glow}`,
            transition: "width 0.15s, height 0.15s, margin 0.15s, background 0.3s, box-shadow 0.3s",
            opacity: clicking ? 0.8 : idle ? 0.5 : 1,
            transform: "translate3d(0,0,0)",
          }}
        />
      )}

      {/* Ripple container — click bursts */}
      <div ref={rippleContainerRef} className="pointer-events-none fixed inset-0 z-[9997]" />

      {/* AI loading indicator — spinning dashed ring around cursor */}
      {isLoading && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[10001] flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            marginLeft: -24,
            marginTop: -24,
            borderRadius: "50%",
            border: `2px dashed ${colors.ring}`,
            borderRightColor: "transparent",
            animation: "cursor-spin 0.8s linear infinite",
            transform: `translate3d(${mouseRef.current.x}px, ${mouseRef.current.y}px, 0)`,
            opacity: 0.7,
          }}
        />
      )}
    </>
  );
}
