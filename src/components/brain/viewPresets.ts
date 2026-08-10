/** Camera framing and the mapZebrain view-orientation presets.
 *
 *  All vectors are in WORLD space, whose axes volumeTransform.ts derives:
 *  +X is rostral, ±Y are the lateral axes, +Z is dorsal.
 *
 *  mapZebrain's own presets are hardcoded camera positions in its voxel frame
 *  (x = LR, y = AP caudal-positive, z = DV), which our world frame is a pure
 *  90° rotation of: world = (−y, x, z). Both spaces are mapZebrain voxel
 *  units, so their distances transfer directly. The directions below are the
 *  rotated form of web-gl.service.ts:696-781, axis-snapped — several of theirs
 *  carry a few degrees of tilt and roll from having been saved off a hand-
 *  positioned camera.
 */

/** Vertical field of view of the 3D viewer's camera, in degrees. Also the
 *  Canvas `fov` prop — keep them from drifting by importing this. */
export const VIEWER_FOV_DEG = 45;

/** Where mapZebrain frames its 3D view, in our world coordinates: the
 *  bounding-box centre of the whole-brain outline mesh.
 *
 *  mapZebrain subtracts this point from every mesh it draws and then always
 *  targets the world origin (brain.service.ts:137-147, web-gl.service.ts:403),
 *  so it is the point every one of its seven orientation buttons orbits and
 *  centres. We instead centre our data on the cell cloud's *mean*, which is
 *  46.6 units rostral, 6.9 lateral and 40.7 dorsal of it — the discrepancy the
 *  embedded view used to paper over with a fixed upward screen nudge. A screen
 *  nudge could only ever be right for the views where the discrepancy happens
 *  to be vertical; in the horizontal-sagittal pair it is sideways and in the
 *  coronal view it is depth. Moving the orbit target is right in all seven.
 *
 *  Emitted by scripts/fetch_meshes.py as the outline's `worldCenter` in
 *  meshes.json (a literal here rather than a manifest read because the camera
 *  default is needed at mount, and the meshes load lazily).
 *
 *  Deliberately NOT included: mapZebrain also shifts its meshes another 100
 *  units caudally ("without an additional 100 pixels ... the lower part of the
 *  brain would become hidden"). That compensates for its canvas being sized to
 *  the whole window while sitting ~115px down the page under a header and its
 *  icon row, so the bottom of the render is cropped by the viewport. Ours is
 *  sized to its container, so copying the number would just push the brain
 *  8% of the frame height too high.
 */
export const MZ_REFERENCE_CENTER: [number, number, number] = [-46.64, -6.94, -40.73];

/** Half of the outline mesh's largest span (the rostro-caudal one), about
 *  MZ_REFERENCE_CENTER. The framing basis for embedded mode, replacing the
 *  cell bounds: the outline is on by default there and is the larger object,
 *  reaching ~499 units caudally against the cells' ~416, because it includes
 *  the spinal-cord stub the recording does not cover. Same provenance as
 *  MZ_REFERENCE_CENTER. */
export const MZ_REFERENCE_HALF_SPAN = 452.56;

/** Margin on the embedded framing distance.
 *
 *  fitDistance's bound is linear — it compares world extents against the
 *  frustum half-height at the target plane — so it ignores that geometry
 *  dorsal of that plane is nearer the camera and magnified. Projecting every
 *  outline vertex through all seven presets, the binding case is the vertical
 *  sagittal pair, which needs 1.118× the linear distance before the snout and
 *  the spinal stub both stay inside the frame. This rounds that up.
 */
export const EMBEDDED_FIT_MARGIN = 1.15;

/** Camera distance at which `halfExtent` exactly fills half the vertical
 *  field of view, times a margin.
 *
 *  Needed because three's fov is the VERTICAL fov. Warp's normal default
 *  distance (span * 0.95) framed the brain's 784-unit rostro-caudal extent
 *  horizontally across a wide panel. Embedded mode rolls that extent
 *  vertical, where span * 0.95 clips the rostral and caudal tips.
 *
 *  This is a linear bound — see EMBEDDED_FIT_MARGIN for what it misses and
 *  what the embedded caller passes to cover it.
 */
export function fitDistance(
  halfExtent: number,
  fovDeg = VIEWER_FOV_DEG,
  margin = EMBEDDED_FIT_MARGIN,
): number {
  return (halfExtent / Math.tan(((fovDeg / 2) * Math.PI) / 180)) * margin;
}

export type ViewPresetKey =
  | 'dorsal'
  | 'ventral'
  | 'sagittalVerticalLeft'
  | 'sagittalVerticalRight'
  | 'sagittalHorizontalLeft'
  | 'sagittalHorizontalRight'
  | 'coronal';

export interface ViewPreset {
  key: ViewPresetKey;
  /** Tooltip / alt text. */
  label: string;
  /** Unit direction from the volume center to the camera, world space. */
  dir: [number, number, number];
  /** Camera up vector, world space. Need not be perpendicular to `dir` —
   *  three's lookAt projects out the parallel component — which is how the
   *  tilted ventral view keeps rostral-up without a second hand-set vector. */
  up: [number, number, number];
  /** Multiplier on the framing distance, for the views mapZebrain itself
   *  parks further back. Omitted means 1. */
  distanceScale?: number;
}

/** How much further back the four rostral-up ("portrait") views sit.
 *
 *  mapZebrain's own saved cameras are 800 units out for the dorsal-up views
 *  and 905-923 for the vertical sagittal pair, i.e. it backs off when the
 *  brain's long axis runs up the screen. Matched here by eye against its 3D
 *  view rather than by porting those numbers, because the two fields of view
 *  differ — see the note below — so equal distances do not mean equal framing.
 */
