/**
 * "Experiences" — the different ways a single uploaded mask can be presented.
 *
 * Each one is a fragment-shader treatment applied to the baked mask atlas plus,
 * optionally, expression inputs (blink, jawOpen, brow raise, ...) so the effect
 * reacts to the face rather than just sitting on it.
 *
 * Implemented as one shader with a mode switch: keeps the whole set on a single
 * material, so switching experience is a uniform change with no recompile.
 */

export const MASK_VERTEX_SHADER = /* glsl */ `
  uniform float uJawOpen;
  uniform float uBrowRaise;
  uniform float uTime;
  uniform float uBreathe;

  attribute vec3 aCanonical;  // canonical rest position, for expression weights

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vView;
  varying float vDepth;
  varying float vEdge;
  varying float vFacing;

  void main() {
    vUv = uv;

    // x/y arrive already placed from the live landmarks and z from the
    // pose-swept canonical profile, so the incoming position is the final 3D
    // point and only the expression accents below are added here.
    vec3 p = position;

    // --- expression accents -------------------------------------------------
    // The landmarks already carry the full deformation; these add the volume
    // change that a flat sheet cannot express on its own.
    float lower = smoothstep(0.2, -0.6, aCanonical.y / 9.0);
    p.z += uJawOpen * lower * 1.2;
    p.z += uBrowRaise * (1.0 - lower) * 0.25;

    // Idle: a breath so the mask never looks frozen.
    p.z += sin(uTime * 0.9) * 0.05 * uBreathe;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
    vDepth = p.z;

    // Proximity to the silhouette, from UV. Drives fresnel-style edge glow
    // without a second render pass.
    vec2 d = abs(vUv - 0.5) * 2.0;
    vEdge = max(d.x, d.y);

    // How square-on this part of the mask faces the camera; used to fade
    // effects in as the head turns.
    vFacing = clamp(normalize(vView).z, 0.0, 1.0);

    gl_Position = projectionMatrix * mv;
  }
`;

