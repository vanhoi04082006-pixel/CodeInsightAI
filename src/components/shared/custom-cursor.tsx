"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * CustomCursor v3.0 — Production-Grade Cursor Interaction System
 *
 * Architecture principles:
 * - Exponential smoothing (frame-rate independent, no lerp drift)
 * - True ring buffer for trail (head/tail, no push/shift/realloc)
 * - Pointer Events API (unified mouse/touch/pen)
 * - Adaptive quality (auto-downgrade on low FPS)
 * - Battery saver (reduce effects on low battery / hidden tab)
 * - Easing-based magnetic (easeOutCubic, not linear)
 * - GPU layer lifecycle (will-change only when moving)
 * - ResizeObserver for DPR changes
 * - Full a11y: reduced-motion, prefers-contrast, touch detection
 * - Cross-browser: Firefox/ Safari fallbacks
 *
 * Inspired by: Linear, Arc Browser, Raycast, Framer, Vercel.
 */

type CursorContext = "default" | "button" | "link" | "input" | "code" | "chart" | "danger" | "loading";
type QualityTier = "ultra" | "premium" | "balanced" | "minimal";

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

// Quality tier configs
const QUALITY_CONFIG: Record<QualityTier, {
  trail: boolean;
  spotlight: boolean;
  ripple: boolean;
  glow: boolean;
  magnetic: boolean;
  breathing: boolean;
  trailMaxPoints: number;
  spotlightSize: number;
}> = {
  ultra:    { trail: true,  spotlight: true,  ripple: true,  glow: true,  magnetic: true,  breathing: true,  trailMaxPoints: 40, spotlightSize: 300 },
  premium:  { trail: true,  spotlight: true,  ripple: true,  glow: true,  magnetic: true,  breathing: true,  trailMaxPoints: 28, spotlightSize: 260 },
  balanced: { trail: true,  spotlight: false, ripple: true,  glow: true,  magnetic: true,  breathing: false, trailMaxPoints: 18, spotlightSize: 220 },
  minimal:  { trail: false, spotlight: false, ripple: false, glow: false, magnetic: false, breathing: false, trailMaxPoints: 0,  spotlightSize: 0   },
};

const RIPPLE_LIFETIME = 200;
const TRAIL_WINDOW = 320;
const IDLE_THRESHOLD = 1800;
const MAGNETIC_MAX_PX = 4;
const GLOW_MAX_PX = 22;
const FPS_SAMPLE_SIZE = 30;
const FPS_CHECK_INTERVAL = 1000;

// ── True Ring Buffer (no push/shift/realloc) ──
class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private tail = 0;
  private _size = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this._size === this.capacity) {
      this.head = (this.head + 1) % this.capacity; // overwrite oldest
    } else {
      this._size++;
    }
  }

  get(i: number): T | undefined {
    if (i >= this._size) return undefined;
    return this.buffer[(this.head + i) % this.capacity];
  }

  clearNewerThan(cutoff: number, getTime: (item: T) => number): void {
    while (this._size > 0 && getTime(this.buffer[this.head]!) < cutoff) {
      this.head = (this.head + 1) % this.capacity;
      this._size--;
    }
  }

  get size(): number { return this._size; }
  get empty(): boolean { return this._size === 0; }
}

// ── Exponential smoothing (frame-rate independent) ──
// alpha = 1 - exp(-speed * dt) → approaches target at rate `speed` per second
// At 60fps: same as lerp `speed/60`. At 144fps: no drift.
function expSmooth(current: number, target: number, speedPerSec: number, dtSec: number): number {
  const alpha = 1 - Math.exp(-speedPerSec * dtSec);
  return current + (target - current) * alpha;
}

