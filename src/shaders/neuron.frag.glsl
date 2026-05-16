precision mediump float;

// Two-pass split: the same shader is bound to an opaque-pass material
// (alphaMin=0.5, alphaMax≈inf, depthWrite=true) and a transparent-pass
// material (alphaMin=0, alphaMax=0.5, depthWrite=false). Opaque cells
// write depth so they occlude cells behind them; transparent cells
// (ghosts, divergent-ramp midpoints) blend in without occluding.
uniform float alphaMin;
uniform float alphaMax;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Pre-filter on cell alpha so each pass only renders its half.
  if (vAlpha < alphaMin || vAlpha >= alphaMax) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  // Soft edge using smoothstep on radius.
  float edge = smoothstep(0.25, 0.18, r2);
  float a = vAlpha * edge;
  // Skip near-zero contributions so smoothstep tails don't pollute
  // the depth buffer (opaque pass) or waste compositing (transparent).
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}
