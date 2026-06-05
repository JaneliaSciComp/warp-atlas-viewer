// Shared scalar recoloring for visible scalar-projection shaders.
// Requires projection_scalar.glsl to be included first.

uniform sampler2D colorMap;
uniform float activeBrightness;
uniform float fadeWeakCorrelation;

// Match the normal stim/swim fade floor: neutral signed values should
// be visible enough to read as context, but transparent enough that the
// coolwarm white midpoint does not dominate projection views.
const float SIGNED_ALPHA_FLOOR = 0.12;

float scalarAlphaFromT(float t) {
  if (scalarMode == 2 && fadeWeakCorrelation > 0.5) {
    float strength = abs(t - 0.5) * 2.0;
    return SIGNED_ALPHA_FLOOR + (1.0 - SIGNED_ALPHA_FLOOR) * strength;
  }
  return 1.0;
}

vec4 scalarRgba(float x) {
  float t = scalarToT(x);
  vec3 rgb = texture2D(colorMap, vec2(t, 0.5)).rgb;
  return vec4(min(vec3(1.0), rgb + activeBrightness), scalarAlphaFromT(t));
}
