// Viridis sampled at 32 stops, then linearly interpolated.
const VIRIDIS_STOPS: Array<[number, number, number]> = [
  [0.267, 0.005, 0.329], [0.282, 0.094, 0.418], [0.279, 0.175, 0.483],
  [0.263, 0.243, 0.524], [0.237, 0.305, 0.541], [0.207, 0.372, 0.553],
  [0.180, 0.435, 0.557], [0.156, 0.498, 0.557], [0.135, 0.557, 0.553],
  [0.115, 0.617, 0.541], [0.121, 0.679, 0.516], [0.180, 0.731, 0.480],
  [0.286, 0.784, 0.428], [0.426, 0.829, 0.357], [0.594, 0.866, 0.270],
  [0.769, 0.890, 0.176], [0.929, 0.906, 0.099], [0.993, 0.906, 0.144],
];

export function viridis(t: number): [number, number, number] {
  return sampleStops(VIRIDIS_STOPS, t);
}

// Plasma — perceptually uniform like viridis but with a deep purple → red
// → orange → yellow ramp, which reads better than viridis on a dark
// background because the dark-end purple is still distinguishable from
// the viewport background. 16 stops sampled from matplotlib's plasma.
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

// Tableau10-style qualitative palette, extended to 16 for region count.
export const REGION_PALETTE: Array<[number, number, number]> = [
  [0.298, 0.447, 0.690], // blue
  [0.867, 0.518, 0.322], // orange
  [0.333, 0.659, 0.408], // green
  [0.769, 0.306, 0.322], // red
  [0.506, 0.447, 0.702], // purple
  [0.576, 0.471, 0.376], // brown
  [0.855, 0.545, 0.765], // pink
  [0.549, 0.549, 0.549], // gray
  [0.800, 0.725, 0.455], // yellow-tan
  [0.392, 0.710, 0.804], // cyan
  [0.945, 0.769, 0.486], // sand
  [0.612, 0.788, 0.451], // lime
  [0.420, 0.624, 0.529], // teal
  [0.722, 0.376, 0.443], // rose
  [0.467, 0.408, 0.671], // violet
  [0.353, 0.502, 0.412], // forest
];

export function regionColor(idx: number): [number, number, number] {
  return REGION_PALETTE[((idx % REGION_PALETTE.length) + REGION_PALETTE.length) % REGION_PALETTE.length];
}

export function rgbToHex(c: [number, number, number]): string {
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)))
    .toString(16)
    .padStart(2, '0');
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}
