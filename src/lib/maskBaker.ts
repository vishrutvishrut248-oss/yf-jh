/**
 * maskBaker — turn an arbitrary uploaded mask picture into a texture that lands
 * correctly on the canonical face mesh.
 *
 * How it works
 * ------------
 * MediaPipe gives us 468 landmarks for a detected face, and those same 468
 * points have known canonical UV coordinates. So if we can find a face in the
 * uploaded image we get 468 (source pixel -> UV) correspondences for free, and
 * we can warp the image into the canonical atlas with a piecewise-affine map
 * over the mesh's own 898 triangles.
 *
 * The same topology is reused when no face is found: the user positions a
 * face-shaped guide, which supplies the correspondences instead.
 *
 * The result is one square texture whose UV layout is exactly the layout the
 * live 3D mesh samples, so expression-driven deformation comes for free.
 */
import {
  CANONICAL_POSITIONS,
  CANONICAL_UVS,
  NUM_VERTICES,
  TRIANGLES,
  uvToAtlas,
} from './canonicalFace';
import { FACE_OVAL } from './landmarks';

export type BakeSource = {
  /** Decoded image, already at natural resolution. */
  bitmap: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
};

export type BakeOptions = {
  /** Atlas resolution. 1024 is plenty; 2048 for very detailed masks. */
  size?: number;
  /** Pixels of feathering on the silhouette edge. */
  feather?: number;
  /** Keep only what falls inside the face contour, or bleed colour outward. */
  clipToFace?: boolean;
  /** Bleed colour outward so a full-head mask covers the mannequin skull. */
  coverHead?: boolean;
  /** Knock out a flat, uniform background (product shots on white/black). */
  removeBackground?: boolean;
  /** 0..1 background tolerance. */
  backgroundTolerance?: number;
  /** How far past the jaw contour the mask is allowed to reach (1 = exactly on it). */
  contourScale?: number;
};

export type BakeResult = {
  canvas: HTMLCanvasElement;
  /** Silhouette of the warped region in atlas pixel space. */
  oval: [number, number][];
  size: number;
};

const DEFAULT_SIZE = 1024;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * The mesh's UV silhouette: edges used by exactly one triangle, chained into
 * loops. This is the exact region of the atlas the face covers, no guessing.
 */
export function meshBoundaryUV(): number[][] {
  const edgeCount = new Map<string, { a: number; b: number; n: number }>();
  for (const [a, b, c] of TRIANGLES) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      const cur = edgeCount.get(key);
      if (cur) cur.n++;
      else edgeCount.set(key, { a: p, b: q, n: 1 });
    }
  }
  const boundary = new Map<number, number[]>();
  for (const { a, b, n } of edgeCount.values()) {
    if (n !== 1) continue;
    if (!boundary.has(a)) boundary.set(a, []);
    if (!boundary.has(b)) boundary.set(b, []);
    boundary.get(a)!.push(b);
    boundary.get(b)!.push(a);
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of boundary.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let cur: number | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(cur);
      cur = boundary.get(cur)?.find((x) => !seen.has(x));
    }
    if (loop.length > 2) loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  return loops;
}

let cachedBoundary: number[][] | null = null;
export function boundaryLoop(): number[] {
  if (!cachedBoundary) cachedBoundary = meshBoundaryUV();
  return cachedBoundary[0] ?? [];
}

/* ------------------------------------------------------------------ */
/* Source point generation                                             */
/* ------------------------------------------------------------------ */

/** Correspondences from a face detected inside the uploaded image. */
export function srcPointsFromLandmarks(
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(NUM_VERTICES * 2);
  for (let i = 0; i < NUM_VERTICES; i++) {
    const lm = landmarks[i] ?? landmarks[landmarks.length - 1];
    out[i * 2] = lm.x * width;
    out[i * 2 + 1] = lm.y * height;
  }
  return out;
}

export type Guide = { x: number; y: number; scale: number; rotation: number };

/**
 * The mapping used for hand-placed masks: the canonical layout acts as a square
 * guide the user positions over their image. Exposed separately from the bake
 * so the same mapping can draw the on-screen guide overlay.
 */
