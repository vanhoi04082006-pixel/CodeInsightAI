"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "blue" | "purple" | "emerald" | "cyan" | "orange" | "rose" | "red" | "indigo" | "slate";
export type UIDensity = "comfortable" | "compact";
export type AnimationLevel = "ultra" | "balanced" | "performance";
export type FontSize = "sm" | "base" | "lg";
export type ColorBlindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export interface PersonalizationState {
  // Appearance
  theme: ThemeMode;
  accent: AccentColor;
  density: UIDensity;
  animation: AnimationLevel;
  // Accessibility
  fontSize: FontSize;
  reducedMotion: boolean;
  highContrast: boolean;
  colorBlind: ColorBlindMode;

  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: UIDensity) => void;
  setAnimation: (a: AnimationLevel) => void;
  setFontSize: (f: FontSize) => void;
  setReducedMotion: (b: boolean) => void;
  setHighContrast: (b: boolean) => void;
  setColorBlind: (c: ColorBlindMode) => void;
  // Resolve the effective theme (system → light/dark)
  resolvedTheme: () => "light" | "dark";
}

// Detect low-end devices to recommend Performance mode
function detectLowEnd(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (mem != null && mem <= 4) || (cores != null && cores <= 4) || isMobile;
}

export const ACCENTS: { id: AccentColor; name: string; color: string }[] = [
  { id: "blue", name: "Blue", color: "#3b82f6" },
  { id: "purple", name: "Purple", color: "#a855f7" },
  { id: "emerald", name: "Emerald", color: "#10b981" },
  { id: "cyan", name: "Cyan", color: "#06b6d4" },
  { id: "orange", name: "Orange", color: "#f97316" },
  { id: "rose", name: "Rose", color: "#f43f5e" },
  { id: "red", name: "Red", color: "#ef4444" },
  { id: "indigo", name: "Indigo", color: "#6366f1" },
  { id: "slate", name: "Slate", color: "#64748b" },
];

// Accent → full palette (hue-rotated). Each maps to CSS vars --primary, --accent, --ring, etc.
export const ACCENT_PALETTES: Record<AccentColor, { primary: string; accent: string; ring: string; glow: string }> = {
  blue:    { primary: "#3b82f6", accent: "#60a5fa", ring: "#3b82f6", glow: "rgba(59,130,246,0.45)" },
  purple:  { primary: "#a855f7", accent: "#c084fc", ring: "#a855f7", glow: "rgba(168,85,247,0.45)" },
  emerald: { primary: "#10b981", accent: "#34d399", ring: "#10b981", glow: "rgba(16,185,129,0.45)" },
  cyan:    { primary: "#06b6d4", accent: "#22d3ee", ring: "#06b6d4", glow: "rgba(6,182,212,0.45)" },
  orange:  { primary: "#f97316", accent: "#fb923c", ring: "#f97316", glow: "rgba(249,115,22,0.45)" },
  rose:    { primary: "#f43f5e", accent: "#fb7185", ring: "#f43f5e", glow: "rgba(244,63,94,0.45)" },
  red:     { primary: "#ef4444", accent: "#f87171", ring: "#ef4444", glow: "rgba(239,68,68,0.45)" },
  indigo:  { primary: "#6366f1", accent: "#818cf8", ring: "#6366f1", glow: "rgba(99,102,241,0.45)" },
  slate:   { primary: "#64748b", accent: "#94a3b8", ring: "#64748b", glow: "rgba(100,116,139,0.45)" },
};

export const usePersonalizationStore = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      theme: "system",
      accent: "blue",
      density: "comfortable",
      animation: detectLowEnd() ? "performance" : "ultra",
      fontSize: "base",
      reducedMotion: false,
      highContrast: false,
      colorBlind: "none",

      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setAnimation: (animation) => set({ animation }),
      setFontSize: (fontSize) => set({ fontSize }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setColorBlind: (colorBlind) => set({ colorBlind }),
      resolvedTheme: () => {
        const { theme } = get();
        if (theme === "system") {
          if (typeof window === "undefined") return "dark";
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return theme;
      },
    }),
    {
      name: "codeinsight-ai-personalization",
    }
  )
);
