import * as THREE from 'three';
import projectionScalarChunkSrc from '../../shaders/projection_scalar.glsl?raw';
import projectionScalarColorChunkSrc from '../../shaders/projection_scalar_color.glsl?raw';

let registered = false;

/** Three's ShaderMaterial preprocessor resolves #include <...> through
 *  ShaderChunk. Register WARP-specific chunks once so the visible
 *  projection, ID-picking projection, and accumulation composite all
 *  share exactly the same scalar-to-palette mapping. */
export function registerProjectionShaderChunks(): void {
  if (registered) return;
  const shaderChunks = THREE.ShaderChunk as unknown as Record<string, string>;
  shaderChunks.warp_projection_scalar = projectionScalarChunkSrc;
  shaderChunks.warp_projection_scalar_color = projectionScalarColorChunkSrc;
  registered = true;
}