export function makeGuideMapper(guide: Guide, size: number, offsetX = 0, offsetY = 0) {
  const cos = Math.cos(guide.rotation);
  const sin = Math.sin(guide.rotation);
  const half = size / 2;
  return (atlasX: number, atlasY: number): [number, number] => {
    const dx = (atlasX - half) * guide.scale;
    const dy = (atlasY - half) * guide.scale;
    return [guide.x + offsetX + dx * cos - dy * sin, guide.y + offsetY + dx * sin + dy * cos];
  };
}

/** Correspondences for a hand-placed mask. */
export function srcPointsFromGuide(
  guide: Guide,
  size: number,
  offsetX = 0,
  offsetY = 0,
): Float32Array {
  const map = makeGuideMapper(guide, size, offsetX, offsetY);
  const out = new Float32Array(NUM_VERTICES * 2);
  for (let i = 0; i < NUM_VERTICES; i++) {
    const [ax, ay] = uvToAtlas(CANONICAL_UVS, i, size);
    const [px, py] = map(ax, ay);
    out[i * 2] = px;
    out[i * 2 + 1] = py;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Warp                                                                */
/* ------------------------------------------------------------------ */

/**
 * Piecewise-affine texture map, written pixel by pixel.
 *
 * The obvious implementation — clip to the destination triangle, apply the
 * inverse affine transform, drawImage — looks elegant but is unreliable:
 * canvas clipping is antialiased and state-heavy, and repeated
 * save/clip/transform/restore across 898 triangles silently drops large parts
 * of the mesh (measured: only ~35% of the face survived). It also cannot
 * feather across an edge.
 *
 * So instead: for every atlas pixel inside a UV triangle, interpolate the
 * matching source pixel with barycentric weights and write it directly. Slower
 * in theory, a few milliseconds in practice, and exact — neighbouring
 * triangles share edges bit-for-bit, so there are no seams to patch.
 */
function warpIntoAtlas(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  src: Float32Array,
  size: number,
) {
  const sw = source.width;
  const sh = source.height;
  const sctx = source.getContext('2d', { willReadFrequently: true })!;
  const sdata = sctx.getImageData(0, 0, sw, sh).data;

  const out = ctx.createImageData(size, size);
  const odata = out.data;

  const ax = new Float32Array(NUM_VERTICES);
  const ay = new Float32Array(NUM_VERTICES);
  for (let i = 0; i < NUM_VERTICES; i++) {
    const [x, y] = uvToAtlas(CANONICAL_UVS, i, size);
    ax[i] = x;
    ay[i] = y;
  }

  const maxX = sw - 1.001;
  const maxY = sh - 1.001;

  for (const [ia, ib, ic] of TRIANGLES) {
    const x0 = ax[ia], y0 = ay[ia];
    const x1 = ax[ib], y1 = ay[ib];
    const x2 = ax[ic], y2 = ay[ic];

    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(den) < 1e-9) continue;

    const u0 = src[ia * 2], v0 = src[ia * 2 + 1];
    const u1 = src[ib * 2], v1 = src[ib * 2 + 1];
    const u2 = src[ic * 2], v2 = src[ic * 2 + 1];

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxXp = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxYp = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));

    // Half-pixel tolerance in barycentric units, derived from the triangle's
    // longest edge, so neighbouring triangles overlap by under a pixel and
    // leave no seam.
    const e0 = Math.hypot(x1 - x0, y1 - y0);
    const e1 = Math.hypot(x2 - x1, y2 - y1);
    const e2 = Math.hypot(x0 - x2, y0 - y2);
    const tol = 0.7 / Math.max(1e-6, Math.max(e0, e1, e2));

    for (let py = minY; py <= maxYp; py++) {
      const fy = py + 0.5;
      for (let px = minX; px <= maxXp; px++) {
        const fx = px + 0.5;

        // Barycentric weights: beta for vertex B, gamma for C, alpha for A.
        const beta = ((fx - x0) * (y2 - y0) - (x2 - x0) * (fy - y0)) / den;
        const gamma = ((x1 - x0) * (fy - y0) - (fx - x0) * (y1 - y0)) / den;
        const alpha = 1 - beta - gamma;

        if (alpha < -tol || beta < -tol || gamma < -tol) continue;

        const su = alpha * u0 + beta * u1 + gamma * u2;
        const sv = alpha * v0 + beta * v1 + gamma * v2;

        // Bilinear sample.
        const sx = su < 0 ? 0 : su > maxX ? maxX : su;
        const sy = sv < 0 ? 0 : sv > maxY ? maxY : sv;
        const ix = sx - 0.5;
        const iy = sy - 0.5;
        const xa = Math.max(0, Math.floor(ix));
        const ya = Math.max(0, Math.floor(iy));
        const xb = xa + 1 < sw ? xa + 1 : xa;
        const yb = ya + 1 < sh ? ya + 1 : ya;
        const tx = ix - xa;
        const ty = iy - ya;

        const o00 = (ya * sw + xa) * 4;
        const o10 = (ya * sw + xb) * 4;
        const o01 = (yb * sw + xa) * 4;
        const o11 = (yb * sw + xb) * 4;

        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;

        const o = (py * size + px) * 4;
        const a =
          sdata[o00 + 3] * w00 + sdata[o10 + 3] * w10 + sdata[o01 + 3] * w01 + sdata[o11 + 3] * w11;
        if (a <= 0.5) continue;

        odata[o] = sdata[o00] * w00 + sdata[o10] * w10 + sdata[o01] * w01 + sdata[o11] * w11;
        odata[o + 1] =
          sdata[o00 + 1] * w00 + sdata[o10 + 1] * w10 + sdata[o01 + 1] * w01 + sdata[o11 + 1] * w11;
        odata[o + 2] =
          sdata[o00 + 2] * w00 + sdata[o10 + 2] * w10 + sdata[o01 + 2] * w01 + sdata[o11 + 2] * w11;
        odata[o + 3] = a;
      }
    }
  }

  ctx.putImageData(out, 0, 0);
}

