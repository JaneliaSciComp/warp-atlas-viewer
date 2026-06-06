// Fragment shader for scalar projection. Projection reduces raw
// scientific scalar values, then maps the reduced scalar back through
// the active color map. `vIntensity` is only the normalized magnitude
// gate used by the projection threshold.
//
//   mode = 0  → max scalar projection. Highest scalar wins the pixel.
//   mode = 1  → min scalar projection. Lowest scalar wins the pixel.
//   mode = 2  → mean scalar projection. Emit (+scalar, -scalar, count)
//               into the additive target; composite divides by count.
//   mode = 3  → sum scalar projection. Same additive emission, but the
//               composite leaves the signed sum undivided.
//   mode = 4  → max-magnitude ("min/max") projection. For signed
//               (diverging) schemes the cell whose scalar deviates most
//               from the neutral midpoint wins, keeping its sign — so the
//               strongest response of EITHER polarity punches through.
//               Sequential schemes have no negative half, so this
//               degenerates to "highest scalar wins" like mode 0.
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

  if (mode == 2 || mode == 3) {
    fragColor = vec4(max(vScalar, 0.0), max(-vScalar, 0.0), 1.0, 1.0);
  } else {
    float order = scalarToT(vScalar);
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
    fragColor = scalarRgba(vScalar);
  }
}
