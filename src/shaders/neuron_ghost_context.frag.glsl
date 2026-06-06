precision mediump float;

// Projection ghost/context fragment shader. Uses the existing per-cell
// ghost buffers (instColor/instAlpha/instSize) but masks by an explicit
// projectable flag so active low-alpha signal cells are not mistaken for
// ghosts.

varying vec3 vColor;
varying float vAlpha;
varying float vProjectable;

void main() {
  // Actual scalar-mode ghosts are non-projectable. Active cells,
  // including weak stim/swim cells with low alpha, are projectable and
  // rendered only by the projection overlay.
  if (vProjectable > 0.5) discard;
  if (vAlpha < 0.02) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float edge = smoothstep(0.25, 0.18, r2);
  float a = vAlpha * edge;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}
