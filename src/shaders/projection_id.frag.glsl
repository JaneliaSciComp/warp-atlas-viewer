// ID-pass fragment shader for projection-mode picking.
//
// Renders the SAME max/min depth-test reduction as the visible
// projection pass, but writes a packed cell index per pixel instead
// of the cell's display color. The picker reads back the pixel under
// the cursor and decodes it to find "the cell that won this pixel"
// — so hover/click pick the cell the user actually sees, not the
// nearest cell center in screen space.
//
// Encoding: cellId + 1 is split across the RGB channels (low 8 / mid
// 8 / high 8). The +1 offset means the background-cleared value of
// (0,0,0) decodes to -1 (no cell), distinguishing it from cellId 0.
// 24 bits handles up to ~16M cells; this dataset has ~274k.
//
// GLSL3 (Three.js ShaderMaterial with glslVersion: GLSL3). gl_FragDepth
// is core in 3.00; uint bitwise ops are native.

precision highp float;
precision highp int;

uniform int mode;            // 0 = max, 1 = min — same encoding as projection.frag
uniform float intensityFloor;
#include <warp_projection_scalar>

flat in int vCellId;
in float vIntensity;
in float vScalar;

out vec4 fragColor;

void main() {
  if (vIntensity < intensityFloor || isnan(vScalar)) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float order = scalarToT(vScalar);
  gl_FragDepth = (mode == 0) ? (1.0 - order) : order;
  uint id = uint(vCellId) + 1u;
  fragColor = vec4(
    float(id & 0xFFu) / 255.0,
    float((id >> 8) & 0xFFu) / 255.0,
    float((id >> 16) & 0xFFu) / 255.0,
    1.0
  );
}