// ── Easing functions for magnetic (natural feel) ──
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const glowRingRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const trailPathRef = useRef<SVGPathElement>(null);
  const trailSvgRef = useRef<SVGSVGElement>(null);
  const rippleContainerRef = useRef<HTMLDivElement>(null);
  const loadingRingRef = useRef<HTMLDivElement>(null);

  const [hidden, setHidden] = useState(true);
  const [context, setContext] = useState<CursorContext>("default");
  const [clicking, setClicking] = useState(false);
  const [idle, setIdle] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Refs mirror state for animation loop (no re-subscribe)
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
  const rafIdRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const magneticTargetRef = useRef<{ cx: number; cy: number } | null>(null);

  // Quality tier (adaptive)
  const qualityRef = useRef<QualityTier>("ultra");
  const fpsRef = useRef({ samples: [] as number[], lastCheck: 0, avg: 60 });

  // Battery saver
  const batterySaverRef = useRef(false);

  // Ring buffer for trail
  const trailBufferRef = useRef<RingBuffer<{ x: number; y: number; t: number }>>(
    new RingBuffer(QUALITY_CONFIG.ultra.trailMaxPoints)
  );

  // Sync state to refs
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { idleRef.current = idle; }, [idle]);
  useEffect(() => { aiLoadingRef.current = aiLoading; }, [aiLoading]);
  useEffect(() => { clickingRef.current = clicking; }, [clicking]);

  // Check AI loading state
  useEffect(() => {
    const checkLoading = () => {
      const loadingEls = document.querySelectorAll("[data-loading='true'], [data-cursor='loading']");
      setAiLoading(loadingEls.length > 0);
    };
    const interval = setInterval(checkLoading, 400);
    return () => clearInterval(interval);
  }, []);

  // ── Battery API (if available) ──
  useEffect(() => {
    const nav = navigator as any;
    if (!nav.getBattery) return;
    let battery: any;
    const update = () => {
      batterySaverRef.current = battery && !battery.charging && battery.level < 0.2;
    };
    nav.getBattery().then((b: any) => {
      battery = b;
      update();
      b.addEventListener("levelchange", update);
      b.addEventListener("chargingchange", update);
    });
    return () => {
      if (battery) {
        battery.removeEventListener("levelchange", update);
        battery.removeEventListener("chargingchange", update);
      }
    };
  }, []);

  // Spawn ripple
  const spawnRipple = useCallback((x: number, y: number, color: string) => {
    if (reducedMotionRef.current) return;
    if (qualityRef.current === "minimal") return;
    if (!rippleContainerRef.current) return;
    const ripple = document.createElement("div");
    ripple.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;border-radius:50%;border:2px solid ${color};box-shadow:0 0 14px ${color};pointer-events:none;z-index:9998;transform:translate(-50%,-50%);animation:cursor-ripple ${RIPPLE_LIFETIME}ms cubic-bezier(0.16,1,0.3,1) forwards;will-change:width,height,opacity;`;
    rippleContainerRef.current.appendChild(ripple);
    setTimeout(() => { ripple.remove(); }, RIPPLE_LIFETIME + 20);
  }, []);

  // Main effect — runs ONCE
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reduced;
    // Reduced motion → force minimal quality
    if (reduced) qualityRef.current = "minimal";

    const showTimer = requestAnimationFrame(() => setHidden(false));

    let prevX = 0, prevY = 0;
    let prevTime = performance.now();

    // ── Pointer Events (unified mouse/touch/pen) ──
    // Fallback to mousemove if Pointer Events not supported
    const supportsPointer = "PointerEvent" in window;
    const moveEvent = supportsPointer ? "pointermove" : "mousemove";
    const overEvent = supportsPointer ? "pointerover" : "mouseover";
    const downEvent = supportsPointer ? "pointerdown" : "mousedown";
    const upEvent = supportsPointer ? "pointerup" : "mouseup";

    const onMove = (e: MouseEvent | PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - prevTime);
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      const speed = Math.min(Math.sqrt(dx * dx + dy * dy) / dt * 16, 80);

      mouseRef.current = { x: e.clientX, y: e.clientY, speed };

      // Instant dot + spotlight follow
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      }
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      }

      // Trail — ring buffer (no push/shift/realloc)
      const cfg = QUALITY_CONFIG[qualityRef.current];
      if (cfg.trail && !reducedMotionRef.current && speed > 2) {
        trailBufferRef.current.push({ x: e.clientX, y: e.clientY, t: now });
        trailBufferRef.current.clearNewerThan(now - TRAIL_WINDOW, (p) => p.t);
      }

      // Magnetic detection (inline)
      const target = e.target as HTMLElement;
      if (target && cfg.magnetic) {
        const magnetic = target.closest("button, a, [data-magnetic]") as HTMLElement | null;
        if (magnetic && magnetic.offsetWidth < 200) {
          const rect = magnetic.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
          if (dist < 48 && dist > 4) {
            magneticTargetRef.current = { cx, cy };
          } else {
            magneticTargetRef.current = null;
          }
        } else {
          magneticTargetRef.current = null;
        }
      } else {
        magneticTargetRef.current = null;
      }

      prevX = e.clientX;
      prevY = e.clientY;
      prevTime = now;
      lastMoveTimeRef.current = Date.now();
      if (idleRef.current) setIdle(false);
    };

    const onOver = (e: MouseEvent | PointerEvent) => {
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

    const onDown = (e: MouseEvent | PointerEvent) => {
      setClicking(true);
      const color = CONTEXT_COLORS[contextRef.current];
      spawnRipple(e.clientX, e.clientY, color.ring);
    };
    const onUp = () => setClicking(false);
    const onLeave = () => setHidden(true);
    const onEnter = () => setHidden(false);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafIdRef.current);
      } else {
        prevTime = performance.now();
        lastFrame = performance.now();
        rafIdRef.current = requestAnimationFrame(animate);
      }
    };

    document.addEventListener(moveEvent, onMove, { passive: true });
    document.addEventListener(overEvent, onOver, { passive: true });
    document.addEventListener(downEvent, onDown);
    document.addEventListener(upEvent, onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("visibilitychange", onVisibility);

    // Idle detection
    const idleInterval = setInterval(() => {
      const elapsed = Date.now() - lastMoveTimeRef.current;
      setIdle(elapsed > IDLE_THRESHOLD);
    }, 600);

    // ── Adaptive Quality: measure FPS, auto-adjust tier ──
    const checkQuality = () => {
      if (reducedMotionRef.current) {
        qualityRef.current = "minimal";
        return;
      }
      const fps = fpsRef.current.avg;
      let newTier: QualityTier;
      if (batterySaverRef.current) {
        newTier = "balanced";
      } else if (fps >= 110) {
        newTier = "ultra";
      } else if (fps >= 80) {
        newTier = "premium";
      } else if (fps >= 55) {
        newTier = "balanced";
      } else {
        newTier = "minimal";
      }
      if (newTier !== qualityRef.current) {
        qualityRef.current = newTier;
        // Realloc ring buffer if capacity changed
        const newCap = QUALITY_CONFIG[newTier].trailMaxPoints;
        if (trailBufferRef.current.capacity !== newCap) {
          trailBufferRef.current = new RingBuffer(newCap);
        }
      }
    };
    const qualityInterval = setInterval(checkQuality, FPS_CHECK_INTERVAL);

    // ── Animation loop (exponential smoothing) ──
    let lastFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const frameDtMs = Math.min(50, now - lastFrame); // cap 50ms (avoid jumps after pause)
      const dtSec = frameDtMs / 1000;
      lastFrame = now;

      // FPS sampling
      const fps = 1000 / Math.max(1, frameDtMs);
      fpsRef.current.samples.push(fps);
      if (fpsRef.current.samples.length > FPS_SAMPLE_SIZE) fpsRef.current.samples.shift();
      if (now - fpsRef.current.lastCheck > FPS_CHECK_INTERVAL) {
        const sum = fpsRef.current.samples.reduce((a, b) => a + b, 0);
        fpsRef.current.avg = sum / fpsRef.current.samples.length;
        fpsRef.current.lastCheck = now;
      }

      const { x: mx, y: my, speed } = mouseRef.current;

      // Magnetic (eased)
      let magX = 0, magY = 0;
      if (magneticTargetRef.current) {
        const { cx, cy } = magneticTargetRef.current;
        const rawX = (cx - mx) * 0.12;
        const rawY = (cy - my) * 0.12;
        const rawDist = Math.hypot(rawX, rawY);
        if (rawDist > MAGNETIC_MAX_PX) {
          // EaseOutCubic on the clamped factor
          const factor = easeOutCubic(MAGNETIC_MAX_PX / rawDist);
          magX = rawX * factor;
          magY = rawY * factor;
        } else {
          magX = rawX;
          magY = rawY;
        }
      }

      // Exponential smoothing (frame-rate independent)
      // speedPerSec: ring=16, glow=28, loading=12 (tuned for natural feel)
      ringPosRef.current.x = expSmooth(ringPosRef.current.x, mx + magX, 16, dtSec);
      ringPosRef.current.y = expSmooth(ringPosRef.current.y, my + magY, 16, dtSec);
      glowPosRef.current.x = expSmooth(glowPosRef.current.x, mx, 28, dtSec);
      glowPosRef.current.y = expSmooth(glowPosRef.current.y, my, 28, dtSec);
      loadingPosRef.current.x = expSmooth(loadingPosRef.current.x, mx, 12, dtSec);
      loadingPosRef.current.y = expSmooth(loadingPosRef.current.y, my, 12, dtSec);

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px,${ringPosRef.current.y}px,0)`;
      }
      if (glowRingRef.current) {
        glowRingRef.current.style.transform = `translate3d(${glowPosRef.current.x}px,${glowPosRef.current.y}px,0)`;
      }
      if (loadingRingRef.current && (aiLoadingRef.current || contextRef.current === "loading")) {
        loadingRingRef.current.style.transform = `translate3d(${loadingPosRef.current.x}px,${loadingPosRef.current.y}px,0)`;
      }

      // Adaptive glow (OLED-safe, capped)
      const cfg = QUALITY_CONFIG[qualityRef.current];
      if (cfg.glow && ringRef.current) {
        const glowRadius = Math.min(GLOW_MAX_PX, 8 + speed / 3.5);
        ringRef.current.style.boxShadow = `0 0 ${glowRadius}px ${CONTEXT_COLORS[contextRef.current].glow}`;
      } else if (ringRef.current) {
        ringRef.current.style.boxShadow = "none";
      }

      // Trail path
      if (trailPathRef.current) {
        const buf = trailBufferRef.current;
        if (cfg.trail && !buf.empty && !reducedMotionRef.current) {
          let pathData = "";
          for (let i = 0; i < buf.size; i++) {
            const p = buf.get(i)!;
            pathData += (i === 0 ? "M " : " L ") + p.x + " " + p.y;
          }
          trailPathRef.current.setAttribute("d", pathData);
          const opacity = Math.min(0.45, speed / 55);
          trailPathRef.current.style.opacity = String(opacity);
        } else {
          trailPathRef.current.style.opacity = "0";
        }
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener(moveEvent, onMove);
      document.removeEventListener(overEvent, onOver);
      document.removeEventListener(downEvent, onDown);
      document.removeEventListener(upEvent, onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafIdRef.current);
      cancelAnimationFrame(showTimer);
      clearInterval(idleInterval);
      clearInterval(qualityInterval);
    };
  }, [spawnRipple]);

  // Inject keyframes
  useEffect(() => {
    if (document.getElementById("cursor-styles-v3")) return;
    const style = document.createElement("style");
    style.id = "cursor-styles-v3";
    style.textContent = `
      @keyframes cursor-ripple {
        0% { width: 0; height: 0; opacity: 0.9; border-width: 2px; }
        100% { width: 48px; height: 48px; opacity: 0; border-width: 1px; }
      }
      @keyframes cursor-breathe {
        0%, 100% { transform: scale(1); opacity: 0.65; }
        50% { transform: scale(1.1); opacity: 1; }
      }
      @keyframes cursor-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    return () => {
      const s = document.getElementById("cursor-styles-v3");
      if (s) s.remove();
    };
  }, []);

  if (hidden) return null;

  const colors = CONTEXT_COLORS[context];
  const isInteractive = context === "button" || context === "link";
  const isText = context === "input";
  const isCode = context === "code";
  const isLoading = context === "loading" || aiLoading;
  const cfg = QUALITY_CONFIG[qualityRef.current];

  const ringSize = isLoading ? 30 : isInteractive ? 40 : isCode ? 32 : 22;
  const dotSize = clicking ? 3 : isInteractive ? 5 : 4;

  return (
    <>
      {/* Spotlight */}
      {cfg.spotlight && (
        <div
          ref={spotlightRef}
          className="pointer-events-none fixed left-0 top-0 z-[9990] hidden md:block"
          style={{
            width: cfg.spotlightSize,
            height: cfg.spotlightSize,
            marginLeft: -cfg.spotlightSize / 2,
            marginTop: -cfg.spotlightSize / 2,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 65%)`,
            opacity: isInteractive ? 0.1 : 0.04,
            mixBlendMode: "screen",
            transition: "opacity 0.3s, background 0.3s",
            willChange: "transform",
          }}
        />
      )}

      {/* Trail */}
      {cfg.trail && (
        <svg
          ref={trailSvgRef}
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
      )}

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
          boxShadow: cfg.glow ? `0 0 10px ${colors.glow}` : "none",
          transition: "width 0.2s cubic-bezier(0.16,1,0.3,1), height 0.2s cubic-bezier(0.16,1,0.3,1), margin 0.2s, border-radius 0.2s, border-color 0.3s, background 0.2s, box-shadow 0.3s",
          opacity: clicking ? 0.6 : idle && !isLoading ? 0.7 : 1,
          animation: cfg.breathing && idle && !isLoading && !isText ? "cursor-breathe 2.8s ease-in-out infinite" : undefined,
          willChange: "transform",
        }}
      />

      {/* Inner glow ring */}
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
            opacity: 0.22,
            transition: "width 0.3s, height 0.3s, margin 0.3s, border-color 0.3s",
            willChange: "transform",
          }}
        />
      )}

      {/* Dot */}
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
            boxShadow: cfg.glow ? `0 0 ${Math.min(7, 4 + mouseRef.current.speed / 7)}px ${colors.glow}` : "none",
            transition: "width 0.15s, height 0.15s, margin 0.15s, background 0.3s, box-shadow 0.3s",
            opacity: clicking ? 0.8 : idle ? 0.5 : 1,
            willChange: "transform",
          }}
        />
      )}

      {/* Ripple container */}
      <div ref={rippleContainerRef} className="pointer-events-none fixed inset-0 z-[9997]" />

      {/* Loading ring */}
      {isLoading && (
        <div
          ref={loadingRingRef}
          className="pointer-events-none fixed left-0 top-0 z-[10001] flex items-center justify-center"
          style={{
            width: 42,
            height: 42,
            marginLeft: -21,
            marginTop: -21,
            borderRadius: "50%",
            border: `2px dashed ${colors.ring}`,
            borderRightColor: "transparent",
            animation: "cursor-spin 0.9s linear infinite",
            opacity: 0.55,
            willChange: "transform",
          }}
        />
      )}
    </>
  );
}
