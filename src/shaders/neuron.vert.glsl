// Per-point: position (built-in), color, alpha, size attributes are written
// directly into BufferAttributes by React when filters change — no geometry
// rebuild. The fragment shader uses gl_PointCoord to draw a soft round disc.

attribute vec3 instColor;
attribute float instAlpha;
attribute float instSize;
attribute float instActivity;
attribute float instActivityActive;

uniform float pixelRatio;
// Canvas-size factor from BrainViewer. Lifts cell sizes when the 3D
// canvas grows so dots-per-area density stays roughly constant. 1.0
// means no scaling.
uniform float sizeScale;
// 0 → normal depth-attenuated sizing (closer points larger).
// 1 → flat: every cell renders at a constant on-screen size.
uniform float flatPointSize;
// Flat-mode size factor. Set to depth mode's attenuation at the default
// zoom (160 / defaultCamDistance) so flipping the toggle doesn't change
// density for any dataset. See utils/zoomSizing.
uniform float flatSizeFactor;
// Activity playback fast path. When enabled, active cells derive their
// color/alpha from instActivity in the shader so playback only uploads
// one float per cell instead of full color/alpha buffers.
uniform float activityMode;
uniform float activityLo;
uniform float activityHi;
uniform float activityNoSignalAlpha;
uniform float activityActiveBrightness;
uniform float activityOpaqueActiveCells;

varying vec3 vColor;
varying float vAlpha;

vec3 plasma(float t) {
  float x = clamp(t, 0.0, 1.0) * 18.0;
  if (x < 1.0) return mix(vec3(0.051, 0.031, 0.529), vec3(0.165, 0.020, 0.578), x);
  if (x < 2.0) return mix(vec3(0.165, 0.020, 0.578), vec3(0.262, 0.012, 0.601), x - 1.0);
  if (x < 3.0) return mix(vec3(0.262, 0.012, 0.601), vec3(0.359, 0.001, 0.602), x - 2.0);
  if (x < 4.0) return mix(vec3(0.359, 0.001, 0.602), vec3(0.453, 0.005, 0.580), x - 3.0);
  if (x < 5.0) return mix(vec3(0.453, 0.005, 0.580), vec3(0.541, 0.039, 0.534), x - 4.0);
  if (x < 6.0) return mix(vec3(0.541, 0.039, 0.534), vec3(0.621, 0.085, 0.479), x - 5.0);
  if (x < 7.0) return mix(vec3(0.621, 0.085, 0.479), vec3(0.690, 0.130, 0.418), x - 6.0);
  if (x < 8.0) return mix(vec3(0.690, 0.130, 0.418), vec3(0.755, 0.180, 0.358), x - 7.0);
  if (x < 9.0) return mix(vec3(0.755, 0.180, 0.358), vec3(0.815, 0.232, 0.298), x - 8.0);
  if (x < 10.0) return mix(vec3(0.815, 0.232, 0.298), vec3(0.866, 0.291, 0.238), x - 9.0);
  if (x < 11.0) return mix(vec3(0.866, 0.291, 0.238), vec3(0.913, 0.350, 0.180), x - 10.0);
  if (x < 12.0) return mix(vec3(0.913, 0.350, 0.180), vec3(0.953, 0.413, 0.131), x - 11.0);
  if (x < 13.0) return mix(vec3(0.953, 0.413, 0.131), vec3(0.982, 0.481, 0.092), x - 12.0);
  if (x < 14.0) return mix(vec3(0.982, 0.481, 0.092), vec3(0.997, 0.557, 0.060), x - 13.0);
  if (x < 15.0) return mix(vec3(0.997, 0.557, 0.060), vec3(0.998, 0.643, 0.034), x - 14.0);
  if (x < 16.0) return mix(vec3(0.998, 0.643, 0.034), vec3(0.984, 0.738, 0.045), x - 15.0);
  if (x < 17.0) return mix(vec3(0.984, 0.738, 0.045), vec3(0.954, 0.840, 0.116), x - 16.0);
  return mix(vec3(0.954, 0.840, 0.116), vec3(0.940, 0.975, 0.131), x - 17.0);
}

void main() {
  vColor = instColor;
  vAlpha = instAlpha;
  if (activityMode > 0.5 && instActivityActive > 0.5) {
    float v = clamp((instActivity - activityLo) / max(activityHi - activityLo, 0.001), 0.0, 1.0);
    if (v <= 0.0) {
      vColor = vec3(0.30, 0.30, 0.32);
      vAlpha = activityNoSignalAlpha;
    } else {
      vColor = plasma(v);
      vAlpha = 1.0;
    }
    if (activityOpaqueActiveCells > 0.5 && vAlpha > 0.0) {
      vAlpha = 1.0;
    }
    vColor = min(vec3(1.0), vColor + activityActiveBrightness);
  }
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float depthFactor = 160.0 / max(dist, 40.0);
  float factor = mix(depthFactor, flatSizeFactor, flatPointSize);
  gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * factor);
}
