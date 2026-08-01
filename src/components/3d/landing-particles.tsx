"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { MotionValue } from "framer-motion";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";
import type { SceneQuality } from "./landing-scene";

// Lazy-load the whole three.js scene — never SSR'd (avoids the hydration
// mismatch that killed the previous 3D implementation) and keeps three.js in
// its own code-split chunk that only loads when the landing mounts it.
const LandingScene = dynamic(() => import("./landing-scene").then((m) => m.LandingScene), {
  ssr: false,
  loading: () => null,
});

const PARTICLE_COUNTS: Record<SceneQuality, number> = {
  ultra: 80_000,
  balanced: 40_000,
};

const emptySubscribe = () => () => {};

function useIsMounted() {
  // false on the server + during hydration, true afterwards — without ever
  // calling setState inside an effect.
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function LandingParticles({ morph }: { morph: MotionValue<number> }) {
  const accentId = usePersonalizationStore((s) => s.accent);
  const animation = usePersonalizationStore((s) => s.animation);
  const reducedMotion = usePersonalizationStore((s) => s.reducedMotion);

  const mounted = useIsMounted();
  // Guarded by `typeof window`; only read once per mount, never in an effect.
  const [webgl] = useState(supportsWebGL);

  if (!mounted || !webgl) return null;
  // Performance mode / reduced motion → fall back to the 2D canvas background.
  if (animation === "performance" || reducedMotion) return null;

  const quality: SceneQuality = animation === "ultra" ? "ultra" : "balanced";
  const palette = ACCENT_PALETTES[accentId];

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <LandingScene
        morph={morph}
        colorA={palette.primary}
        colorB={palette.accent}
        quality={quality}
        count={PARTICLE_COUNTS[quality]}
      />
    </div>
  );
}
