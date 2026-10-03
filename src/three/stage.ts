/**
 * FaceStage — the renderer.
 *
 * Placement strategy
 * ------------------
 * Two things have to be true at once: the mask must sit exactly on the user's
 * expressions, and the head must look like a solid 3D object turning in space.
 * Those pull in opposite directions, so they're handled separately:
 *
 *   x / y   straight from the live landmarks, anchored to the eye midpoint and
 *           scaled by inter-ocular distance. Expression-accurate by
 *           construction, stable in frame, and it preserves the narrowing you
 *           see when a head turns.
 *   z       from the canonical depth profile, swept by the estimated head yaw
 *           and pitch. This is what gives the nose real parallax and makes the
 *           surface read as curved rather than pasted on.
 *   roll/yaw/pitch  estimated from landmark geometry (not the raw matrix, whose
 *           axis conventions are easy to get subtly wrong) and applied to the
 *           mannequin bust so the solid head follows along.
 *
 * The user's camera pixels are never drawn, stored or transmitted — only these
 * numbers ever exist.
 */
import * as THREE from 'three';
import {
  CANONICAL_INDICES,
  CANONICAL_POSITIONS,
  CANONICAL_UVS,
  NUM_VERTICES,
} from '../lib/canonicalFace';
import type { TrackerFrame } from '../lib/faceTracker';
import { bs } from '../lib/faceTracker';
import type { BlendshapeMap } from '../lib/landmarks';
import { createBustMaterial, createMannequin, HEAD } from './mannequin';
import { MASK_FRAGMENT_SHADER, MASK_VERTEX_SHADER, type Experience } from './experiences';

/** Eye outer corners — the anchor pair for scale and roll. */
const EYE_LEFT = 33;
const EYE_RIGHT = 263;
/** Nose tip and chin, for pitch. */
const NOSE_TIP = 4;
const CHIN = 152;
function canonXZ(i: number) {
  return {
    x: CANONICAL_POSITIONS[i * 3],
    y: CANONICAL_POSITIONS[i * 3 + 1],
    z: CANONICAL_POSITIONS[i * 3 + 2],
  };
}

const REST = {
  eyeL: canonXZ(EYE_LEFT),
  eyeR: canonXZ(EYE_RIGHT),
  nose: canonXZ(NOSE_TIP),
  chin: canonXZ(CHIN),
};

/** Inter-ocular distance in canonical centimetres. */
const IOD_MODEL = Math.hypot(REST.eyeL.x - REST.eyeR.x, REST.eyeL.y - REST.eyeR.y) || 1;
const EYE_MID_Y = (REST.eyeL.y + REST.eyeR.y) / 2;
/** Nose position between eye-line and chin at rest, used as the pitch baseline. */
const REST_PITCH_RATIO =
  (REST.nose.y - EYE_MID_Y) / ((REST.chin.y - EYE_MID_Y) || 1);
const BACKDROP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BACKDROP_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uAccent;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
  void main() {
    vec2 uv = vUv;
    vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, uv.y));
    // Soft pool of light behind the head.
    float d = length((uv - vec2(0.5, 0.58)) * vec2(1.5, 1.0));
    col += uAccent * smoothstep(0.75, 0.0, d) * 0.28;
    // Very light grain keeps large flat areas from banding.
    col += (hash(uv * 1024.0 + uTime) - 0.5) * 0.02;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export type StageStats = {
  faceDetected: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  /** Headline expression readings, for the live meter in the UI. */
  expression: {
    jawOpen: number;
    blink: number;
    smile: number;
    browRaise: number;
  };
};

export type FaceStageOptions = {
  canvas: HTMLCanvasElement;
  onStats?: (stats: StageStats) => void;
};

