"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CustomCursor — premium glow cursor with magnetic hover.
 *
 * Features:
 * - Outer ring follows mouse with lerp (smooth lag)
 * - Inner dot follows mouse instantly
 * - Ring expands + glows when hovering interactive elements (button, a, input, [role=button])
 * - Ring turns cyan by default, violet on hover
 * - Hidden on touch devices (no mouse)
 * - Respects reduced-motion preference
 */
export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    // Skip on touch devices
    if (window.matchMedia("(hover: none)").matches) return;
    // Skip if reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Use requestAnimationFrame to avoid setState-in-effect lint
    const showTimer = requestAnimationFrame(() => setHidden(false));

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;
    let rafId: number;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
      }
    };

    const animate = () => {
      // Lerp ring toward mouse (smooth follow)
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ringX}px, ${ringY}px)`;
      }
      rafId = requestAnimationFrame(animate);
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const interactive = target.closest("button, a, input, textarea, select, [role=button], [data-cursor='hover']");
      setHovering(!!interactive);
    };

    const onDown = () => setClicking(true);
    const onUp = () => setClicking(false);
    const onLeave = () => setHidden(true);
    const onEnter = () => setHidden(false);

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    rafId = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(showTimer);
    };
  }, []);

  if (hidden) return null;

  return (
    <>
      {/* Outer ring — lerp follow */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999] flex items-center justify-center"
        style={{
          width: hovering ? 40 : 24,
          height: hovering ? 40 : 24,
          marginLeft: hovering ? -20 : -12,
          marginTop: hovering ? -20 : -12,
          borderRadius: "50%",
          border: `1.5px solid ${hovering ? "#a78bfa" : "#22d3ee"}`,
          boxShadow: `0 0 ${hovering ? 20 : 12}px ${hovering ? "rgba(167,139,250,0.4)" : "rgba(34,211,238,0.3)"}`,
          transition: "width 0.2s, height 0.2s, margin 0.2s, border-color 0.2s, box-shadow 0.2s",
          opacity: clicking ? 0.5 : 1,
          transform: "translate(0, 0)",
        }}
      />
      {/* Inner dot — instant follow */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999]"
        style={{
          width: clicking ? 6 : hovering ? 5 : 4,
          height: clicking ? 6 : hovering ? 5 : 4,
          marginLeft: clicking ? -3 : hovering ? -2.5 : -2,
          marginTop: clicking ? -3 : hovering ? -2.5 : -2,
          borderRadius: "50%",
          background: hovering ? "#a78bfa" : "#22d3ee",
          boxShadow: `0 0 8px ${hovering ? "rgba(167,139,250,0.6)" : "rgba(34,211,238,0.5)"}`,
          transition: "width 0.1s, height 0.1s, margin 0.1s, background 0.1s",
          transform: "translate(0, 0)",
        }}
      />
    </>
  );
}
