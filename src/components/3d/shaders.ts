"use client";

// ═══════════════════════════════════════════════════════════════════
//  GLSL SHADERS — Particle morphing with simplex noise + curl flow
//  Torus → Wireframe Sphere morph with network lines
// ═══════════════════════════════════════════════════════════════════

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
`;

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aPosTorus;    // State 1: particle ring (torus)
  attribute vec3 aPosSphere;   // State 2: wireframe sphere surface
  attribute float aScale;
  attribute float aSeed;

  uniform float uTime;
  uniform float uMorph;        // 0.0 = torus, 1.0 = sphere
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vDist;
  varying float vMorph;

  ${SIMPLEX_NOISE_GLSL}

  void main() {
    // Smooth morph: torus → sphere
    float t = smoothstep(0.0, 1.0, uMorph);
    vec3 pos = mix(aPosTorus, aPosSphere, t);

    // Organic drift via simplex noise — gentle, not chaotic
    float drift = snoise(pos * 0.3 + uTime * 0.05) * 0.08;
    pos += normalize(pos + 0.001) * drift;

    // Torus state: slow orbital rotation around Y
    float torusWeight = 1.0 - t;
    float angle = uTime * 0.15 + aSeed * 6.28;
    pos.xz = vec2(
      pos.x * cos(angle * 0.02 * torusWeight) - pos.z * sin(angle * 0.02 * torusWeight),
      pos.x * sin(angle * 0.02 * torusWeight) + pos.z * cos(angle * 0.02 * torusWeight)
    );

    // Sphere state: gentle pulsing/breathing
    float sphereWeight = t;
    float pulse = 1.0 + sin(uTime * 1.2 + aSeed * 10.0) * 0.02 * sphereWeight;
    pos *= pulse;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation
    float pointSize = uSize * aScale * uPixelRatio * (300.0 / max(1.0, -mvPosition.z));
    gl_PointSize = max(1.0, pointSize);

    vDist = length(mvPosition.xyz);
    vAlpha = smoothstep(25.0, 3.0, vDist) * 0.85 + 0.15;
    vAlpha *= smoothstep(0.0, 0.15, aScale);
    vMorph = uMorph;
  }
`;

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColorTorus;   // Cyan
  uniform vec3 uColorSphere;  // Neon green

  varying float vAlpha;
  varying float vDist;
  varying float vMorph;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    glow = pow(glow, 1.5);

    // Color: cyan → green based on morph
    vec3 color = mix(uColorTorus, uColorSphere, vMorph);

    // HDR intensity for bloom
    color *= glow * 2.5;

    float alpha = glow * vAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`;
