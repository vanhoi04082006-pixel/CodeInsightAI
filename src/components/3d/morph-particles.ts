// CodeInsight AI — 3D morph particle system (fresh implementation)
// Pure data + GLSL for a THREE.Points scene that interpolates between three
// shapes: GALAXY → SPHERE → GRID. Rendered by landing-scene.tsx.

export const MAX_PARTICLES = 80_000;

export type MorphTarget = "galaxy" | "sphere" | "grid";

/* ──────────────────────────────────────────────────────────────
   SHAPE GENERATORS — each returns Float32Array(count * 3)
   ────────────────────────────────────────────────────────────── */

/** Galaxy vortex — 4 spiral arms with radial falloff. */
export function generateGalaxy(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const arms = 4;
  const radius = 6;
  const spin = 1.6;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 0.7) * radius;
    const branchAngle = ((i % arms) / arms) * Math.PI * 2;
    const spinAngle = r * spin;

    const falloff = 1 - r / radius;
    const randX = (Math.random() - 0.5) * 0.3 * falloff;
    const randY = (Math.random() - 0.5) * 0.18 * falloff;
    const randZ = (Math.random() - 0.5) * 0.3 * falloff;

    positions[i3] = Math.cos(branchAngle + spinAngle) * r + randX;
    positions[i3 + 1] = randY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randZ;
  }
  return positions;
}

/** Energy sphere — Fibonacci distribution, 60% surface / 40% volume. */
export function generateSphere(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const radius = 2.6;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = Math.random() < 0.6 ? radius : radius * Math.cbrt(Math.random());

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

/** Data grid — structured 3D voxel matrix (span normalized to ~sphere size). */
export function generateGrid(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const gridSize = Math.ceil(Math.cbrt(count));
  const spacing = 6.5 / gridSize;
  const offset = (gridSize * spacing) / 2;

  let idx = 0;
  for (let x = 0; x < gridSize && idx < count; x++) {
    for (let y = 0; y < gridSize && idx < count; y++) {
      for (let z = 0; z < gridSize && idx < count; z++) {
        const i3 = idx * 3;
        positions[i3] = x * spacing - offset + (Math.random() - 0.5) * 0.06;
        positions[i3 + 1] = y * spacing - offset + (Math.random() - 0.5) * 0.06;
        positions[i3 + 2] = z * spacing - offset + (Math.random() - 0.5) * 0.06;
        idx++;
      }
    }
  }
  for (; idx < count; idx++) {
    const i3 = idx * 3;
    positions[i3] = (Math.random() - 0.5) * gridSize * spacing;
    positions[i3 + 1] = (Math.random() - 0.5) * gridSize * spacing;
    positions[i3 + 2] = (Math.random() - 0.5) * gridSize * spacing;
  }
  return positions;
}

/** Per-particle seed for color/opacity variation (0..1). */
export function generateSeeds(count: number): Float32Array {
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  return seeds;
}

/* ──────────────────────────────────────────────────────────────
   GLSL SHADERS
   ────────────────────────────────────────────────────────────── */

export const PARTICLE_VERTEX = /* glsl */ `
  attribute vec3 aGalaxy;
  attribute vec3 aSphere;
  attribute vec3 aGrid;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uMorph; // x=galaxy, y=sphere, z=grid (weights sum to ~1)

  varying float vSeed;

  void main() {
    vec3 pos = aGalaxy * uMorph.x + aSphere * uMorph.y + aGrid * uMorph.z;

    // Gentle per-particle drift (idle life)
    float t = uTime * 0.25;
    pos.x += sin(t + aSeed * 6.2831) * 0.03;
    pos.y += cos(t * 0.7 + aSeed * 12.566) * 0.03;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective size — uSize * 240 gives ~8px soft dots at hero depth.
    gl_PointSize = uSize * uPixelRatio * (240.0 / max(0.1, -mvPosition.z));
    vSeed = aSeed;
  }
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.12, d);
    if (alpha < 0.01) discard;

    vec3 color = mix(uColorA, uColorB, vSeed);
    gl_FragColor = vec4(color, alpha);
  }
`;
