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
uniform sampler2D colorMap;
// 0 = sequential linear, 1 = sequential log1p, 2 = signed/diverging.
uniform int scalarMode;
uniform float scalarLo;
uniform float scalarHi;
uniform float scalarLogDen;
uniform float activeBrightness;

in float vIntensity;
in float vScalar;

out vec4 fragColor;

float scalarToT(float x) {
  if (scalarMode == 2) {
    float hi = max(scalarLo + 0.000001, scalarHi);
    float mag = abs(x);
    float v = mag <= scalarLo ? 0.0 : clamp((mag - scalarLo) / (hi - scalarLo), 0.0, 1.0);
    float signedV = x < 0.0 ? -v : v;
    return signedV * 0.5 + 0.5;
  }
  if (scalarMode == 1) {
    return clamp(log(1.0 + max(0.0, x)) / max(0.000001, scalarLogDen), 0.0, 1.0);
  }
  return clamp((x - scalarLo) / max(0.000001, scalarHi - scalarLo), 0.0, 1.0);
}

vec3 scalarColor(float x) {
  vec3 rgb = texture2D(colorMap, vec2(scalarToT(x), 0.5)).rgb;
  return min(vec3(1.0), rgb + activeBrightness);
}

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
    fragColor = vec4(scalarColor(vScalar), 1.0);
  }
}
