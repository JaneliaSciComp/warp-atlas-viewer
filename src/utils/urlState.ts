// URL-state serializer: persists the user-visible view state into the
// URL hash so a copy/paste reproduces the exact view someone else is
// looking at. Format mirrors Neuroglancer's `#!{json}` convention.
//
// Two design choices keep the URL tractable:
//   1. Anything at its default value is dropped from the JSON, so a
//      fresh-load app keeps an empty hash. The one exception is
//      `stimMode: "off"` when stimuli are selected, which preserves the
//      distinction between new no-filter links and older positive-filter
//      links that predate the explicit mode field.
//   2. Lasso selections are stored as polygon vertices (in t-SNE data
//      coords), not as the resulting cell indices — typical lasso has
//      30-150 vertices regardless of how many cells fall inside, so
//      the URL stays small. Decoder re-runs point-in-polygon to derive
//      indices.

import type {
  ColorMode,
  FilterState,
  GeneLogic,
  GeneMultiColor,
  GeneScale,
  GeneThresholdMode,
  NeuronDataset,
  RegionPalette,
  SettingsState,
  StimLogic,
  StimMode,
  SwimMode,
  TxMode,
} from '../data/types';

// Persisted 3D camera pose.
//
// v3 (current): { dist, az, el, pan? } — semantic twist-free orbit
//   state. The camera always orbits VOLUME_CENTER, so no target is
//   serialized. `az` and `el` are radians; the renderer reconstructs
//   camera position and up vector from spherical coords each frame.
//   Roll is structurally impossible (the controller is twist-free), so
//   the entire camera pose is captured by three scalars plus optional
//   screen pan.
//
// v2 (legacy): { pos, quat, pan? } — explicit quaternion from the
//   previous TrackballControls renderer. The decoder converts to v3 by
//   extracting az/el/dist from `pos` (with target at the origin) and
//   discarding `quat`. Any roll baked into old links is lost — that's
//   acceptable in exchange for the v3 schema's stability.
//
// v1 (legacy): { pos, target, pan? } — oldest format. Decoder converts
//   to v3 the same way as v2; `target` is required to validate but
//   ignored thereafter (the point cloud is always centered at the
//   origin, so a non-zero target field was misleading).
//
// `validateCamera` accepts any of the three shapes. New emissions are
// always v3.
export interface CameraState {
  /** Camera-to-target distance (v3). */
  dist?: number;
  /** Azimuth in radians, rotation around world Y. 0 ⇒ camera on +Z (v3). */
  az?: number;
  /** Elevation in radians from the equator. 0 ⇒ horizontal, +π/2 ⇒
   *  camera straight above the volume looking down (v3). */
  el?: number;
  /** Legacy camera position in world coords (v1/v2). */
  pos?: [number, number, number];
  /** Legacy camera quaternion (v2 only). Discarded during conversion. */
  quat?: [number, number, number, number];
  /** Legacy orbit target (v1 only). Discarded during conversion — the
   *  point cloud is always centered at the origin. */
  target?: [number, number, number];
  /** Screen-space viewer pan in CSS pixels. Positive x/y move the
   *  volume right/down in the viewport without changing the orbit. */
  pan?: [number, number];
}

export interface UmapViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PersistedState {
  filter?: Partial<FilterState>;
  settings?: Partial<SettingsState>;
  focusedNeuron?: number;
  detail?: boolean;
  bottom?: boolean;
  /** Height of the bottom panel in pixels. Persisted so a share link
   *  reproduces the original layout, and so collapse → re-expand
   *  restores the last dragged size instead of the default. */
  bottomHeight?: number;
  /** Width of the right detail panel in pixels. Same persistence
   *  reasoning as bottomHeight. */
  detailWidth?: number;
  camera?: CameraState;
  umap?: UmapViewport;
  /** Activity playback speed multiplier (1, 2, 10, 50, 100). The
   *  current value is persisted (omitted when at the 10× default) so a
   *  recorded view plays at the same speed on the receiving end.
   *  `activityPlaying` itself is intentionally NOT persisted — a share
   *  link should land paused so the recipient sees the same frame, not
   *  a moving picture. */
  activitySpeed?: number;
  /** Lasso polygon vertices in t-SNE data coords, flat array
   *  [x0,y0,x1,y1,...]. Decoder re-derives the cell indices via
   *  point-in-polygon, so the URL stays small (~30-150 vertices)
   *  regardless of how many cells the lasso enclosed. */
  lasso?: number[];
}

