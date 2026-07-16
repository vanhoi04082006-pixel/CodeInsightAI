"use client";

import { useEffect } from "react";
import { usePersonalizationStore, ACCENT_PALETTES, type AccentColor, type FontSize, type UIDensity, type AnimationLevel } from "@/lib/personalization-store";

/**
 * ThemeManager — applies personalization to the DOM via CSS variables + classes.
 * Runs once on mount and whenever any personalization value changes.
 * No page reload, no flicker (values are applied to :root before paint via useEffect).
 */
export function ThemeManager() {
  const theme = usePersonalizationStore((s) => s.theme);
  const accent = usePersonalizationStore((s) => s.accent);
  const density = usePersonalizationStore((s) => s.density);
  const animation = usePersonalizationStore((s) => s.animation);
  const fontSize = usePersonalizationStore((s) => s.fontSize);
  const reducedMotion = usePersonalizationStore((s) => s.reducedMotion);
  const highContrast = usePersonalizationStore((s) => s.highContrast);
  const colorBlind = usePersonalizationStore((s) => s.colorBlind);

  // Resolve system theme + listen for OS changes
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const effective = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
      root.classList.toggle("dark", effective === "dark");
      root.classList.toggle("light", effective === "light");
      root.dataset.theme = effective;
    };
    apply();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // Apply accent color via CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const p = ACCENT_PALETTES[accent as AccentColor];
    if (p) {
      root.style.setProperty("--accent-primary", p.primary);
      root.style.setProperty("--accent-accent", p.accent);
      root.style.setProperty("--accent-ring", p.ring);
      root.style.setProperty("--accent-glow", p.glow);
    }
    root.dataset.accent = accent;
  }, [accent]);

  // Apply density
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;
    const spacing = density === "compact" ? "0.5rem" : "0.875rem";
    const cardPad = density === "compact" ? "0.75rem" : "1.25rem";
    const btnHeight = density === "compact" ? "1.75rem" : "2.25rem";
    root.style.setProperty("--density-spacing", spacing);
    root.style.setProperty("--density-card-pad", cardPad);
    root.style.setProperty("--density-btn-height", btnHeight);
  }, [density]);

  // Apply animation level
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.animation = animation;
    const enableShaders = animation === "ultra";
    const enableBlur = animation !== "performance";
    const enableBloom = animation === "ultra";
    const enableParticles = animation !== "performance";
    root.style.setProperty("--enable-shaders", enableShaders ? "1" : "0");
    root.style.setProperty("--enable-blur", enableBlur ? "1" : "0");
    root.style.setProperty("--enable-bloom", enableBloom ? "1" : "0");
    root.style.setProperty("--enable-particles", enableParticles ? "1" : "0");
  }, [animation]);

  // Apply font size
  useEffect(() => {
    const root = document.documentElement;
    const sizes: Record<FontSize, string> = { sm: "14px", base: "16px", lg: "18px" };
    root.style.fontSize = sizes[fontSize as FontSize];
  }, [fontSize]);

  // Apply accessibility flags
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", reducedMotion);
    root.classList.toggle("high-contrast", highContrast);
    root.dataset.colorBlind = colorBlind;
  }, [reducedMotion, highContrast, colorBlind]);

  return null;
}
