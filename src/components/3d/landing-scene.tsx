"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { generateGalaxy, generateSphere, generateGrid } from "./morph-particles";

export type SceneQuality = "ultra" | "balanced";

interface LandingSceneProps {
  morph: MotionValue<number>; // 0 = galaxy, 1 = sphere, 2 = grid
  colorA: string;
  colorB: string;
  quality: SceneQuality;
  count: number;
}

/** Simple morphing particle field — no custom shader, uses PointsMaterial. */
function MorphPoints({ morph, colorA, colorB, count }: {
  morph: MotionValue<number>;
  colorA: string;
  colorB: string;
  count: number;
}) {
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  // Pre-generate the 3 shape position sets once.
  const shapes = useMemo(() => {
    return {
      galaxy: generateGalaxy(count),
      sphere: generateSphere(count),
      grid: generateGrid(count),
    };
  }, [count]);

  // Build a geometry with a single 'position' attribute that we'll update
  // each frame to interpolate between the 3 shapes.
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // Start with galaxy positions
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(shapes.galaxy), 3));
    // Per-vertex color (mix between colorA and colorB based on index)
    const colors = new Float32Array(count * 3);
    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const c = cA.clone().lerp(cB, t);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [shapes, count, colorA, colorB]);

  // Material — simple PointsMaterial with vertexColors + additive blending
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.08,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  // Update colors when accent changes
  useMemo(() => {
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!colors) return;
    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const c = cA.clone().lerp(cB, t);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }, [colorA, colorB, count, geometry]);

  const currentMorph = useRef(0);
  const idlePhase = useRef(0);
  const lastScroll = useRef(0);
  const scrollActivity = useRef(0);
  const tmpA = useRef(new THREE.Vector3());
  const tmpB = useRef(new THREE.Vector3());
  const tmpC = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const scrollTarget = THREE.MathUtils.clamp(morph.get(), 0, 2);

    // Detect active scrolling
    if (Math.abs(scrollTarget - lastScroll.current) > 1e-4) {
      scrollActivity.current = 2;
    }
    lastScroll.current = scrollTarget;
    scrollActivity.current = Math.max(0, scrollActivity.current - delta);

    // Idle auto-morph
    let target: number;
    if (scrollActivity.current > 0) {
      idlePhase.current = currentMorph.current;
      target = scrollTarget;
    } else {
      idlePhase.current = (idlePhase.current + delta * 0.08) % 2;
      target = idlePhase.current;
    }

    currentMorph.current += (target - currentMorph.current) * Math.min(1, delta * 1.6);
    const m = currentMorph.current;

    let w0: number, w1: number, w2: number;
    if (m <= 1) {
      w0 = 1 - m;
      w1 = m;
      w2 = 0;
    } else {
      w0 = 0;
      w1 = 2 - m;
      w2 = m - 1;
    }

    // Update positions — interpolate between galaxy/sphere/grid
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    if (posAttr) {
      const arr = posAttr.array as Float32Array;
      const galaxy = shapes.galaxy;
      const sphere = shapes.sphere;
      const grid = shapes.grid;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // Galaxy spin
        const gx = galaxy[i3], gy = galaxy[i3 + 1], gz = galaxy[i3 + 2];
        const gRadius = Math.sqrt(gx * gx + gz * gz);
        const gAngle = elapsed * 0.15 * (1 - gRadius / 6);
        const cosA = Math.cos(gAngle), sinA = Math.sin(gAngle);
        const sgx = gx * cosA - gz * sinA;
        const sgz = gx * sinA + gz * cosA;

        arr[i3]     = sgx * w0 + sphere[i3]     * w1 + grid[i3]     * w2;
        arr[i3 + 1] = gy  * w0 + sphere[i3 + 1] * w1 + grid[i3 + 1] * w2;
        arr[i3 + 2] = sgz * w0 + sphere[i3 + 2] * w1 + grid[i3 + 2] * w2;
      }
      posAttr.needsUpdate = true;
    }

    // Gentle rotation
    if (group.current) {
      group.current.rotation.y += delta * 0.06;
      group.current.rotation.x = Math.sin(elapsed * 0.15) * 0.12;
      group.current.scale.setScalar(Math.max(1, viewport.width / 8));
    }

    // Pointer parallax
    if (points.current) {
      points.current.rotation.y = THREE.MathUtils.lerp(
        points.current.rotation.y,
        state.pointer.x * 0.18,
        Math.min(1, delta * 2),
      );
      points.current.rotation.x = THREE.MathUtils.lerp(
        points.current.rotation.x,
        -state.pointer.y * 0.12,
        Math.min(1, delta * 2),
      );
    }
  });

  return (
    <group ref={group}>
      <points ref={points} geometry={geometry} material={material} />
    </group>
  );
}

export function LandingScene({ morph, colorA, colorB, quality, count }: LandingSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      camera={{ position: [0, 0, 7], fov: 60 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <MorphPoints morph={morph} colorA={colorA} colorB={colorB} count={count} />
    </Canvas>
  );
}
