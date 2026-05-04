// Per-point: position (built-in), color, alpha, size attributes are written
// directly into BufferAttributes by React when filters change — no geometry
// rebuild. The fragment shader uses gl_PointCoord to draw a soft round disc.

attribute vec3 instColor;
attribute float instAlpha;
attribute float instSize;

uniform float pixelRatio;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = instColor;
  vAlpha = instAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Slight depth attenuation: closer points larger. Min 1.5 to keep the
  // far side of the brain readable.
  float dist = -mvPosition.z;
  float size = instSize * pixelRatio * (160.0 / max(dist, 40.0));
  gl_PointSize = max(1.5, size);
}
