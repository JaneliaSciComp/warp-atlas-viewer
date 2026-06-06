// Shared scalar recoloring for visible scalar-projection shaders.
// Requires projection_scalar.glsl to be included first.

uniform sampler2D colorMap;
uniform float activeBrightness;
uniform float fadeWeakCorrelation;

// Neutral signed values fade all the way to transparent. The dim
// context brain rendered behind the projection supplies the "weak cells
// still readable" role the old non-zero floor used to play — so here we
// let the coolwarm midpoint drop to zero alpha and reveal that context
// instead of painting an opaque grey wash over it.
const float SIGNED_ALPHA_FLOOR = 0.0;

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
