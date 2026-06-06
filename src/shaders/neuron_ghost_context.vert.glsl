// Projection context vertex shader. Mirrors neuron.vert sizing but also
// forwards instProjectable so the fragment shader can draw only actual
// ghosts (out-of-filter / lasso-demoted cells), not every low-alpha
// active cell.

attribute vec3 instColor;
attribute float instAlpha;
attribute float instSize;
attribute float instProjectable;

uniform float pixelRatio;
uniform float sizeScale;
uniform float flatPointSize;
uniform float flatSizeFactor;

varying vec3 vColor;
varying float vAlpha;
varying float vProjectable;

void main() {
  vColor = instColor;
  vAlpha = instAlpha;
  vProjectable = instProjectable;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float depthFactor = 160.0 / max(dist, 40.0);
  float factor = mix(depthFactor, flatSizeFactor, flatPointSize);
  gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * factor);
}