export class FaceStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly mannequin = createMannequin();
  private readonly bustMaterial = createBustMaterial();
  private readonly maskGeometry: THREE.BufferGeometry;
  private readonly maskMaterial: THREE.ShaderMaterial;
  private readonly backdrop: THREE.Mesh;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.HemisphereLight;

  private readonly positions: Float32Array;
  private readonly prevPositions: Float32Array;
  private maskTexture: THREE.Texture | null = null;

  private smoothed = { yaw: 0, pitch: 0, roll: 0 };
  private hasSeenFace = false;
  private lastFrameTime = 0;
  private experience: Experience | null = null;
  private disposed = false;
  private opacityTarget = 0;

  constructor({ canvas, onStats }: FaceStageOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      // Needed so a snapshot can read the buffer back at any time.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x05060a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 4000);
    this.camera.position.set(0, HEAD.centre.y, 58);
    this.camera.lookAt(0, HEAD.centre.y, 0);

    // ---- backdrop ---------------------------------------------------------
    const backdropMat = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTop: { value: new THREE.Color('#0a0b12') },
        uBottom: { value: new THREE.Color('#04050a') },
        uAccent: { value: new THREE.Color('#3a4a7a') },
        uTime: { value: 0 },
      },
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -1;
    this.scene.add(this.backdrop);

    // ---- lights -----------------------------------------------------------
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    this.keyLight.position.set(-34, 26, 44);
    this.rimLight = new THREE.DirectionalLight(0x93a8ff, 2.4);
    this.rimLight.position.set(30, 12, -34);
    this.fillLight = new THREE.HemisphereLight(0x6688cc, 0x0a0c12, 0.5);
    this.scene.add(this.keyLight, this.rimLight, this.fillLight);

    // ---- bust -------------------------------------------------------------
    this.mannequin.setMaterial(this.bustMaterial);
    this.scene.add(this.mannequin.group);

    // ---- mask plate -------------------------------------------------------
    this.positions = new Float32Array(CANONICAL_POSITIONS);
    this.prevPositions = Float32Array.from(this.positions);

    this.maskGeometry = new THREE.BufferGeometry();
    this.maskGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.maskGeometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(CANONICAL_UVS), 2));
    // Canonical rest positions, still needed by the shader for expression weights.
    this.maskGeometry.setAttribute(
      'aCanonical',
      new THREE.BufferAttribute(Float32Array.from(CANONICAL_POSITIONS), 3),
    );
    this.maskGeometry.setIndex(new THREE.BufferAttribute(CANONICAL_INDICES, 1));
    // The plate moves every frame, so skip frustum culling entirely.
    this.maskGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);

    this.maskMaterial = new THREE.ShaderMaterial({
      vertexShader: MASK_VERTEX_SHADER,
      fragmentShader: MASK_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      // Double-sided: a mask should stay solid from any viewing angle, and
      // the thin plate can be seen edge-on when the head turns hard.
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: null },
        uMode: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uRim: { value: 0.8 },
        uGrain: { value: 0.12 },
        uScan: { value: 0 },
        uTint: { value: new THREE.Color('#ffffff') },
        uGlow: { value: new THREE.Color('#9fb4ff') },
        uJawOpen: { value: 0 },
        uBrowRaise: { value: 0 },
        uBreathe: { value: 1 },
        uBlink: { value: 0 },
        uMouthOpen: { value: 0 },
        uLookX: { value: 0 },
        uLookY: { value: 0 },
        uAngry: { value: 0 },
        uHappy: { value: 0 },
      },
    });

    const mask = new THREE.Mesh(this.maskGeometry, this.maskMaterial);
    mask.frustumCulled = false;
    mask.renderOrder = 10;
    this.scene.add(mask);

    this.onStats = onStats;
    this.resize();
  }

  private onStats?: (stats: StageStats) => void;

  /* ------------------------------------------------------------------ */

  /** Installs a freshly baked mask atlas. */
  setMaskTexture(canvas: HTMLCanvasElement) {
    this.maskTexture?.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace; // sampled raw, so the artwork is untouched
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    this.maskTexture = tex;
    this.maskMaterial.uniforms.uMap.value = tex;
    this.opacityTarget = 1;
  }

  clearMask() {
    this.opacityTarget = 0;
  }

  setExperience(exp: Experience) {
    this.experience = exp;
    const u = this.maskMaterial.uniforms;
    u.uMode.value = exp.mode;
    (u.uTint.value as THREE.Color).set(exp.tint);
    (u.uGlow.value as THREE.Color).set(exp.glow);
    u.uRim.value = exp.rim;
    u.uGrain.value = exp.grain;
    u.uScan.value = exp.scan;

    const bd = this.backdrop.material as THREE.ShaderMaterial;
    (bd.uniforms.uTop.value as THREE.Color).set(exp.backdrop[0]);
    (bd.uniforms.uBottom.value as THREE.Color).set(exp.backdrop[1]);
    (bd.uniforms.uAccent.value as THREE.Color).set(exp.glow);
    bd.uniforms.uAccent.value.multiplyScalar(0.5);

    this.bustMaterial.color.set(exp.bust.colour);
    this.bustMaterial.emissive.set(exp.bust.rim);
    this.bustMaterial.emissiveIntensity = 0.05;
    this.rimLight.color.set(exp.bust.rim);
    this.keyLight.color.set(exp.id === 'porcelain' ? '#ffffff' : '#dfe6ff');
  }

  resize() {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || canvas.clientWidth || 1;
    const h = parent?.clientHeight || canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------------ */

  /**
   * Places the mask for one tracked frame. `frame` may be null when no face is
   * visible, in which case the head eases back to a neutral rest pose.
   */
  update(frame: TrackerFrame | null, nowMs: number, aspect = 16 / 9) {
    if (this.disposed) return;
    const dt = this.lastFrameTime ? Math.min(0.1, (nowMs - this.lastFrameTime) / 1000) : 0.016;
    this.lastFrameTime = nowMs;

    const u = this.maskMaterial.uniforms;
    u.uTime.value = nowMs / 1000;
    (this.backdrop.material as THREE.ShaderMaterial).uniforms.uTime.value = nowMs / 1000;

    // Fade the mask in once it exists and a face is found.
    const opacity = u.uOpacity.value as number;
    u.uOpacity.value = opacity + (this.opacityTarget - opacity) * Math.min(1, dt * 4);

    if (!frame) {
      if (this.hasSeenFace) {
        this.onStats?.({
          faceDetected: false,
          yaw: 0,
          pitch: 0,
          roll: 0,
          expression: { jawOpen: 0, blink: 0, smile: 0, browRaise: 0 },
        });
      }
      this.easeToRest(dt);
      this.render();
      return;
    }

    const lm = frame.landmarks;
    if (lm.length < 468) {
      this.render();
      return;
    }

    // ---- anchors ----------------------------------------------------------
    // MediaPipe normalises x by frame width and y by frame height, so the two
    // axes are in different units. Everything below therefore works in
    // "image-height units" — x is scaled by the aspect ratio first — otherwise
    // the mask inherits the camera's aspect distortion and comes out stretched.
    const mx = (i: number) => (1 - lm[i].x) * aspect; // mirrored, in height units
    const my = (i: number) => lm[i].y;

    const eLx = mx(EYE_LEFT);
    const eLy = my(EYE_LEFT);
    const eRx = mx(EYE_RIGHT);
    const eRy = my(EYE_RIGHT);
    const eyeMidX = (eLx + eRx) / 2;
    const eyeMidY = (eLy + eRy) / 2;

    const iodNorm = Math.hypot(eLx - eRx, eLy - eRy) || 1e-4;
    // Canonical centimetres per image-height unit: keeps the head the same size
    // on screen whether you lean in or sit back.
    const scale = IOD_MODEL / iodNorm;

    // ---- head pose --------------------------------------------------------
    const noseX = mx(NOSE_TIP);
    const noseY = my(NOSE_TIP);
    const chinY = my(CHIN);

    // Yaw: where the nose sits relative to the eye line, in eye-widths.
    const yawRaw = (noseX - eyeMidX) / iodNorm;
    // Pitch: the nose's position between eye line and chin, versus at rest.
    const spanNow = chinY - eyeMidY || 1e-4;
    const pitchRatio = (noseY - eyeMidY) / spanNow;
    const pitchRaw = pitchRatio - REST_PITCH_RATIO;

    // Roll: the world-space eye line, compared with the model's own eye line.
    const worldEyeX = (eRx - eLx);
    const worldEyeY = -(eRy - eLy);
    const worldAngle = Math.atan2(worldEyeY, worldEyeX);
    // Mirroring negates the model's x axis, so compare against a flipped model.
    const modelAngle = Math.atan2(
      REST.eyeR.y - REST.eyeL.y,
      -(REST.eyeR.x - REST.eyeL.x),
    );
    let roll = worldAngle - modelAngle;
    // Keep roll in [-pi, pi] then damp the influence: heads tilt less than the
    // raw geometry suggests once you account for landmark noise.
    while (roll > Math.PI) roll -= 2 * Math.PI;
    while (roll < -Math.PI) roll += 2 * Math.PI;

    const MAX_YAW = 0.62;
    const MAX_PITCH = 0.42;
    const MAX_ROLL = 0.5;
    const targetYaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, yawRaw * 2.1));
    const targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitchRaw * 1.5));
    const targetRoll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, roll * 0.9));

    const k = Math.min(1, dt * 9);
    this.smoothed.yaw += (targetYaw - this.smoothed.yaw) * k;
    this.smoothed.pitch += (targetPitch - this.smoothed.pitch) * k;
    this.smoothed.roll += (targetRoll - this.smoothed.roll) * k;

    const yaw = this.smoothed.yaw;
    const pitch = this.smoothed.pitch;
    const rollSm = this.smoothed.roll;

    // ---- expression -------------------------------------------------------
    const b: BlendshapeMap = frame.blendshapes;
    const jawOpen = bs(b, 'jawOpen');
    const browRaise = Math.max(
      bs(b, 'browInnerUp'),
      bs(b, 'browOuterUpLeft'),
      bs(b, 'browOuterUpRight'),
    );
    const blink = Math.max(bs(b, 'eyeBlinkLeft'), bs(b, 'eyeBlinkRight'));
    const smile = (bs(b, 'mouthSmileLeft') + bs(b, 'mouthSmileRight')) / 2;
    const angry = Math.max(bs(b, 'browDownLeft'), bs(b, 'browDownRight'));
    const lookX =
      (bs(b, 'eyeLookOutLeft') + bs(b, 'eyeLookInRight')) / 2 -
      (bs(b, 'eyeLookInLeft') + bs(b, 'eyeLookOutRight')) / 2;
    const lookY =
      (bs(b, 'eyeLookUpLeft') + bs(b, 'eyeLookUpRight')) / 2 -
      (bs(b, 'eyeLookDownLeft') + bs(b, 'eyeLookDownRight')) / 2;

    u.uJawOpen.value = jawOpen;
    u.uMouthOpen.value = jawOpen;
    u.uBrowRaise.value = browRaise;
    u.uBlink.value = blink;
    u.uHappy.value = smile;
    u.uAngry.value = angry;
    u.uLookX.value = lookX;
    u.uLookY.value = lookY;

    // ---- depth sweep ------------------------------------------------------
    // Rotate the canonical profile by yaw/pitch and keep z, so the nose gains
    // parallax and the cheeks fall away as the head turns.
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const pos = this.positions;
    const prev = this.prevPositions;
    // Frame-rate independent smoothing of the placed vertices.
    const vk = Math.min(1, dt * 26);

    for (let i = 0; i < NUM_VERTICES; i++) {
      // Both axes are in the same unit now, so this is a true uniform scale.
      const x = (mx(i) - eyeMidX) * scale;
      const y = -(my(i) - eyeMidY) * scale + EYE_MID_Y;

      const cx0 = CANONICAL_POSITIONS[i * 3];
      const cy0 = CANONICAL_POSITIONS[i * 3 + 1];
      const cz0 = CANONICAL_POSITIONS[i * 3 + 2];
      const x1 = cx0 * cy + cz0 * sy;
      const z1 = -cx0 * sy + cz0 * cy;
      const z2 = cy0 * sp + z1 * cp;

      const i3 = i * 3;
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z2;

      // Squash jitter without adding perceptible lag.
      prev[i3] += (x - prev[i3]) * vk;
      prev[i3 + 1] += (y - prev[i3 + 1]) * vk;
      prev[i3 + 2] += (z2 - prev[i3 + 2]) * vk;
    }

    pos.set(prev);
    (this.maskGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // ---- follow ------------------------------------------------------------
    // The bust carries the rotation; the face plate already carries its own
    // in-plane motion through the landmarks.
    this.mannequin.poseGroup.rotation.set(pitch, yaw, rollSm);
    // A gentle lateral drift makes the bust feel attached to a body.
    this.mannequin.poseGroup.position.x = -yawRaw * 1.4;

    if (!this.hasSeenFace) this.hasSeenFace = true;
    this.onStats?.({
      faceDetected: true,
      yaw,
      pitch,
      roll: rollSm,
      expression: { jawOpen, blink, smile, browRaise },
    });

    this.render();
  }

  /** No face: relax the mesh back to the canonical rest shape. */
  private easeToRest(dt: number) {
    const k = Math.min(1, dt * 3);
    const pos = this.positions;
    for (let i = 0; i < NUM_VERTICES * 3; i++) {
      pos[i] += (CANONICAL_POSITIONS[i] - pos[i]) * k;
    }
    this.prevPositions.set(pos);
    (this.maskGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.smoothed.yaw *= 0.94;
    this.smoothed.pitch *= 0.94;
    this.smoothed.roll *= 0.94;
    this.mannequin.poseGroup.rotation.set(this.smoothed.pitch, this.smoothed.yaw, this.smoothed.roll);
    this.mannequin.poseGroup.position.x *= 0.96;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Development aid: show only selected parts of the bust. */
  setBustParts(opts: { cranium?: boolean; neck?: boolean; pedestal?: boolean }) {
    this.mannequin.setParts(opts);
  }

  /** Show or hide the mannequin bust (development aid). */
  setBustVisible(v: boolean) {
    this.mannequin.group.visible = v;
  }

  /** Show or hide the mask plate (development aid). */
  setMaskVisible(v: boolean) {
    this.maskMaterial.visible = v;
  }

  /** Introspection for development and automated checks. */
  debugInfo() {
    const pos = this.maskGeometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < arr.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = arr[i + a];
        if (!Number.isFinite(v)) return { nan: true } as const;
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    const u = this.maskMaterial.uniforms;
    return {
      nan: false,
      min,
      max,
      opacity: u.uOpacity.value as number,
      mode: u.uMode.value as number,
      hasTexture: !!u.uMap.value,
      visible: this.maskMaterial.visible,
      pose: {
        yaw: this.smoothed.yaw,
        pitch: this.smoothed.pitch,
        roll: this.smoothed.roll,
      },
    } as const;
  }

  /** PNG data URL of the current frame, including the backdrop. */
  capture(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    this.maskTexture?.dispose();
    this.maskGeometry.dispose();
    this.maskMaterial.dispose();
    this.mannequin.dispose();
    this.bustMaterial.dispose();
    (this.backdrop.material as THREE.Material).dispose();
    this.backdrop.geometry.dispose();
    this.renderer.dispose();
  }
}