/** Round each polygon vertex to 3 decimal places — t-SNE values are
 *  typically in the tens, so 3 decimals is well under the inter-cell
 *  spacing while keeping each number ~5 chars in JSON. */
export function roundLasso(poly: Float32Array): number[] {
  const out = new Array<number>(poly.length);
  for (let i = 0; i < poly.length; i++) {
    out[i] = Math.round(poly[i] * 1000) / 1000;
  }
  return out;
}

export function encodeHash(state: PersistedState): string {
  const trimmed: PersistedState = {};
  for (const [k, v] of Object.entries(state) as Array<[keyof PersistedState, unknown]>) {
    if (v == null) continue;
    if (typeof v === 'string' && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (trimmed as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(trimmed).length === 0) return '';
  return '#!' + encodeURIComponent(JSON.stringify(trimmed));
}

export function decodeHash(hash: string): PersistedState | null {
  if (!hash.startsWith('#!')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(hash.slice(2)));
  } catch (err) {
    console.warn('[urlState] failed to parse URL hash, ignoring:', err);
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return validatePersisted(parsed as Record<string, unknown>);
}

// ── Runtime schema validation ────────────────────────────────────────
//
// The URL hash is hostile input — a user pasting a stale or hand-edited
// share link can put arbitrary values into our state. Without runtime
// validation, an out-of-range value like `selectedGenes: [999]` would
// walk past the end of a typed array, NaN through plasma(), and throw
// inside sampleStops. The validators below drop malformed fields
// silently — the merged state falls back to its default where the URL
// value was unusable.
//
// Note: these checks are SCHEMA-LEVEL only (types/enums/finite numbers).
// Index bounds that depend on the loaded dataset (gene/stim/cluster
// arity, count, traceLength, …) are enforced separately by
// sanitizeAgainstDataset below, called after `data` resolves.

const COLOR_MODES = new Set<ColorMode>(['highlight', 'region', 'gene', 'stim', 'swim', 'activity', 'fish']);
const GENE_SCALES = new Set<GeneScale>(['log', 'linear']);
const REGION_PALETTES = new Set<RegionPalette>(['nipy_spectral', 'turbo', 'distinct']);
const TX_MODES = new Set<TxMode>(['all', 'gene', 'subtype']);
const GENE_LOGICS = new Set<GeneLogic>(['or', 'and']);
const STIM_LOGICS = new Set<StimLogic>(['or', 'and']);
const STIM_MODES = new Set<StimMode>(['off', 'positive', 'negative', 'both']);
const SWIM_MODES = new Set<SwimMode>(['off', 'positive', 'negative', 'both']);
const GENE_MULTI_COLORS = new Set<GeneMultiColor>(['max', 'sum', 'richness']);
const GENE_THRESHOLD_MODES = new Set<GeneThresholdMode>(['paper', 'global']);

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInt(v: unknown): v is number {
  return Number.isInteger(v);
}
function isString<T extends string>(v: unknown, allowed: Set<T>): v is T {
  return typeof v === 'string' && allowed.has(v as T);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Validate + clean an unknown blob into a Partial<FilterState>. Keys
 *  with malformed values are dropped (not defaulted) so the caller's
 *  spread merge falls back to the app default. */
function validateFilter(raw: unknown): Partial<FilterState> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const f = raw as Record<string, unknown>;
  const out: Partial<FilterState> = {};
  if (isString(f.colorMode, COLOR_MODES)) out.colorMode = f.colorMode;
  if (isString(f.geneScale, GENE_SCALES)) out.geneScale = f.geneScale;
  if (typeof f.showUnassignedRegion === 'boolean') out.showUnassignedRegion = f.showUnassignedRegion;
  if (isString(f.regionPalette, REGION_PALETTES)) out.regionPalette = f.regionPalette;
  if (isInt(f.isolatedRegion) && f.isolatedRegion >= -1) out.isolatedRegion = f.isolatedRegion;
  if (isInt(f.isolatedFish) && f.isolatedFish >= -1) out.isolatedFish = f.isolatedFish;
  if (isString(f.txMode, TX_MODES)) out.txMode = f.txMode;
  if (Array.isArray(f.selectedGenes)) {
    const ids = f.selectedGenes.filter((x): x is number => isInt(x) && x >= 0);
    out.selectedGenes = Array.from(new Set(ids)).sort((a, b) => a - b);
  }
  if (isString(f.geneLogic, GENE_LOGICS)) out.geneLogic = f.geneLogic;
  if (isInt(f.selectedCluster) && f.selectedCluster >= 0) out.selectedCluster = f.selectedCluster;
  if (Array.isArray(f.selectedStimuli)) {
    const ids = f.selectedStimuli.filter((x): x is number => isInt(x) && x >= 0);
    out.selectedStimuli = Array.from(new Set(ids)).sort((a, b) => a - b);
  }
  if (isString(f.stimLogic, STIM_LOGICS)) out.stimLogic = f.stimLogic;
  if (isString(f.stimMode, STIM_MODES)) out.stimMode = f.stimMode;
  // Legacy hashes from before the explicit "no filter" default may contain
  // selected stimuli without a stimMode field. Those links meant "+ correlated"
  // because positive filtering was the app default at the time.
  if (
    out.selectedStimuli &&
    out.selectedStimuli.length > 0 &&
    !isString(f.stimMode, STIM_MODES)
  ) {
    out.stimMode = 'positive';
  }
  if (isString(f.swimMode, SWIM_MODES)) out.swimMode = f.swimMode;
  if (isInt(f.activitySample) && f.activitySample >= 0) out.activitySample = f.activitySample;
  return out;
}

/** Validate + clean an unknown blob into a Partial<SettingsState>.
 *  Numeric ranges are clamped to plausible windows so a hostile URL
 *  can't push the renderer into a state the UI can't reach. */
function validateSettings(raw: unknown): Partial<SettingsState> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const s = raw as Record<string, unknown>;
  const out: Partial<SettingsState> = {};
  // Stim cutoffs are magnitudes in [0, 1]; positive/negative sign is
  // represented by FilterState.stimMode.
  if (isFiniteNum(s.stimLo)) out.stimLo = clamp(s.stimLo, 0, 1);
  if (isFiniteNum(s.stimHi)) out.stimHi = clamp(s.stimHi, 0, 1);
  if (isFiniteNum(s.geneMaxSpots) && s.geneMaxSpots > 0) {
    out.geneMaxSpots = clamp(s.geneMaxSpots, 1, 100000);
  }
  if (isString(s.geneThresholdMode, GENE_THRESHOLD_MODES)) out.geneThresholdMode = s.geneThresholdMode;
  if (isFiniteNum(s.geneThresholdGlobal) && s.geneThresholdGlobal >= 1) {
    out.geneThresholdGlobal = clamp(Math.round(s.geneThresholdGlobal), 1, 100000);
  }
  if (isString(s.geneMultiColor, GENE_MULTI_COLORS)) out.geneMultiColor = s.geneMultiColor;
  if (isFiniteNum(s.pointSize) && s.pointSize > 0) out.pointSize = clamp(s.pointSize, 1, 50);
  if (isFiniteNum(s.umapPointSize) && s.umapPointSize > 0) out.umapPointSize = clamp(s.umapPointSize, 1, 50);
  if (isFiniteNum(s.umapGhostIntensity)) out.umapGhostIntensity = clamp(s.umapGhostIntensity, 0, 1);
  if (typeof s.ambientOcclusion === 'boolean') out.ambientOcclusion = s.ambientOcclusion;
  if (isFiniteNum(s.ambientOcclusionIntensity)) {
    out.ambientOcclusionIntensity = clamp(s.ambientOcclusionIntensity, 0, 0.4);
  }
  if (isFiniteNum(s.ambientOcclusionRadius)) {
    out.ambientOcclusionRadius = clamp(Math.round(s.ambientOcclusionRadius), 1, 72);
  }
  if (typeof s.opaqueActiveCells === 'boolean') out.opaqueActiveCells = s.opaqueActiveCells;
  if (isFiniteNum(s.activeBrightness)) out.activeBrightness = clamp(s.activeBrightness, 0, 1);
  // ΔF/F anchors. Negative lo is plausible (cells deflecting below
  // baseline); 10 is a generous upper bound for activityHi.
  if (isFiniteNum(s.activityLo)) out.activityLo = clamp(s.activityLo, -5, 10);
  if (isFiniteNum(s.activityHi)) out.activityHi = clamp(s.activityHi, -5, 10);
  if (isFiniteNum(s.swimLo)) out.swimLo = clamp(s.swimLo, 0, 1);
  if (isFiniteNum(s.swimHi)) out.swimHi = clamp(s.swimHi, 0, 1);
  if (isFiniteNum(s.ghostIntensity)) out.ghostIntensity = clamp(s.ghostIntensity, 0, 1);
  if (typeof s.autoSizing === 'boolean') out.autoSizing = s.autoSizing;
  if (typeof s.scaleByFilterCount === 'boolean') out.scaleByFilterCount = s.scaleByFilterCount;
  if (typeof s.debugMode === 'boolean') out.debugMode = s.debugMode;
  if (typeof s.fadeWeakCorrelation === 'boolean') out.fadeWeakCorrelation = s.fadeWeakCorrelation;
  return out;
}

function validateCamera(raw: unknown): CameraState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  // v3: { dist > 0, az, el }. dist is a magnitude so we reject ≤ 0;
  // az/el are unbounded (elevation past ±π/2 is the "unlimited
  // rotation" case past a pole).
  const hasV3 =
    isFiniteNum(c.dist) && c.dist > 0 && isFiniteNum(c.az) && isFiniteNum(c.el);
  // v1/v2: { pos } with either { quat } (v2) or { target } (v1).
  const hasPos =
    Array.isArray(c.pos) && c.pos.length === 3 && c.pos.every(isFiniteNum);
  const hasQuat =
    Array.isArray(c.quat) && c.quat.length === 4 && c.quat.every(isFiniteNum);
  const hasTarget =
    Array.isArray(c.target) && c.target.length === 3 && c.target.every(isFiniteNum);
  const hasV2 = hasPos && hasQuat;
  const hasV1 = hasPos && hasTarget;
  if (!hasV3 && !hasV2 && !hasV1) return undefined;
  const out: CameraState = {};
  if (hasV3) {
    out.dist = c.dist as number;
    out.az = c.az as number;
    out.el = c.el as number;
  } else if (hasPos) {
    const p = c.pos as number[];
    out.pos = [p[0], p[1], p[2]];
    if (hasQuat) {
      const q = c.quat as number[];
      out.quat = [q[0], q[1], q[2], q[3]];
    } else if (hasTarget) {
      const t = c.target as number[];
      out.target = [t[0], t[1], t[2]];
    }
  }
  if (Array.isArray(c.pan) && c.pan.length === 2 && c.pan.every(isFiniteNum)) {
    out.pan = [c.pan[0] as number, c.pan[1] as number];
  }
  return out;
}

