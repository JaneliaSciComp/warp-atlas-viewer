// Vertex shader for the projection-mode render path. Forwards the
// per-cell scheme-aware intensity (gene/activity = normalized v,
// stim/swim = |r| past the deadband regardless of fadeWeakCorrelation,
// region/fish/highlight = 1 for in-set, 0 for ghosts). Sourcing this
// independently of instAlpha is what lets stim with fade-off still
// produce a magnitude-aware projection.
//
// Sizing diverges from neuron.vert.glsl: the normal shader's
// `160 / max(dist, 40)` depth attenuation is intentionally dropped
// for projection mode. Under that falloff a deep cell renders as a
// tiny dot covering few pixels, which:
//   - loses the depth-test race in max/min: shallow lower-intensity
//     cells cover more pixels and steal pixels they shouldn't.
//   - under-weights deep cells in mean/sum: a small disk contributes
//     to fewer pixels' accumulation than a large surface disk.
// A constant on-screen size gives every cell equal coverage in the
// reduction — the standard MIP-style convention for volume rendering.
//
// The PROJECTION_SIZE_SCALE factor compensates for the missing depth
// falloff: the auto-sizing curve in applyColoring was tuned for
// rendering where the `160/dist` term shrinks cells ~3× at default
// zoom, so applying it raw here produces oversized dots. Halving
// keeps projection cells in roughly the same visual register as
// near-surface normal cells.
//
// GLSL ES 3.00: required so the fragment shader can write
// gl_FragDepth (used for the max/min depth-test trick). Three.js
// still injects `in vec3 position;` and the standard uniforms when
// the material has `glslVersion: THREE.GLSL3`.

in vec3 instColor;
in float instIntensity;
in float instSize;

uniform float pixelRatio;
uniform float sizeScale;

out vec3 vColor;
out float vIntensity;

const float PROJECTION_SIZE_SCALE = 0.4;

void main() {
  vColor = instColor;
  vIntensity = instIntensity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * PROJECTION_SIZE_SCALE);
}
