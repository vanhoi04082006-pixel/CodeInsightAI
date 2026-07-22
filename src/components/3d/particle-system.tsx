/* eslint-disable react-hooks/immutability */
"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  PARTICLE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
} from "./shaders";

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const PARTICLE_COUNT = 60000;

// ═══════════════════════════════════════════════════════════════════
//  GEOMETRY — Torus (ring) + Sphere surface
// ═══════════════════════════════════════════════════════════════════

/** STATE 1: Particle TORUS — a ring of particles (like the video) */
function generateTorusPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const R = 3.0;       // major radius (ring size)
  const r = 0.4;       // minor radius (tube thickness)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const u = Math.random() * Math.PI * 2;      // around the ring
    const v = Math.random() * Math.PI * 2;      // around the tube
    const rr = r * Math.sqrt(Math.random());     // distribute within tube

    positions[i3]     = (R + rr * Math.cos(v)) * Math.cos(u);
    positions[i3 + 1] = rr * Math.sin(v) * 0.7;  // flatten slightly
    positions[i3 + 2] = (R + rr * Math.cos(v)) * Math.sin(u);
  }
  return positions;
}

/** STATE 2: Sphere SURFACE — particles on a sphere shell (wireframe effect) */
function generateSpherePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const R = 2.2;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // Fibonacci sphere — even distribution on surface
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    // Most particles on surface, some slightly inside for depth
    const r = Math.random() < 0.85 ? R : R * (0.85 + Math.random() * 0.15);
    positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM — morphs torus → sphere
// ═══════════════════════════════════════════════════════════════════

interface ParticleSystemProps {
  targetMorph: number; // 0.0 = torus, 1.0 = sphere
  active?: boolean;
}

export function ParticleSystem({ targetMorph, active = false }: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const { torusPos, spherePos, scales, seeds } = useMemo(() => {
    const scales = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      scales[i] = Math.random() * 0.8 + 0.2;
      seeds[i] = Math.random();
    }
    return {
      torusPos: generateTorusPositions(PARTICLE_COUNT),
      spherePos: generateSpherePositions(PARTICLE_COUNT),
      scales,
      seeds,
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uSize: { value: 2.0 },
      uPixelRatio: { value: Math.min(size.height > 0 ? size.height / 600 : 1, 2) },
      uColorTorus: { value: new THREE.Color("#00ddff") },  // cyan
      uColorSphere: { value: new THREE.Color("#00ff66") },  // neon green
    }),
    []
  );

  const currentMorph = useRef(0);

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const lerpSpeed = Math.min(delta * 1.2, 0.08);
    currentMorph.current += (targetMorph - currentMorph.current) * lerpSpeed;

    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uMorph.value = currentMorph.current;
    matRef.current.uniforms.uSize.value = active ? 2.8 : 2.0;

    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.04;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.06;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[torusPos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aPosTorus" args={[torusPos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aPosSphere" args={[spherePos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} count={PARTICLE_COUNT} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={PARTICLE_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  WIREFRAME SPHERE — network/grid lines (visible in sphere state)
// ═══════════════════════════════════════════════════════════════════

export function WireframeSphere({ morph }: { morph: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    // Only visible when morphing toward sphere (morph > 0.3)
    const visibility = Math.max(0, (morph - 0.3) / 0.7);
    if (matRef.current) {
      matRef.current.opacity = visibility * 0.15;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.06;
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2.2, 3]} />
      <meshBasicMaterial
        ref={matRef}
        color="#00ff66"
        wireframe
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  STARFIELD — distant background dots (matching video)
// ═══════════════════════════════════════════════════════════════════

export function Starfield({ count = 500 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 25 + Math.random() * 20;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.008;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#ffffff" transparent opacity={0.5} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MOUSE PARALLAX — smooth camera follow
// ═══════════════════════════════════════════════════════════════════

export function MouseParallax({ intensity = 0.4 }: { intensity?: number }) {
  const { camera, pointer } = useThree();
  const target = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    const lerp = Math.min(delta * 1.5, 0.08);
    target.current.x += (pointer.x * intensity - target.current.x) * lerp;
    target.current.y += (pointer.y * intensity * 0.6 - target.current.y) * lerp;
    camera.position.x = target.current.x;
    camera.position.y = target.current.y;
    camera.lookAt(0, 0, 0);
  });

  return null;
}
