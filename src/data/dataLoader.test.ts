import { describe, it, expect } from 'vitest';
import {
  binaryFileKeys,
  buildDataset,
  expectedBytes,
  isMockRequested,
  parseManifest,
  validateBuffer,
  validateManifest,
  type ManifestV3,
} from './dataLoader';

function validManifest(overrides: Partial<ManifestV3> = {}): ManifestV3 {
  return {
    version: 3,
    count: 4,
    traceLength: 2,
    traceSampleRateHz: 1,
    activityTraceQuant: { lo: 0, hi: 1.5 },
    nStimuli: 2,
    geneNames: ['g0', 'g1'],
    regionNames: ['r0'],
    atlasRegionNames: ['a0', 'a1', 'a2'],
    stimulusNames: ['s0', 's1'],
    clusterNames: ['c0'],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    files: {
      positions: 'positions.bin',
      regionIds: 'regionIds.bin',
      clusterIds: 'clusterIds.bin',
      fishIds: 'fishIds.bin',
      geneCounts: 'geneCounts.bin',
      geneBinary: 'geneBinary.bin',
      umap: 'umap.bin',
      stimulusCorr: 'stimulusCorr.bin',
      swimCorr: 'swimCorr.bin',
      activityTrace: 'activityTrace.bin',
      atlasRegionMask: 'atlasRegionMask.bin',
    },
    ...overrides,
  };
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(() => validateManifest(validManifest())).not.toThrow();
  });

  it('rejects non-positive integer counts', () => {
    expect(() => validateManifest(validManifest({ count: 0 }))).toThrow(/count/);
    expect(() => validateManifest(validManifest({ traceLength: -1 }))).toThrow(/traceLength/);
    expect(() => validateManifest(validManifest({ nStimuli: 1.5 }))).toThrow(/nStimuli/);
  });

  it('rejects empty name arrays', () => {
    expect(() => validateManifest(validManifest({ geneNames: [] }))).toThrow(/geneNames/);
    expect(() => validateManifest(validManifest({ regionNames: [] }))).toThrow(/regionNames/);
    expect(() => validateManifest(validManifest({ atlasRegionNames: [] }))).toThrow(/atlasRegionNames/);
    expect(() => validateManifest(validManifest({ clusterNames: [] }))).toThrow(/clusterNames/);
  });

  it('rejects stimulusNames whose length disagrees with nStimuli', () => {
    expect(() =>
      validateManifest(validManifest({ stimulusNames: ['s0'], nStimuli: 2 })),
    ).toThrow(/stimulusNames/);
  });

  it('rejects non-finite bounds', () => {
    expect(() =>
      validateManifest(
        validManifest({
          bounds: { min: [0, 0, NaN], max: [1, 1, 1] },
        }),
      ),
    ).toThrow(/bounds.min/);
  });

  it('rejects activityTraceQuant where hi <= lo', () => {
    expect(() =>
      validateManifest(validManifest({ activityTraceQuant: { lo: 1, hi: 1 } })),
    ).toThrow(/activityTraceQuant\.hi/);
    expect(() =>
      validateManifest(validManifest({ activityTraceQuant: { lo: 2, hi: 1 } })),
    ).toThrow(/activityTraceQuant\.hi/);
  });

  it('rejects a missing or non-object files block', () => {
    expect(() =>
      validateManifest(validManifest({ files: undefined as unknown as ManifestV3['files'] })),
    ).toThrow(/manifest\.files/);
    expect(() =>
      validateManifest(validManifest({ files: [] as unknown as ManifestV3['files'] })),
    ).toThrow(/manifest\.files/);
  });

  it('rejects missing, empty, or non-string required file names', () => {
    const missing = validManifest();
    delete (missing.files as Partial<ManifestV3['files']>).fishIds;
    expect(() => validateManifest(missing)).toThrow(/manifest\.files\.fishIds/);

    const empty = validManifest();
    empty.files.positions = '';
    expect(() => validateManifest(empty)).toThrow(/manifest\.files\.positions/);

    const nonString = validManifest();
    (nonString.files as unknown as Record<string, unknown>).umap = 42;
    expect(() => validateManifest(nonString)).toThrow(/manifest\.files\.umap/);
  });

  it('rejects an invalid optional regressors file name when present', () => {
    const m = validManifest();
    m.files.regressors = '   ';
    expect(() => validateManifest(m)).toThrow(/manifest\.files\.regressors/);
  });
});

describe('expectedBytes', () => {
  // count=4, geneNames=2, nStimuli=2, traceLength=2:
  // positions      4 * 3 * 4 = 48
  // regionIds      4 * 2     =  8 (int16)
  // clusterIds     4 * 2     =  8 (int16)
  // fishIds        4         =  4 (uint8)
  // geneCounts     4 * 2 * 4 = 32 (float32)
  // geneBinary     4 * 2     =  8 (uint8)
  // umap           4 * 2 * 4 = 32
  // stimulusCorr   4 * 2 * 4 = 32
  // swimCorr       4 * 4     = 16
  // activityTrace  4 * 2 * 2 = 16 (uint16)
  // atlasRegionMask 4 * ceil(3/8) = 4 (packed bitfield, 3 atlas regions = 1 byte/cell)
  // regressors     2 * 2 * 4 = 16  ← per-stim × traceLength, NOT per-cell
  const m = validManifest();

  it.each([
    ['positions', 48],
    ['regionIds', 8],
    ['clusterIds', 8],
    ['fishIds', 4],
    ['geneCounts', 32],
    ['geneBinary', 8],
    ['umap', 32],
    ['stimulusCorr', 32],
    ['swimCorr', 16],
    ['activityTrace', 16],
    ['atlasRegionMask', 4],
    ['regressors', 16],
  ] as const)('sizes %s as %d bytes', (key, expected) => {
    expect(expectedBytes(key, m)).toBe(expected);
  });
});

