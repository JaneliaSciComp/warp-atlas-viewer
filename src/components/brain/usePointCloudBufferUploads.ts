import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { FilterState, NeuronDataset, SelectionState, SettingsState } from '../../data/types';
import { applySelectionAsFilterGhost, type ColoringResult } from '../../utils/coloring';
import type { SharedColoring } from '../../hooks/useColoring';

/** Uploads shared coloring buffers into the local Three.js geometry attributes. */
export function usePointCloudBufferUploads({
  data,
  filter,
  settings,
  coloring,
  selection,
  focusedNeuron,
  projectionMode,
  buffers,
  projectableMask,
  activityValues,
  activityActiveMask,
  geometry,
  opaqueMaterial,
  transparentMaterial,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
  selection: SelectionState;
  focusedNeuron: number | null;
  projectionMode: SettingsState['projectionMode'];
  buffers: ColoringResult;
  projectableMask: Float32Array;
  activityValues: Float32Array;
  activityActiveMask: Float32Array;
  geometry: THREE.BufferGeometry;
  opaqueMaterial: THREE.ShaderMaterial;
  transparentMaterial: THREE.ShaderMaterial;
}) {
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

  // Reusable draw-order index attribute. coloring.drawOrder is a fresh
  // Uint32Array from each applyColoring pass, so wrapping it in a new
  // THREE.BufferAttribute on every filter change would allocate a new GPU
  // index buffer each time. We instead keep one attribute per geometry and
  // copy the new order into its backing store, so Three reuses the same buffer
  // via bufferSubData. Once uploaded, the attribute stays attached to the
  // geometry so Three can free its GL buffer when the geometry is disposed.
  const indexAttrRef = useRef<{
    geometry: THREE.BufferGeometry;
    attr: THREE.BufferAttribute;
    mode: 'drawOrder' | 'identity' | null;
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
    // dimmed group. The ring marker handles the actual focus indicator
    // — we don't bump the cell size.
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
    // sit in space. When no filter is active drawOrder is null; before
    // the first reordering we leave the geometry unindexed, and after
    // that we rewrite the reusable index to identity order and keep it
    // attached so Three disposes the uploaded GL buffer with the geometry.
    const ensureIndexAttr = (length: number) => {
      let owned = indexAttrRef.current;
      if (
        !owned ||
        owned.geometry !== geometry ||
        owned.attr.array.length !== length
      ) {
        // Allocate once per geometry size; reused across filter changes.
        const attr = new THREE.BufferAttribute(new Uint32Array(length), 1);
        attr.setUsage(THREE.DynamicDrawUsage);
        owned = { geometry, attr, mode: null };
        indexAttrRef.current = owned;
      }
      return owned;
    };
    if (coloring.drawOrder) {
      const owned = ensureIndexAttr(coloring.drawOrder.length);
      (owned.attr.array as Uint32Array).set(coloring.drawOrder);
      owned.attr.needsUpdate = true;
      owned.mode = 'drawOrder';
      if (geometry.index !== owned.attr) geometry.setIndex(owned.attr);
    } else if (indexAttrRef.current?.geometry === geometry) {
      const owned = ensureIndexAttr(data.count);
      if (owned.mode !== 'identity') {
        const indices = owned.attr.array as Uint32Array;
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        owned.attr.needsUpdate = true;
        owned.mode = 'identity';
      }
      if (geometry.index !== owned.attr) geometry.setIndex(owned.attr);
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
}
