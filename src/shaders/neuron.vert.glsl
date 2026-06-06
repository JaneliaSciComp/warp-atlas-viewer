// Per-point: position (built-in), color, alpha, size attributes are written
// directly into BufferAttributes by React when filters change — no geometry
// rebuild. The fragment shader uses gl_PointCoord to draw a soft round disc.

attribute vec3 instColor;
attribute float instAlpha;
attribute float instSize;

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

varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = instColor;
  vAlpha = instAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float depthFactor = 160.0 / max(dist, 40.0);
  float factor = mix(depthFactor, flatSizeFactor, flatPointSize);
  gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * factor);
}