export const MASK_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uMode;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uRim;
  uniform float uGrain;
  uniform float uScan;
  uniform vec3  uTint;
  uniform vec3  uGlow;
  uniform float uBlink;
  uniform float uMouthOpen;
  uniform float uLookX;
  uniform float uLookY;
  uniform float uAngry;
  uniform float uHappy;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vView;
  varying float vDepth;
  varying float vEdge;
  varying float vFacing;

  // ---------------------------------------------------------------- helpers
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // Cheap sobel on the mask luminance: drives carvings, neon outlines and
  // light-reactive materials from the uploaded artwork's own detail.
  float edgeStrength(vec2 uv, float texel) {
    vec2 o = vec2(texel, 0.0);
    float tl = luma(texture2D(uMap, uv + o.xy * vec2(-1, 1)).rgb);
    float t  = luma(texture2D(uMap, uv + o.xy * vec2( 0, 1)).rgb);
    float tr = luma(texture2D(uMap, uv + o.xy * vec2( 1, 1)).rgb);
    float l  = luma(texture2D(uMap, uv - o).rgb);
    float r  = luma(texture2D(uMap, uv + o).rgb);
    float bl = luma(texture2D(uMap, uv + o.xy * vec2(-1,-1)).rgb);
    float b  = luma(texture2D(uMap, uv + o.xy * vec2( 0,-1)).rgb);
    float br = luma(texture2D(uMap, uv + o.xy * vec2( 1,-1)).rgb);
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    return clamp(length(vec2(gx, gy)) * 1.6, 0.0, 1.0);
  }

  vec3 textureLit(vec2 uv, float texel, out float alphaOut) {
    vec4 tex = texture2D(uMap, uv);
    alphaOut = tex.a;
    vec3 base = tex.rgb;

    float d = luma(base);
    // Fake a height field from luminance + its gradient, then light it.
    float e = edgeStrength(uv, texel);
    vec3 n = normalize(vec3(-(e - 0.5) * 1.6, -(d - 0.5) * 1.2, 1.0));

    vec3 L1 = normalize(vec3(-0.5, 0.7, 0.6));
    vec3 L2 = normalize(vec3(0.7, -0.2, 0.5));
    float lambert = max(dot(n, L1), 0.0) * 0.85 + max(dot(n, L2), 0.0) * 0.28;
    vec3 col = base * (0.42 + lambert);

    // Specular sheen so raised detail reads as sculpted.
    vec3 V = normalize(vView);
    vec3 H = normalize(L1 + V);
    col += pow(max(dot(n, H), 0.0), 34.0) * 0.35 * d;
    return col;
  }

  void main() {
    float texel = 1.0 / 1024.0;
    float alphaMask;
    vec3 col = textureLit(vUv, texel, alphaMask);

    if (alphaMask < 0.02) discard;

    float t = uTime;
    float lipRegion = smoothstep(0.30, 0.05, abs(vUv.y - 0.28));
    float eyeRegion = smoothstep(0.16, 0.0, abs(vUv.y - 0.56));
    float e = edgeStrength(vUv, texel);
    float n = fbm(vUv * 9.0 + vec2(0.0, -t * 0.35));

    // ---- mode 0: archival ---------------------------------------------------
    if (uMode < 0.5) {
      col = mix(col, col * uTint, 0.55);
      col += uGlow * pow(vEdge, 4.0) * uRim * 0.6;
    }
    // ---- mode 1: bronze ----------------------------------------------------
    else if (uMode < 1.5) {
      float d = luma(col);
      vec3 bronze = mix(vec3(0.09, 0.05, 0.03), vec3(1.05, 0.72, 0.35), pow(d, 0.8));
      bronze += pow(d, 6.0) * 0.6;
      col = mix(col, bronze, 0.9);
      col += uGlow * (1.0 - d) * 0.12 * (0.6 + 0.4 * n);
    }
    // ---- mode 2: neon ------------------------------------------------------
    else if (uMode < 2.5) {
      float d = luma(col);
      vec3 neon = uGlow * pow(e, 1.4) * 3.2;
      neon += uTint * pow(d, 2.0) * 0.42;
      neon += uGlow * 0.1;
      float pulse = 0.85 + 0.15 * sin(t * 3.1 + vUv.y * 10.0);
      col = neon * pulse;
      alphaMask = clamp(alphaMask + e * 0.7, 0.0, 1.0);
    }
    // ---- mode 3: hologram --------------------------------------------------
    else if (uMode < 3.5) {
      float scan = 0.55 + 0.45 * sin((vUv.y + t * 0.07) * 420.0);
      float bands = step(0.5, fract(vUv.y * 90.0 + t * 0.6));
      col = uGlow * (luma(col) * 1.5 + 0.18) * scan * (0.75 + 0.25 * bands);
      col += uGlow * pow(vEdge, 5.0) * 1.2;
      alphaMask *= 0.62 + 0.38 * scan;
      col += vec3(0.05, 0.2, 0.28) * (1.0 - scan) * 0.4;
    }
    // ---- mode 4: fractured / shatter --------------------------------------
    else if (uMode < 4.5) {
      vec2 gid = floor(vUv * 46.0);
      float rnd = hash(gid);
      vec2 cell = (gid + 0.5) / 46.0;
      float dx = cell.x - 0.5, dy = cell.y - 0.5;
      float radial = length(vec2(dx, dy));
      float seed = fract(rnd * 7.13 + 0.5);
      vec2 off = vec2(sin(t * 0.6 + seed * 20.6), cos(t * 0.5 + seed * 13.2))
               * (0.004 + 0.05 * radial * radial);
      float a2;
      vec3 c2 = textureLit(vUv - off, texel, a2);
      float seam = smoothstep(0.02, 0.0, abs(fract(vUv.x * 46.0) - 0.5) - 0.46)
                 + smoothstep(0.02, 0.0, abs(fract(vUv.y * 46.0) - 0.5) - 0.46);
      col = c2 * (1.0 - seam * 0.5) + uGlow * seam * 0.25;
      alphaMask = max(alphaMask, a2 > 0.02 ? alphaMask : 0.0);
    }
    // ---- mode 5: molten ----------------------------------------------------
    else if (uMode < 5.5) {
      float flow = fbm(vUv * vec2(5.0, 2.2) + vec2(0.0, -t * 0.85));
      float d = luma(col);
      vec3 ember = mix(vec3(0.06, 0.008, 0.0), vec3(1.0, 0.35, 0.05), smoothstep(0.15, 0.9, flow));
      ember = mix(ember, vec3(1.0, 0.92, 0.6), smoothstep(0.78, 0.98, flow) * 1.4);
      col = mix(col * 0.35, ember, 0.86);
      col *= 0.7 + 0.5 * d;
      alphaMask = clamp(alphaMask * (0.85 + 0.3 * flow), 0.0, 1.0);
    }
    // ---- mode 6: porcelain -------------------------------------------------
    else if (uMode < 6.5) {
      float d = luma(col);
      float crack = smoothstep(0.55, 0.62, e);
      vec3 por = mix(vec3(0.93, 0.92, 0.90), vec3(0.62, 0.66, 0.72), 1.0 - d);
      por *= 0.6 + 0.5 * d;
      por = mix(por, vec3(0.05, 0.06, 0.09), crack);
      col = por;
    }
    // ---- mode 7: spirit (mask possessed by expression) ---------------------
    else if (uMode < 7.5) {
      float d = luma(col);
      float wisp = fbm(vUv * 7.0 + vec2(t * 0.25, -t * 0.5));
      vec3 cold = mix(vec3(0.02, 0.03, 0.08), uGlow, smoothstep(0.2, 1.0, wisp));
      col = mix(col * 0.5, cold, 0.8);
      float eyes = pow(max(0.0, 1.0 - eyeRegion * 6.0), 2.0);
      col += uGlow * eyes * (0.4 + uBlink * 1.6);
      col += uGlow * lipRegion * uMouthOpen * 1.5;
      col *= 0.6 + 0.7 * d;
    }
    // ---- mode 8: xray / wire ----------------------------------------------
    else {
      float d = luma(col);
      col = uGlow * pow(e, 1.2) * 2.0 + uTint * d * 0.35;
      float lines = smoothstep(0.86, 1.0, sin((vUv.y * 260.0) + t * 2.0) * 0.5 + 0.5);
      col += uGlow * lines * 0.22;
      alphaMask *= 0.75;
    }

    // ---- shared: expression-reactive accents --------------------------------
    // Mouth opens -> warm glow from behind the lips. Blink -> eyes flash.
    float mouthGlow = lipRegion * uMouthOpen;
    col += uGlow * mouthGlow * 0.55;
    float eyeFlash = eyeRegion * (0.25 + uBlink * 1.3);
    col += uGlow * eyeFlash * 0.35;
    // Smile warms the tint, anger cools it.
    col += uTint * uHappy * 0.06;
    col -= uTint * uAngry * 0.05;

    // Gaze slightly brightens the quadrant being looked at.
    float gaze = smoothstep(0.5, 1.0, vUv.x * 0.5 + 0.5 * (1.0 - vUv.y));
    col += uGlow * gaze * (uLookX + uLookY) * 0.05;

    // ---- grade --------------------------------------------------------------
    col += (n - 0.5) * uGrain * 0.2;
    col *= 0.92 + 0.08 * (1.0 - vEdge);
    col += uGlow * pow(vEdge, 3.5) * uRim * 0.35;

    // Vertical scanline/vignette overlay for the "screen" experiences.
    col *= 1.0 - uScan * 0.35 * smoothstep(0.6, 1.0, abs(vUv.y - 0.5) * 2.0);

    // Parts of the mask turning away from camera lose a little energy, which
    // sells the curvature as the head rotates.
    col *= mix(0.78, 1.0, vFacing);

    // NOTE: no <colorspace_fragment> here on purpose. The renderer's output
    // colour space is sRGB and this shader samples its texture without an sRGB
    // decode, so writing straight through reproduces the uploaded artwork
    // exactly, with no double conversion.
    gl_FragColor = vec4(col, alphaMask * uOpacity);
  }
