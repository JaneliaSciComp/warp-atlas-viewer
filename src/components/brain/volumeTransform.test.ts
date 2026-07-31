import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VOLUME_GROUP_ROTATION, VOLUME_GROUP_SCALE } from './volumeTransform';

/** Compose the group transform exactly as three does (M = T * R * S) and
 *  push a preprocessed-space point through it. */
function toWorld(v: [number, number, number]): THREE.Vector3 {
  const g = new THREE.Object3D();
  g.rotation.set(...VOLUME_GROUP_ROTATION);
  g.scale.set(...VOLUME_GROUP_SCALE);
  g.updateMatrix();
  return new THREE.Vector3(...v).applyMatrix4(g.matrix);
}

function groupMatrix(): THREE.Matrix4 {
  const g = new THREE.Object3D();
  g.rotation.set(...VOLUME_GROUP_ROTATION);
  g.scale.set(...VOLUME_GROUP_SCALE);
  g.updateMatrix();
  return g.matrix;
}

describe('volume group transform', () => {
  it('maps preprocessed (x, y, z) to world (y, x, z)', () => {
    const w = toWorld([3, 5, 7]);
    expect(w.x).toBeCloseTo(5, 5);
    expect(w.y).toBeCloseTo(3, 5);
    expect(w.z).toBeCloseTo(7, 5);
  });

  it('puts rostral (preprocessed +Y) on world +X', () => {
    const w = toWorld([0, 100, 0]);
    expect(w.x).toBeCloseTo(100, 5);
    expect(w.y).toBeCloseTo(0, 5);
    expect(w.z).toBeCloseTo(0, 5);
  });

  it('puts the lateral axis (preprocessed +X) on world +Y', () => {
    const w = toWorld([100, 0, 0]);
    expect(w.x).toBeCloseTo(0, 5);
    expect(w.y).toBeCloseTo(100, 5);
    expect(w.z).toBeCloseTo(0, 5);
  });

  it('leaves dorsal (preprocessed +Z) on world +Z', () => {
    const w = toWorld([0, 0, 100]);
    expect(w.z).toBeCloseTo(100, 5);
  });

  it('is orientation-reversing, so world handedness is mirrored', () => {
    // Documents why anatomical left/right cannot be derived from the axes
    // and has to be confirmed visually.
    expect(groupMatrix().determinant()).toBeLessThan(0);
  });

  it('preserves lengths, so camera distances are orientation-independent', () => {
    expect(toWorld([3, 4, 12]).length()).toBeCloseTo(13, 5);
  });
});