/* ------------------------------------------------------------------ */
/* Background removal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Knocks out a flat background by sampling the image border. Only fires when
 * the border is genuinely uniform, so busy photos are left untouched.
 */
export function detectFlatBackground(
  img: ImageData,
  tolerance = 0.12,
): { r: number; g: number; b: number } | null {
  const { data, width, height } = img;
  const samples: number[][] = [];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };
  const step = Math.max(1, Math.floor(width / 64));
  for (let x = 0; x < width; x += step) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    push(0, y);
    push(width - 1, y);
  }
  if (samples.length < 8) return null;
  const mean = [0, 1, 2].map((k) => samples.reduce((a, s) => a + s[k], 0) / samples.length);
  let spread = 0;
  for (const s of samples) {
    spread += Math.abs(s[0] - mean[0]) + Math.abs(s[1] - mean[1]) + Math.abs(s[2] - mean[2]);
  }
  spread /= samples.length * 3 * 255;
  if (spread > tolerance) return null;
  return { r: mean[0], g: mean[1], b: mean[2] };
}

function applyBackgroundRemoval(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tolerance: number,
) {
  const img = ctx.getImageData(0, 0, width, height);
  const bg = detectFlatBackground(img, tolerance);
  if (!bg) return false;
  const { data } = img;
  const t = Math.max(12, tolerance * 255 * 1.6);
  for (let i = 0; i < data.length; i += 4) {
    const dist =
      Math.abs(data[i] - bg.r) * 0.3 +
      Math.abs(data[i + 1] - bg.g) * 0.59 +
      Math.abs(data[i + 2] - bg.b) * 0.11;
    if (dist < t) data[i + 3] = 0;
    else if (dist < t * 1.7) data[i + 3] = Math.min(data[i + 3], ((dist - t) / (t * 0.7)) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

/* ------------------------------------------------------------------ */
/* Silhouette / alpha                                                  */
/* ------------------------------------------------------------------ */

/**
 * Rasterises the mask's own UV coverage and, optionally, the face region.
 *
 * Why not use the mesh boundary: the canonical UV layout is a full *head*
 * unwrap that spans the whole atlas (forehead at v=0.11, chin at v=0.95, ears
 * at u=0.01/0.99), so its boundary loop is the whole skull, not a face. Walking
 * that loop produces a folded polygon that clips the mask away.
 *
 * Instead this walks the actual triangles: for every atlas pixel covered by a
 * UV triangle it interpolates the canonical (x, y) position, so each pixel
 * knows where on the face it lives. That gives an exact coverage mask and lets
 * the face region be tested against the real jaw contour, with no topology
 * assumptions at all.
 */
type AlphaOptions = {
  /** Clip to the face contour rather than the whole unwrapped head. */
  faceOnly: boolean;
  /** 1 = the landmark contour, >1 grows it, <1 shrinks it. */
  contourScale?: number;
  /** Feather radius in atlas pixels. */
  feather?: number;
};

/** Point-in-polygon, honouring the odd winding of the face contour. */
function inPolygon(px: number, py: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** The face contour in canonical (x, y), optionally scaled about its centre. */
function faceContour(scale: number): number[][] {
  const pts = FACE_OVAL.map((i) => [
    CANONICAL_POSITIONS[i * 3],
    CANONICAL_POSITIONS[i * 3 + 1],
  ]);
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x / pts.length;
    cy += y / pts.length;
  }
  return pts.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
}

/** Alpha mask of exactly the region the warp will fill. */
export function rasteriseAlpha(size: number, options: AlphaOptions): HTMLCanvasElement {
  const faceOnly = options.faceOnly ?? true;
  const contourScale = options.contourScale ?? 1.04;
  const feather = options.feather ?? 3;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const contour = faceOnly ? faceContour(contourScale) : null;
  const uvx = new Float32Array(NUM_VERTICES);
  const uvy = new Float32Array(NUM_VERTICES);
  for (let i = 0; i < NUM_VERTICES; i++) {
    uvx[i] = CANONICAL_UVS[i * 2] * size;
    uvy[i] = (1 - CANONICAL_UVS[i * 2 + 1]) * size;
  }

  for (const [ia, ib, ic] of TRIANGLES) {
    const ax = uvx[ia], ay = uvy[ia];
    const bx = uvx[ib], by = uvy[ib];
    const cx2 = uvx[ic], cy2 = uvy[ic];

    const den = (bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay);
    if (Math.abs(den) < 1e-9) continue;

    // Expand the triangle by a fraction of a pixel so neighbours meet cleanly.
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx2) - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx2) + 1));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy2) - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy2) + 1));
    if (maxX < minX || maxY < minY) continue;

    const px = CANONICAL_POSITIONS[ia * 3];
    const py = CANONICAL_POSITIONS[ia * 3 + 1];
    const qx = CANONICAL_POSITIONS[ib * 3];
    const qy = CANONICAL_POSITIONS[ib * 3 + 1];
    const rx = CANONICAL_POSITIONS[ic * 3];
    const ry = CANONICAL_POSITIONS[ic * 3 + 1];

    const EPS = -0.03; // slight outward tolerance, in barycentric units
    for (let y = minY; y <= maxY; y++) {
      const fy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const fx = x + 0.5;
        const beta = ((fx - ax) * (cy2 - ay) - (cx2 - ax) * (fy - ay)) / den;
        const gamma = ((bx - ax) * (fy - ay) - (fx - ax) * (by - ay)) / den;
        const alpha = 1 - beta - gamma;
        if (alpha < EPS || beta < EPS || gamma < EPS) continue;

        if (contour) {
          // Canonical position of this texel, from the same barycentric weights.
          const vx = alpha * px + beta * qx + gamma * rx;
          const vy = alpha * py + beta * qy + gamma * ry;
          if (!inPolygon(vx, vy, contour)) continue;
        }
        data[(y * size + x) * 4 + 3] = 255;
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  if (feather > 0) {
    const soft = document.createElement('canvas');
    soft.width = size;
    soft.height = size;
    const sctx = soft.getContext('2d')!;
    sctx.filter = `blur(${feather}px)`;
    sctx.drawImage(canvas, 0, 0);
    sctx.filter = 'none';
    return soft;
  }
  return canvas;
}