function validateViewport(raw: unknown): UmapViewport | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  if (!isFiniteNum(v.zoom) || v.zoom <= 0) return undefined;
  if (!isFiniteNum(v.panX) || !isFiniteNum(v.panY)) return undefined;
  return { zoom: v.zoom, panX: v.panX, panY: v.panY };
}

function validateLasso(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length < 6 || raw.length % 2 !== 0) return undefined;
  if (!raw.every(isFiniteNum)) return undefined;
  return raw as number[];
}

function validatePersisted(raw: Record<string, unknown>): PersistedState {
  const out: PersistedState = {};
  if (raw.filter !== undefined) {
    const f = validateFilter(raw.filter);
    if (Object.keys(f).length > 0) out.filter = f;
  }
  if (raw.settings !== undefined) {
    const s = validateSettings(raw.settings);
    if (Object.keys(s).length > 0) out.settings = s;
  }
  if (isInt(raw.focusedNeuron) && raw.focusedNeuron >= 0) {
    out.focusedNeuron = raw.focusedNeuron;
  }
  if (typeof raw.detail === 'boolean') out.detail = raw.detail;
  if (typeof raw.bottom === 'boolean') out.bottom = raw.bottom;
  // Clamp to a generous window so a hostile URL can't pin a panel
  // off-screen or smaller than its content. App's drag handlers apply
  // the same bounds at runtime.
  if (isFiniteNum(raw.bottomHeight)) {
    out.bottomHeight = clamp(raw.bottomHeight, 120, 1200);
  }
  if (isFiniteNum(raw.detailWidth)) {
    out.detailWidth = clamp(raw.detailWidth, 240, 800);
  }
  const cam = validateCamera(raw.camera);
  if (cam) out.camera = cam;
  const vp = validateViewport(raw.umap);
  if (vp) out.umap = vp;
  // Playback speed: positive number, clamped to the practical range
  // the picker exposes (1×–100×). The picker discretizes to a fixed
  // set [1, 2, 10, 50, 100], but we accept any number in range so a
  // hand-edited URL with e.g. 25× still works and just doesn't match
  // a dropdown option.
  if (isFiniteNum(raw.activitySpeed) && raw.activitySpeed > 0) {
    out.activitySpeed = clamp(raw.activitySpeed, 0.1, 1000);
  }
  const lasso = validateLasso(raw.lasso);
  if (lasso) out.lasso = lasso;
  return out;
}

