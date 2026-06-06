precision mediump float;

// Dim anatomical context drawn behind the projection overlay. Renders
// every renderable cell as a faint neutral disc so the brain's shape and
// density stay visible through the transparent (weak-signal) regions of
// the projection. Reuses neuron.vert, so it ignores the per-cell color
// and paints a uniform grey at a low fixed alpha; many overlapping discs
// blend into a soft volume.
uniform vec3 contextColor;
uniform float contextAlpha;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Skip cells the coloring fully hid (alpha 0 — e.g. unassigned-region
  // cells when that toggle is off). Everything else contributes context.
  if (vAlpha < 0.01) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float edge = smoothstep(0.25, 0.18, r2);
  gl_FragColor = vec4(contextColor, contextAlpha * edge);
}
