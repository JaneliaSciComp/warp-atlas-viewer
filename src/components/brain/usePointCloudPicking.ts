import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../../data/types';
import {
  anyFilterActive,
  cellInSet,
  cellIsRenderable,
  type ColoringResult,
} from '../../utils/coloring';
import type { SharedColoring } from '../../hooks/useColoring';

export interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}

interface UsePointCloudPickingParams {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
  selection: SelectionState;
  buffers: ColoringResult;
  projectionMode: SettingsState['projectionMode'];
  pickRef: MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
  idMaterial: THREE.ShaderMaterial;
  idRt: THREE.WebGLRenderTarget;
  contextPointsRef: MutableRefObject<THREE.Points | null>;
  markerPointsRef: MutableRefObject<THREE.Points | null>;
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  size: { width: number; height: number };
}

export function usePointCloudPicking({
  data,
  filter,
  settings,
  coloring,
  selection,
  buffers,
  projectionMode,
  pickRef,
  onHoverChange,
  idMaterial,
  idRt,
  contextPointsRef,
  markerPointsRef,
  gl,
  scene,
  camera,
  size,
}: UsePointCloudPickingParams): void {
  const ndcRef = useRef(new THREE.Vector3());
  const idPixelRef = useRef(new Uint8Array(4));

  useFrame(() => {
    const projMode = projectionMode;
    // Mean / sum projection has no single per-pixel winner. It still
    // needs click focus, so those modes fall through to the geometric
    // picker below, restricted to cells that contribute to projection.
    // Max / min projection: pick via an ID-buffer readback so the
    // selected cell matches the pixel actually drawn on screen
    // (rather than the geometrically-nearest cell center, which can
    // diverge wildly when a deep high-intensity cell punches through
    // a shallow low-intensity one). Same depth-test reduction as the
    // visible projection pass, written into an RGBA8 offscreen with
    // cell index packed across RGB.
    if (projMode === 'max' || projMode === 'min' || projMode === 'maxabs') {
      const pos = pickRef.current.pos;
      if (!pos) {
        if (pickRef.current.hovered !== -1) {
          pickRef.current.hovered = -1;
          onHoverChange(-1);
        }
        return;
      }
      const prevOverride = scene.overrideMaterial;
      const prevBackground = scene.background;
      const prevTarget = gl.getRenderTarget();
      const prevClearColor = gl.getClearColor(new THREE.Color());
      const prevClearAlpha = gl.getClearAlpha();
      const ctx = contextPointsRef.current;
      const prevCtxVisible = ctx ? ctx.visible : true;
      const marker = markerPointsRef.current;
      const prevMarkerVisible = marker ? marker.visible : true;
      try {
        // Exclude the ghost/context underlay so its cells (which share the
        // geometry, hence the same scalar attributes) don't win ID pixels
        // over the projection cells the user actually sees.
        if (ctx) ctx.visible = false;
        if (marker) marker.visible = false;
        scene.overrideMaterial = idMaterial;
        // The viewer scene has an opaque background color for the normal
        // backbuffer render. Suppress it for the ID target so empty pixels
        // stay the packed background value (0,0,0) and decode to "no cell".
        scene.background = null;
        gl.setRenderTarget(idRt);
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, false);
        gl.render(scene, camera);
      } finally {
        if (ctx) ctx.visible = prevCtxVisible;
        if (marker) marker.visible = prevMarkerVisible;
        scene.overrideMaterial = prevOverride;
        scene.background = prevBackground;
        gl.setRenderTarget(prevTarget);
        gl.setClearColor(prevClearColor, prevClearAlpha);
      }
      const pr = gl.getPixelRatio();
      // readPixels uses bottom-up Y; our cursor coords are top-down.
      const px = Math.floor(pos.x * pr);
      const py = Math.floor((size.height - pos.y) * pr);
      const pixel = idPixelRef.current;
      gl.readRenderTargetPixels(idRt, px, py, 1, 1, pixel);
      const packed = pixel[0] | (pixel[1] << 8) | (pixel[2] << 16);
      const id = packed === 0 ? -1 : packed - 1;
      if (id !== pickRef.current.hovered) {
        pickRef.current.hovered = id;
        onHoverChange(id);
      }
      return;
    }
    const pos = pickRef.current.pos;
    if (!pos) {
      if (pickRef.current.hovered !== -1) {
        pickRef.current.hovered = -1;
        onHoverChange(-1);
      }
      return;
    }
    const { x: mx, y: my } = pos;
    const positions = data.positions;
    const w = size.width;
    const h = size.height;
    const projMat = camera.projectionMatrix;
    const viewMat = camera.matrixWorldInverse;
    const tmp = ndcRef.current;
    const CENTER_FALLBACK_RADIUS = 16;
    const CENTER_FALLBACK_RADIUS_SQ = CENTER_FALLBACK_RADIUS * CENTER_FALLBACK_RADIUS;
    const PICK_PAD_PX = 2;
    const MIN_DISK_PICK_RADIUS = 3;

    // Match the world transform applied by <group> below: scale y by
    // −1 (flip the AP/longitudinal axis to match the paper figures),
    // then rotate +90° around Z. Net effect on raw data coords:
    //   (dx, dy, dz) → (dy, dx, dz)
    // so AP/world-y → +screen-x and ML/world-x → +screen-y.

    // Pick in two tiers:
    //   1. If the cursor is inside one or more rendered point disks,
    //      choose the front-most disk. This matches what the depth
    //      buffer shows, so a rear cell center cannot steal a click
    //      from a visible front cell.
    //   2. If the cursor is near but not on any disk, fall back to the
    //      nearest center in a 16 px radius to keep small/far points
    //      easy to acquire.
    //
    // When a filter is active, in-filter cells outrank out-of-filter
    // ones regardless of distance/depth: the dimmed background cells
    // are visually de-emphasized, so a click on a coloured cell that
    // happens to sit a hair behind a greyed-out one should still land
    // on the coloured cell. Out-of-filter cells are only considered if
    // no in-filter cell is within the pick window — and not at all
    // when ghost mode is on, since they're effectively invisible.
    //
    // The t-SNE lasso is treated as an additional filter in the 3D
    // viewer (see applySelectionAsFilterGhost), so it contributes to
    // both `filterActive` and per-cell `inFilter`. That keeps the
    // picker's priority aligned with the rendered ghost demotion.
    const hasLasso = selection.source === 'umap' && selection.indices.length > 0;
    const lassoSet = hasLasso ? new Set<number>(Array.from(selection.indices)) : null;
    const filterActive = anyFilterActive(data, filter) || hasLasso;
    // Below half visibility, ghosts are too faint to aim at — skip
    // them in the picker so clicks always land on cells the user can
    // actually see. Use coloring's effective ghost intensity so this
    // tracks autoSizing too.
    const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
    const ghost = filterActive && effGhost < 0.5;
    // Read from our LOCAL buffers (not coloring.result) so the picker
    // honors the selection-as-filter ghost override: a cell that was
    // demoted to ghost in the 3D pass should also be unpickable below
    // the visibility threshold, even though the shared buffer still
    // marks it as in-set.
    const alphas = buffers.alphas;
    const pointSizes = buffers.sizes;
    const projectionFallbackPicking = projMode === 'mean' || projMode === 'sum';
    const projectionFloor = Math.max(0, Math.min(1, settings.projectionIntensityFloor));
    const defaultPointSize = coloring?.effectivePointSize ?? settings.pointSize;
    const pixelRatio = gl.getPixelRatio();
    let bestDiskI = -1;
    let bestDiskD2 = Infinity;
    let bestDiskZ = Infinity;
    let bestDiskInFilter = false;
    let bestNearI = -1;
    let bestNearD2 = Infinity;
    let bestNearZ = Infinity;
    let bestNearInFilter = false;
    for (let i = 0; i < data.count; i++) {
      if (!cellIsRenderable(data, filter, i)) continue;
      if (alphas && alphas[i] < 0.02) continue;
      if (projectionFallbackPicking) {
        if (!Number.isFinite(buffers.scalarValues[i])) continue;
        if (buffers.intensities[i] < projectionFloor) continue;
      }
      const ox = positions[i * 3];
      const x = positions[i * 3 + 1];
      const y = ox;
      const z = positions[i * 3 + 2];
      tmp.set(x, y, z);
      tmp.applyMatrix4(viewMat);
      const cz = tmp.z;
      if (cz > -1) continue;
      tmp.applyMatrix4(projMat);
      const px = (tmp.x * 0.5 + 0.5) * w;
      const py = (-tmp.y * 0.5 + 0.5) * h;
      const dx = px - mx;
      const dy = py - my;
      const d2 = dx * dx + dy * dy;
      const depth = -cz;
      const pointSize = pointSizes ? pointSizes[i] : defaultPointSize;
      const diameter = Math.max(1.5 / pixelRatio, pointSize * (160 / Math.max(depth, 40)));
      const diskRadius = Math.max(MIN_DISK_PICK_RADIUS, diameter * 0.5 + PICK_PAD_PX);
      const diskHit = d2 <= diskRadius * diskRadius;
      const nearHit = d2 <= CENTER_FALLBACK_RADIUS_SQ;
      if (!diskHit && !nearHit) continue;
      // "In filter" for picker priority: passes the active filter cards
       // AND is inside the active lasso (if any).
      const inFilter =
        !filterActive ||
        (cellInSet(data, filter, settings, i) && (!lassoSet || lassoSet.has(i)));
      if (diskHit) {
        if (inFilter) {
          if (
            !bestDiskInFilter ||
            depth < bestDiskZ ||
            (depth === bestDiskZ && d2 < bestDiskD2)
          ) {
            bestDiskInFilter = true;
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        } else if (!bestDiskInFilter && !ghost) {
          if (depth < bestDiskZ || (depth === bestDiskZ && d2 < bestDiskD2)) {
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        }
      }
      if (nearHit) {
        if (inFilter) {
          if (!bestNearInFilter || d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearInFilter = true;
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        } else if (!bestNearInFilter && !ghost) {
          if (d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        }
      }
    }

    const bestI = bestDiskI >= 0 ? bestDiskI : bestNearI;
    if (bestI !== pickRef.current.hovered) {
      pickRef.current.hovered = bestI;
      onHoverChange(bestI);
    }
  });

}
