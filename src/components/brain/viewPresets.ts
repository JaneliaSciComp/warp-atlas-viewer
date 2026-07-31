/** Camera framing and the mapZebrain view-orientation presets.
 *
 *  All vectors are in WORLD space, whose axes volumeTransform.ts derives:
 *  +X is rostral, ±Y are the lateral axes, +Z is dorsal.
 *
 *  mapZebrain's own presets are hardcoded quaternions in its camera frame
 *  (up = (0,-1,0), AP sign opposite to ours, and no equivalent of our volume
 *  group transform). Porting those numbers would be both wrong and opaque, so
 *  these are derived from the axis convention instead.
 */

/** Vertical field of view of the 3D viewer's camera, in degrees. Also the
 *  Canvas `fov` prop — keep them from drifting by importing this. */
export const VIEWER_FOV_DEG = 45;

/** Camera distance at which `extent` exactly fills the vertical field of
 *  view, times a margin.
 *
 *  Needed because three's fov is the VERTICAL fov. Warp's normal default
 *  distance (span * 0.95) framed the brain's 784-unit rostro-caudal extent
 *  horizontally across a wide panel. Embedded mode rolls that extent
 *  vertical, where span * 0.95 clips the rostral and caudal tips.
 */
export function fitDistance(extent: number, fovDeg = VIEWER_FOV_DEG, margin = 1.05): number {
  return (extent / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)) * margin;
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
  /** Camera up vector, world space. */
  up: [number, number, number];
}

/** In mapZebrain's icon-bar order.
 *
 *  "Vertical" means rostral-up (up along world +X); "horizontal" means
 *  dorsal-up (up along world +Z) — mapZebrain's naming. Coronal views from
 *  the rostral side, as mapZebrain's does.
 *
 *  Which of ±Y is the animal's left is NOT derivable: the brain is near
 *  bilaterally symmetric and the volume group transform is a mirror. The
 *  left/right labels here are provisional and must be confirmed against the
 *  icon artwork in the browser; if they are swapped, swap the two `dir`
 *  signs in each sagittal pair.
 */
export const VIEW_PRESETS: ViewPreset[] = [
  { key: 'dorsal', label: 'Dorsal', dir: [0, 0, 1], up: [1, 0, 0] },
  { key: 'ventral', label: 'Ventral', dir: [0, 0, -1], up: [1, 0, 0] },
  {
    key: 'sagittalVerticalLeft',
    label: 'Sagittal (vertical-left)',
    dir: [0, -1, 0],
    up: [1, 0, 0],
  },
  {
    key: 'sagittalVerticalRight',
    label: 'Sagittal (vertical-right)',
    dir: [0, 1, 0],
    up: [1, 0, 0],
  },
  {
    key: 'sagittalHorizontalLeft',
    label: 'Sagittal (horizontal-left)',
    dir: [0, -1, 0],
    up: [0, 0, 1],
  },
  {
    key: 'sagittalHorizontalRight',
    label: 'Sagittal (horizontal-right)',
    dir: [0, 1, 0],
    up: [0, 0, 1],
  },
  { key: 'coronal', label: 'Coronal', dir: [1, 0, 0], up: [0, 0, 1] },
];

/** Embedded mode opens on mapZebrain's default: dorsal, brain vertical,
 *  rostral up. */
export const EMBEDDED_DEFAULT_PRESET: ViewPreset = VIEW_PRESETS[0];

export function presetPosition(
  preset: ViewPreset,
  distance: number,
): [number, number, number] {
  return [preset.dir[0] * distance, preset.dir[1] * distance, preset.dir[2] * distance];
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
