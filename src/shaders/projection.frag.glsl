// Fragment shader for scalar projection. Projection reduces raw
// scientific scalar values, then maps the reduced scalar back through
// the active color map. `vIntensity` is only the normalized magnitude
// gate used by the projection threshold.
//
//   mode = 0  → max scalar projection. Highest scalar wins the pixel.
//   mode = 1  → min scalar projection. Lowest scalar wins the pixel.
//   mode = 2  → mean scalar projection. Emit (+scalar, -scalar, denom)
//               into the additive target; composite divides by denom.
//               Signed stim/swim with weak-correlation fade uses signal
//               strength as the denominator weight so transparent weak
//               cells cannot numerically swamp stronger signal.
//   mode = 3  → sum scalar projection. Same additive emission, but the
//               composite leaves the signed sum undivided.
//   mode = 4  → max-magnitude ("min/max") projection. For signed
//               (diverging) schemes the cell whose scalar deviates most
//               from the neutral midpoint wins, keeping its sign — so the
//               strongest response of EITHER polarity punches through.
//               Sequential schemes have no negative half, so this
//               degenerates to "highest scalar wins" like mode 0.
//
// Signed winner modes (stim/swim max, min, min/max) are not rendered with
// depth-test winner-take-all. They emit an order-independent MAX-blend key
// into the accumulation target, then the composite pass reconstructs the
// winning ramp position. That keeps true scalar min/max semantics without
// letting a transparent near-neutral point depth-cull stronger signal.
//
// GLSL ES 3.00 (Three.js sets `glslVersion: THREE.GLSL3` on the host
// material). In GLSL3 ShaderMaterial mode Three does NOT auto-define
// gl_FragColor, so we declare our own out vec4. gl_FragDepth is core
// in 3.00, no extension dance needed.

precision highp float;

uniform int mode;
uniform float intensityFloor;
#include <warp_projection_scalar>
#include <warp_projection_scalar_color>

in float vIntensity;
in float vScalar;
in float vProjectable;

out vec4 fragColor;

void main() {
  if (vProjectable < 0.5 || vIntensity < intensityFloor || isnan(vScalar)) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float edge = smoothstep(0.25, 0.18, r2);

  if (mode == 2 || mode == 3) {
    if (mode == 2 && signedFadeActive()) {
      // For signed mean projections, transparency has to participate in
      // the reduction itself. A full arithmetic count lets many
      // near-zero/transparent correlations pull the mean to the neutral
      // midpoint and then hide stronger cells. Weight by signed signal
      // strength (and sprite edge coverage) so weak transparent samples
      // do not dominate the reduced scalar.
      float t = scalarToT(vScalar);
      float weight = scalarStrengthFromT(t) * edge;
      if (weight <= 0.000001) discard;
      float weightedScalar = vScalar * weight;
      fragColor = vec4(max(weightedScalar, 0.0), max(-weightedScalar, 0.0), weight, weight);
      return;
    }
    fragColor = vec4(max(vScalar, 0.0), max(-vScalar, 0.0), 1.0, 1.0);
  } else {
    float order = scalarToT(vScalar);
    if (scalarMode == 2) {
      // Signed max/min/min-max use MAX blending into the off-screen target
      // rather than scalar-keyed depth. Channels carry mode-specific keys:
      //   max    → r = max(t)
      //   min    → r = max(1 - t), reconstructed as t = 1 - r
      //   minmax → r/g = strongest positive/negative magnitudes
      // Alpha is a touched-pixel flag for max/min and harmless for minmax.
      float strength = scalarStrengthFromT(order);
      if (strength <= intensityFloor) discard;
      if (mode == 1) {
        fragColor = vec4(1.0 - order, 0.0, 0.0, 1.0);
      } else if (mode == 4) {
        float posMag = order > 0.5 ? strength : 0.0;
        float negMag = order < 0.5 ? strength : 0.0;
        fragColor = vec4(posMag, negMag, 0.0, 1.0);
      } else {
        fragColor = vec4(order, 0.0, 0.0, 1.0);
      }
      return;
    }

    // Sequential max/min/min-max: opaque depth-test MIP. maxabs has no
    // negative half here, so it shares max's "highest scalar wins" key.
    if (mode == 4) {
      // Largest deviation from neutral wins. For signed schemes the
      // neutral midpoint is t = 0.5, so strength is symmetric around it;
      // for sequential schemes (scalarMode != 2) there is no negative
      // half, so fall back to the plain "highest scalar" key.
      float strength = scalarMode == 2 ? abs(order - 0.5) * 2.0 : order;
      gl_FragDepth = 1.0 - strength;
    } else {
      gl_FragDepth = (mode == 0) ? (1.0 - order) : order;
    }
    fragColor = scalarRgbaFromT(order);
  }
}
