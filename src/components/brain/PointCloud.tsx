import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../../data/types';
import {
  allocColoring,
  applySelectionAsFilterGhost,
} from '../../utils/coloring';
import type { SharedColoring } from '../../hooks/useColoring';
import { skipAmbientOcclusionUserData } from '../AmbientOcclusion';
import { zoomSizeScale, flatSizeFactor } from '../../utils/zoomSizing';
import type { ScalarProjectionConfig } from './projectionModel';
import {
  FOCUS_MARKER_NAME,
  PROJECTION_CONTEXT_NAME,
  PROJECTION_POINTS_NAME,
} from './sceneObjectNames';
import { registerProjectionShaderChunks } from './registerProjectionShaderChunks';
import { usePointCloudMaterials } from './usePointCloudMaterials';
import { usePointCloudPicking, type PickState } from './usePointCloudPicking';
import { useFocusMarker } from './useFocusMarker';

export type { PickState };

registerProjectionShaderChunks();

/** Inner R3F component: owns the Points object and shader updates.
 *  Filter / settings / selection are already baked into `coloring`;
 *  this component reads them directly only for the picker's
 *  in-filter prioritization. */
export function PointCloud({
  data,
  filter,
  settings,
  coloring,
  projectionMode,
  projectionConfig,
  projectionColorMap,
  selection,
  focusedNeuron,
  pickRef,
  onHoverChange,
  defaultCamDistance,
  volumeCenter,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
  projectionMode: SettingsState['projectionMode'];
  projectionConfig: ScalarProjectionConfig;
  projectionColorMap: THREE.DataTexture;
  selection: SelectionState;
  focusedNeuron: number | null;
  pickRef: MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
  /** Camera-to-target distance at the default zoom (span * 0.95). The basis
   *  for the flat-mode zoom-size correction below. */
  defaultCamDistance: number;
  /** Volume center in rendered world coordinates. Used as the camera-distance fallback before controls mount. */
  volumeCenter: THREE.Vector3;
}) {
  const { gl, scene, camera, size } = useThree();
  // drei's makeDefault publishes the TrackballControls instance here. Used
  // to read the live orbit target for the zoom-size correction; may be null
  // for the first frame or two before the controls mount.
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  // The ghost/context underlay. Hidden during the ID-buffer picking render
  // so hover/click resolve to the projection cell on top, not a context
  // dot behind it.
  const contextPointsRef = useRef<THREE.Points>(null);

  const buffers = useMemo(() => allocColoring(data.count), [data]);
  const projectableMask = useMemo(() => new Float32Array(data.count), [data]);
  const activityValues = useMemo(() => new Float32Array(data.count), [data]);
  const activityActiveMask = useMemo(() => new Float32Array(data.count), [data]);

  // Static per-cell index attribute (0..count-1). Used by the
  // projection-mode ID pass to encode the winning cell per pixel.
  // Values never change after dataset load so we don't track
  // needsUpdate after the initial upload.
  const cellIds = useMemo(() => {
    const arr = new Float32Array(data.count);
    for (let i = 0; i < data.count; i++) arr[i] = i;
    return arr;
  }, [data]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('instColor', new THREE.BufferAttribute(buffers.colors, 3));
    g.setAttribute('instAlpha', new THREE.BufferAttribute(buffers.alphas, 1));
    g.setAttribute('instSize', new THREE.BufferAttribute(buffers.sizes, 1));
    // Projection-mode intensity (scheme-aware magnitude). Separate from
    // alpha so projection works even when fadeWeakCorrelation collapses
    // alpha to 1 for all in-set cells. Only the projection vertex
    // shader reads this attribute.
    g.setAttribute('instIntensity', new THREE.BufferAttribute(buffers.intensities, 1));
    g.setAttribute('instScalar', new THREE.BufferAttribute(buffers.scalarValues, 1));
    g.setAttribute('instProjectable', new THREE.BufferAttribute(projectableMask, 1));
    g.setAttribute('instActivity', new THREE.BufferAttribute(activityValues, 1));
    g.setAttribute('instActivityActive', new THREE.BufferAttribute(activityActiveMask, 1));
    g.setAttribute('instCellId', new THREE.BufferAttribute(cellIds, 1));
    g.computeBoundingSphere();
    return g;
  }, [data, buffers, projectableMask, activityValues, activityActiveMask, cellIds]);

  const {
    opaqueMaterial,
    transparentMaterial,
    contextMaterial,
    projectionMaterial,
    idRt,
    idMaterial,
  } = usePointCloudMaterials({
    gl,
    size,
    projectionMode,
    projectionConfig,
    projectionColorMap,
    settings,
  });

  // Canvas-size adaptation now lives inside applyColoring's auto-mode
  // formulas (basePointSize is derived from canvas height), so the
  // shader uniform stays at its default 1.0. We keep the uniform
  // around for shader-source compatibility but no longer drive it
  // from JS.

  const lastStaticUploadRef = useRef<{
    focusedNeuron: number | null;
    selection: SelectionState;
    coloringRevision: number;
  } | null>(null);

  useEffect(() => {
    if (!coloring) return;
    const activityShaderMode =
      filter.colorMode === 'activity' && projectionMode === 'off';
    const skipStaticUpload =
      activityShaderMode &&
      lastStaticUploadRef.current?.focusedNeuron === focusedNeuron &&
      lastStaticUploadRef.current?.selection === selection &&
      lastStaticUploadRef.current?.coloringRevision === coloring.revision;
    if (skipStaticUpload) return;
    // Copy the shared base coloring into our own buffers so the
    // focused-neuron stamp and selection-as-filter ghost pass below
    // don't corrupt what other consumers (UmapPanel) read from the
    // same shared result.
    buffers.colors.set(coloring.result.colors);
    buffers.alphas.set(coloring.result.alphas);
    buffers.sizes.set(coloring.result.sizes);
    const projectionAttributesNeeded = projectionMode !== 'off';
    const scalarAttributesNeeded = projectionAttributesNeeded || activityShaderMode;
    if (scalarAttributesNeeded) {
      buffers.intensities.set(coloring.result.intensities);
      buffers.scalarValues.set(coloring.result.scalarValues);
    }
    // Treat a t-SNE lasso selection as an additional filter for the 3D
    // viewer only: demote in-set cells outside the lasso to standard
    // ghost values. UmapPanel reads the shared (non-demoted) buffer so
    // the user can lasso new subsets from the dimmed cells.
    // basePointSize (the un-boosted size) keeps the in-set boost from
    // scale-by-filter confined to active cells — the helper sizes
    // ghosts as basePointSize × ghostFactor.
    applySelectionAsFilterGhost(
      buffers,
      data.count,
      coloring.drawOrder,
      coloring.filterSelection,
      coloring.basePointSize,
      coloring.effectiveGhostIntensity,
      selection,
    );
    // Stamp the focused neuron on top of whatever group coloring chose
    // for it: full alpha, brightened, so it stays visible inside a
    // dimmed group. The ring marker (below) handles the actual focus
    // indicator — we don't bump the cell size.
    // Note: in activityShaderMode the shader recomputes color/alpha from
    // instActivity for active cells, so this stamp is overridden there —
    // the ring still marks focus, but a focused no-signal cell shows at the
    // dim no-signal alpha rather than being lifted to 1.0.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const i = focusedNeuron;
      buffers.colors[i * 3] = Math.min(1, buffers.colors[i * 3] * 1.2 + 0.25);
      buffers.colors[i * 3 + 1] = Math.min(1, buffers.colors[i * 3 + 1] * 1.2 + 0.25);
      buffers.colors[i * 3 + 2] = Math.min(1, buffers.colors[i * 3 + 2] * 1.2 + 0.25);
      buffers.alphas[i] = 1.0;
    }
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
    if (activityShaderMode) {
      for (let i = 0; i < data.count; i++) {
        activityActiveMask[i] = Number.isFinite(buffers.scalarValues[i]) ? 1 : 0;
      }
      (geometry.attributes.instActivityActive as THREE.BufferAttribute).needsUpdate = true;
    }
    if (projectionAttributesNeeded) {
      for (let i = 0; i < data.count; i++) {
        projectableMask[i] = Number.isFinite(buffers.scalarValues[i]) ? 1 : 0;
      }
      (geometry.attributes.instIntensity as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.instScalar as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.instProjectable as THREE.BufferAttribute).needsUpdate = true;
    }
    // drawOrder partitions cells so out-of-filter indices come first
    // and in-filter ones last. Setting it as the geometry's index
    // buffer makes Three.js draw them in that order — combined with
    // depthWrite: false (so the depth buffer doesn't enforce true 3D
    // ordering for transparents) this guarantees in-set cells
    // composite over the dim ghost haze regardless of where they
    // sit in space. When no filter is active drawOrder is null and
    // we clear the index so the renderer falls back to natural order.
    if (coloring.drawOrder) {
      geometry.setIndex(new THREE.BufferAttribute(coloring.drawOrder, 1));
    } else if (geometry.index) {
      geometry.setIndex(null);
    }
    lastStaticUploadRef.current = {
      focusedNeuron,
      selection,
      coloringRevision: coloring.revision,
    };
  }, [data, filter, settings, coloring, selection, focusedNeuron, buffers, projectableMask, activityActiveMask, geometry, projectionMode]);

  useEffect(() => {
    const activityShaderMode =
      filter.colorMode === 'activity' && projectionMode === 'off';
    const mode = activityShaderMode ? 1 : 0;
    const lo = settings.activityLo;
    const hi = Math.max(lo + 0.001, settings.activityHi);
    const noSignalAlpha =
      (filter.anatomyAtlas === 'mapzebrain'
        ? filter.isolatedAtlasRegion
        : filter.isolatedRegion) >= 0
        ? 0.5
        : 0.22;
    for (const material of [opaqueMaterial, transparentMaterial]) {
      material.uniforms.activityMode.value = mode;
      material.uniforms.activityLo.value = lo;
      material.uniforms.activityHi.value = hi;
      material.uniforms.activityNoSignalAlpha.value = noSignalAlpha;
      material.uniforms.activityActiveBrightness.value = settings.activeBrightness;
      material.uniforms.activityOpaqueActiveCells.value = settings.opaqueActiveCells ? 1 : 0;
    }
  }, [
    filter.anatomyAtlas,
    filter.colorMode,
    filter.isolatedAtlasRegion,
    filter.isolatedRegion,
    opaqueMaterial,
    projectionMode,
    settings.activeBrightness,
    settings.activityHi,
    settings.activityLo,
    settings.opaqueActiveCells,
    transparentMaterial,
  ]);

  useEffect(() => {
    if (filter.colorMode !== 'activity' || projectionMode !== 'off') return;
    const sample = Math.max(0, Math.min(data.traceLength - 1, filter.activitySample | 0));
    const trace = data.activityTrace;
    const T = data.traceLength;
    for (let i = 0; i < data.count; i++) {
      activityValues[i] = trace[i * T + sample];
    }
    (geometry.attributes.instActivity as THREE.BufferAttribute).needsUpdate = true;
  }, [
    activityValues,
    data,
    filter.activitySample,
    filter.colorMode,
    geometry,
    projectionMode,
  ]);

  const { markerGeometry, markerMaterial, markerPointsRef } = useFocusMarker({
    data,
    focusedNeuron,
    gl,
    initialPointSize: settings.pointSize,
    effectiveMarkerSize: coloring?.effectivePointSize ?? settings.pointSize,
  });

  useEffect(() => {
    // Single source of truth: settings.scaleByDepth fans out to every
    // material that computes gl_PointSize. The shader-side uniform is
    // `flatPointSize` (1 = flat, 0 = attenuated) — the inversion lives
    // here so the user-facing setting reads positively ("scale by depth
    // is on, by default"). AmbientOcclusion's internal material gets
    // the same flag via a prop on the JSX element.
    const v = settings.scaleByDepth ? 0 : 1;
    opaqueMaterial.uniforms.flatPointSize.value = v;
    transparentMaterial.uniforms.flatPointSize.value = v;
    projectionMaterial.uniforms.flatPointSize.value = v;
    contextMaterial.uniforms.flatPointSize.value = v;
    idMaterial.uniforms.flatPointSize.value = v;
    markerMaterial.uniforms.flatPointSize.value = v;
  }, [
    settings.scaleByDepth,
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
    const flat = !settings.scaleByDepth;
    const target = controls?.target ?? volumeCenter;
    const s = zoomSizeScale(camera, target, defaultCamDistance, flat);
    opaqueMaterial.uniforms.sizeScale.value = s;
    transparentMaterial.uniforms.sizeScale.value = s;
    projectionMaterial.uniforms.sizeScale.value = s;
    contextMaterial.uniforms.sizeScale.value = s;
    idMaterial.uniforms.sizeScale.value = s;
    markerMaterial.uniforms.sizeScale.value = s;
  });

  useEffect(() => {
    if (focusedNeuron == null || focusedNeuron < 0 || focusedNeuron >= data.count) {
      markerGeometry.setDrawRange(0, 0);
      return;
    }
    const i = focusedNeuron;
    const pos = markerGeometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
    pos.needsUpdate = true;
    markerGeometry.setDrawRange(0, 1);
  }, [focusedNeuron, data, markerGeometry]);

  usePointCloudPicking({
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
  });

  const projectionOn = projectionMode !== 'off';
  return (
    <group rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
      {projectionOn ? (
        // Projection mode replaces the normal opaque + transparent
        // foreground with an existing-buffer ghost pass plus the
        // projection overlay. The underlay uses the same instColor,
        // instAlpha, instSize, ghost visibility, and auto-sizing logic as
        // normal rendering, but masks to actual non-projectable ghosts, so
        // low-alpha active signal cells do not become context.
        <>
          <points
            ref={contextPointsRef}
            name={PROJECTION_CONTEXT_NAME}
            geometry={geometry}
            material={contextMaterial}
            renderOrder={-1}
            userData={skipAmbientOcclusionUserData}
          />
          <points
            name={PROJECTION_POINTS_NAME}
            geometry={geometry}
            material={projectionMaterial}
            renderOrder={0}
            userData={skipAmbientOcclusionUserData}
          />
          <points
            ref={markerPointsRef}
            name={FOCUS_MARKER_NAME}
            geometry={markerGeometry}
            material={markerMaterial}
            renderOrder={2}
            userData={skipAmbientOcclusionUserData}
          />
        </>
      ) : (
        <>
          {/* Opaque pass first so its depth values are in place before the
            * transparent pass reads them. Both points share the same
            * geometry — the materials' alphaMin / alphaMax uniforms
            * partition cells by alpha at the fragment level. */}
          <points geometry={geometry} material={opaqueMaterial} renderOrder={0} />
          <points
            geometry={geometry}
            material={transparentMaterial}
            renderOrder={1}
            userData={skipAmbientOcclusionUserData}
          />
          <points
            ref={markerPointsRef}
            name={FOCUS_MARKER_NAME}
            geometry={markerGeometry}
            material={markerMaterial}
            renderOrder={2}
            userData={skipAmbientOcclusionUserData}
          />
        </>
      )}
    </group>
  );
}
