"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo } from "react";
import * as THREE from "three";
import {
  ParticleSystem,
  WireframeSphere,
  Starfield,
  MouseParallax,
} from "./particle-system";

// ═══════════════════════════════════════════════════════════════════
//  SCENE — Full-bleed 3D background (NO container box)
//  The 3D fills the entire viewport — seamless with the page background.
//  Particles morph: torus (cyan ring) → sphere (green wireframe)
// ═══════════════════════════════════════════════════════════════════

export interface SceneProps {
  /** 0.0 = torus (cyan ring), 1.0 = sphere (green wireframe) */
  morph: number;
  active?: boolean;
  className?: string;
}

export function Scene({
  morph,
  active = false,
  className = "",
}: SceneProps) {
  const bloomConfig = useMemo(
    () => ({
      intensity: 1.2,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.9,
      mipmapBlur: true,
      radius: 0.7,
    }),
    []
  );

  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      <Canvas
        camera={{ position: [0, 0, 9], fov: 55 }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }) => {
          // Transparent clear color — 3D blends seamlessly with page background
          gl.setClearColor("#000000", 0);
        }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Background starfield */}
        <Starfield count={500} />

        {/* Main particle system — torus → sphere morph */}
        <ParticleSystem targetMorph={morph} active={active} />

        {/* Wireframe sphere (network lines, visible in sphere state) */}
        <WireframeSphere morph={morph} />

        {/* Mouse parallax */}
        <MouseParallax intensity={0.4} />

        {/* Post-processing — cinematic glow */}
        <EffectComposer multisampling={4}>
          <Bloom
            intensity={bloomConfig.intensity}
            luminanceThreshold={bloomConfig.luminanceThreshold}
            luminanceSmoothing={bloomConfig.luminanceSmoothing}
            mipmapBlur={bloomConfig.mipmapBlur}
            radius={bloomConfig.radius}
          />
          <Noise
            blendFunction={BlendFunction.OVERLAY}
            opacity={0.03}
            premultiply
          />
          <Vignette
            eskil={false}
            offset={0.15}
            darkness={0.7}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default Scene;
