import { useMemo } from 'react';
import * as THREE from 'three';
import type { NeuronDataset } from '../../data/types';
import { allocColoring } from '../../utils/coloring';

/** Allocates the mutable point-cloud buffers and corresponding Three.js geometry. */
export function usePointCloudGeometry(data: NeuronDataset) {
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

  return {
    buffers,
    projectableMask,
    activityValues,
    activityActiveMask,
    geometry,
  };
}
