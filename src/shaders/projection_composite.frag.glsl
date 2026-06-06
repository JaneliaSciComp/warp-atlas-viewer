// Fullscreen composite for scalar mean/sum projection.
//
// The projection pass additively accumulates signed scalar components
// as (positiveSum, negativeSum, count, count). This pass reconstructs
// either the arithmetic mean scalar or the exposure-scaled signed sum,
// then maps that scalar through the active color map.
//
// The pass is composited (alpha-blended) over the dim context brain that
// was already drawn to the back buffer, so it emits genuine transparency:
// untouched pixels and faded weak-signal pixels carry low/zero alpha and
// let the context show through, rather than painting a flat fill.
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
    // No cell touched this pixel — fully transparent, context shows.
    fragColor = vec4(0.0);
    return;
  }
  float signedSum = acc.r - acc.g;
  float scalar = mode == 1 ? signedSum * sumExposure : signedSum / acc.a;
  fragColor = scalarRgba(scalar);
}
