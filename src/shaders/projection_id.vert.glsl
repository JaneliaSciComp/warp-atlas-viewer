// ID-pass vertex shader for projection-mode picking. Mirrors
// projection.vert.glsl's transform and point sizing exactly so the
// rasterized disk lands on the same pixels as the visible projection
// pass — the only difference is what gets written to the framebuffer
// (a packed cell index instead of a display color). The `flat`
// qualifier on vCellId prevents any interpolation across the sprite
// since cell index is a discrete integer per point.

in float instCellId;
in float instIntensity;
in float instSize;

uniform float pixelRatio;
uniform float sizeScale;

flat out int vCellId;
out float vIntensity;

void main() {
  vCellId = int(instCellId + 0.5);
  vIntensity = instIntensity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = -mvPosition.z;
  float size = instSize * sizeScale * pixelRatio * (160.0 / max(dist, 40.0));
  gl_PointSize = max(1.5, size);
}
