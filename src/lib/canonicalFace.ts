/**
 * The canonical face mesh.
 *
 * Extracted from MediaPipe's own `geometry_pipeline_metadata_landmarks.binarypb`
 * (shipped inside the FaceLandmarker `.task` bundle), field 3 = 468 vertices of
 * packed [x, y, z, u, v] floats, field 4 = the triangle index buffer.
 *
 * Cross-checked against the independent UV table in @tensorflow-models/facemesh
 * (`uv_coords.js`) — maximum UV delta 0.000000 over all 468 points.
 *
 * Coordinate space: MediaPipe canonical face model, roughly centimetres.
 *   x  right   (face is symmetric about x = 0)
 *   y  up      (chin ≈ -9.4, crown of forehead ≈ +8.3)
 *   z  toward viewer (face plane ≈ +7.6 at the nose tip)
 *
 * UV space matches MediaPipe's canonical texture layout (see mesh_map), which is
 * what makes it possible to bake an arbitrary uploaded mask photo into a
 * texture that lands correctly on the live mesh.
 */
import raw from './canonicalFace.json';

export const NUM_VERTICES = raw.numVertices; // 468
export const NUM_TRIANGLES = raw.indices.length / 3; // 898

/** Flat [x,y,z, ...] — 1404 numbers. */
export const CANONICAL_POSITIONS: Float32Array = Float32Array.from(raw.positions);
/** Flat [u,v, ...] — 936 numbers, u right / v up in the texture atlas. */
export const CANONICAL_UVS: Float32Array = Float32Array.from(raw.uvs);
/** Flat triangle indices — 2694 numbers. */
export const CANONICAL_INDICES: Uint16Array = Uint16Array.from(raw.indices);

/** Bounding box of the canonical mesh, precomputed. */
export const CANONICAL_BOUNDS = (() => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < NUM_VERTICES; i++) {
    for (let a = 0; a < 3; a++) {
      const v = CANONICAL_POSITIONS[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
})();

/** Bounding box of the UV layout — i.e. the region of the atlas the face occupies. */
export const UV_BOUNDS = (() => {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (let i = 0; i < NUM_VERTICES; i++) {
    for (let a = 0; a < 2; a++) {
      const v = CANONICAL_UVS[i * 2 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1]] };
})();

/**
 * Convert a canonical UV into pixel coordinates in a square atlas of `size`.
 * MediaPipe's UV origin is bottom-left; canvas/image origin is top-left.
 */
export function uvToAtlas(
  uv: ArrayLike<number>,
  index: number,
  size: number,
): [number, number] {
  return [uv[index * 2] * size, (1 - uv[index * 2 + 1]) * size];
}

/**
 * Triangles as index triplets, restricted to the 468 canonical vertices.
 * MediaPipe's FaceLandmarker returns 478 landmarks — the last 10 are iris
 * refinement points with no canonical vertex, so the mesh only ever uses 0..467.
 */
export const TRIANGLES: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < CANONICAL_INDICES.length; i += 3) {
    out.push([CANONICAL_INDICES[i], CANONICAL_INDICES[i + 1], CANONICAL_INDICES[i + 2]]);
  }
  return out;
})();

/** Index of every vertex that sits on a triangle edge, for wireframe/silhouette effects. */
export const NEIGHBOURS: number[][] = (() => {
  const n: Set<number>[] = Array.from({ length: NUM_VERTICES }, () => new Set<number>());
  for (const [a, b, c] of TRIANGLES) {
    n[a].add(b);
    n[a].add(c);
    n[b].add(a);
    n[b].add(c);
    n[c].add(a);
    n[c].add(b);
  }
  return n.map((s) => [...s]);
})();
