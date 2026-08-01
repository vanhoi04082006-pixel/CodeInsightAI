"use client";

import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import {
  generateGalaxy,
  generateSphere,
  generateGrid,
  generateSeeds,
  PARTICLE_VERTEX,
  PARTICLE_FRAGMENT,
} from "./morph-particles";

export type SceneQuality = "ultra" | "balanced";

interface LandingSceneProps {
  morph: MotionValue<number>; // 0 = galaxy, 1 = sphere, 2 = grid
  colorA: string;
  colorB: string;
  quality: SceneQuality;
  count: number;
}

function MorphPoints({ morph, colorA, colorB, count }: {
  morph: MotionValue<number>;
  colorA: string;
  colorB: string;
  count: number;
}) {
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const [geometry, uniforms] = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("aGalaxy", new THREE.BufferAttribute(generateGalaxy(count), 3));
    geo.setAttribute("aSphere", new THREE.BufferAttribute(generateSphere(count), 3));
    geo.setAttribute("aGrid", new THREE.BufferAttribute(generateGrid(count), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(generateSeeds(count), 1));

    const uniforms = {
      uTime: { value: 0 },
      uMorph: { value: new THREE.Vector3(1, 0, 0) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: 0.14 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    };

    return [geo, uniforms] as const;
  }, [count, colorA, colorB]);

  // Keep particle colors in sync if the accent palette changes at runtime.
  useEffect(() => {
    // Mutating the shader uniform values is the standard three.js pattern;
    // the uniforms object is deliberately held by useMemo.
    // eslint-disable-next-line react-hooks/immutability
    uniforms.uColorA.value = new THREE.Color(colorA);
    uniforms.uColorB.value = new THREE.Color(colorB);
  }, [colorA, colorB, uniforms]);

  const currentMorph = useRef(0);
  const idlePhase = useRef(0);
  const lastScroll = useRef(0);
  const scrollActivity = useRef(0);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;

    // The scroll-driven target (0 = galaxy, 1 = sphere, 2 = grid).
    const scrollTarget = THREE.MathUtils.clamp(morph.get(), 0, 2);

    // Detect active scrolling so the idle auto-morph yields to the user.
    if (Math.abs(scrollTarget - lastScroll.current) > 1e-4) {
      scrollActivity.current = 2;
    }
    lastScroll.current = scrollTarget;
    scrollActivity.current = Math.max(0, scrollActivity.current - delta);

    // While idle, slowly cycle galaxy -> sphere -> grid -> galaxy so all three
    // shapes stay visible even without scrolling. The loop resumes smoothly
    // from wherever the last scroll position left off.
    let target: number;
    if (scrollActivity.current > 0) {
      idlePhase.current = currentMorph.current;
      target = scrollTarget;
    } else {
      idlePhase.current = (idlePhase.current + delta * 0.08) % 2;
      target = idlePhase.current;
    }

    // Smoothly chase the target.
    currentMorph.current += (target - currentMorph.current) * Math.min(1, delta * 1.6);
    const m = currentMorph.current;

    let w0: number;
    let w1: number;
    let w2: number;
    if (m <= 1) {
      w0 = 1 - m;
      w1 = m;
      w2 = 0;
    } else {
      w0 = 0;
      w1 = 2 - m;
      w2 = m - 1;
    }

    // Mutating the shader uniform values each frame is the standard
    // ShaderMaterial pattern; the uniforms object is held by useMemo.
    // eslint-disable-next-line react-hooks/immutability
    uniforms.uTime.value = elapsed;
    (uniforms.uMorph.value as THREE.Vector3).set(w0, w1, w2);

    // Gentle idle rotation.
    if (group.current) {
      group.current.rotation.y += delta * 0.06;
      group.current.rotation.x = Math.sin(elapsed * 0.15) * 0.12;
      // Scale with viewport so the shape roughly fills the screen.
      group.current.scale.setScalar(Math.max(1, viewport.width / 8));
    }

    // Camera parallax toward the pointer.
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
      <points ref={points} geometry={geometry}>
        <shaderMaterial
          ref={material}
          vertexShader={PARTICLE_VERTEX}
          fragmentShader={PARTICLE_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export function LandingScene({ morph, colorA, colorB, quality, count }: LandingSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 7], fov: 60 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <MorphPoints morph={morph} colorA={colorA} colorB={colorB} count={count} />
      {quality === "ultra" && (
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.08} luminanceSmoothing={0.9} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}