// ── Dataset-aware sanitization ───────────────────────────────────────
//
// Called once after `data` resolves to clamp index-typed state against
// the actual arity of the loaded dataset. A URL that was generated
// against a different dataset (different gene panel, different stimulus
// list, smaller cell count) would otherwise feed out-of-range indices
// into typed-array reads.

/** Unique fish ids present in the dataset, as a Set for O(1)
 *  membership tests. Built once per sanitize call — fishIds is a flat
 *  Uint8Array with no explicit unique list (cf. CodeReview §1.2). */
function fishIdSet(fishIds: Uint8Array): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < fishIds.length; i++) s.add(fishIds[i]);
  return s;
}

export function sanitizeFilterAgainstDataset(
  f: FilterState,
  data: NeuronDataset,
): FilterState {
  const G = data.geneNames.length;
  const C = data.clusterNames.length;
  const R = data.regionNames.length;
  const S = data.stimulusNames.length;
  const T = data.traceLength;
  const fishSet = fishIdSet(data.fishIds);
  return {
    ...f,
    isolatedRegion: f.isolatedRegion >= -1 && f.isolatedRegion < R ? f.isolatedRegion : -1,
    isolatedFish: f.isolatedFish === -1 || fishSet.has(f.isolatedFish) ? f.isolatedFish : -1,
    selectedGenes: f.selectedGenes.filter((g) => g >= 0 && g < G),
    selectedCluster: f.selectedCluster >= 0 && f.selectedCluster < C ? f.selectedCluster : 0,
    selectedStimuli: f.selectedStimuli.filter((s) => s >= 0 && s < S),
    activitySample: f.activitySample >= 0 && f.activitySample < T ? f.activitySample : 0,
  };
}

