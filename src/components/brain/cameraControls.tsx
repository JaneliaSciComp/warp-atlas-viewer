import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraState } from '../../utils/urlState';

export interface ScreenPanState {
  /** CSS-pixel offset applied in projection space. Positive values move
   *  the volume right/down in the viewport. */
  x: number;
  y: number;
}

function supportsViewOffset(
  camera: THREE.Camera,
): camera is THREE.PerspectiveCamera | THREE.OrthographicCamera {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera;
}

/** Screen-space panning is implemented as a projection offset, not as a
 *  camera/target translation. TrackballControls therefore keeps a stable
 *  orbit target at the volume center, while right-drag simply shifts where
 *  that centered view lands inside the canvas.
 *
 *  When `enabled` is false (the user toggled off object-centric rotation),
 *  this component clears any active view offset and detaches its pointer
 *  listeners so TrackballControls' native pan can take over the right
 *  mouse button. The cached `panRef` is preserved so toggling the mode
 *  back on restores the previous screen-space pan. */
export function ScreenSpacePan({
  panRef,
  enabled,
}: {
  panRef: React.MutableRefObject<ScreenPanState>;
  enabled: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const applyViewOffset = useCallback(() => {
    if (!supportsViewOffset(camera)) return;
    if (size.width <= 0 || size.height <= 0) return;
    const pan = panRef.current;
    camera.setViewOffset(size.width, size.height, -pan.x, -pan.y, size.width, size.height);
    invalidate();
  }, [camera, invalidate, panRef, size.height, size.width]);

  useEffect(() => {
    if (!enabled) {
      // Drop any active projection offset so the native trackball pan
      // sees a centered frustum to work against.
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
        invalidate();
      }
      return;
    }
    applyViewOffset();
  }, [applyViewOffset, camera, enabled, invalidate, size.height, size.width]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      el.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      panRef.current.x += dx;
      panRef.current.y += dy;
      applyViewOffset();
      event.preventDefault();
    };

    const stopDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', stopDrag);
      el.removeEventListener('pointercancel', stopDrag);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [applyViewOffset, enabled, gl, panRef]);

  return null;
}

/** Reads/writes the camera-controls + camera state so App can mirror
 *  it to the URL hash. Restores `initialCamera` once on mount;
 *  thereafter polls the camera each frame and fires `onCameraChange`
 *  only after a few idle frames so the URL update lands when the user
 *  has truly stopped moving (covers TrackballControls' damping settle
 *  without spamming a write per frame). */