`;

export type Experience = {
  id: string;
  label: string;
  tagline: string;
  mode: number;
  tint: string;
  glow: string;
  rim: number;
  grain: number;
  scan: number;
  /** Suggested bust material so the whole frame hangs together. */
  bust: { colour: string; rim: string };
  /** Background gradient stops. */
  backdrop: [string, string];
};

export const EXPERIENCES: Experience[] = [
  {
    id: 'archival',
    label: 'Archival',
    tagline: 'The mask, exactly as you uploaded it.',
    mode: 0,
    tint: '#ffffff',
    glow: '#9fb4ff',
    rim: 0.8,
    grain: 0.1,
    scan: 0,
    bust: { colour: '#2b2d36', rim: '#8ea3ff' },
    backdrop: ['#0a0b12', '#05060a'],
  },
  {
    id: 'bronze',
    label: 'Bronze',
    tagline: 'Cast in weathered metal.',
    mode: 1,
    tint: '#ffcf8a',
    glow: '#ff9a3c',
    rim: 0.9,
    grain: 0.25,
    scan: 0,
    bust: { colour: '#241a12', rim: '#ff9a3c' },
    backdrop: ['#140d07', '#080502'],
  },
  {
    id: 'neon',
    label: 'Neon',
    tagline: 'Outline traced in light.',
    mode: 2,
    tint: '#ff2fd0',
    glow: '#22e0ff',
    rim: 1.4,
    grain: 0.2,
    scan: 0.3,
    bust: { colour: '#0b0a1a', rim: '#22e0ff' },
    backdrop: ['#10041c', '#03010a'],
  },
  {
    id: 'hologram',
    label: 'Hologram',
    tagline: 'Unstable projection.',
    mode: 3,
    tint: '#7fe9ff',
    glow: '#3fd0ff',
    rim: 1.2,
    grain: 0.35,
    scan: 0.7,
    bust: { colour: '#08131a', rim: '#3fd0ff' },
    backdrop: ['#03121a', '#010509'],
  },
  {
    id: 'shatter',
    label: 'Shattered',
    tagline: 'Held together, barely.',
    mode: 4,
    tint: '#cfd6ff',
    glow: '#7fa6ff',
    rim: 1.0,
    grain: 0.3,
    scan: 0.15,
    bust: { colour: '#191b24', rim: '#7fa6ff' },
    backdrop: ['#0b0d16', '#04050a'],
  },
  {
    id: 'molten',
    label: 'Molten',
    tagline: 'Still cooling.',
    mode: 5,
    tint: '#ff7a18',
    glow: '#ffb347',
    rim: 1.1,
    grain: 0.2,
    scan: 0.1,
    bust: { colour: '#1a0d06', rim: '#ff8a2b' },
    backdrop: ['#1a0903', '#070201'],
  },
  {
    id: 'porcelain',
    label: 'Porcelain',
    tagline: 'Cracked, and smiling about it.',
    mode: 6,
    tint: '#ffffff',
    glow: '#aab6d4',
    rim: 0.7,
    grain: 0.15,
    scan: 0,
    bust: { colour: '#d9d7d2', rim: '#ffffff' },
    backdrop: ['#1b1e27', '#0a0c11'],
  },
  {
    id: 'spirit',
    label: 'Spirit',
    tagline: 'It blinks when you blink.',
    mode: 7,
    tint: '#b98cff',
    glow: '#7ef0d0',
    rim: 1.3,
    grain: 0.3,
    scan: 0.35,
    bust: { colour: '#0d0a1c', rim: '#7ef0d0' },
    backdrop: ['#0a0620', '#020106'],
  },
  {
    id: 'xray',
    label: 'X-Ray',
    tagline: 'Structure, not surface.',
    mode: 8,
    tint: '#9dffcf',
    glow: '#63ffb0',
    rim: 1.5,
    grain: 0.25,
    scan: 0.6,
    bust: { colour: '#03130c', rim: '#63ffb0' },
    backdrop: ['#02140c', '#010604'],
  },
];

export function experienceById(id: string): Experience {
  return EXPERIENCES.find((e) => e.id === id) ?? EXPERIENCES[0];
}
