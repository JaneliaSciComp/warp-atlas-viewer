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

out vec4 fragColor;

void main() {
  if (vIntensity < intensityFloor || isnan(vScalar)) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;

  if (mode == 2 || mode == 3) {
    fragColor = vec4(max(vScalar, 0.0), max(-vScalar, 0.0), 1.0, 1.0);
  } else {
    float order = scalarToT(vScalar);
    gl_FragDepth = (mode == 0) ? (1.0 - order) : order;
    fragColor = scalarRgba(vScalar);
  }
}
