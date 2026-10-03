/**
 * Vendors runtime assets that must be served from the same origin.
 *
 * Why this exists: the face-tracking runtime (WASM) and the FaceLandmarker
 * model bundle are normally pulled from Google's CDN at runtime. That makes
 * the app fail on networks where those hosts are blocked (which happens), and
 * it leaks a request to a third party on every load. Copying them into
 * public/ keeps the app fully self-hosted and offline-capable.
 *
 *   npm run vendor
 *
 * Runs automatically via the predev / prebuild hooks.
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = join(root, 'public', 'mediapipe');
const modelSrc = join(root, 'vendor', 'face_landmarker.task');
const modelDest = join(root, 'public', 'models');

const WASM_FILES = [
  // SIMD build (used by every browser since ~2021) ...
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  // ... and the non-SIMD fallback, so old devices still work.
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

function copy(from, to, label) {
  if (!existsSync(from)) throw new Error(`vendor: missing source ${from} (${label})`);
  const size = statSync(from).size;
  if (existsSync(to) && statSync(to).size === size) return { label, skipped: true };
  copyFileSync(from, to);
  return { label, skipped: false, size };
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let failed = false;
for (const f of ['mediapipe', 'models']) ensureDir(join(root, 'public', f));

if (!existsSync(wasmSrc)) {
  console.error('vendor: @mediapipe/tasks-vision not installed — run `npm install` first.');
  failed = true;
} else {
  for (const f of WASM_FILES) {
    const r = copy(join(wasmSrc, f), join(wasmDest, f), 'mediapipe wasm');
    console.log(`  ${r.skipped ? '=' : '+'} public/mediapipe/${f}`);
  }
}

if (existsSync(modelSrc)) {
  const r = copy(modelSrc, join(modelDest, 'face_landmarker.task'), 'landmarker model');
  console.log(`  ${r.skipped ? '=' : '+'} public/models/face_landmarker.task`);
} else {
  console.warn(
    'vendor: vendor/face_landmarker.task not present.\n' +
      '        The app will fall back to downloading it from Google at runtime.',
  );
}

if (failed) process.exit(1);
console.log('vendor: done.');
