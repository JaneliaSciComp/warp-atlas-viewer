// Fullscreen-quad vertex shader for the mean-projection composite.
// Three.js' ShaderMaterial in GLSL3 mode injects `in vec3 position;`
// and `in vec2 uv;` for us, so we just pass them through; the quad
// itself is a 2x2 PlaneGeometry at z=0 sampled by an OrthographicCamera
// with frustum [-1, 1] on each axis (NDC-aligned, so the projection
// matrix is the identity for our purposes — passing position.xy
// straight to clip space).

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
