# Maskroom

Wear any mask. Keep your face.

Upload a picture of a mask and it becomes a mask you can wear on camera — fitted
to real 3D face geometry, moving with your expressions. The camera feed is used
only to work out where your face is: it is never drawn on screen, never
recorded, and never sent anywhere.

---

## What it does

1. **You upload a mask picture.** A photo of a physical mask, a drawing, a PNG,
   an anime portrait — anything with a face in it.
2. **It finds the face.** 468 landmarks are detected in your image.
3. **It is warped onto the canonical face mesh.** Those 468 points have known UV
   coordinates, so the image is resampled into a texture atlas whose layout is
   exactly what the 3D mesh samples. That is what makes the mask deform.
4. **You wear it.** On camera, the same 468 points are tracked live (plus 52
   blendshapes), and the mesh is driven by them — so the mask's mouth opens when
   you open your mouth, its eyes shut when you blink, and it turns as you turn.

What you see on screen is a sculpted mannequin bust wearing your mask. Your own
face is never rendered.

## The experiences

Nine treatments, all applied to whatever you uploaded, all expression-aware:

| | |
|---|---|
| **Archival** | The mask exactly as uploaded |
| **Bronze** | Cast in weathered metal |
| **Neon** | Outline traced in light, from the artwork's own edges |
| **Hologram** | Unstable projection with scanlines |
| **Shattered** | Held together, barely |
| **Molten** | Still cooling — flowing heat driven by luminance |
| **Porcelain** | Cracked, and smiling about it |
| **Spirit** | Eyes flare when you blink, lips glow when you speak |
| **X-Ray** | Structure, not surface |

Privacy is a feature, not a disclaimer: **Tracking** tab shows the live numbers
the app derives from the camera, so you can see that only geometry leaves it.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm install` is followed automatically by `npm run vendor`, which copies the
face-tracking runtime out of `node_modules` and into `public/` so the app is
fully self-hosted and works offline.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run typecheck
```

### Camera permissions

Browsers block camera access inside cross-origin iframes unless the embedding
page allows it. If you are viewing this in an embedded preview and the camera is
refused, the app says so and offers an **Open in new tab** button — camera
access works normally in a top-level tab.

---

## How it works

```
upload                      live
──────                      ────
bakeAtlas()                 FaceLandmarker (MediaPipe, on-device)
  detect 468 landmarks        478 landmarks · 52 blendshapes
  piecewise-affine warp       │
  → 1024² canonical atlas     ▼
                            vertex placement: x/y from landmarks,
                            z from the canonical profile swept by head pose
                            │
                            ▼
                            mannequin bust + mask plate → expression shader
```

### The canonical face mesh

`src/lib/canonicalFace.json` holds 468 vertices (position + UV, packed), 898
triangles and their UVs. It was extracted from MediaPipe's own
`geometry_pipeline_metadata_landmarks.binarypb`, which ships inside the
FaceLandmarker `.task` bundle (`field 3` = packed `x,y,z,u,v` floats,
`field 4` = the index buffer, plus the Procrustes basis for `field 2`).

