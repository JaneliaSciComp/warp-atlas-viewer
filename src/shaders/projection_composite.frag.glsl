// Fullscreen composite for the additive-blend projection modes.
//
// Both `mean` and `sum` additively blend the same per-cell emission
// into the off-screen target: (color × intensity, intensity). They
// differ only in composite math:
//
//   mode = 0 (mean) → projection shader emits (color × intensity,
//     intensity); composite divides RGB by A to recover the
//     intensity-weighted mean color. Bounded to plasma/coolwarm
//     gamut; insensitive to how many cells touched the pixel.
//
//   mode = 1 (sum)  → composite clamps the raw per-channel
//     accumulation to [0, 1] without dividing. This keeps the
//     integrated magnitude: a single half-strength cell appears half as
//     bright, while many cells stacking along the ray saturate toward
//     white as channels max out.
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
    rgb = min(acc.rgb, vec3(1.0));
  } else {
    rgb = acc.rgb / acc.a;
  }
  fragColor = vec4(rgb, 1.0);
}
