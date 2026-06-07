// Fullscreen composite for accumulation-backed scalar projection modes.
//
// The projection pass feeds this composite with two accumulation flavors:
//
//   mode 0 (mean) / 1 (sum): additive signed scalar components.
//     Sequential schemes use (positiveSum, negativeSum, count, count).
//     Signed stim/swim mean with weak-correlation fade instead uses
//     (positiveWeightedSum, negativeWeightedSum, weightSum, weightSum), so
//     transparent near-zero samples cannot pull the displayed mean to the
//     neutral midpoint before transparency is applied.
//
//   mode 2 (max) / 3 (min) / 4 (min/max): signed stim/swim winner modes.
//     The projection MAX-blends an order-independent key instead of using
//     depth. Max stores max(t), Min stores max(1-t), and Min/Max stores
//     strongest positive/negative magnitudes. This pass reconstructs the
//     winning ramp coordinate t and recolors it.
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

  if (mode <= 1) {
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
    return;
  }

  if (acc.a < 1e-4) {
    fragColor = vec4(0.0);
    return;
  }
  float t;
  if (mode == 2) {
    t = acc.r;
  } else if (mode == 3) {
    t = 1.0 - acc.r;
  } else {
    t = acc.r >= acc.g ? 0.5 + 0.5 * acc.r : 0.5 - 0.5 * acc.g;
  }
  if (signedFadeActive() && scalarStrengthFromT(t) <= intensityFloor) {
    fragColor = vec4(0.0);
    return;
  }
  fragColor = scalarRgbaFromT(t);
}
