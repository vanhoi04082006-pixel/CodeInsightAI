/* eslint-disable react-hooks/immutability, react-hooks/rules-of-hooks */
"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { usePersonalizationStore, ACCENT_PALETTES } from "@/lib/personalization-store";

type AccentPalette = { primary: string; accent: string; ring: string; glow: string };

/* ============================================================
   GLSL Shaders for the Core
   ============================================================ */
const CORE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vHeight;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                   mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
               mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                   mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.02;
    f += 0.2500 * noise(p); p *= 2.03;
    f += 0.1250 * noise(p); p *= 2.01;
    f += 0.0625 * noise(p);
    return f;
  }

  void main() {
    vec3 pos = position;
    float d = length(pos);
    vec3 dir = normalize(pos);
    float f = fbm(dir * 3.5 + uTime * (0.8 + uActive * 1.2));
    float displacement = f * (0.45 + uActive * 0.2) * smoothstep(1.7, 1.0, d);
    pos += normal * displacement;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = pos;
    vHeight = displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uActive;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vHeight;

  void main() {
    vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
    float fresnel = 1.0 - abs(dot(vNormal, viewDir));
    fresnel = pow(fresnel, 3.5 + uActive * 1.5);
    float plasma = sin(vPosition.x * 3.0 + uTime) * cos(vPosition.y * 3.0 + uTime * 0.7) * sin(vPosition.z * 2.0 + uTime * 1.2);
    plasma = plasma * 0.35 + 0.65;
    vec3 base = mix(uColor, uAccent, fresnel * 0.9 + vHeight * 2.0);
    base = mix(base, uAccent, plasma * 0.4);
    float edgeGlow = smoothstep(0.3, 0.9, fresnel);
    base += uAccent * edgeGlow * (0.6 + uActive * 0.4);
    gl_FragColor = vec4(base, 0.92);
  }
`;

/* ============================================================
   Core Orb — shader-displaced icosahedron + inner sphere + glow
   ============================================================ */
function CoreOrb({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const coreMesh = useRef<THREE.Mesh>(null!);
  const innerSphere = useRef<THREE.Mesh>(null!);
  const glowHalo = useRef<THREE.Mesh>(null!);
  const wireframe = useRef<THREE.Mesh>(null!);

  const primary = useMemo(() => new THREE.Color(accent.primary), [accent.primary]);
  const accentColor = useMemo(() => new THREE.Color(accent.accent), [accent.accent]);
  const glowColor = useMemo(() => new THREE.Color(accent.glow), [accent.glow]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: primary },
    uAccent: { value: accentColor },
    uActive: { value: 0 },
  }), [primary, accentColor]);

  const coreMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    transparent: true,
    depthWrite: true,
  }), [uniforms]);

  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: glowColor, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [glowColor]);

  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: accentColor, wireframe: true, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), [accentColor]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const targetActive = active ? 1.0 : 0.0;
    uniforms.uActive.value += (targetActive - uniforms.uActive.value) * 0.1;
    uniforms.uTime.value = t;

    if (coreMesh.current) {
      coreMesh.current.rotation.y += 0.002 * (1 + (active ? 2 : 0));
      coreMesh.current.rotation.x = Math.sin(t * 0.5) * 0.2 * (1 + (active ? 0.5 : 0));
      coreMesh.current.rotation.z = Math.cos(t * 0.3) * 0.15;
    }
    if (innerSphere.current) {
      const s = 1 + Math.sin(t * 8) * 0.08 * (1 + (active ? 1 : 0));
      innerSphere.current.scale.setScalar(s);
      innerSphere.current.rotation.y -= 0.003 * (1 + (active ? 1 : 0));
    }
    if (glowHalo.current) {
      glowHalo.current.scale.setScalar(1.6 + Math.sin(t * 3.5) * 0.2 * (1 + (active ? 1 : 0)));
      glowMat.opacity = 0.18 + Math.sin(t * 5) * 0.06 * (1 + (active ? 1 : 0));
    }
    if (wireframe.current) {
      wireframe.current.rotation.y += 0.001;
      wireframe.current.rotation.x = Math.sin(t * 0.4) * 0.1;
    }
  });

  return (
    <group>
      {/* Core mesh with shader */}
      <mesh ref={coreMesh} material={coreMat}>
        <icosahedronGeometry args={[1.4, 6]} />
      </mesh>

      {/* Inner sphere */}
      <mesh ref={innerSphere}>
        <sphereGeometry args={[0.5, 64, 64]} />
        <meshBasicMaterial color={accentColor} toneMapped={false} />
      </mesh>

      {/* Glow halo */}
      <mesh ref={glowHalo} material={glowMat}>
        <sphereGeometry args={[1.25, 48, 48]} />
      </mesh>

      {/* Energy wireframe */}
      <mesh ref={wireframe} material={wireMat}>
        <icosahedronGeometry args={[1.8, 3]} />
      </mesh>
    </group>
  );
}

/* ============================================================
   Orbiting Rings
   ============================================================ */
function Rings({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const ring1 = useRef<THREE.Mesh>(null!);
  const ring2 = useRef<THREE.Mesh>(null!);
  const ring3 = useRef<THREE.Mesh>(null!);
  const ring4 = useRef<THREE.Mesh>(null!);

  const purple = useMemo(() => new THREE.Color("#c084fc"), []);

  const ringMat = (color: THREE.Color, opacity: number) => useMemo(() =>
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), [color, opacity]);

  const m1 = ringMat(new THREE.Color(accent.primary), 0.8);
  const m2 = ringMat(new THREE.Color(accent.accent), 0.7);
  const m3 = ringMat(new THREE.Color(accent.glow), 0.5);
  const m4 = ringMat(purple, 0.4);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const sp = (n: number) => n * (1 + (active ? 1 : 0));
    if (ring1.current) { ring1.current.rotation.x += sp(0.0025); ring1.current.rotation.y += sp(0.002); }
    if (ring2.current) { ring2.current.rotation.x -= sp(0.003); ring2.current.rotation.z += sp(0.0025); }
    if (ring3.current) { ring3.current.rotation.y += sp(0.003); ring3.current.rotation.x = Math.sin(t * 0.7) * 0.5; }
    if (ring4.current) { ring4.current.rotation.z += sp(0.002); ring4.current.rotation.x += 0.001; }
  });

  return (
    <>
      <mesh ref={ring1} material={m1}><torusGeometry args={[2.15, 0.02, 32, 128]} /></mesh>
      <mesh ref={ring2} material={m2} rotation={[Math.PI / 3, 0, 0]}><torusGeometry args={[2.8, 0.015, 32, 128]} /></mesh>
      <mesh ref={ring3} material={m3} rotation={[Math.PI / 4, Math.PI / 6, 0]}><torusGeometry args={[3.3, 0.008, 32, 128]} /></mesh>
      <mesh ref={ring4} material={m4} rotation={[Math.PI / 2, 0, Math.PI / 4]}><torusGeometry args={[2.0, 0.006, 32, 128]} /></mesh>
    </>
  );
}

/* ============================================================
   DNA Helix (double spiral tubes)
   ============================================================ */
function DNAHelix({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const group = useRef<THREE.Group>(null!);

  const { tube1, tube2 } = useMemo(() => {
    const turns = 4, radius = 2.5, height = 4, steps = 150;
    const pts1: THREE.Vector3[] = [], pts2: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI * 2 * turns;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (t - 0.5) * height;
      pts1.push(new THREE.Vector3(x, y, z));
      pts2.push(new THREE.Vector3(-x, y, -z));
    }
    const c1 = new THREE.CatmullRomCurve3(pts1);
    const c2 = new THREE.CatmullRomCurve3(pts2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent.accent),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, toneMapped: false,
    });
    return {
      tube1: new THREE.Mesh(new THREE.TubeGeometry(c1, 100, 0.025, 6, false), mat),
      tube2: new THREE.Mesh(new THREE.TubeGeometry(c2, 100, 0.025, 6, false), mat),
    };
  }, [accent.accent]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y += 0.002 * (1 + (active ? 1 : 0));
      group.current.rotation.x = Math.sin(t * 0.6) * 0.1;
    }
  });

  return (
    <group ref={group}>
      <primitive object={tube1} />
      <primitive object={tube2} />
    </group>
  );
}

/* ============================================================
   Data Streams (curved tubes)
   ============================================================ */
function DataStreams({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const group = useRef<THREE.Group>(null!);

  const meshes = useMemo(() => {
    const arr: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const r = 2.3 + Math.random() * 0.5;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 60; j++) {
        const t = j / 60;
        const theta = angle + t * Math.PI * 2.5;
        const rad = r + Math.sin(t * Math.PI * 8) * 0.3;
        pts.push(new THREE.Vector3(Math.cos(theta) * rad, Math.sin(t * Math.PI * 3) * 1.2, Math.sin(theta) * rad));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const color = i % 2 ? new THREE.Color(accent.accent) : new THREE.Color(accent.primary);
      const mat = new THREE.MeshBasicMaterial({
        color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45, toneMapped: false,
      });
      arr.push(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.02, 6, false), mat));
    }
    return arr;
  }, [accent]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y += 0.0015 * (1 + (active ? 1 : 0));
      group.current.rotation.x = Math.sin(t * 0.5) * 0.1;
    }
  });

  return (
    <group ref={group}>
      {meshes.map((m, i) => <primitive key={i} object={m} />)}
    </group>
  );
}

/* ============================================================
   Particle Systems: Electron Cloud + Sparkle Field + Starfield
   ============================================================ */
function ParticleSystems({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const electronCloud = useRef<THREE.Points>(null!);
  const sparkField = useRef<THREE.Points>(null!);
  const starsNear = useRef<THREE.Points>(null!);
  const starsFar = useRef<THREE.Points>(null!);

  const primary = useMemo(() => new THREE.Color(accent.primary), [accent.primary]);
  const accentColor = useMemo(() => new THREE.Color(accent.accent), [accent.accent]);

  // Electron cloud
  const electronGeo = useMemo(() => {
    const count = 80;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 1.8 + Math.sin(i * 6.3) * 0.3;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.cos(i * 4.1) * 0.9;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  // Sparkle field
  const sparkGeo = useMemo(() => {
    const count = 300;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.asin(2 * Math.random() - 1);
      const r = 2.2 + Math.random() * 3.0;
      pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      pos[i * 3 + 1] = Math.sin(phi) * r;
      pos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
      const c = new THREE.Color().lerpColors(primary, accentColor, Math.random());
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }, [primary, accentColor]);

  // Starfields
  const { nearGeo, farGeo } = useMemo(() => {
    const make = (count: number, minR: number, maxR: number) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = minR + Math.random() * (maxR - minR);
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = r * Math.cos(ph);
        const c = new THREE.Color().lerpColors(new THREE.Color("#a5f3fc"), new THREE.Color("#c084fc"), Math.random());
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return geo;
    };
    return { nearGeo: make(500, 5, 12), farGeo: make(800, 15, 30) };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (electronCloud.current) {
      electronCloud.current.rotation.y += 0.004 * (1 + (active ? 1 : 0));
      electronCloud.current.rotation.z = Math.sin(t * 0.6) * 0.3;
    }
    if (sparkField.current) {
      sparkField.current.rotation.y += 0.0008 * (1 + (active ? 1 : 0));
      sparkField.current.rotation.x = Math.sin(t * 0.3) * 0.2;
    }
    if (starsNear.current) starsNear.current.rotation.y += 0.00015;
    if (starsFar.current) { starsFar.current.rotation.y -= 0.0001; starsFar.current.rotation.x += 0.00005; }
  });

  return (
    <>
      <points ref={electronCloud} geometry={electronGeo}>
        <pointsMaterial size={0.08} color={accentColor} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      <points ref={sparkField} geometry={sparkGeo}>
        <pointsMaterial size={0.09} vertexColors blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.9} transparent />
      </points>
      <points ref={starsNear} geometry={nearGeo}>
        <pointsMaterial size={0.08} vertexColors blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.9} transparent />
      </points>
      <points ref={starsFar} geometry={farGeo}>
        <pointsMaterial size={0.15} vertexColors blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.55} transparent />
      </points>
    </>
  );
}

/* ============================================================
   God Rays (light ray planes)
   ============================================================ */
function GodRays({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const group = useRef<THREE.Group>(null!);

  const { texture, meshes } = useMemo(() => {
    // Create canvas gradient texture
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(200,220,255,0.9)");
    grad.addColorStop(0.7, "rgba(100,150,255,0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 16);
    const tex = new THREE.CanvasTexture(canvas);

    const rayCount = 12;
    const rayLength = 3.5;
    const arr: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
    for (let i = 0; i < rayCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
        opacity: 0.6, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rayLength, 0.15), mat);
      const angle = (i / rayCount) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 1.6, Math.sin(angle) * 0.3, Math.sin(angle) * 1.6);
      mesh.rotation.z = angle;
      mesh.rotation.y = Math.PI / 2 - angle;
      arr.push({ mesh, mat });
    }
    return { texture: tex, meshes: arr };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y += 0.0004 * (1 + (active ? 3 : 0));
      group.current.rotation.x = Math.sin(t * 0.4) * 0.1;
    }
    meshes.forEach(({ mat }, i) => {
      mat.opacity = 0.4 + (active ? 0.3 + Math.sin(t * 3 + i) * 0.1 : 0);
    });
  });

  return (
    <group ref={group}>
      {meshes.map(({ mesh }, i) => <primitive key={i} object={mesh} />)}
    </group>
  );
}

/* ============================================================
   Energy Particles (dynamic, spawned on activation)
   ============================================================ */
interface ParticleData { position: THREE.Vector3; velocity: THREE.Vector3; life: number; maxLife: number; }

function EnergyParticles({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const points = useRef<THREE.Points>(null!);
  const maxParticles = 200;

  const { geo, positions, colors, particles } = useMemo(() => {
    const pos = new Float32Array(maxParticles * 3);
    const col = new Float32Array(maxParticles * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    // Hide all initially
    for (let i = 0; i < maxParticles; i++) pos[i * 3 + 1] = -999;
    const pd: ParticleData[] = Array.from({ length: maxParticles }, () => ({
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 1,
    }));
    return { geo: g, positions: pos, colors: col, particles: pd };
  }, []);

  const primary = useMemo(() => new THREE.Color(accent.primary), [accent.primary]);
  const accentColor = useMemo(() => new THREE.Color(accent.accent), [accent.accent]);

  const spawnParticle = () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5;
    return {
      position: new THREE.Vector3(Math.cos(angle) * radius, (Math.random() - 0.5) * 0.5, Math.sin(angle) * radius),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8
      ).normalize().multiplyScalar(0.8 + Math.random() * 1.5),
      life: 1.0,
      maxLife: 0.8 + Math.random() * 0.7,
    };
  };

  // Spawn burst on activation
  useEffect(() => {
    if (active) {
      for (let i = 0; i < 30; i++) {
        const idx = particles.findIndex((p) => p.life <= 0);
        if (idx !== -1) { particles[idx] = spawnParticle(); particles[idx].life = 1.5; }
      }
    }
  }, [active]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < maxParticles; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          positions[i * 3] = 0; positions[i * 3 + 1] = -999; positions[i * 3 + 2] = 0;
        } else {
          p.position.add(p.velocity.clone().multiplyScalar(dt));
          positions[i * 3] = p.position.x;
          positions[i * 3 + 1] = p.position.y;
          positions[i * 3 + 2] = p.position.z;
          const col = new THREE.Color().lerpColors(accentColor, primary, p.life);
          colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
        }
      }
    }
    // Continuously spawn when active
    if (active && Math.random() < 0.5) {
      const idx = particles.findIndex((p) => p.life <= 0);
      if (idx !== -1) particles[idx] = spawnParticle();
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial size={0.1} vertexColors blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  );
}

/* ============================================================
   Shockwave Ring
   ============================================================ */
function Shockwave({ active, accent }: { active: boolean; accent: AccentPalette }) {
  const ring = useRef<THREE.Mesh>(null!);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(accent.accent), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false,
  }), [accent.accent]);

  const startTime = useRef(0);
  const visible = useRef(false);

  useEffect(() => {
    if (active) {
      visible.current = true;
      startTime.current = performance.now() / 1000;
      if (ring.current) ring.current.visible = true;
    }
  }, [active]);

  useFrame(() => {
    if (!visible.current || !ring.current) return;
    const elapsed = performance.now() / 1000 - startTime.current;
    if (elapsed > 1.2) {
      visible.current = false;
      ring.current.visible = false;
    } else {
      const progress = elapsed / 1.2;
      const scale = 0.1 + progress * 5.0;
      ring.current.scale.set(scale, scale, scale);
      mat.opacity = 0.9 * (1 - progress);
    }
  });

  return (
    <mesh ref={ring} material={mat} visible={false}>
      <torusGeometry args={[1.0, 0.03, 16, 100]} />
    </mesh>
  );
}

/* ============================================================
   Mouse Parallax Camera Rig
   ============================================================ */
function ParallaxRig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 7));
  useFrame(() => {
    target.current.set(pointer.x * 1.8, pointer.y * 1.2, 7);
    camera.position.lerp(target.current, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ============================================================
   Main AI Core Component
   ============================================================ */
export function AICore({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const accentId = usePersonalizationStore((s) => s.accent);
  const animation = usePersonalizationStore((s) => s.animation);
  const palette = ACCENT_PALETTES[accentId];
  const perfMode = animation === "performance";

  if (!mounted) return <div className={className} />;

  // Performance mode: lightweight gradient placeholder (no WebGL)
  if (perfMode) {
    return (
      <div
        className={className}
        style={{ background: `radial-gradient(circle at 50% 50%, ${palette.glow}, transparent 60%)` }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: palette.primary, opacity: 0.3, filter: "blur(40px)" }}
        />
      </div>
    );
  }

  const balanced = animation === "balanced";

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <color attach="background" args={["#020210"]} />
        <ambientLight intensity={1.3} color={new THREE.Color("#1a1a40")} />
        <pointLight position={[6, 5, 6]} intensity={2.8} color={palette.primary} />
        <pointLight position={[-6, -4, 3]} intensity={2.5} color={palette.accent} />
        <pointLight position={[0, 0, 5]} intensity={1.8} color={palette.primary} />
        <pointLight position={[0, -5, -4]} intensity={2.0} color={palette.accent} />
        <pointLight position={[4, -3, -5]} intensity={1.5} color={"#c084fc"} />

        <ParallaxRig />
        <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.4}>
          <CoreOrb active={active} accent={palette} />
          <Shockwave active={active} accent={palette} />
        </Float>
        <Rings active={active} accent={palette} />
        {!balanced && <DNAHelix active={active} accent={palette} />}
        {!balanced && <DataStreams active={active} accent={palette} />}
        <ParticleSystems active={active} accent={palette} />
        {!balanced && <GodRays active={active} accent={palette} />}
        <EnergyParticles active={active} accent={palette} />

        {animation === "ultra" && (
          <EffectComposer>
            <Bloom intensity={active ? 1.6 : 1.0} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
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