Both the extracted UVs and an independent public copy
(`@tensorflow-models/facemesh`'s `uv_coords.js`) agree to six decimal places
across all 468 points, so the atlas layout is the one MediaPipe's own geometry
pipeline uses.

### The warp

`bakeAtlas()` resamples the uploaded image with a piecewise-affine map over the
mesh's 898 triangles, written pixel by pixel with barycentric weights.

This matters: the obvious implementation — clip to the destination triangle,
apply the inverse affine transform, `drawImage` — silently loses most of the
mesh. Canvas clipping is antialiased and state-heavy, and across 898
save/clip/transform/restore cycles only ~35% of the face survived (measured with
a per-vertex round-trip test: 16 of 468 vertices landed where they should). The
direct rasteriser gets 441/468, with the remainder explained by overlapping
markers in dense regions. Bilinear sampling keeps it smooth, and neighbouring
triangles share edges bit-for-bit so there are no seams.

The face silhouette is not guessed from the mesh boundary either: the canonical
UV layout is a full *head* unwrap spanning the whole atlas, so its boundary is
the skull, not a face. `rasteriseAlpha()` instead interpolates each texel's
canonical (x, y) position and tests it against the real jaw contour.

### The 3D head

The bust is generated procedurally from two spline profiles (lateral width and
front-to-back depth against height) plus a pole closure that rolls the crown and
chin off like a sphere. Its dimensions are chosen from the mask's own depth
profile: the mask sheet curves back to z ≈ 0 around |x| = 6.5, so the skull's
front surface is parked just behind that, and a mask meets the head cleanly at
its silhouette instead of floating in front of it.

Vertex placement is split deliberately:

- **x and y** come straight from the live landmarks, anchored to the eye
  midpoint and scaled by inter-ocular distance. Expression-accurate by
  construction, and stable in frame.
- **z** comes from the canonical depth profile, swept by the estimated head yaw
  and pitch — the nose gains real parallax as the head turns, so the surface
  reads as curved rather than pasted on.
- **yaw, pitch, roll** are estimated from landmark geometry (nose position
  relative to the eye line, nose height between eye line and chin, eye-line
  angle) and rotate the bust, so the solid head follows along.

Getting this wrong is easy and it was wrong at first: MediaPipe normalises x by
frame width and y by frame height, so mixing the two stretches everything by the
camera's aspect ratio. The mask came out 12.8 × 25.9 instead of 15.5 × 17.7 —
exactly 16:9. Everything works in image-height units now.

---

## Assets

`vendor/face_landmarker.task` (3.6 MB) is MediaPipe's FaceLandmarker bundle:
the face detector, the 468-point landmark model and the blendshape model. It is
committed so the app never depends on a CDN at runtime.

The 11 MB SIMD WebAssembly runtime is copied from `@mediapipe/tasks-vision` at
install time and is gitignored, because it is reproducible.

Everything runs on-device. There is no backend, no analytics and no network
traffic after the page loads.

## Development harnesses

`dev/` holds standalone pages used while building this, served by the dev server:

- `dev/face-preview.html?src=/test-assets/anime-portrait.png&exp=neon` — renders
  a mask on the mesh and draws the baked atlas, with no camera needed.
  Query params: `exp`, `jaw`, `clip`, `cover`, `bust`, `mask`, `cranium`,
  `neck`, `ped`.
- `dev/roundtrip-test.html` — paints a uniquely coloured dot at every landmark,
  bakes, and reads back each vertex's colour to verify the warp. Reports how
  many of the 468 vertices land where they should.
- `dev/detect-test.html?src=…` — reports whether a face is detectable in an
  image, and how much of the atlas the bake covers.

## Layout

```
src/lib/canonicalFace.ts    the canonical mesh (468 / 898) + triangle helpers
src/lib/canonicalFace.json  extracted vertex, UV and index data
src/lib/landmarks.ts        landmark index groups, blendshape vocabulary
src/lib/faceTracker.ts      MediaPipe wrapper: video and still-image modes
src/lib/maskBaker.ts        the warp, the alpha rasteriser, background removal
src/lib/useCamera.ts        camera lifecycle + permission error handling
src/lib/useFacePipeline.ts  camera → tracker → stage, and the frame loop
src/three/mannequin.ts      procedural bust
src/three/experiences.ts    the nine shader treatments
src/three/stage.ts          placement, lighting, rendering, snapshots
src/components/             UI
scripts/vendor-assets.mjs   copies the runtime out of node_modules
```

## Known limitations

- One face at a time.
- Very dark or heavily occluded faces are not tracked reliably; this is a
  limitation of the landmark model, not of the warp.
- `removeBackground` only fires when the image border is genuinely uniform, so
  product shots on white work and busy photos are left alone.
- The mask plate is a thin shell, not a volume — from an extreme side-on view
  you can see it is a surface.
