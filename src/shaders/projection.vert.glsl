// Vertex shader for the scalar projection render path. Forwards both
// the raw scientific scalar (gene count/richness, activity ΔF/F,
// signed stim/swim correlation) and its normalized magnitude used only
// for thresholding. Categorical schemes are disabled before this
// material is used.
//
// Sizing is controlled by the `flatPointSize` uniform, same as the
// normal cell shader — projection has no opinion about size on its
// own, the user picks via settings.flatPointSizes. Under depth
// attenuation a deep cell renders as a tiny dot, which (a) loses the
// depth-test race in max/min to shallow lower-intensity cells, and
// (b) under-weights deep cells in mean/sum because a small disk
// contributes to fewer pixels. The flat sizing path solves both at
// the cost of losing the depth cue — the standard MIP convention in
// volume rendering.
//
// GLSL ES 3.00: required so the fragment shader can write
// gl_FragDepth (used for the max/min depth-test trick). Three.js
// still injects `in vec3 position;` and the standard uniforms when
// the material has `glslVersion: THREE.GLSL3`.

in float instIntensity;
in float instScalar;
in float instProjectable;
in float instSize;

uniform float pixelRatio;
uniform float sizeScale;
// Same contract as neuron.vert.glsl: 0 = depth-attenuated, 1 = flat.
uniform float flatPointSize;

out float vIntensity;
out float vScalar;
out float vProjectable;

void main() {
  vIntensity = instIntensity;
  vScalar = instScalar;
  vProjectable = instProjectable;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float depthFactor = 160.0 / max(dist, 40.0);
  float factor = mix(depthFactor, 0.4, flatPointSize);
  gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * factor);
}
