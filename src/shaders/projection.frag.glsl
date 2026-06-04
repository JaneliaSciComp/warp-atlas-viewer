// Fragment shader for the projection render path. Four behaviors via
// the `mode` uniform; the host code also flips depthWrite/blending to
// match.
//
//   mode = 0  → max projection. Output gl_FragDepth = 1 - intensity
//               and the cell's color at full alpha. With depth test
//               LESS and depth write ON, the highest-intensity cell
//               along the view ray wins the pixel.
//
//   mode = 1  → min projection. Output gl_FragDepth = intensity and
//               the cell's color. Lowest-intensity cell wins.
//
//   mode = 2  → mean projection. Emit (color × intensity, intensity)
//               with additive blending; the composite pass divides
//               RGB by A to recover intensity-weighted mean color.
//
//   mode = 3  → sum projection. Emit (color, 1.0) — color is NOT
//               intensity-weighted because the composite doesn't
//               divide. With additive blending, single-cell pixels
//               keep the cell's full plasma/coolwarm color and dense
//               accumulations saturate toward white. The composite
//               tone-maps the raw sum to clamp the high end.
//
// GLSL ES 3.00 (Three.js sets `glslVersion: THREE.GLSL3` on the host
// material). In GLSL3 ShaderMaterial mode Three does NOT auto-define
// gl_FragColor, so we declare our own out vec4. gl_FragDepth is core
// in 3.00, no extension dance needed.

precision highp float;

uniform int mode;
uniform float intensityFloor;

in vec3 vColor;
in float vIntensity;

out vec4 fragColor;

void main() {
  if (vIntensity < intensityFloor) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float i = clamp(vIntensity, 0.0, 1.0);
  if (mode == 2) {
    fragColor = vec4(vColor * i, i);
  } else if (mode == 3) {
    fragColor = vec4(vColor, 1.0);
  } else {
    gl_FragDepth = (mode == 0) ? (1.0 - i) : i;
    fragColor = vec4(vColor, 1.0);
  }
}
