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

const PARTICLE_COUNT = 80000;

export type MorphState = 0 | 1 | 2; // 0=galaxy, 1=sphere, 2=grid

// ═══════════════════════════════════════════════════════════════════
//  GEOMETRY GENERATION — 3 target shapes
// ═══════════════════════════════════════════════════════════════════

/** STATE 1: Galaxy vortex — spiral disk with arms */
function generateGalaxyPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const arms = 4;
  const radius = 6;
  const spin = 1.5;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 0.7) * radius;
    const branchAngle = ((i % arms) / arms) * Math.PI * 2;
    const spinAngle = r * spin;

    const randomX = (Math.random() - 0.5) * 0.3 * (1 - r / radius);
    const randomY = (Math.random() - 0.5) * 0.15 * (1 - r / radius);
    const randomZ = (Math.random() - 0.5) * 0.3 * (1 - r / radius);

    positions[i3] = Math.cos(branchAngle + spinAngle) * r + randomX;
    positions[i3 + 1] = randomY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randomZ;
  }
  return positions;
}

/** STATE 2: Energy orb — dense sphere with shell */
function generateSpherePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const radius = 2.5;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // Fibonacci sphere distribution for even coverage
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    // Mix between surface and volume (60% surface, 40% interior)
    const r = Math.random() < 0.6 ? radius : radius * Math.cbrt(Math.random());
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

/** STATE 3: Data grid — structured 3D voxel matrix */
function generateGridPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const gridSize = Math.ceil(Math.cbrt(count));
  const spacing = 0.5;
  const offset = (gridSize * spacing) / 2;

  let idx = 0;
  for (let x = 0; x < gridSize && idx < count; x++) {
    for (let y = 0; y < gridSize && idx < count; y++) {
      for (let z = 0; z < gridSize && idx < count; z++) {
        const i3 = idx * 3;
        positions[i3] = x * spacing - offset + (Math.random() - 0.5) * 0.08;
        positions[i3 + 1] = y * spacing - offset + (Math.random() - 0.5) * 0.08;
        positions[i3 + 2] = z * spacing - offset + (Math.random() - 0.5) * 0.08;
        idx++;
      }
    }
  }
  // Fill remaining with random grid-adjacent points
  for (; idx < count; idx++) {
    const i3 = idx * 3;
    positions[i3] = (Math.random() - 0.5) * gridSize * spacing;
    positions[i3 + 1] = (Math.random() - 0.5) * gridSize * spacing;
    positions[i3 + 2] = (Math.random() - 0.5) * gridSize * spacing;
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM COMPONENT
// ═══════════════════════════════════════════════════════════════════

interface ParticleSystemProps {
  targetMorph: number; // 0.0 = galaxy, 1.0 = sphere, 2.0 = grid
  active?: boolean;
}

export function ParticleSystem({ targetMorph, active = false }: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Generate all geometry once
  const { galaxyPos, spherePos, gridPos, scales, seeds } = useMemo(() => {
    const scales = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      scales[i] = Math.random() * 0.8 + 0.2;
      seeds[i] = Math.random();
    }
    return {
      galaxyPos: generateGalaxyPositions(PARTICLE_COUNT),
      spherePos: generateSpherePositions(PARTICLE_COUNT),
      gridPos: generateGridPositions(PARTICLE_COUNT),
      scales,
      seeds,
    };
  }, []);

  // Shader material
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uSize: { value: 2.5 },
      uPixelRatio: { value: Math.min(size.height > 0 ? size.height / 600 : 1, 2) },
      uColorA: { value: new THREE.Color("#00ddff") },  // electric cyan
      uColorB: { value: new THREE.Color("#7c3aed") },  // violet
      uColorC: { value: new THREE.Color("#00ff66") },  // neon green
    }),
    []
  );

  // Smooth morph interpolation (lerp — prevents instant jumps / flickering)
  const currentMorph = useRef(0);

  useFrame((state, delta) => {
    if (!matRef.current) return;

    // Smooth lerp toward target morph
    const lerpSpeed = Math.min(delta * 1.5, 0.1);
    currentMorph.current += (targetMorph - currentMorph.current) * lerpSpeed;

    // Update uniforms
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uMorph.value = currentMorph.current;

    // Active boost: bigger particles when active
    matRef.current.uniforms.uSize.value = active ? 3.2 : 2.5;

    // Slow camera-facing rotation
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.03;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[galaxyPos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aPosGalaxy" args={[galaxyPos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aPosSphere" args={[spherePos, 3]} count={PARTICLE_COUNT} />
        <bufferAttribute attach="attributes-aPosGrid" args={[gridPos, 3]} count={PARTICLE_COUNT} />
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
//  SHOCKWAVE RINGS — emit from sphere state (torus formations)
// ═══════════════════════════════════════════════════════════════════

export function ShockwaveRings({ morphValue }: { morphValue: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Only visible during sphere state (morph 0.4-1.2)
    const visibility = smoothstep(0.3, 0.6, morphValue) * (1 - smoothstep(1.0, 1.4, morphValue));
    const t = state.clock.elapsedTime;

    if (ringRef.current) {
      const scale = 3 + Math.sin(t * 1.5) * 0.8;
      ringRef.current.scale.set(scale, scale, scale);
      ringRef.current.rotation.x = Math.PI / 2;
      ringRef.current.rotation.z = t * 0.2;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = visibility * 0.3;
    }
    if (ringRef2.current) {
      const scale = 3.5 + Math.sin(t * 1.5 + Math.PI) * 0.8;
      ringRef2.current.scale.set(scale, scale, scale);
      ringRef2.current.rotation.x = Math.PI / 2.5;
      ringRef2.current.rotation.z = -t * 0.15;
      (ringRef2.current.material as THREE.MeshBasicMaterial).opacity = visibility * 0.2;
    }
  });

  return (
    <>
      <mesh ref={ringRef}>
        <torusGeometry args={[1, 0.02, 8, 64]} />
        <meshBasicMaterial color="#00ff66" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringRef2}>
        <torusGeometry args={[1, 0.015, 8, 64]} />
        <meshBasicMaterial color="#00ddff" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  STARFIELD — distant background dots
// ═══════════════════════════════════════════════════════════════════

export function Starfield({ count = 400 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 20 + Math.random() * 15;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.005;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#ffffff" transparent opacity={0.4} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MOUSE PARALLAX — smooth camera follow
// ═══════════════════════════════════════════════════════════════════

export function MouseParallax({ intensity = 0.3 }: { intensity?: number }) {
  const { camera, pointer } = useThree();
  const target = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    const lerp = Math.min(delta * 1.5, 0.1);
    target.current.x += (pointer.x * intensity - target.current.x) * lerp;
    target.current.y += (pointer.y * intensity * 0.6 - target.current.y) * lerp;
    camera.position.x = target.current.x;
    camera.position.y = target.current.y;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}
