// Shared scalar recoloring for visible scalar-projection shaders.
// Requires projection_scalar.glsl to be included first.

uniform sampler2D colorMap;
uniform float activeBrightness;
uniform vec3 background;

vec3 scalarColor(float x) {
  float t = scalarToT(x);
  vec3 rgb = texture2D(colorMap, vec2(t, 0.5)).rgb;
  if (scalarMode == 2) {
    // Signed stim/swim projections should not let the coolwarm neutral
    // midpoint (white) dominate dense/cancelled rays. Preserve the
    // signed scalar reduction, but display sign as hue and magnitude as
    // visibility: zero/cancelled projected values fade to background.
    float strength = abs(t - 0.5) * 2.0;
    vec3 lifted = min(vec3(1.0), rgb + activeBrightness);
    return mix(background, lifted, strength);
  }
  return min(vec3(1.0), rgb + activeBrightness);
}
