/**
 * FaceTracker — a thin, dependency-free wrapper around MediaPipe's
 * FaceLandmarker running entirely on-device.
 *
 * Privacy contract (this is the whole point of the site):
 *   - the camera stream is consumed by this module and never attached to a
 *     visible element, never drawn to a canvas, never recorded, never sent
 *     anywhere. Only numeric landmark coordinates leave this class.
 *   - all inference is local. There is no network call at runtime.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { BLENDSHAPES, IRIS_GROUP, type BlendshapeMap } from './landmarks';

export type TrackerFrame = {
  /** 478 landmarks in normalised image space (x right, y down, z depth). */
  landmarks: { x: number; y: number; z: number }[];
  /** 0..1 blendshape activations keyed by name. */
  blendshapes: BlendshapeMap;
  /** Column-major 4x4 canonical-face -> camera transform, or null. */
  matrix: Float32Array | null;
  /** Monotonic timestamp of the frame, ms. */
  timestamp: number;
};

export type TrackerStatus =
  | { state: 'idle' }
  | { state: 'loading'; detail: string }
  | { state: 'ready' }
  | { state: 'error'; message: string; hint?: string };

/**
 * Asset locations, resolved against the deployment base rather than the domain
 * root, so the site works when hosted at a subpath (GitHub Pages project site,
 * a folder on a shared host) as well as at a domain root.
 */
const BASE = import.meta.env.BASE_URL || '/';
const WASM_ROOT = `${BASE}mediapipe`;
const MODEL_URL = `${BASE}models/face_landmarker.task`;

/** Where to look for the model, in order. Local first so we never depend on a CDN. */
const MODEL_CANDIDATES = [
  MODEL_URL,
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
];

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function resolveModelUrl(): Promise<string> {
  for (const url of MODEL_CANDIDATES) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      /* try the next candidate */
    }
  }
  return MODEL_URL;
}

/** Loads (once) and returns the shared FaceLandmarker instance. */
export async function getLandmarker(
  onProgress?: (detail: string) => void,
): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      onProgress?.('loading runtime');
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      onProgress?.('loading model');
      const modelAssetPath = await resolveModelUrl();
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    })().catch((err) => {
      // Allow a retry (e.g. GPU delegate unsupported -> CPU on next attempt).
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/** Converts a MediaPipe result into our plain frame object. */
export function toFrame(result: FaceLandmarkerResult, timestamp: number): TrackerFrame | null {
  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) return null;

  const blendshapes: BlendshapeMap = {};
  const cats = result.faceBlendshapes?.[0]?.categories;
  if (cats) {
    for (const c of cats) {
      const name = (c.categoryName ?? BLENDSHAPES[c.index] ?? String(c.index)).replace(/^_/, '');
      blendshapes[name] = c.score;
    }
  }

  const m = result.facialTransformationMatrixes?.[0]?.data;
  return {
    landmarks: faces[0],
    blendshapes,
    matrix: m ? Float32Array.from(m) : null,
    timestamp,
  };
}

/** Frame-rate independent smoothing (exponential moving average). */
export function smooth(
  prev: Float32Array | null,
  next: Float32Array,
  alpha: number,
): Float32Array {
  if (!prev || prev.length !== next.length) return next.slice();
  for (let i = 0; i < next.length; i++) prev[i] += (next[i] - prev[i]) * alpha;
  return prev;
}

/** Clamp a value into [lo, hi]. */
export function clamp(v: number, lo = 0, hi = 1) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Reads a blendshape with a default, so callers need not null-check. */
export function bs(map: BlendshapeMap, name: string, fallback = 0) {
  const v = map[name];
  return typeof v === 'number' ? v : fallback;
}

/**
 * Estimates eye openness (0 closed .. 1 open) from the landmark geometry
 * rather than blendshapes — useful as a cross-check and for accessories that
 * should not pop when blendshape confidence dips.
 */
export function eyeOpenness(landmarks: { x: number; y: number }[], top: number, bottom: number, outer: number, inner: number) {
  const t = landmarks[top];
  const b = landmarks[bottom];
  const o = landmarks[outer];
  const i = landmarks[inner];
  if (!t || !b || !o || !i) return 1;
  const eyeH = Math.hypot(t.x - b.x, t.y - b.y);
  const eyeW = Math.hypot(o.x - i.x, o.y - i.y) || 1e-6;
  return clamp((eyeH / eyeW) * 4.2);
}

export { IRIS_GROUP };

/* ------------------------------------------------------------------ */
/* Still-image detection (used when fitting an uploaded mask)          */
/* ------------------------------------------------------------------ */

let imageLandmarkerPromise: Promise<FaceLandmarker> | null = null;

/**
 * A second landmarker in IMAGE mode, for finding the face inside an uploaded
 * mask picture. Created lazily and shares the same cached model bytes.
 */
export async function getImageLandmarker(): Promise<FaceLandmarker> {
  if (!imageLandmarkerPromise) {
    imageLandmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const modelAssetPath = await resolveModelUrl();
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    })().catch((err) => {
      imageLandmarkerPromise = null;
      throw err;
    });
  }
  return imageLandmarkerPromise;
}