const PORTRAIT_DISTANCE_SCALE = 1.08;

// WHY THESE CANNOT BE PIXEL-IDENTICAL TO mapZEBRAIN'S. Its camera is a 75°
// vertical fov; ours is 45° (VIEWER_FOV_DEG). Silhouette scale can always be
// matched by moving the camera — that is what PORTRAIT_DISTANCE_SCALE and the
// framing distance do — but foreshortening cannot: at 75° you see further
// "around" the near face of the brain at the same framing. The tilt on the
// ventral preset below is the visible consequence. Matching exactly would mean
// rendering embedded mode at 75°, which also needs the point-size attenuation
// constant in zoomSizing.ts rescaled by tan(22.5°)/tan(37.5°) — the shaders
// size points from camera distance alone, with no fov term, so every point
// would otherwise jump ~1.5× the moment the fov changed.

/** In mapZebrain's icon-bar order.
 *
 *  "Vertical" means rostral-up (up along world +X); "horizontal" means
 *  dorsal-up (up along world +Z) — mapZebrain's naming. Coronal views from
 *  the rostral side, as mapZebrain's does.
 *
 *  Which of ±Y each sagittal button views from is taken from mapZebrain's own
 *  camera positions, rotated into our frame. Note that this makes its two
 *  "left" buttons view the brain from OPPOSITE sides: vertical-left sits at
 *  x = −905 and horizontal-left at x = +848 in its frame. That is mapZebrain's
 *  inconsistency, not a transcription error, and it is reproduced deliberately
 *  — a user clicking the same glyph in the host page and in the embedded
 *  viewer should get the same picture. Nothing else can settle it: the brain is
 *  near bilaterally symmetric, and the vertical glyphs are rostral-up, so their
 *  artwork is mirror-symmetric and cannot show which side faces the camera.
 */
export const VIEW_PRESETS: ViewPreset[] = [
  {
    key: 'dorsal',
    label: 'Dorsal',
    dir: [0, 0, 1],
    up: [1, 0, 0],
    distanceScale: PORTRAIT_DISTANCE_SCALE,
  },
  {
    key: 'ventral',
    label: 'Ventral',
    // Tilted 18.9° caudally rather than straight up the ventral axis, so the
    // caudal face is visible the way mapZebrain's ventral button shows it (its
    // own camera carries an 11.6° tilt, which reads as a deeper one through its
    // wider fov). up stays rostral; lookAt orthogonalises it to (0.946, 0,
    // -0.324), matching mapZebrain's saved up vector for this view.
    dir: [-0.3239174, 0, -0.9460854],
    up: [1, 0, 0],
    distanceScale: PORTRAIT_DISTANCE_SCALE,
  },
  {
    key: 'sagittalVerticalLeft',
    label: 'Sagittal (vertical-left)',
    dir: [0, -1, 0],
    up: [1, 0, 0],
    distanceScale: PORTRAIT_DISTANCE_SCALE,
  },
  {
    key: 'sagittalVerticalRight',
    label: 'Sagittal (vertical-right)',
    dir: [0, 1, 0],
    up: [1, 0, 0],
    distanceScale: PORTRAIT_DISTANCE_SCALE,
  },
  {
    key: 'sagittalHorizontalLeft',
    label: 'Sagittal (horizontal-left)',
    dir: [0, 1, 0],
    up: [0, 0, 1],
  },
  {
    key: 'sagittalHorizontalRight',
    label: 'Sagittal (horizontal-right)',
    dir: [0, -1, 0],
    up: [0, 0, 1],
  },
  { key: 'coronal', label: 'Coronal', dir: [1, 0, 0], up: [0, 0, 1] },
];

/** Embedded mode opens on mapZebrain's default: dorsal, brain vertical,
 *  rostral up. */
export const EMBEDDED_DEFAULT_PRESET: ViewPreset = VIEW_PRESETS[0];

/** Camera position for a preset: `distance` (times the preset's own scale) out
 *  from `center` along its direction. `center` is the orbit target, which
 *  embedded mode moves to MZ_REFERENCE_CENTER — pass the same value the camera
 *  targets or the view lands off-axis. */
export function presetPosition(
  preset: ViewPreset,
  distance: number,
  center: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const d = distance * (preset.distanceScale ?? 1);
  return [
    center[0] + preset.dir[0] * d,
    center[1] + preset.dir[1] * d,
    center[2] + preset.dir[2] * d,
  ];
}

/** Whether the camera is sitting exactly on its default view.
 *
 *  Extracted as a pure function because the default up vector is now
 *  mode-dependent (landscape (0,1,0) normally, portrait (1,0,0) embedded), and
 *  a hardcoded comparison was the bug this replaces.
 *
 *  posEps absorbs trackball damping residue, which can leave sub-unit error
 *  after a snap — exact equality would keep reporting "moved" for ~130 frames.
 */
export function isAtDefaultCamera({
  position,
  up,
  target,
  defaultPosition,
  defaultUp,
  volumeCenter,
  pan,
  posEps,
}: {
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  defaultPosition: [number, number, number];
  defaultUp: [number, number, number];
  volumeCenter: [number, number, number];
  pan: { x: number; y: number };
  posEps: number;
}): boolean {
  const UP_EPS = 1e-3;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(position[i] - defaultPosition[i]) >= posEps) return false;
    if (Math.abs(up[i] - defaultUp[i]) >= UP_EPS) return false;
    if (Math.abs(target[i] - volumeCenter[i]) >= posEps) return false;
  }
  return pan.x === 0 && pan.y === 0;
}