export function sanitizeFocusedNeuron(
  n: number | null,
  data: NeuronDataset,
): number | null {
  if (n === null) return null;
  return n >= 0 && n < data.count ? n : null;
}

/** Difference helpers: only fields that differ from the default end up
 *  in the URL. Keeps the share link readable for typical "small tweak"
 *  views and empty for an unmodified app. */
export function diffFilter(f: FilterState, def: FilterState): Partial<FilterState> {
  const out: Partial<FilterState> = {};
  for (const k of Object.keys(f) as Array<keyof FilterState>) {
    const a = f[k];
    const b = def[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length === b.length && a.every((v, i) => v === b[i])) continue;
    } else if (a === b) continue;
    (out as Record<string, unknown>)[k] = a;
  }
  if (
    f.selectedStimuli.length > 0 &&
    f.stimMode === 'off' &&
    def.stimMode === 'off'
  ) {
    out.stimMode = 'off';
  }
  return out;
}

export function diffSettings(s: SettingsState, def: SettingsState): Partial<SettingsState> {
  const out: Partial<SettingsState> = {};
  for (const k of Object.keys(s) as Array<keyof SettingsState>) {
    if (s[k] !== def[k]) (out as Record<string, unknown>)[k] = s[k];
  }
  return out;
}

/** Round a number to N decimal places — keeps camera/umap-viewport
 *  state from carrying 17 digits of float precision into the URL. */
