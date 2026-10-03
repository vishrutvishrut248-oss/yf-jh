# Third-party notices

## MediaPipe Face Landmarker

`vendor/face_landmarker.task` is redistributed from Google's MediaPipe
Face Landmarker (`google-ai-edge/mediapipe`). It bundles:

- `face_detector.tflite` — short-range face detection
- `face_landmarks_detector.tflite` — 478-point face landmark model
- `face_blendshapes.tflite` — 52 ARKit-style expression channels
- `geometry_pipeline_metadata_landmarks.binarypb` — the canonical face mesh
  (468 vertices, 898 triangles), its UV layout and the Procrustes basis

`src/lib/canonicalFace.json` is extracted from that last file.

Licensed under the Apache License, Version 2.0.
<https://www.apache.org/licenses/LICENSE-2.0>

## @mediapipe/tasks-vision

The face-tracking runtime (`vision_bundle`, and the WebAssembly modules copied
into `public/mediapipe/` by `scripts/vendor-assets.mjs`) is redistributed from
the `@mediapipe/tasks-vision` npm package.

Licensed under the Apache License, Version 2.0.

## three.js

Licensed under the MIT License.

## React

Licensed under the MIT License.

---

The canonical mesh data was cross-validated against the `uv_coords.js` table in
`@tensorflow-models/facemesh` (Apache-2.0), which agrees with the extracted UVs
to six decimal places across all 468 points.
