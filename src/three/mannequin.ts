/**
 * The stand-in head.
 *
 * The whole point of this site is that the user's own face never appears. So the
 * mask needs something to hang on: a neutral sculpted bust, generated
 * procedurally (no downloaded model), that rotates with the head pose and
 * catches light like plaster or graphite.
 *
 * Dimensions are in canonical face units (≈ cm) so everything lines up with the
 * face mesh: the canonical face spans x ±7.74, y -9.4..8.3, and its front
 * surface sits near z ≈ +7.6.
 */
import * as THREE from 'three';

export const HEAD = {
  /** Half-extents of the cranium. */
  halfWidth: 8.9,
  halfHeight: 11.0,
  halfDepth: 6.2,
  /**
   * Centre of the cranium in canonical space.
   *
   * Chosen from the mask's own depth profile: the mask sheet curves back to
   * z ≈ 0 around |x| = 6.5 and reaches z ≈ -2.4 at its outermost edge, so the
   * skull's front surface is parked just behind that (z ≈ -0.2 at |x| = 6.5,
   * z ≈ +1.6 at the midline, well clear of the nose at z = 7.6). The result is
   * that a face-plate mask meets the head cleanly at its silhouette, the way a
   * real mask sits on a face, instead of floating in front of it.
   *
   * Depth is deliberately shallow front-to-back: the back of the skull lands
   * near z = -10.8, giving a total head depth close to human proportions
   * relative to the 17.7-unit face height.
   */
  centre: new THREE.Vector3(0, 0.8, -4.6),
  /** The mask plate's front surface, canonical z at rest. */
  faceZ: 7.6,
};

/** Smoothstep that works on plain numbers (THREE.MathUtils.smoothstep is fine too). */
function smooth(x: number, lo: number, hi: number) {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/**
 * Lateral half-width of a head at a given normalised height.
 *
 * A scaled sphere reads as an egg no matter how it is squashed, because an
 * ellipse has no jaw. A real head is widest across the temples, holds that
 * width through the cheekbones, then falls away sharply into a much narrower
 * jaw. These control points, sampled with a smooth interpolation, are what
 * turn the silhouette from an oval into a head.
 *
 * t = -1 at the chin, 0 at the centre of the cranium, +1 at the crown.
 */
const WIDTH_PROFILE: [number, number][] = [
  [-1.0, 0.56],
  [-0.88, 0.63],
  [-0.74, 0.72],
  [-0.58, 0.81],
  [-0.38, 0.89],
  [-0.14, 0.96],
  [0.06, 1.0],
  [0.3, 0.97],
  [0.55, 0.90],
  [0.75, 0.79],
  [0.9, 0.63],
  [1.0, 0.42],
];

/** Front-to-back half-depth profile, same parameterisation. */
const DEPTH_PROFILE: [number, number][] = [
  [-1.0, 0.5],
  [-0.8, 0.6],
  [-0.5, 0.75],
  [-0.15, 0.87],
  [0.25, 0.98],
  [0.6, 1.0],
  [0.85, 0.94],
  [1.0, 0.72],
];

/**
 * Catmull-Rom through the control points.
 *
 * Straight smoothstep between points is only C1 and leaves visible faceting
 * where the slope changes; a spline carries curvature through and the surface
 * comes out clean.
 */
function sampleProfile(profile: [number, number][], t: number): number {
  const n = profile.length;
  if (t <= profile[0][0]) return profile[0][1];
  if (t >= profile[n - 1][0]) return profile[n - 1][1];

  let i = 1;
  while (i < n - 1 && t > profile[i][0]) i++;
  const [t1, v1] = profile[i - 1];
  const [t2, v2] = profile[i];
  const v0 = profile[i - 2]?.[1] ?? v1;
  const v3 = profile[i + 1]?.[1] ?? v2;

  const k = (t - t1) / (t2 - t1);
  const k2 = k * k;
  const k3 = k2 * k;
  return (
    0.5 *
    (2 * v1 +
      (-v0 + v2) * k +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * k2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * k3)
  );
}

/**
 * Closes the surface to a point at the crown and the chin.
 *
 * The width and depth profiles stay well above zero at the extremes (a head is
 * still ~2 units across just under the crown), so without this the top and
 * bottom of the sphere collapse into flat discs — a bucket, not a head.
 */
function poleClosure(y: number): number {
  const a = (Math.abs(y) - 0.78) / 0.22;
  if (a <= 0) return 1;
  // An elliptical cap, so the last 16% rolls off the way a sphere's pole does
  // instead of tapering to a spike.
  return Math.sqrt(Math.max(0, 1 - a * a));
}

function makeCranium(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 144, 104);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Sphere cross-section radius at this height.
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const close = poleClosure(y);
    const width = sampleProfile(WIDTH_PROFILE, y) * close;
    const depth = sampleProfile(DEPTH_PROFILE, y) * close;

    // Normalise the horizontal direction so the profiles fully define the shape.
    const dirX = r > 1e-6 ? x / r : 0;
    const dirZ = r > 1e-6 ? z / r : 0;

    let nx = dirX * width;
    let nz = dirZ * depth;

    // Flatten the back of the skull.
    if (nz < 0) nz *= 1 - 0.18 * Math.min(1, -nz) * Math.min(1, -nz);

    // Park the face plane well behind the mask, which curves back to z ~ 0
    // around |x| = 6.5, so the mask always occludes the head.
    if (nz > 0.28) {
      const t = Math.min(1, (nz - 0.28) / 0.72);
      nz -= 0.34 * t;
    }

    // Cheekbones: a little lateral and forward structure.
    const cheek = Math.exp(-((y - 0.05) ** 2) / 0.045 - ((Math.abs(dirX) - 0.66) ** 2) / 0.06);
    nx += Math.sign(dirX) * cheek * 0.035;
    nz += cheek * 0.045;

    // Chin: a forward point, narrowed laterally.
    const chin = Math.exp(-(((y + 0.82) ** 2) / 0.02 + (x * x) / 0.05));
    nz += chin * 0.12;
    nx *= 1 - chin * 0.24;

    // Brow ridge, so the eyes sit in a shadowed recess.
    const brow = Math.exp(-(((y - 0.28) ** 2) / 0.012 + (x * x) / 0.3));
    nz += brow * 0.05;

    pos.setXYZ(i, nx, y, nz);
  }

  geo.scale(HEAD.halfWidth, HEAD.halfHeight, HEAD.halfDepth);
  geo.translate(HEAD.centre.x, HEAD.centre.y, HEAD.centre.z);
  geo.computeVertexNormals();
  return geo;
}

