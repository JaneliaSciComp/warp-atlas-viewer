// Fullscreen composite for scalar mean/sum projection.
//
// The projection pass additively accumulates signed scalar components.
// Sequential schemes use (positiveSum, negativeSum, count, count).
// Signed stim/swim mean with weak-correlation fade instead uses
// (positiveWeightedSum, negativeWeightedSum, weightSum, weightSum), so
// transparent near-zero samples cannot pull the displayed mean to the
// neutral midpoint before transparency is applied. This pass reconstructs
// either the mean scalar or the exposure-scaled signed sum, then maps that
// scalar through the active color map.
//
// The pass is composited (alpha-blended) over the ghost-only context pass
// that was already drawn to the back buffer, so it emits genuine
// transparency: untouched pixels and faded weak-signal pixels carry
// low/zero alpha and let the context show through, rather than painting a
// flat fill.
//
// GLSL3 ShaderMaterial: Three #defines texture2D → texture but does
// NOT auto-define gl_FragColor, so we declare our own out vec4.

precision highp float;

uniform sampler2D src;
uniform int mode;
uniform float sumExposure;
uniform float intensityFloor;
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
  float t = scalarToT(scalar);
  if (signedFadeActive() && scalarStrengthFromT(t) <= intensityFloor) {
    // Per-cell thresholding happens in the projection pass, but a signed
    // mean/sum can still reduce back toward zero by cancellation. Treat
    // that reduced near-zero value as genuinely transparent instead of
    // drawing a low-alpha dark point-shaped speck.
    fragColor = vec4(0.0);
    return;
  }
  fragColor = scalarRgbaFromT(t);
}
