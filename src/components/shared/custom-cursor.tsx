"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * CustomCursor v2.1 — Premium SaaS Cursor (QA-Optimized)
 *
 * QA Fixes from v2:
 * - Single useEffect (no re-subscribe on context/idle change) → no stutter
 * - Refs for context/idle/aiLoading → animation loop reads refs, no re-render
 * - Trail: ring buffer (no array realloc), 350ms window (was 500ms)
 * - Ripple: 200ms lifetime (was 600ms) → snappier feedback
 * - Magnetic: 4px max, 0.08 lerp (was 6px/0.15) → subtle, not jarring
 * - Spotlight: 300px (was 400px), opacity 0.06 default (was 0.08) → better readability
 * - Glow cap: max 24px box-shadow (was up to 62px) → OLED-safe
 * - I-beam: 18px height (was 24px) → doesn't obstruct text
 * - Single mousemove listener (merged onMove + onMagneticMove)
 * - Delta-time lerp → consistent on 60/120/144Hz
 * - Visibility change: pause rAF when tab hidden (CPU saving)
 * - will-change: transform for GPU hint
 */

type CursorContext = "default" | "button" | "link" | "input" | "code" | "chart" | "danger" | "loading";

const CONTEXT_COLORS: Record<CursorContext, { ring: string; dot: string; glow: string }> = {
  default: { ring: "#22d3ee", dot: "#22d3ee", glow: "rgba(34,211,238,0.35)" },
  button: { ring: "#a78bfa", dot: "#a78bfa", glow: "rgba(167,139,250,0.45)" },
  link: { ring: "#60a5fa", dot: "#60a5fa", glow: "rgba(96,165,250,0.45)" },
  input: { ring: "#fbbf24", dot: "#fbbf24", glow: "rgba(251,191,36,0.35)" },
  code: { ring: "#34d399", dot: "#34d399", glow: "rgba(52,211,153,0.35)" },
  chart: { ring: "#f472b6", dot: "#f472b6", glow: "rgba(244,114,182,0.45)" },
  danger: { ring: "#ff5470", dot: "#ff5470", glow: "rgba(255,84,112,0.45)" },
  loading: { ring: "#a78bfa", dot: "#a78bfa", glow: "rgba(167,139,250,0.55)" },
};