function r(x: number, n = 3): number {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
}

// Camera fields use higher precision than the t-SNE viewport: scene
// coordinates span hundreds of units and the camera renders at zoom
// levels where 3-decimal rounding (~5e-4 unit) was visibly off when
// duplicating a tab. Angles are radians so 5 decimals keeps roundtrip
// orientation error below ~1e-5 rad (≈ a few thousandths of a degree).
const POS_PRECISION = 5;
const ANGLE_PRECISION = 5;
const QUAT_PRECISION = 5;

export function roundCamera(cam: CameraState): CameraState {
  const out: CameraState = {};
  if (cam.dist != null && cam.az != null && cam.el != null) {
    // v3 is the canonical emission shape — the renderer always feeds
    // (dist, az, el) once it mounts.
    out.dist = r(cam.dist, POS_PRECISION);
    out.az = r(cam.az, ANGLE_PRECISION);
    out.el = r(cam.el, ANGLE_PRECISION);
  } else if (cam.pos) {
    // Defensive legacy passthrough: if a caller hands the rounder a
    // pre-v3 shape (test fixtures, or a v1/v2 URL being re-emitted
    // before the renderer mounts), preserve it so the next decode
    // doesn't reject the field as malformed.
    out.pos = [
      r(cam.pos[0], POS_PRECISION),
      r(cam.pos[1], POS_PRECISION),
      r(cam.pos[2], POS_PRECISION),
    ];
    if (cam.quat) {
      out.quat = [
        r(cam.quat[0], QUAT_PRECISION),
        r(cam.quat[1], QUAT_PRECISION),
        r(cam.quat[2], QUAT_PRECISION),
        r(cam.quat[3], QUAT_PRECISION),
      ];
    } else if (cam.target) {
      out.target = [
        r(cam.target[0], POS_PRECISION),
        r(cam.target[1], POS_PRECISION),
        r(cam.target[2], POS_PRECISION),
      ];
    }
  }
  if (cam.pan && (cam.pan[0] !== 0 || cam.pan[1] !== 0)) {
    out.pan = [r(cam.pan[0], POS_PRECISION), r(cam.pan[1], POS_PRECISION)];
  }
  return out;
}

export function roundViewport(vp: UmapViewport): UmapViewport {
  return { zoom: r(vp.zoom), panX: r(vp.panX), panY: r(vp.panY) };
}

export function viewportIsDefault(vp: UmapViewport): boolean {
  return vp.zoom === 1 && vp.panX === 0 && vp.panY === 0;
}
