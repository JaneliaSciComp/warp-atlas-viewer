// Shared scalar recoloring for visible scalar-projection shaders.
// Requires projection_scalar.glsl to be included first.

uniform sampler2D colorMap;
uniform float activeBrightness;
uniform float fadeWeakCorrelation;

// Neutral signed values fade all the way to transparent. The ghost-only
// context pass rendered behind the projection supplies visual context, so
// here we let the coolwarm midpoint drop to zero alpha and reveal that
// context instead of painting an opaque wash.
const float SIGNED_ALPHA_FLOOR = 0.0;

bool signedFadeActive() {
  return scalarMode == 2 && fadeWeakCorrelation > 0.5;
}

float scalarStrengthFromT(float t) {
  return abs(t - 0.5) * 2.0;
}

float scalarAlphaFromT(float t) {
  if (signedFadeActive()) {
    float strength = scalarStrengthFromT(t);
    return SIGNED_ALPHA_FLOOR + (1.0 - SIGNED_ALPHA_FLOOR) * strength;
  }
  return 1.0;
}

vec4 scalarRgbaFromT(float t) {
  vec3 rgb = texture2D(colorMap, vec2(t, 0.5)).rgb;
  return vec4(min(vec3(1.0), rgb + activeBrightness), scalarAlphaFromT(t));
}

vec4 scalarRgba(float x) {
  return scalarRgbaFromT(scalarToT(x));
}
