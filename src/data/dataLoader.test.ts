import { describe, it, expect } from 'vitest';
import {
  expectedBytes,
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
