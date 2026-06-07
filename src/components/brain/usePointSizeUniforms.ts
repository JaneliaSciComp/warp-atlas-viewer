import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { zoomSizeScale, flatSizeFactor } from '../../utils/zoomSizing';

interface TrackballControlsLike {
  target: THREE.Vector3;
}

/** Synchronizes point-size uniforms across all point-cloud materials. */
export function usePointSizeUniforms({
  scaleByDepth,
  defaultCamDistance,
  camera,
  controls,
  volumeCenter,
  opaqueMaterial,
  transparentMaterial,
  projectionMaterial,
  contextMaterial,
  idMaterial,
  markerMaterial,
}: {
  scaleByDepth: boolean;
  defaultCamDistance: number;
  camera: THREE.Camera;
  controls: TrackballControlsLike | null;
  volumeCenter: THREE.Vector3;
  opaqueMaterial: THREE.ShaderMaterial;
  transparentMaterial: THREE.ShaderMaterial;
  projectionMaterial: THREE.ShaderMaterial;
  contextMaterial: THREE.ShaderMaterial;
  idMaterial: THREE.ShaderMaterial;
  markerMaterial: THREE.ShaderMaterial;
}) {
  useEffect(() => {
    // Single source of truth: settings.scaleByDepth fans out to every
    // material that computes gl_PointSize. The shader-side uniform is
    // `flatPointSize` (1 = flat, 0 = attenuated) — the inversion lives
    // here so the user-facing setting reads positively ("scale by depth
    // is on, by default"). AmbientOcclusion's internal material gets
    // the same flag via a prop on the JSX element.
    const v = scaleByDepth ? 0 : 1;
    opaqueMaterial.uniforms.flatPointSize.value = v;
    transparentMaterial.uniforms.flatPointSize.value = v;
    projectionMaterial.uniforms.flatPointSize.value = v;
    contextMaterial.uniforms.flatPointSize.value = v;
    idMaterial.uniforms.flatPointSize.value = v;
    markerMaterial.uniforms.flatPointSize.value = v;
  }, [
    scaleByDepth,
    opaqueMaterial,
    transparentMaterial,
    projectionMaterial,
    contextMaterial,
    idMaterial,
    markerMaterial,
  ]);

  // Flat-mode constant size factor. Match depth mode's attenuation at the
  // default zoom so toggling scale-by-depth doesn't shift density. Depends
  // only on the dataset (via defaultCamDistance), so a plain effect — not the
  // per-frame loop below — keeps it current.
  useEffect(() => {
    const f = flatSizeFactor(defaultCamDistance);
    opaqueMaterial.uniforms.flatSizeFactor.value = f;
    transparentMaterial.uniforms.flatSizeFactor.value = f;
    projectionMaterial.uniforms.flatSizeFactor.value = f;
    contextMaterial.uniforms.flatSizeFactor.value = f;
    idMaterial.uniforms.flatSizeFactor.value = f;
    markerMaterial.uniforms.flatSizeFactor.value = f;
  }, [
    defaultCamDistance,
    opaqueMaterial,
    transparentMaterial,
    projectionMaterial,
    contextMaterial,
    idMaterial,
    markerMaterial,
  ]);

  // Flat-mode zoom-size correction. Auto sizing is calibrated for the volume
  // filling the viewport at the default zoom; in flat mode it otherwise stays
  // fixed on screen while the volume grows/shrinks with zoom. Drive sizeScale
  // from the live camera distance each frame (cheap uniform write — no
  // coloring recompute) so flat-mode coverage stays roughly constant. Depth
  // mode keeps sizeScale = 1; its per-point 1/dist term already handles zoom.
  useFrame(() => {
    const flat = !scaleByDepth;
    const target = controls?.target ?? volumeCenter;
    const s = zoomSizeScale(camera, target, defaultCamDistance, flat);
    opaqueMaterial.uniforms.sizeScale.value = s;
    transparentMaterial.uniforms.sizeScale.value = s;
    projectionMaterial.uniforms.sizeScale.value = s;
    contextMaterial.uniforms.sizeScale.value = s;
    idMaterial.uniforms.sizeScale.value = s;
    markerMaterial.uniforms.sizeScale.value = s;
  });
}
