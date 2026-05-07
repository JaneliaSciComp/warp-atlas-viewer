// URL-state serializer: persists the user-visible view state into the
// URL hash so a copy/paste reproduces the exact view someone else is
// looking at. Format mirrors Neuroglancer's `#!{json}` convention.
//
// Two design choices keep the URL tractable:
//   1. Anything at its default value is dropped from the JSON, so a
//      fresh-load app keeps an empty hash.
//   2. Lasso selections are stored as polygon vertices (in t-SNE data
//      coords), not as the resulting cell indices — typical lasso has
//      30-150 vertices regardless of how many cells fall inside, so
//      the URL stays small. Decoder re-runs point-in-polygon to derive
//      indices.

import type { FilterState, SettingsState } from '../data/types';

export interface CameraState {
  pos: [number, number, number];
  target: [number, number, number];
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
  camera?: CameraState;
  umap?: UmapViewport;
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
  try {
    const parsed = JSON.parse(decodeURIComponent(hash.slice(2)));
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as PersistedState;
  } catch {
    return null;
  }
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

export function roundCamera(cam: CameraState): CameraState {
  return {
    pos: [r(cam.pos[0]), r(cam.pos[1]), r(cam.pos[2])],
    target: [r(cam.target[0]), r(cam.target[1]), r(cam.target[2])],
  };
}

export function roundViewport(vp: UmapViewport): UmapViewport {
  return { zoom: r(vp.zoom), panX: r(vp.panX), panY: r(vp.panY) };
}

export function viewportIsDefault(vp: UmapViewport): boolean {
  return vp.zoom === 1 && vp.panX === 0 && vp.panY === 0;
}
