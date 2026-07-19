"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo } from "react";
import * as THREE from "three";
import {
  ParticleSystem,
  ShockwaveRings,
  Starfield,
  MouseParallax,
} from "./particle-system";

// ═══════════════════════════════════════════════════════════════════
//  SCENE — R3F Canvas + Post-processing + Camera + Lighting
// ═══════════════════════════════════════════════════════════════════

export interface SceneProps {
  /** 0.0 = galaxy, 1.0 = sphere, 2.0 = grid */
  morph: number;
  active?: boolean;
  className?: string;
  enableControls?: boolean;
}

export function Scene({
  morph,
  active = false,
  className = "",
  enableControls = false,
}: SceneProps) {
  // Bloom config — HDR colors need threshold 0.1, strength 1.5
  const bloomConfig = useMemo(
    () => ({
      intensity: 1.5,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.9,
      mipmapBlur: true,
      radius: 0.8,
    }),
    []
  );

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#050507", 1);
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.2} />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#00ddff" />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color="#00ff66" />

        {/* Background starfield */}
        <Starfield count={400} />

        {/* Main particle system */}
        <ParticleSystem targetMorph={morph} active={active} />

        {/* Shockwave rings (visible during sphere state) */}
        <ShockwaveRings morphValue={morph} />

        {/* Mouse parallax */}
        <MouseParallax intensity={0.3} />

        {/* Optional orbit controls */}
        {enableControls && (
          <OrbitControls
            enablePan={false}
            enableZoom
            zoomSpeed={0.5}
            rotateSpeed={0.4}
            minDistance={5}
            maxDistance={20}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI * 2 / 3}
            dampingFactor={0.08}
            enableDamping
          />
        )}

        {/* ═══ POST-PROCESSING — cinematic glow ═══ */}
        <EffectComposer multisampling={4}>
          {/* UnrealBloom — intense neon glow (MANDATORY) */}
          <Bloom
            intensity={bloomConfig.intensity}
            luminanceThreshold={bloomConfig.luminanceThreshold}
            luminanceSmoothing={bloomConfig.luminanceSmoothing}
            mipmapBlur={bloomConfig.mipmapBlur}
            radius={bloomConfig.radius}
          />

          {/* Chromatic Aberration — subtle RGB shift at edges */}
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={[0.0005, 0.0005]}
            radialModulation={false}
            modulationOffset={0}
          />

          {/* Film Grain — subtle noise texture */}
          <Noise
            blendFunction={BlendFunction.OVERLAY}
            opacity={0.04}
            premultiply
          />

          {/* Vignette — dark edges for cinematic framing */}
          <Vignette
            eskil={false}
            offset={0.2}
            darkness={0.8}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default Scene;