const RIPPLE_LIFETIME = 200; // ms (was 600 — now snappy)
const TRAIL_WINDOW = 350; // ms (was 500 — less clutter)
const TRAIL_MAX_POINTS = 40; // ring buffer cap
const IDLE_THRESHOLD = 1800; // ms
const MAGNETIC_MAX_PX = 4; // was 6
const MAGNETIC_LERP = 0.08; // was 0.15
const GLOW_MAX_PX = 24; // was unbounded (~62px)
const SPOTLIGHT_SIZE = 300; // was 400
const SPOTLIGHT_OPACITY_DEFAULT = 0.05; // was 0.08
const SPOTLIGHT_OPACITY_INTERACTIVE = 0.12; // was 0.15

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const glowRingRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const trailPathRef = useRef<SVGPathElement>(null);
  const rippleContainerRef = useRef<HTMLDivElement>(null);
  const loadingRingRef = useRef<HTMLDivElement>(null);

  const [hidden, setHidden] = useState(true);
  const [context, setContext] = useState<CursorContext>("default");
  const [clicking, setClicking] = useState(false);
  const [idle, setIdle] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Refs mirror state for animation loop (avoid re-subscribing useEffect)
  const contextRef = useRef<CursorContext>("default");
  const idleRef = useRef(false);
  const aiLoadingRef = useRef(false);
  const clickingRef = useRef(false);

  const mouseRef = useRef({ x: 0, y: 0, speed: 0 });
  const ringPosRef = useRef({ x: 0, y: 0 });
  const glowPosRef = useRef({ x: 0, y: 0 });
  const loadingPosRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(Date.now());
  const lastTargetRef = useRef<HTMLElement | null>(null);
  const trailPointsRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const rafIdRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const magneticTargetRef = useRef<{ cx: number; cy: number } | null>(null);
  const visibleRef = useRef(true);

  // Sync state to refs
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { idleRef.current = idle; }, [idle]);
  useEffect(() => { aiLoadingRef.current = aiLoading; }, [aiLoading]);
  useEffect(() => { clickingRef.current = clicking; }, [clicking]);

  // Check for AI loading state
  useEffect(() => {
    const checkLoading = () => {
      const loadingEls = document.querySelectorAll("[data-loading='true'], [data-cursor='loading']");
      setAiLoading(loadingEls.length > 0);
    };
    const interval = setInterval(checkLoading, 400); // was 300 — less frequent
    return () => clearInterval(interval);
  }, []);

  // Spawn ripple on click
  const spawnRipple = useCallback((x: number, y: number, color: string) => {
    if (reducedMotionRef.current) return;
    if (!rippleContainerRef.current) return;
    const ripple = document.createElement("div");
    ripple.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;border-radius:50%;border:2px solid ${color};box-shadow:0 0 16px ${color};pointer-events:none;z-index:9998;transform:translate(-50%,-50%);animation:cursor-ripple ${RIPPLE_LIFETIME}ms cubic-bezier(0.16,1,0.3,1) forwards;will-change:width,height,opacity;`;
    rippleContainerRef.current.appendChild(ripple);
    setTimeout(() => { ripple.remove(); }, RIPPLE_LIFETIME + 30);
  }, []);

  // Main effect — runs ONCE (no re-subscribe)
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reduced;

    const showTimer = requestAnimationFrame(() => setHidden(false));

    let prevX = 0, prevY = 0;
    let prevTime = performance.now();

    // SINGLE mousemove listener (merged move + magnetic)
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - prevTime);
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      const speed = Math.min(Math.sqrt(dx * dx + dy * dy) / dt * 16, 80); // cap 80 (was 100)

      mouseRef.current = { x: e.clientX, y: e.clientY, speed };

      // Instant dot + spotlight follow
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      }
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      }

      // Trail (ring buffer — no filter realloc)
      if (!reducedMotionRef.current && speed > 2) {
        trailPointsRef.current.push({ x: e.clientX, y: e.clientY, t: now });
        // Prune old points in-place (shift if exceeds cap)
        const cutoff = now - TRAIL_WINDOW;
        const pts = trailPointsRef.current;
        while (pts.length > 0 && (pts[0].t < cutoff || pts.length > TRAIL_MAX_POINTS)) {
          pts.shift();
        }
      }

      // Magnetic detection (inline, no separate listener)
      const target = e.target as HTMLElement;
      if (target) {
        const magnetic = target.closest("button, a, [data-magnetic]") as HTMLElement | null;
        if (magnetic && magnetic.offsetWidth < 200) {
          const rect = magnetic.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
          if (dist < 50 && dist > 4) {
            magneticTargetRef.current = { cx, cy };
          } else {
            magneticTargetRef.current = null;
          }
        } else {
          magneticTargetRef.current = null;
        }
      }

      prevX = e.clientX;
      prevY = e.clientY;
      prevTime = now;
      lastMoveTimeRef.current = Date.now();
      if (idleRef.current) setIdle(false);
    };

    // Context detection — throttled by target change
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === lastTargetRef.current) return;
      lastTargetRef.current = target;

      if (aiLoadingRef.current) {
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

    const onDown = (e: MouseEvent) => {
      setClicking(true);
      const color = CONTEXT_COLORS[contextRef.current];
      spawnRipple(e.clientX, e.clientY, color.ring);
    };
    const onUp = () => setClicking(false);
    const onLeave = () => setHidden(true);
    const onEnter = () => setHidden(false);

    // Pause rAF when tab hidden (CPU saving)
    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      if (document.hidden) {
        cancelAnimationFrame(rafIdRef.current);
      } else {
        prevTime = performance.now();
        rafIdRef.current = requestAnimationFrame(animate);
      }
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("visibilitychange", onVisibility);

    // Idle detection
    const idleInterval = setInterval(() => {
      const elapsed = Date.now() - lastMoveTimeRef.current;
      setIdle(elapsed > IDLE_THRESHOLD);
    }, 600); // was 500 — less frequent

    // Delta-time animation loop (consistent on 60/120/144Hz)
    let lastFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const frameDt = Math.min(33, now - lastFrame); // cap at ~30fps equivalent
      lastFrame = now;

      // Normalize lerp factor to 60fps baseline
      // At 60Hz (16.67ms): factor stays as-is
      // At 120Hz (8.33ms): factor halves (so same distance per second)
      const dtScale = frameDt / 16.67;
      const ringLerp = Math.min(1, 0.28 * dtScale);
      const glowLerp = Math.min(1, 0.5 * dtScale);
      const loadingLerp = Math.min(1, 0.35 * dtScale);

      const { x: mx, y: my } = mouseRef.current;

      // Magnetic offset (subtle, max 4px)
      let magX = 0, magY = 0;
      if (magneticTargetRef.current) {
        const { cx, cy } = magneticTargetRef.current;
        magX = (cx - mx) * MAGNETIC_LERP;
        magY = (cy - my) * MAGNETIC_LERP;
        const magDist = Math.hypot(magX, magY);
        if (magDist > MAGNETIC_MAX_PX) {
          magX = (magX / magDist) * MAGNETIC_MAX_PX;
          magY = (magY / magDist) * MAGNETIC_MAX_PX;
        }
      }

      // Outer ring
      ringPosRef.current.x += (mx + magX - ringPosRef.current.x) * ringLerp;
      ringPosRef.current.y += (my + magY - ringPosRef.current.y) * ringLerp;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px,${ringPosRef.current.y}px,0)`;
      }

      // Inner glow ring (trailing)
      glowPosRef.current.x += (mx - glowPosRef.current.x) * glowLerp;
      glowPosRef.current.y += (my - glowPosRef.current.y) * glowLerp;
      if (glowRingRef.current) {
        glowRingRef.current.style.transform = `translate3d(${glowPosRef.current.x}px,${glowPosRef.current.y}px,0)`;
      }

      // Loading ring follow
      if (aiLoadingRef.current || contextRef.current === "loading") {
        loadingPosRef.current.x += (mx - loadingPosRef.current.x) * loadingLerp;
        loadingPosRef.current.y += (my - loadingPosRef.current.y) * loadingLerp;
        if (loadingRingRef.current) {
          loadingRingRef.current.style.transform = `translate3d(${loadingPosRef.current.x}px,${loadingPosRef.current.y}px,0)`;
        }
      }

      // Velocity glow (capped for OLED)
      const speed = mouseRef.current.speed;
      const glowRadius = Math.min(GLOW_MAX_PX, 10 + speed / 3);
      if (ringRef.current) {
        ringRef.current.style.boxShadow = `0 0 ${glowRadius}px ${CONTEXT_COLORS[contextRef.current].glow}`;
      }

      // Trail path update
      if (trailPathRef.current) {
        const pts = trailPointsRef.current;
        if (pts.length > 1 && !reducedMotionRef.current) {
          let pathData = `M ${pts[0].x} ${pts[0].y}`;
          for (let i = 1; i < pts.length; i++) {
            pathData += ` L ${pts[i].x} ${pts[i].y}`;
          }
          trailPathRef.current.setAttribute("d", pathData);
          const opacity = Math.min(0.5, speed / 50);
          trailPathRef.current.style.opacity = String(opacity);
        } else {
          trailPathRef.current.style.opacity = "0";
        }
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafIdRef.current);
      cancelAnimationFrame(showTimer);
      clearInterval(idleInterval);
    };
  }, [spawnRipple]); // ← stable: only runs once

  // Inject keyframes
  useEffect(() => {
    if (document.getElementById("cursor-styles-v21")) return;
    const style = document.createElement("style");
    style.id = "cursor-styles-v21";
    style.textContent = `
      @keyframes cursor-ripple {
        0% { width: 0; height: 0; opacity: 0.9; border-width: 2px; }
        100% { width: 50px; height: 50px; opacity: 0; border-width: 1px; }
      }
      @keyframes cursor-breathe {
        0%, 100% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(1.12); opacity: 1; }
      }
      @keyframes cursor-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      // Clean up style on unmount
      const s = document.getElementById("cursor-styles-v21");
      if (s) s.remove();
    };
  }, []);

  if (hidden) return null;

  const colors = CONTEXT_COLORS[context];
  const isInteractive = context === "button" || context === "link";
  const isText = context === "input";
  const isCode = context === "code";
  const isLoading = context === "loading" || aiLoading;

  const ringSize = isLoading ? 30 : isInteractive ? 40 : isCode ? 32 : 22;
  const dotSize = clicking ? 3 : isInteractive ? 5 : 4;

  return (
    <>
      {/* Spotlight — subtle, doesn't hurt readability */}
      <div
        ref={spotlightRef}
        className="pointer-events-none fixed left-0 top-0 z-[9990] hidden md:block"
        style={{
          width: SPOTLIGHT_SIZE,
          height: SPOTLIGHT_SIZE,
          marginLeft: -SPOTLIGHT_SIZE / 2,
          marginTop: -SPOTLIGHT_SIZE / 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 65%)`,
          opacity: isInteractive ? SPOTLIGHT_OPACITY_INTERACTIVE : SPOTLIGHT_OPACITY_DEFAULT,
          mixBlendMode: "screen",
          transition: "opacity 0.3s, background 0.3s",
          willChange: "transform",
        }}
      />

      {/* Velocity trail */}
      <svg
        className="pointer-events-none fixed left-0 top-0 z-[9992] hidden md:block"
        style={{ width: "100vw", height: "100vh", pointerEvents: "none" }}
      >
        <defs>
          <linearGradient id="trail-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.ring} stopOpacity="0" />
            <stop offset="100%" stopColor={colors.ring} stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <path
          ref={trailPathRef}
          d=""
          fill="none"
          stroke="url(#trail-gradient)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0, transition: "opacity 0.15s" }}
        />
      </svg>

      {/* Outer ring */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999] flex items-center justify-center"
        style={{
          width: isText ? 2 : ringSize,
          height: isText ? 18 : ringSize,
          marginLeft: isText ? -1 : -ringSize / 2,
          marginTop: isText ? -9 : -ringSize / 2,
          borderRadius: isText ? 0 : "50%",
          border: isText ? "none" : `1.5px solid ${colors.ring}`,
          background: isText ? colors.ring : "transparent",
          boxShadow: `0 0 10px ${colors.glow}`,
          transition: "width 0.2s cubic-bezier(0.16,1,0.3,1), height 0.2s cubic-bezier(0.16,1,0.3,1), margin 0.2s, border-radius 0.2s, border-color 0.3s, background 0.2s",
          opacity: clicking ? 0.6 : idle && !isLoading ? 0.7 : 1,
          animation: idle && !isLoading && !isText ? "cursor-breathe 2.8s ease-in-out infinite" : undefined,
          willChange: "transform",
        }}
      />

      {/* Inner glow ring (trailing) */}
      {!isText && (
        <div
          ref={glowRingRef}
          className="pointer-events-none fixed left-0 top-0 z-[9998] flex items-center justify-center"
          style={{
            width: ringSize * 0.55,
            height: ringSize * 0.55,
            marginLeft: -(ringSize * 0.55) / 2,
            marginTop: -(ringSize * 0.55) / 2,
            borderRadius: "50%",
            border: `1px solid ${colors.ring}`,
            opacity: 0.25,
            transition: "width 0.3s, height 0.3s, margin 0.3s, border-color 0.3s",
            willChange: "transform",
          }}
        />
      )}

      {/* Inner dot */}
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
            boxShadow: `0 0 ${Math.min(8, 5 + mouseRef.current.speed / 6)}px ${colors.glow}`,
            transition: "width 0.15s, height 0.15s, margin 0.15s, background 0.3s, box-shadow 0.3s",
            opacity: clicking ? 0.8 : idle ? 0.5 : 1,
            willChange: "transform",
          }}
        />
      )}

      {/* Ripple container */}
      <div ref={rippleContainerRef} className="pointer-events-none fixed inset-0 z-[9997]" />

      {/* AI loading ring */}
      {isLoading && (
        <div
          ref={loadingRingRef}
          className="pointer-events-none fixed left-0 top-0 z-[10001] flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            marginLeft: -22,
            marginTop: -22,
            borderRadius: "50%",
            border: `2px dashed ${colors.ring}`,
            borderRightColor: "transparent",
            animation: "cursor-spin 0.9s linear infinite",
            opacity: 0.6,
            willChange: "transform",
          }}
        />
      )}
    </>
  );
}