describe('validateBuffer', () => {
  it('passes when the byte length matches', () => {
    expect(() => validateBuffer('positions.bin', new ArrayBuffer(48), 48)).not.toThrow();
  });

  it('throws with a clear message when the byte length is wrong', () => {
    expect(() =>
      validateBuffer('positions.bin', new ArrayBuffer(40), 48),
    ).toThrow(/expected 48 bytes, got 40/);
  });
});

describe('isMockRequested', () => {
  it('is true when the mock param is present (any/no value)', () => {
    expect(isMockRequested('?mock=1')).toBe(true);
    expect(isMockRequested('?mock')).toBe(true);
    expect(isMockRequested('?mock=0')).toBe(true); // presence, not truthiness
    expect(isMockRequested('?foo=1&mock=1')).toBe(true);
  });
  it('is false when the mock param is absent', () => {
    expect(isMockRequested('')).toBe(false);
    expect(isMockRequested('?foo=1')).toBe(false);
  });
});

describe('parseManifest', () => {
  it('returns the manifest for valid input', () => {
    const m = validManifest();
    expect(parseManifest(m)).toBe(m);
  });
  it('rejects non-object JSON', () => {
    expect(() => parseManifest(null)).toThrow(/must be a JSON object/);
    expect(() => parseManifest([1, 2, 3])).toThrow(/must be a JSON object/);
    expect(() => parseManifest('nope')).toThrow(/must be a JSON object/);
  });
  it('rejects an unsupported version', () => {
    expect(() => parseManifest(validManifest({ version: 2 as 3 }))).toThrow(/version 2/);
  });
  it('propagates field-level validation failures', () => {
    expect(() => parseManifest(validManifest({ count: 0 }))).toThrow(/count/);
  });
});

describe('binaryFileKeys', () => {
  it('lists the 11 required binaries and omits absent regressors', () => {
    const keys = binaryFileKeys(validManifest());
    expect(keys).toHaveLength(11);
    expect(keys).not.toContain('regressors');
  });
  it('appends regressors when the manifest declares them', () => {
    const m = validManifest();
    m.files.regressors = 'regressors.bin';
    const keys = binaryFileKeys(m);
    expect(keys).toHaveLength(12);
    expect(keys[keys.length - 1]).toBe('regressors');
  });
});

describe('buildDataset', () => {
  // Build a Map of correctly-sized (zeroed) buffers for every binary the
  // manifest declares, sized via expectedBytes so it can't drift.
  function validBuffers(m: ManifestV3): Map<keyof ManifestV3['files'], ArrayBuffer> {
    const map = new Map<keyof ManifestV3['files'], ArrayBuffer>();
    for (const k of binaryFileKeys(m)) map.set(k, new ArrayBuffer(expectedBytes(k, m)));
    return map;
  }

  it('constructs typed arrays of the expected kind and length', () => {
    const m = validManifest();
    const ds = buildDataset(m, validBuffers(m));
    expect(ds.count).toBe(4);
    expect(ds.source).toBe('real');
    expect(ds.positions).toBeInstanceOf(Float32Array);
    expect(ds.positions.length).toBe(12); // count*3
    expect(ds.regionIds).toBeInstanceOf(Int16Array);
    expect(ds.regionIds.length).toBe(4);
    expect(ds.fishIds).toBeInstanceOf(Uint8Array);
    expect(ds.activityTrace.length).toBe(8); // count*traceLength
    expect(ds.bounds).toEqual(m.bounds);
    expect(ds.regressors).toBeUndefined();
  });

  it('decodes the affine-quantized activity trace', () => {
    const m = validManifest(); // quant lo=0, hi=1.5
    const buffers = validBuffers(m);
    const q = new Uint16Array(m.count * m.traceLength); // 8 samples
    q[0] = 65535; // top of the quant range → hi
    q[1] = 0; // bottom → lo
    buffers.set('activityTrace', q.buffer);
    const ds = buildDataset(m, buffers);
    expect(ds.activityTrace[0]).toBeCloseTo(1.5);
    expect(ds.activityTrace[1]).toBeCloseTo(0);
  });

  it('includes regressors when the manifest declares them', () => {
    const m = validManifest();
    m.files.regressors = 'regressors.bin';
    const ds = buildDataset(m, validBuffers(m));
    expect(ds.regressors).toBeInstanceOf(Float32Array);
    expect(ds.regressors!.length).toBe(4); // nStimuli*traceLength
  });

  it('throws on a truncated buffer before constructing typed arrays', () => {
    const m = validManifest();
    const buffers = validBuffers(m);
    buffers.set('positions', new ArrayBuffer(40)); // expected 48
    expect(() => buildDataset(m, buffers)).toThrow(/expected 48 bytes, got 40/);
  });

  it('throws when a required buffer is missing', () => {
    const m = validManifest();
    const buffers = validBuffers(m);
    buffers.delete('fishIds');
    expect(() => buildDataset(m, buffers)).toThrow(/missing binary buffer for fishIds/);
  });
});
