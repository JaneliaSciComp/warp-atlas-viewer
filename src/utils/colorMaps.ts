import type { RegionPalette } from '../data/types';

// Plasma — perceptually uniform with a deep purple → red → orange →
// yellow ramp, which reads well on a dark background because the
// dark-end purple is still distinguishable from the viewport
// background. 16 stops sampled from matplotlib's plasma.
const PLASMA_STOPS: Array<[number, number, number]> = [
  [0.051, 0.031, 0.529], [0.165, 0.020, 0.578], [0.262, 0.012, 0.601],
  [0.359, 0.001, 0.602], [0.453, 0.005, 0.580], [0.541, 0.039, 0.534],
  [0.621, 0.085, 0.479], [0.690, 0.130, 0.418], [0.755, 0.180, 0.358],
  [0.815, 0.232, 0.298], [0.866, 0.291, 0.238], [0.913, 0.350, 0.180],
  [0.953, 0.413, 0.131], [0.982, 0.481, 0.092], [0.997, 0.557, 0.060],
  [0.998, 0.643, 0.034], [0.984, 0.738, 0.045], [0.954, 0.840, 0.116],
  [0.940, 0.975, 0.131],
];

export function plasma(t: number): [number, number, number] {
  return sampleStops(PLASMA_STOPS, t);
}

// Coolwarm — perceptually uniform diverging map (deep blue → near-white
// → deep red), suitable for signed quantities like swim correlation
// where 0 sits at the visually neutral midpoint. 11 stops sampled from
// matplotlib's coolwarm. Pass t in [-1, +1] (it's symmetric around 0).
const COOLWARM_STOPS: Array<[number, number, number]> = [
  [0.230, 0.299, 0.754], // -1.0  deep blue
  [0.353, 0.470, 0.871],
  [0.487, 0.625, 0.953],
  [0.624, 0.751, 0.996],
  [0.748, 0.842, 0.992],
  [0.866, 0.866, 0.866], //  0.0  neutral gray
  [0.957, 0.811, 0.728],
  [0.969, 0.703, 0.589],
  [0.953, 0.557, 0.442],
  [0.886, 0.395, 0.314],
  [0.706, 0.016, 0.150], // +1.0  deep red
];

export function coolwarm(t: number): [number, number, number] {
  // Map t from [-1, +1] to [0, 1] then sample.
  return sampleStops(COOLWARM_STOPS, (t + 1) / 2);
}

function sampleStops(stops: Array<[number, number, number]>, t: number): [number, number, number] {
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const x = t * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Google Turbo — polynomial approximation published with the Turbo
// colormap. It is a smoother rainbow-style ramp than Jet/nipy_spectral
// while keeping high hue contrast for quick visual lookup.
export function turbo(t: number): [number, number, number] {
  const x = clamp01(t);
  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x3 * x;
  const x5 = x4 * x;
  const r = 0.13572138
    + 4.61539260 * x
    - 42.66032258 * x2
    + 132.13108234 * x3
    - 152.94239396 * x4
    + 59.28637943 * x5;
  const g = 0.09140261
    + 2.19418839 * x
    + 4.84296658 * x2
    - 14.18503333 * x3
    + 4.27729857 * x4
    + 2.82956604 * x5;
  const b = 0.10667330
    + 12.64194608 * x
    - 60.58204836 * x2
    + 110.36276771 * x3
    - 89.90310912 * x4
    + 27.34824973 * x5;
  return [clamp01(r), clamp01(g), clamp01(b)];
}

// WARP region palettes are 16 categorical samples over a continuous
// rainbow ramp, plus a dedicated neutral gray for Unassigned. Data-index
// k ∈ 1..16 maps to ramp(k/17), so k=1 (InfMO) gets the purple/blue end
// and k=16 (Pal) gets the red end. Anterior → posterior in the paper's
// figure walks down the palette (red Pal → purple InfMO).
export const NIPY_SPECTRAL_REGION_PALETTE: Array<[number, number, number]> = [
  [0.40, 0.40, 0.42],          //  0  Unassigned (dedicated gray)
  [0.478, 0.000, 0.545],       //  1  InfMO
  [0.345, 0.000, 0.624],       //  2  IntMO
  [0.000, 0.000, 0.773],       //  3  SupMO
  [0.000, 0.329, 0.867],       //  4  SupRaphe
  [0.000, 0.584, 0.867],       //  5  Cb
  [0.000, 0.667, 0.659],       //  6  Tg
  [0.000, 0.651, 0.408],       //  7  NI
  [0.000, 0.655, 0.000],       //  8  OTpv
  [0.000, 0.812, 0.000],       //  9  OTnp
  [0.000, 0.969, 0.000],       // 10  Pt
  [0.690, 1.000, 0.000],       // 11  preTh
  [0.941, 0.918, 0.000],       // 12  Th
  [1.000, 0.741, 0.000],       // 13  Hab
  [1.000, 0.318, 0.000],       // 14  HypTh
  [0.914, 0.000, 0.000],       // 15  SubP
  [0.812, 0.000, 0.000],       // 16  Pal
];

function buildTurboRegionPalette(): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [[0.40, 0.40, 0.42]];
  for (let k = 1; k <= 16; k++) out.push(turbo(k / 17));
  return out;
}

export const TURBO_REGION_PALETTE: Array<[number, number, number]> = buildTurboRegionPalette();

// Back-compatible name for the default, paper-matching palette.
export const REGION_PALETTE = NIPY_SPECTRAL_REGION_PALETTE;

export function regionColor(idx: number, palette: RegionPalette = 'nipy_spectral'): [number, number, number] {
  const colors = palette === 'turbo' ? TURBO_REGION_PALETTE : NIPY_SPECTRAL_REGION_PALETTE;
  return colors[((idx % colors.length) + colors.length) % colors.length];
}

// Categorical palette for the per-fish color scheme. Kept distinct from
// the region palette (which is a 16-stop Tableau extension) so fish and
// regions don't read as visually related. Cycles if a dataset somehow
// has more than 8 specimens.
export const FISH_PALETTE: Array<[number, number, number]> = [
  [0.894, 0.102, 0.110], // red
  [0.216, 0.494, 0.722], // blue
  [0.302, 0.686, 0.290], // green
  [0.596, 0.306, 0.639], // purple
  [1.000, 0.498, 0.000], // orange
  [1.000, 1.000, 0.200], // yellow
  [0.651, 0.337, 0.157], // brown
  [0.969, 0.506, 0.749], // pink
];

export function fishColor(idx: number): [number, number, number] {
  return FISH_PALETTE[((idx % FISH_PALETTE.length) + FISH_PALETTE.length) % FISH_PALETTE.length];
}

export function rgbToHex(c: [number, number, number]): string {
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)))
    .toString(16)
    .padStart(2, '0');
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}
