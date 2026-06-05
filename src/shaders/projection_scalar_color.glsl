// Shared scalar recoloring for visible scalar-projection shaders.
// Requires projection_scalar.glsl to be included first.

uniform sampler2D colorMap;
uniform float activeBrightness;

vec3 scalarColor(float x) {
  vec3 rgb = texture2D(colorMap, vec2(scalarToT(x), 0.5)).rgb;
  return min(vec3(1.0), rgb + activeBrightness);
}
