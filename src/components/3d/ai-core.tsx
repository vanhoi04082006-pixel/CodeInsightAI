"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, Sparkles, Torus, Sphere } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";

type AccentPalette = { primary: string; accent: string; ring: string; glow: string };

/* ---------- Core orb ---------- */
function CoreOrb({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const inner = useRef<THREE.Mesh>(null!);
  const ring1 = useRef<THREE.Mesh>(null!);
  const ring2 = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const speed = active ? 1.6 : 1;
    if (mesh.current) {
      mesh.current.rotation.y = t * 0.25 * speed;
      mesh.current.rotation.x = Math.sin(t * 0.4) * 0.2;
    }
    if (inner.current) {
      inner.current.rotation.y = -t * 0.4 * speed;
      inner.current.rotation.z = t * 0.15;
      const s = 1 + Math.sin(t * (active ? 6 : 2)) * (active ? 0.08 : 0.03);
      inner.current.scale.setScalar(s);
    }
    if (ring1.current) {
      ring1.current.rotation.x = t * 0.3;
      ring1.current.rotation.y = t * 0.2;
    }
    if (ring2.current) {
      ring2.current.rotation.x = -t * 0.25;
      ring2.current.rotation.z = t * 0.3;
    }
  });

  return (
    <group>
      {/* Outer distorted shell */}
      <Icosahedron ref={mesh} args={[1.35, 4]}>
        <MeshDistortMaterial
          color={accent.primary}
          emissive={accent.primary}
          emissiveIntensity={active ? 0.9 : 0.5}
          roughness={0.15}
          metalness={0.6}
          distort={active ? 0.45 : 0.3}
          speed={active ? 4 : 1.5}
          transparent
          opacity={0.85}
        />
      </Icosahedron>

      {/* Inner glowing core */}
      <Sphere ref={inner} args={[0.55, 32, 32]}>
        <meshBasicMaterial color={accent.accent} toneMapped={false} />
      </Sphere>

      {/* Orbiting rings */}
      <Torus ref={ring1} args={[2.1, 0.012, 16, 100]}>
        <meshBasicMaterial color={accent.primary} transparent opacity={0.6} toneMapped={false} />
      </Torus>
      <Torus ref={ring2} args={[2.6, 0.008, 16, 100]} rotation={[Math.PI / 3, 0, 0]}>
        <meshBasicMaterial color={accent.accent} transparent opacity={0.5} toneMapped={false} />
      </Torus>

      {/* Sparkle field */}
      <Sparkles
        count={active ? 120 : 60}
        scale={6}
        size={2}
        speed={active ? 0.6 : 0.2}
        opacity={0.7}
        color={accent.accent}
      />
    </group>
  );
}

/* ---------- Particle starfield ---------- */
function Particles({ count = 800 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.02;
      ref.current.rotation.x = state.clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#a5f3fc"
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ---------- Mouse parallax camera ---------- */
function ParallaxRig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3());
  useFrame(() => {
    // R3F intentionally mutates the camera each frame for parallax.
    target.current.set(pointer.x * 1.2, pointer.y * 0.8, 6);
    camera.position.lerp(target.current, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ---------- Public component ---------- */
export function AICore({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  // Defer mounting to avoid SSR/canvas hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical hydration guard for client-only WebGL canvas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Read personalization: accent color + animation level
  const accent = usePersonalizationStore((s) => s.accent);
  const animation = usePersonalizationStore((s) => s.animation);
  const palette = ACCENT_PALETTES[accent];
  const perfMode = animation === "performance";
  const particleCount = perfMode ? 0 : animation === "balanced" ? 300 : 600;

  if (!mounted) {
    return <div className={className} />;
  }

  // Performance mode: render a static gradient placeholder instead of WebGL
  if (perfMode) {
    return (
      <div
        className={className}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${palette.glow}, transparent 60%)`,
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: palette.primary, opacity: 0.3, filter: "blur(40px)" }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.2} color={palette.primary} />
        <pointLight position={[-5, -3, 2]} intensity={0.8} color={palette.accent} />
        <pointLight position={[0, 0, 4]} intensity={0.6} color={palette.accent} />

        <ParallaxRig />
        <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.6}>
          <CoreOrb active={active} accent={palette} />
        </Float>
        {particleCount > 0 && <Particles count={particleCount} />}

        {animation === "ultra" && (
          <EffectComposer>
            <Bloom
              intensity={active ? 1.6 : 1.0}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.9}
              mipmapBlur
            />
            <ChromaticAberration
              blendFunction={BlendFunction.NORMAL}
              offset={[0.0006, 0.0008]}
              radialModulation={false}
              modulationOffset={0}
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
