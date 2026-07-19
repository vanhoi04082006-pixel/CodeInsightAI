/* eslint-disable react-hooks/immutability */
"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";

type AccentPalette = { primary: string; accent: string; ring: string; glow: string };

/* ============================================================
   PARTICLE GALAXY TORUS
   The hero visual: ~30,000 particles arranged in a torus/ring
   shape that slowly orbits. Color transitions smoothly from
   cyan (idle) → green (active) — matching the reference video.
   No flickering: uses a single Points draw call, stable
   shader-based animation, deterministic positions.
   ============================================================ */

const PARTICLE_COUNT = 30000; // high count but single draw call = performant

interface GalaxyProps {
  mode: "idle" | "focus" | "analyze";
  accent: AccentPalette;
}

function ParticleGalaxy({ mode, accent }: GalaxyProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Colors: cyan for idle, green for analyze
  const colorIdle = new THREE.Color("#22d3ee"); // cyan
  const colorActive = new THREE.Color("#34d399"); // green
  const colorMix = useMemo(() => new THREE.Color(), []);

  // Generate particle positions in a torus (ring) distribution
  const { positions, scales } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const scl = new Float32Array(PARTICLE_COUNT);
    const radii = [1.8, 2.2, 2.6, 3.0]; // multiple ring layers
    const tubeR = 0.3; // tube radius (thickness of ring)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ringIdx = i % radii.length;
      const R = radii[ringIdx] + (Math.random() - 0.5) * 0.15;
      const angle = Math.random() * Math.PI * 2;
      const tubeAngle = Math.random() * Math.PI * 2;
      const r = tubeR * Math.sqrt(Math.random());

      const x = (R + r * Math.cos(tubeAngle)) * Math.cos(angle);
      const y = r * Math.sin(tubeAngle) * 0.6; // flatten slightly
      const z = (R + r * Math.cos(tubeAngle)) * Math.sin(angle);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      scl[i] = Math.random() * 0.5 + 0.5;
    }
    return { positions: pos, scales: scl };
  }, []);

  // Shader: soft round particles with glow — no harsh edges, no flickering
  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: 0 }, // 0=idle, 0.5=focus, 1=analyze
        uColorIdle: { value: colorIdle },
        uColorActive: { value: colorActive },
        uSize: { value: 2.5 },
      },
      vertexShader: /* glsl */ `
        attribute float scale;
        uniform float uTime;
        uniform float uMode;
        uniform float uSize;
        varying float vAlpha;

        void main() {
          vec3 pos = position;
          // Slow orbital rotation around Y axis — each particle moves
          // at slightly different speed based on its ring radius
          float radius = length(pos.xz);
          float angle = atan(pos.z, pos.x);
          float speed = 0.15 + (1.0 / radius) * 0.3 + uMode * 0.4;
          angle += uTime * speed;
          pos.x = cos(angle) * radius;
          pos.z = sin(angle) * radius;

          // Subtle vertical breathing — very gentle, no flickering
          pos.y += sin(uTime * 0.5 + radius * 2.0) * 0.05;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Size attenuation: closer particles are bigger
          float pointSize = uSize * scale * (300.0 / -mvPosition.z);
          gl_PointSize = max(1.0, pointSize);

          // Alpha based on distance — center particles brighter
          vAlpha = 0.4 + (1.0 - radius / 3.5) * 0.6;
          vAlpha *= smoothstep(0.0, 0.3, scale);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorIdle;
        uniform vec3 uColorActive;
        uniform float uMode;
        varying float vAlpha;

        void main() {
          // Soft circular particle — smooth falloff, no hard edges
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;

          // Smooth glow: brighter in center, fades to edge
          float glow = 1.0 - smoothstep(0.0, 0.5, dist);
          glow = pow(glow, 1.8); // slightly sharper center

          // Mix color: cyan → green based on mode
          vec3 color = mix(uColorIdle, uColorActive, uMode);

          float alpha = glow * vAlpha;
          gl_FragColor = vec4(color * (0.8 + glow * 0.4), alpha);
        }
      `,
    }),
    []
  );

  // Smooth mode transition (no flickering — lerp, not instant switch)
  const modeTarget = useRef(0);
  const modeCurrent = useRef(0);

  useFrame((state, delta) => {
    if (!matRef.current) return;

    // Set target based on mode
    modeTarget.current = mode === "idle" ? 0 : mode === "focus" ? 0.3 : 1.0;

    // Smooth lerp — NEVER instant, prevents flickering
    modeCurrent.current += (modeTarget.current - modeCurrent.current) * Math.min(delta * 2.0, 0.1);

    // Update uniforms
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uMode.value = modeCurrent.current;

    // Slow group rotation for cinematic feel
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.05;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.08;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={PARTICLE_COUNT}
        />
        <bufferAttribute
          attach="attributes-scale"
          args={[scales, 1]}
          count={PARTICLE_COUNT}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        args={[shader]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ============================================================
   STARFIELD — tiny static dots in the background (like the video)
   ============================================================ */
function Starfield({ count = 300 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute on a large sphere shell
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 15 + Math.random() * 10;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#ffffff"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ============================================================
   MOUSE PARALLIA — subtle camera follow
   ============================================================ */
function CameraParallax() {
  const { camera, pointer } = useThree();
  const target = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    // Smooth lerp toward pointer — never instant, prevents jitter
    target.current.x += (pointer.x * 0.3 - target.current.x) * Math.min(delta * 2, 0.1);
    target.current.y += (pointer.y * 0.2 - target.current.y) * Math.min(delta * 2, 0.1);

    camera.position.x = target.current.x;
    camera.position.y = target.current.y;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ============================================================
   MAIN COMPONENT — AICore
   ============================================================ */
export interface AICoreProps {
  active?: boolean;
  mode?: "idle" | "focus" | "analyze";
  className?: string;
  parallax?: boolean;
  showStars?: boolean;
  bloomIntensity?: number;
  particleRing?: boolean;
  wireSphere?: boolean;
  forceBloom?: boolean;
}

export function AICore({
  active = false,
  mode,
  className = "",
  parallax = true,
  showStars = true,
  bloomIntensity = 0.8,
  particleRing = true,
  wireSphere = false,
  forceBloom = false,
}: AICoreProps) {
  const accentIdx = usePersonalizationStore((s) => s.accent);
  const palette = ACCENT_PALETTES[accentIdx] ?? ACCENT_PALETTES.cyan;
  const animLevel = usePersonalizationStore((s) => s.animation);

  // Resolve mode: if `mode` prop given, use it; otherwise derive from `active`
  const resolvedMode = mode ?? (active ? "analyze" : "idle");

  // Performance mode: skip heavy 3D entirely
  if (animLevel === "performance") {
    return (
      <div
        className={`relative flex items-center justify-center ${className}`}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${palette.primary}15, transparent 70%)`,
        }}
      >
        <div
          className="h-48 w-48 rounded-full"
          style={{
            background: `radial-gradient(circle, ${palette.primary}40, transparent 70%)`,
            animation: "pulse 3s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
        }}
      >
        {parallax && <CameraParallax />}

        {showStars && <Starfield count={animLevel === "ultra" ? 400 : 200} />}

        <ParticleGalaxy mode={resolvedMode} accent={palette} />

        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

export default AICore;
