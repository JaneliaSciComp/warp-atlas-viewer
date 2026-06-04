// Fullscreen composite for mean-mode projection. Samples the
// off-screen target where the projection pass additively accumulated
// (color × intensity) in RGB and (intensity) in A, then divides to
// recover intensity-weighted mean color per pixel. Pixels that no
// cell ever touched (A ≈ 0) fall back to the background color.
//
// GLSL3 ShaderMaterial: Three #defines texture2D → texture but does
// NOT auto-define gl_FragColor, so we declare our own out vec4.

precision highp float;

uniform sampler2D src;
uniform vec3 background;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 acc = texture2D(src, vUv);
  if (acc.a < 1e-4) {
    fragColor = vec4(background, 1.0);
    return;
  }
  fragColor = vec4(acc.rgb / acc.a, 1.0);
}
