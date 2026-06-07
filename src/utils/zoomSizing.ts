import * as THREE from 'three';

// Auto point/ghost sizing keys off canvasHeight, which only proxies the
// volume's on-screen size at the default zoom (the brain fills the viewport
// vertically there). Depth-attenuated mode already keeps coverage constant
// under zoom: gl_PointSize ∝ instSize/dist while the projected brain ∝ 1/dist,
// so the two cancel. Flat mode has no 1/dist term, so its on-screen coverage
// drifts as you zoom. We close that gap by feeding the zoom ratio
// (defaultCamDistance / currentDistance) into the sizeScale uniform, but only
// in flat mode — in depth mode it would double-count. Clamped so flat points
// neither vanish at full zoom-out nor explode at full zoom-in.
const ZOOM_SIZE_MIN = 0.4;
const ZOOM_SIZE_MAX = 3.0;

export function zoomSizeScale(
  camera: THREE.Camera,
  target: THREE.Vector3,
  defaultCamDistance: number,
  flat: boolean,
): number {
  if (!flat || defaultCamDistance <= 0) return 1;
  const dist = camera.position.distanceTo(target);
  if (dist <= 0) return 1;
  return THREE.MathUtils.clamp(defaultCamDistance / dist, ZOOM_SIZE_MIN, ZOOM_SIZE_MAX);
}

// Depth attenuation in the vertex shaders is depthFactor = NUM / max(dist, MIN).
// Flat mode replaces that with a single constant factor; setting it to the
// value depth mode produces at the *default* zoom makes the toggle seamless
// for any dataset (no per-volume tuning of a magic number). Mirrors the
// shader constants so the two stay in lockstep.
const DEPTH_ATTEN_NUM = 160.0;
const DEPTH_ATTEN_MIN = 40.0;
export function flatSizeFactor(defaultCamDistance: number): number {
  return DEPTH_ATTEN_NUM / Math.max(DEPTH_ATTEN_MIN, defaultCamDistance);
}