export function CameraSync({
  initialCamera,
  onCameraChange,
  panRef,
  defaultCamPosition,
  resetRef,
  onAtDefaultChange,
  lockTargetToCenter,
  volumeCenter,
}: {
  initialCamera: CameraState | null;
  onCameraChange?: (cam: CameraState) => void;
  panRef: React.MutableRefObject<ScreenPanState>;
  defaultCamPosition: [number, number, number];
  resetRef: React.MutableRefObject<(() => void) | null>;
  onAtDefaultChange: (atDefault: boolean) => void;
  /** When true, the orbit target is forced back to volumeCenter each
   *  frame so rotation always pivots around the volume. When false, the
   *  user-driven pan (native TrackballControls pan) is allowed to move
   *  the target freely. */
  lockTargetToCenter: boolean;
  volumeCenter: [number, number, number];
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  // The drei controls wire themselves in via makeDefault; useThree
  // exposes the instance on .controls. Use any to avoid a public-API
  // dependency on TrackballControlsImpl.
  const controls = useThree((s) => s.controls) as any;
  const restoredRef = useRef(false);
  const lastRef = useRef<CameraState | null>(null);
  // Position tolerance for the at-default check. Trackball damping
  // can leave sub-unit residue after a snap, so compare against a
  // fraction of the default eye distance rather than using exact
  // equality.
  const POS_EPS = Math.max(1e-3, Math.hypot(...defaultCamPosition) * 1e-4);
  const atDefaultRef = useRef<boolean | null>(null);

  useEffect(() => {
    resetRef.current = () => {
      camera.position.set(...defaultCamPosition);
      // TrackballControls rotates camera.up during orbit, so position
      // + target alone leaves the view rolled. Restore the canonical
      // up vector so the volume returns to its original orientation.
      camera.up.set(0, 1, 0);
      controls?.target.set(...volumeCenter);
      controls?.update();
      panRef.current.x = 0;
      panRef.current.y = 0;
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
      }
      invalidate();
    };
    return () => {
      resetRef.current = null;
    };
  }, [camera, controls, defaultCamPosition, invalidate, panRef, resetRef, size.height, size.width, volumeCenter]);

  useEffect(() => {
    if (!controls || restoredRef.current) return;
    if (initialCamera) {
      camera.position.set(...initialCamera.pos);
      // Orient the camera. Current URLs carry both an explicit quaternion
      // (captures any roll the trackball produced) and the orbit target
      // (captures native pan). Older v2 URLs may only have pos + quat and
      // implicitly target the volume center; v1 URLs only had pos + target,
      // so fall back to look-at with the canonical up vector (roll for
      // those links is unrecoverable).
      const target = initialCamera.target ?? volumeCenter;
      if (initialCamera.quat) {
        camera.quaternion.set(
          initialCamera.quat[0],
          initialCamera.quat[1],
          initialCamera.quat[2],
          initialCamera.quat[3],
        );
        // Derive `up` from the quaternion so subsequent trackball
        // rotations have the correct local frame to spin around.
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      } else if (initialCamera.target) {
        camera.up.set(0, 1, 0);
        camera.lookAt(target[0], target[1], target[2]);
      }
      controls.target.set(...target);
      controls.update();
    }
    restoredRef.current = true;
  }, [controls, camera, initialCamera, volumeCenter]);

  useFrame(() => {
    if (!controls) return;
    if (
      lockTargetToCenter &&
      (controls.target.x !== volumeCenter[0] ||
        controls.target.y !== volumeCenter[1] ||
        controls.target.z !== volumeCenter[2])
    ) {
      controls.target.set(...volumeCenter);
      controls.update();
    }
    const targetAtCenter =
      Math.abs(controls.target.x - volumeCenter[0]) < POS_EPS &&
      Math.abs(controls.target.y - volumeCenter[1]) < POS_EPS &&
      Math.abs(controls.target.z - volumeCenter[2]) < POS_EPS;
    const isAtDefault =
      Math.abs(camera.position.x - defaultCamPosition[0]) < POS_EPS &&
      Math.abs(camera.position.y - defaultCamPosition[1]) < POS_EPS &&
      Math.abs(camera.position.z - defaultCamPosition[2]) < POS_EPS &&
      Math.abs(camera.up.x) < 1e-3 &&
      Math.abs(camera.up.y - 1) < 1e-3 &&
      Math.abs(camera.up.z) < 1e-3 &&
      panRef.current.x === 0 &&
      panRef.current.y === 0 &&
      targetAtCenter;
    if (atDefaultRef.current !== isAtDefault) {
      atDefaultRef.current = isAtDefault;
      onAtDefaultChange(isAtDefault);
    }
    if (!onCameraChange) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const quat: [number, number, number, number] = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ];
    const target: [number, number, number] = [
      controls.target.x,
      controls.target.y,
      controls.target.z,
    ];
    const rawPan = panRef.current;
    const pan: [number, number] | undefined =
      rawPan.x !== 0 || rawPan.y !== 0 ? [rawPan.x, rawPan.y] : undefined;
    const cam: CameraState = pan ? { pos, quat, target, pan } : { pos, quat, target };
    const last = lastRef.current;
    // Sub-pixel epsilon: anything below this per-frame delta is
    // numerically still as far as the rendered image cares about, so
    // we stop emitting and let the App-side debounce write the URL.
    // Exact float equality would keep counting the tail of trackball
    // damping (~0.9× velocity decay each frame) as "movement" for
    // ~130 frames after release — which kept resetting the debounce
    // and stalled the URL hash for ~2 s. The remaining residue past
    // this threshold is bounded by epsilon / dampingFactor (~1e-3
    // unit), well inside the rounded URL precision.
    const POS_DELTA_EPS = 1e-4;
    const TARGET_DELTA_EPS = 1e-4;
    const QUAT_DELTA_EPS = 1e-5;
    const PAN_DELTA_EPS = 1e-4;
    const moved =
      !last ||
      Math.abs(pos[0] - last.pos[0]) > POS_DELTA_EPS ||
      Math.abs(pos[1] - last.pos[1]) > POS_DELTA_EPS ||
      Math.abs(pos[2] - last.pos[2]) > POS_DELTA_EPS ||
      Math.abs(target[0] - (last.target?.[0] ?? volumeCenter[0])) > TARGET_DELTA_EPS ||
      Math.abs(target[1] - (last.target?.[1] ?? volumeCenter[1])) > TARGET_DELTA_EPS ||
      Math.abs(target[2] - (last.target?.[2] ?? volumeCenter[2])) > TARGET_DELTA_EPS ||
      Math.abs(quat[0] - (last.quat?.[0] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[1] - (last.quat?.[1] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[2] - (last.quat?.[2] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[3] - (last.quat?.[3] ?? 1)) > QUAT_DELTA_EPS ||
      Math.abs((pan?.[0] ?? 0) - (last.pan?.[0] ?? 0)) > PAN_DELTA_EPS ||
      Math.abs((pan?.[1] ?? 0) - (last.pan?.[1] ?? 0)) > PAN_DELTA_EPS;
    if (!moved) return;
    // Emit on every (above-epsilon) change so the upstream camera ref
    // stays current — the URL hash write is debounced 50 ms in App,
    // which is what coalesces the per-frame stream into a single
    // replaceState call once the damping settles below the epsilon.
    // Holding emits until N idle frames meant a tab duplicated
    // mid-rotation (or mid-damping) saw a stale hash.
    lastRef.current = cam;
    onCameraChange(cam);
  });

  return null;
}