function makeNeck(): THREE.BufferGeometry {
  const top = HEAD.centre.y - HEAD.halfHeight * 0.60;
  const bottom = top - 13;
  const geo = new THREE.CylinderGeometry(
    HEAD.halfWidth * 0.44,
    HEAD.halfWidth * 0.55,
    top - bottom,
    48,
    12,
    true,
  );
  geo.translate(0, (top + bottom) / 2, HEAD.centre.z - 1.2);
  // Lean the neck slightly back for a natural bust silhouette.
  geo.rotateX(-0.06);
  geo.computeVertexNormals();
  return geo;
}

function makePedestal(): THREE.BufferGeometry {
  const top = HEAD.centre.y - HEAD.halfHeight - 22;
  const h = 3;
  const geo = new THREE.CylinderGeometry(13.5, 15, h, 64, 2, false);
  geo.translate(0, top - h / 2, HEAD.centre.z - 2);
  geo.computeVertexNormals();
  return geo;
}

export type Mannequin = {
  group: THREE.Group;
  /** Rotates with the head pose; the mask plate is *not* in here. */
  poseGroup: THREE.Group;
  setMaterial(material: THREE.Material): void;
  /** Development aid: show only the cranium. */
  setParts(opts: { cranium?: boolean; neck?: boolean; pedestal?: boolean }): void;
  dispose(): void;
};

/**
 * Builds the bust. `poseGroup` is what you rotate to make the whole solid head
 * follow the user's head movement.
 */
export function createMannequin(): Mannequin {
  const root = new THREE.Group();
  const poseGroup = new THREE.Group();

  // Typed as plain Mesh so any material can be swapped in per experience.
  const cranium: THREE.Mesh = new THREE.Mesh(makeCranium(), new THREE.MeshStandardMaterial());
  const neck: THREE.Mesh = new THREE.Mesh(makeNeck(), new THREE.MeshStandardMaterial());
  const pedestal: THREE.Mesh = new THREE.Mesh(makePedestal(), new THREE.MeshStandardMaterial());
  const geometries = [cranium.geometry, neck.geometry, pedestal.geometry];

  poseGroup.add(cranium, neck);
  // The pedestal is part of the world, not the head.
  root.add(poseGroup, pedestal);

  const meshes = [cranium, neck, pedestal];

  return {
    group: root,
    poseGroup,
    setMaterial(material) {
      for (const m of meshes) m.material = material;
    },
    setParts(opts) {
      if (opts.cranium !== undefined) cranium.visible = opts.cranium;
      if (opts.neck !== undefined) neck.visible = opts.neck;
      if (opts.pedestal !== undefined) pedestal.visible = opts.pedestal;
    },
    dispose() {
      for (const g of geometries) g.dispose();
    },
  };
}

/**
 * The bust's surface: a matte sculpted material with a fresnel rim so the
 * silhouette stays readable against a dark backdrop.
 */
export function createBustMaterial(options: {
  colour?: THREE.ColorRepresentation;
  rim?: THREE.ColorRepresentation;
  rimStrength?: number;
} = {}) {
  const colour = new THREE.Color(options.colour ?? 0x2a2b33);
  const rim = new THREE.Color(options.rim ?? 0x9fb4ff);
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.82,
    metalness: 0.06,
    emissive: rim.clone().multiplyScalar(0.05 * (options.rimStrength ?? 1)),
    flatShading: false,
  });
}
