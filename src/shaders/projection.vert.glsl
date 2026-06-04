// Vertex shader for the projection-mode render path. Mirrors
// neuron.vert.glsl's transform and point-sprite sizing, but forwards
// the per-cell alpha as the projection "intensity" (same scalar that
// drives the cell's alpha in the normal pass: high for active in-set
// cells, low for ghosts).
//
// GLSL ES 3.00: required so the fragment shader can write
// gl_FragDepth (used for the max/min depth-test trick). Three.js
// still injects `in vec3 position;` and the standard uniforms when
// the material has `glslVersion: THREE.GLSL3`.

in vec3 instColor;
in float instAlpha;
in float instSize;

uniform float pixelRatio;
uniform float sizeScale;

out vec3 vColor;
out float vIntensity;

void main() {
  vColor = instColor;
  vIntensity = instAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float size = instSize * sizeScale * pixelRatio * (160.0 / max(dist, 40.0));
  gl_PointSize = max(1.5, size);
}
