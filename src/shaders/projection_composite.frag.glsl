// Fullscreen composite for scalar mean/sum projection.
//
// The projection pass additively accumulates signed scalar components
// as (positiveSum, negativeSum, count, count). This pass reconstructs
// either the arithmetic mean scalar or the exposure-scaled signed sum,
// then maps that scalar through the active color map.
//
// Pixels that no cell ever touched (A ≈ 0) fall back to the
// background color in both modes.
//
// GLSL3 ShaderMaterial: Three #defines texture2D → texture but does
// NOT auto-define gl_FragColor, so we declare our own out vec4.

precision highp float;

uniform sampler2D src;
uniform int mode;
uniform float sumExposure;
#include <warp_projection_scalar>
#include <warp_projection_scalar_color>

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 acc = texture2D(src, vUv);
  if (acc.a < 1e-4) {
    fragColor = vec4(background, 1.0);
    return;
  }
  float signedSum = acc.r - acc.g;
  float scalar = mode == 1 ? signedSum * sumExposure : signedSum / acc.a;
  fragColor = vec4(scalarColor(scalar), 1.0);
}
