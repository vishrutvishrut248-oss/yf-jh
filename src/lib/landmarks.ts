/**
 * MediaPipe face landmark topology, index groups and blendshape vocabulary.
 *
 * Landmarks 0..467 map 1:1 onto the canonical mesh. 468..477 are iris
 * refinement points added by the FaceLandmarker (no canonical vertex).
 *
 * NOTE on left/right: MediaPipe labels these from the *subject's* point of
 * view, so `LEFT_EYE` appears on the right-hand side of an unmirrored image.
 */

export const IRIS_LEFT = 468;
export const IRIS_RIGHT = 473;

/** Closed contour of the face — used for alpha-clipping a mask to the face. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54,
  103, 67, 109,
];

export const LEFT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
export const RIGHT_EYE = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
];

/** Upper + lower lid midpoints, handy for blink-driven effects. */
export const LEFT_EYE_TOP = 159;
export const LEFT_EYE_BOTTOM = 145;
export const RIGHT_EYE_TOP = 386;
export const RIGHT_EYE_BOTTOM = 374;

export const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39,
  40, 185,
];
export const LIPS_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81,
  80, 191,
];

export const LEFT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
export const RIGHT_BROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];

export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1, 2];
export const NOSE_TIP = 4;
export const NOSE_BOTTOM = 2;
export const CHIN = 152;
export const FOREHEAD_TOP = 10;
export const MOUTH_CENTER = 13;

/** Both irises + surrounding ring, as a group. */
export const IRIS_GROUP = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];

/**
 * The 52 ARKit-style blendshape channels the FaceLandmarker reports, in the
 * order MediaPipe emits them. Stable string keys let effects subscribe to a
 * single expression without hard-coding array offsets.
 */
export const BLENDSHAPES = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const;

export type BlendshapeName = (typeof BLENDSHAPES)[number];

/** A lookup of blendshape name -> 0..1 activation, rebuilt each frame. */
export type BlendshapeMap = Record<string, number>;
