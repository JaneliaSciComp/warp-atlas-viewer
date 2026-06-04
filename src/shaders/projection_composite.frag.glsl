// Fullscreen composite for the additive-blend projection modes.
//
// Both `mean` and `sum` use the same projection-pass shader (additive
// blending of (color × intensity, intensity)). They diverge only in
// how the accumulated buffer is interpreted here:
//
//   mode = 0 (mean) → RGB / A → intensity-weighted average color.
//   mode = 1 (sum)  → Reinhard tone-map of RGB → integrated signal.
//     Sum keeps bright cells bright when they stack along the ray
//     (where mean would dilute them with dim non-expressers), at the
//     cost of saturating dense pixels toward white.
//
// Pixels that no cell ever touched (A ≈ 0) fall back to the
// background color in both modes.
//
// GLSL3 ShaderMaterial: Three #defines texture2D → texture but does
// NOT auto-define gl_FragColor, so we declare our own out vec4.

precision highp float;

uniform sampler2D src;
uniform vec3 background;
uniform int mode;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 acc = texture2D(src, vUv);
  if (acc.a < 1e-4) {
    fragColor = vec4(background, 1.0);
    return;
  }
  vec3 rgb;
  if (mode == 1) {
    // Sum: Reinhard tone-mapping. Bounded to [0, 1] without needing to
    // know the max accumulated value in advance; dense pixels saturate
    // gradually toward white.
    rgb = acc.rgb / (vec3(1.0) + acc.rgb);
  } else {
    rgb = acc.rgb / acc.a;
  }
  fragColor = vec4(rgb, 1.0);
}