/** Bleeds edge colour outward so masks can wrap the whole skull. */
function bleedOutward(canvas: HTMLCanvasElement, passes: number) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const snapshot = document.createElement('canvas');
  snapshot.width = w;
  snapshot.height = h;
  snapshot.getContext('2d')!.drawImage(canvas, 0, 0);

  ctx.globalCompositeOperation = 'destination-over';
  let blur = 4;
  for (let p = 0; p < passes; p++) {
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lg = layer.getContext('2d')!;
    lg.filter = `blur(${blur}px)`;
    lg.drawImage(snapshot, 0, 0);
    lg.filter = 'none';
    ctx.drawImage(layer, 0, 0);
    blur *= 2.4;
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Warps `source` into the canonical atlas using 468 provided correspondences.
 */
export function bakeAtlas(
  source: BakeSource,
  srcPoints: Float32Array,
  options: BakeOptions = {},
): BakeResult {
  const size = options.size ?? DEFAULT_SIZE;
  const feather = options.feather ?? 3;
  const clipToFace = options.clipToFace ?? true;
  const coverHead = options.coverHead ?? false;

  // 1. Draw the source at natural resolution and optionally cut its background.
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = source.width;
  srcCanvas.height = source.height;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(source.bitmap as CanvasImageSource, 0, 0, source.width, source.height);
  if (options.removeBackground) {
    applyBackgroundRemoval(
      sctx,
      source.width,
      source.height,
      options.backgroundTolerance ?? 0.12,
    );
  }

  // 2. Warp into the atlas.
  const atlas = document.createElement('canvas');
  atlas.width = size;
  atlas.height = size;
  const actx = atlas.getContext('2d')!;
  actx.imageSmoothingEnabled = true;
  actx.imageSmoothingQuality = 'high';
  warpIntoAtlas(actx, srcCanvas, srcPoints, size);

  // 3. Shape the alpha from the mesh's own rasterised coverage.
  const alpha = rasteriseAlpha(size, {
    faceOnly: clipToFace,
    contourScale: options.contourScale ?? 1.04,
    feather,
  });
  if (coverHead) {
    // Colour bleeds outward past the face contour so the mask can carry on
    // over the skull, but the silhouette still bounds the final alpha.
    const colourOnly = document.createElement('canvas');
    colourOnly.width = size;
    colourOnly.height = size;
    colourOnly.getContext('2d')!.drawImage(atlas, 0, 0);
    bleedOutward(colourOnly, 5);

    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const octx = out.getContext('2d')!;
    octx.drawImage(colourOnly, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(atlas, 0, 0); // keep the original alpha detail
    octx.globalCompositeOperation = 'destination-over';
    octx.drawImage(atlas, 0, 0); // and the original colour on top
    octx.globalCompositeOperation = 'source-over';

    // Where the original was empty but the bleed has colour, take the bleed.
    const merged = document.createElement('canvas');
    merged.width = size;
    merged.height = size;
    const mctx = merged.getContext('2d')!;
    mctx.drawImage(colourOnly, 0, 0);
    mctx.globalCompositeOperation = 'destination-out';
    mctx.drawImage(atlas, 0, 0);
    mctx.globalCompositeOperation = 'source-over';
    const final = document.createElement('canvas');
    final.width = size;
    final.height = size;
    const fctx = final.getContext('2d')!;
    fctx.drawImage(merged, 0, 0);
    fctx.drawImage(atlas, 0, 0);
    applyAlpha(final, alpha);
    return finish(final, size);
  }

  const composed = document.createElement('canvas');
  composed.width = size;
  composed.height = size;
  composed.getContext('2d')!.drawImage(atlas, 0, 0);
  applyAlpha(composed, alpha);
  return finish(composed, size);
}

/** Multiplies a canvas's alpha by a greyscale mask. */
function applyAlpha(target: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const ctx = target.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function finish(canvas: HTMLCanvasElement, size: number): BakeResult {
  const oval = FACE_OVAL.map(
    (i) => uvToAtlas(CANONICAL_UVS, i, size) as [number, number],
  );
  return { canvas, oval, size };
}

/** Convenience: bake using landmarks detected in the uploaded image. */
export function bakeFromLandmarks(
  source: BakeSource,
  landmarks: { x: number; y: number }[],
  options: BakeOptions = {},
): BakeResult {
  const src = srcPointsFromLandmarks(landmarks, source.width, source.height);
  return bakeAtlas(source, src, options);
}

/** Loads a File/Blob into something we can both measure and draw. */
export async function loadImageFile(file: File | Blob): Promise<BakeSource> {
  const bitmap = await createImageBitmap(file);
  return { bitmap, width: bitmap.width, height: bitmap.height };
}
