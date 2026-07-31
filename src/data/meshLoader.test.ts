import { describe, it, expect } from 'vitest';
import {
  BRAIN_MESH_CONTROLS,
  decodeMeshBuffer,
  parseMeshManifest,
  type BrainMeshEntry,
} from './meshLoader';

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    source: 'https://mapzebrain.org - Kunst et al., 2019',
    voxelCenter: [283.79, 463.48, 219.8],
    meshes: {
      outline: { file: 'meshOutline.bin.gz', triangles: 2, color: '#dddcdf' },
      fibers: { file: 'meshFibers.bin.gz', triangles: 1, color: '#dddcdf' },
      cellBodies: { file: 'meshCellBodies.bin.gz', triangles: 1, color: '#dddcdf' },
    },
    ...overrides,
  };
}

describe('parseMeshManifest', () => {
  it('accepts a well-formed manifest', () => {
    const m = parseMeshManifest(validRaw());
    expect(m.meshes.outline.triangles).toBe(2);
    expect(m.voxelCenter).toEqual([283.79, 463.48, 219.8]);
  });

  it('rejects a manifest missing a mesh key', () => {
    const raw = validRaw();
    delete (raw.meshes as Record<string, unknown>).fibers;
    expect(() => parseMeshManifest(raw)).toThrow(/fibers/);
  });

  it('rejects a non-positive triangle count', () => {
    const raw = validRaw();
    (raw.meshes as Record<string, BrainMeshEntry>).outline.triangles = 0;
    expect(() => parseMeshManifest(raw)).toThrow(/triangles/);
  });

  it('rejects a wrong-length voxelCenter', () => {
    expect(() => parseMeshManifest(validRaw({ voxelCenter: [1, 2] }))).toThrow(
      /voxelCenter/,
    );
  });

  it('rejects a non-object', () => {
    expect(() => parseMeshManifest(null)).toThrow();
    expect(() => parseMeshManifest([])).toThrow();
  });
});

describe('decodeMeshBuffer', () => {
  const entry: BrainMeshEntry = {
    file: 'meshOutline.bin.gz',
    triangles: 2,
    color: '#dddcdf',
  };

  it('wraps a correctly sized buffer', () => {
    // 2 triangles x 3 vertices x 3 floats = 18 floats
    const src = new Float32Array(18).map((_, i) => i);
    const out = decodeMeshBuffer(entry, src.buffer);
    expect(out.length).toBe(18);
    expect(out[17]).toBe(17);
  });

  it('rejects a short buffer and names the file', () => {
    const src = new Float32Array(17);
    expect(() => decodeMeshBuffer(entry, src.buffer)).toThrow(/meshOutline\.bin\.gz/);
  });

  it('rejects a long buffer', () => {
    const src = new Float32Array(19);
    expect(() => decodeMeshBuffer(entry, src.buffer)).toThrow(/18/);
  });
});

describe('BRAIN_MESH_CONTROLS', () => {
  it('covers all three meshes with distinct settings fields', () => {
    expect(BRAIN_MESH_CONTROLS.map((c) => c.key)).toEqual([
      'outline',
      'fibers',
      'cellBodies',
    ]);
    const enabled = BRAIN_MESH_CONTROLS.map((c) => c.enabledKey);
    const opacity = BRAIN_MESH_CONTROLS.map((c) => c.opacityKey);
    expect(new Set(enabled).size).toBe(3);
    expect(new Set(opacity).size).toBe(3);
  });
});
