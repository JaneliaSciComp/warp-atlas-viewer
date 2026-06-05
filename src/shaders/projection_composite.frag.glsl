// Fullscreen composite for scalar mean/sum projection.
//
// The projection pass additively accumulates signed scalar components
// as (positiveSum, negativeSum, count, count). This pass reconstructs
// either the arithmetic mean scalar or the exposure-scaled signed sum,
// then maps that scalar through the active color map.
//
// Pixels that no cell ever touched (A ≈ 0) fall back to the
// background color in both modes.
//
// GLSL3 ShaderMaterial: Three #defines texture2D → texture but does
// NOT auto-define gl_FragColor, so we declare our own out vec4.

precision highp float;

uniform sampler2D src;
uniform vec3 background;
uniform int mode;
uniform float sumExposure;
uniform sampler2D colorMap;
// 0 = sequential linear, 1 = sequential log1p, 2 = signed/diverging.
uniform int scalarMode;
uniform float scalarLo;
uniform float scalarHi;
uniform float scalarLogDen;
uniform float activeBrightness;

in vec2 vUv;

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
  vec4 acc = texture2D(src, vUv);
  if (acc.a < 1e-4) {
    fragColor = vec4(background, 1.0);
    return;
  }
  float signedSum = acc.r - acc.g;
  float scalar = mode == 1 ? signedSum * sumExposure : signedSum / acc.a;
  fragColor = vec4(scalarColor(scalar), 1.0);
}
