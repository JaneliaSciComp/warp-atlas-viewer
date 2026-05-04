precision mediump float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  // Soft edge using smoothstep on radius.
  float edge = smoothstep(0.25, 0.18, r2);
  gl_FragColor = vec4(vColor, vAlpha * edge);
}
