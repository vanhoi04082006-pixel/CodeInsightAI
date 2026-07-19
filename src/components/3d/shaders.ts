"use client";

// ═══════════════════════════════════════════════════════════════════
//  GLSL SHADERS — Particle morphing with simplex noise + curl flow
// ═══════════════════════════════════════════════════════════════════

// Simplex 3D noise (Ashima/Stefan Gustavson) — used for organic drift
export const SIMPLEX_NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // Curl noise for flow-field drift
  vec3 curlNoise(vec3 p) {
    const float e = 0.1;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    float p_x0 = snoise(p - dx); float p_x1 = snoise(p + dx);
    float p_y0 = snoise(p - dy); float p_y1 = snoise(p + dy);
    float p_z0 = snoise(p - dz); float p_z1 = snoise(p + dz);
    float x = p_y1 - p_y0 - p_z1 + p_z0;
    float y = p_z1 - p_z0 - p_x1 + p_x0;
    float z = p_x1 - p_x0 - p_y1 + p_y0;
    const float divisor = 1.0 / (2.0 * e);
    return normalize(vec3(x, y, z) * divisor);
  }
`;

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aPosGalaxy;   // State 1: galaxy vortex
  attribute vec3 aPosSphere;   // State 2: energy orb
  attribute vec3 aPosGrid;     // State 3: data grid
  attribute float aScale;
  attribute float aSeed;

  uniform float uTime;
  uniform float uMorph;        // 0.0 = galaxy, 1.0 = sphere, 2.0 = grid
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vDist;

  ${SIMPLEX_NOISE_GLSL}

  // Smooth morph between 3 target positions
  vec3 getMorphedPosition() {
    float m = uMorph;
    vec3 pos;

    if (m <= 1.0) {
      // Galaxy → Sphere
      float t = smoothstep(0.0, 1.0, m);
      pos = mix(aPosGalaxy, aPosSphere, t);
    } else {
      // Sphere → Grid
      float t = smoothstep(0.0, 1.0, m - 1.0);
      pos = mix(aPosSphere, aPosGrid, t);
    }
    return pos;
  }

  void main() {
    vec3 pos = getMorphedPosition();

    // Organic drift via curl noise — intensity scales with morph state
    float driftStrength = 0.15 + sin(uTime * 0.3 + aSeed * 6.28) * 0.05;
    vec3 curl = curlNoise(pos * 0.5 + uTime * 0.08);
    pos += curl * driftStrength;

    // Slow orbital rotation for galaxy state
    float angle = uTime * 0.1 + aSeed * 6.28;
    float morphGalaxy = 1.0 - smoothstep(0.0, 0.3, uMorph);
    pos.xz = rotate2d(pos.xz, angle * 0.02 * morphGalaxy);

    // Pulsing for sphere state
    float morphSphere = smoothstep(0.2, 0.6, uMorph) * (1.0 - smoothstep(0.8, 1.2, uMorph));
    float pulse = 1.0 + sin(uTime * 2.0 + aSeed * 10.0) * 0.03 * morphSphere;
    pos *= pulse;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation: closer = bigger
    float pointSize = uSize * aScale * uPixelRatio * (300.0 / max(1.0, -mvPosition.z));
    gl_PointSize = max(1.0, pointSize);

    // Depth-based alpha fade
    vDist = length(mvPosition.xyz);
    vAlpha = smoothstep(30.0, 5.0, vDist) * 0.9 + 0.1;
    vAlpha *= smoothstep(0.0, 0.2, aScale);
  }

  // 2D rotation helper
  vec2 rotate2d(vec2 v, float a) {
    float s = sin(a); float c = cos(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }
`;

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColorA;   // Primary (cyan/blue)
  uniform vec3 uColorB;   // Secondary (violet)
  uniform vec3 uColorC;   // Accent (neon green)
  uniform float uMorph;

  varying float vAlpha;
  varying float vDist;

  void main() {
    // Soft circular particle — smooth radial falloff
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Glow: brighter center, soft edge
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    glow = pow(glow, 1.5);

    // Color mixing based on morph state
    vec3 color;
    if (uMorph <= 1.0) {
      // Galaxy: mix cyan → violet with distance
      float t = clamp(vDist / 15.0, 0.0, 1.0);
      color = mix(uColorA, uColorB, t);
      // Add green hint as we approach sphere
      color = mix(color, uColorC, smoothstep(0.7, 1.0, uMorph) * 0.5);
    } else {
      // Grid: green dominant
      color = mix(uColorC, uColorA, smoothstep(0.0, 0.5, uMorph - 1.0));
    }

    // HDR intensity for bloom (multiply > 1.0)
    float intensity = glow * 2.5;
    color *= intensity;

    float alpha = glow * vAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`;
