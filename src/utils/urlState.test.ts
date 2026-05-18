import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decodeHash,
  diffFilter,
  diffSettings,
  encodeHash,
  roundCamera,
  roundLasso,
  roundViewport,
  viewportIsDefault,
} from './urlState';
import { DEFAULT_SETTINGS, type FilterState, type SettingsState } from '../data/types';

const INITIAL_FILTER: FilterState = {
  colorMode: 'region',
  geneScale: 'log',
  showUnassignedRegion: true,
  isolatedRegion: -1,
  isolatedFish: -1,
  txMode: 'gene',
  selectedGenes: [],
  geneLogic: 'or',
  selectedCluster: 0,
  selectedStimuli: [],
  stimLogic: 'or',
  stimMode: 'positive',
  activitySample: 0,
  swimMode: 'off',
};

describe('encodeHash / decodeHash', () => {
  it('emits empty for an empty state', () => {
    expect(encodeHash({})).toBe('');
  });

  it('round-trips a non-trivial state', () => {
    const state = {
      filter: { colorMode: 'gene', selectedGenes: [3, 7] } as Partial<FilterState>,
      settings: { stimLo: 0.2 } as Partial<SettingsState>,
      focusedNeuron: 42,
      detail: true,
      camera: {
        pos: [1, 2, 3] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        pan: [12, -8] as [number, number],
      },
    };
    const hash = encodeHash(state);
    expect(hash.startsWith('#!')).toBe(true);
    const decoded = decodeHash(hash);
    expect(decoded).toMatchObject(state);
  });

  it('returns null for a hash without the #! prefix', () => {
    expect(decodeHash('foo')).toBeNull();
    expect(decodeHash('')).toBeNull();
  });

  it('warns and returns null for malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = decodeHash('#!{not json}');
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops unknown enum values silently', () => {
    const bogus = encodeHash({
      filter: { colorMode: 'banana' as unknown as FilterState['colorMode'] },
    });
    const decoded = decodeHash(bogus);
    // Unknown enum is dropped; the spread-merge in App falls back to default.
    expect(decoded?.filter?.colorMode).toBeUndefined();
  });

  it('drops out-of-range numeric fields silently', () => {
    const bogus = encodeHash({
      filter: { isolatedRegion: -5 as number }, // schema requires >= -1
    });
    const decoded = decodeHash(bogus);
    expect(decoded?.filter?.isolatedRegion).toBeUndefined();
  });

  it('dedupes and sorts selectedGenes / selectedStimuli on parse', () => {
    const hash = encodeHash({ filter: { selectedGenes: [5, 1, 5, 3] } });
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.selectedGenes).toEqual([1, 3, 5]);
  });

  it('clamps stimulus cutoffs as nonnegative magnitudes', () => {
    const hash = encodeHash({
      settings: { stimLo: -0.2, stimHi: -0.5 } as Partial<SettingsState>,
    });
    const decoded = decodeHash(hash);
    expect(decoded?.settings?.stimLo).toBe(0);
    expect(decoded?.settings?.stimHi).toBe(0);
  });
});

describe('diffFilter', () => {
  it('returns {} when state equals defaults', () => {
    expect(diffFilter(INITIAL_FILTER, INITIAL_FILTER)).toEqual({});
  });

  it('emits only the changed fields', () => {
    const changed: FilterState = { ...INITIAL_FILTER, colorMode: 'gene' };
    expect(diffFilter(changed, INITIAL_FILTER)).toEqual({ colorMode: 'gene' });
  });

  it('treats equal-length array fields with same elements as unchanged', () => {
    const a: FilterState = { ...INITIAL_FILTER, selectedGenes: [1, 2, 3] };
    const b: FilterState = { ...INITIAL_FILTER, selectedGenes: [1, 2, 3] };
    expect(diffFilter(a, b)).toEqual({});
  });

  it('detects array fields that differ', () => {
    const a: FilterState = { ...INITIAL_FILTER, selectedGenes: [1, 2, 3] };
    expect(diffFilter(a, INITIAL_FILTER)).toEqual({ selectedGenes: [1, 2, 3] });
  });
});

describe('diffSettings', () => {
  it('returns {} when state equals defaults', () => {
    expect(diffSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({});
  });

  it('emits only the changed fields', () => {
    const changed: SettingsState = { ...DEFAULT_SETTINGS, stimLo: 0.5 };
    expect(diffSettings(changed, DEFAULT_SETTINGS)).toEqual({ stimLo: 0.5 });
  });
});

describe('rounding helpers', () => {
  it('roundLasso clamps to 3 decimals', () => {
    const out = roundLasso(new Float32Array([1.23456, 7.89123]));
    expect(out).toEqual([1.235, 7.891]);
  });

  it('roundCamera rounds pos, target, and screen pan', () => {
    const cam = roundCamera({
      pos: [1.111111, 2.222222, 3.333333],
      target: [0.000001, 0, 0],
      pan: [4.444444, -5.555555],
    });
    expect(cam.pos.every((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9)).toBe(true);
    expect(cam.target.every((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9)).toBe(true);
    expect(cam.pan?.every((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9)).toBe(true);
  });

  it('roundViewport rounds zoom and pan', () => {
    const vp = roundViewport({ zoom: 1.234567, panX: 0.5555, panY: -1.0001 });
    expect(vp.zoom).toBeCloseTo(1.235, 5);
    expect(vp.panX).toBeCloseTo(0.556, 5);
    expect(vp.panY).toBeCloseTo(-1, 5);
  });
});

describe('viewportIsDefault', () => {
  beforeEach(() => undefined);

  it('matches the exact default viewport', () => {
    expect(viewportIsDefault({ zoom: 1, panX: 0, panY: 0 })).toBe(true);
  });

  it('rejects any non-default zoom or pan', () => {
    expect(viewportIsDefault({ zoom: 1.001, panX: 0, panY: 0 })).toBe(false);
    expect(viewportIsDefault({ zoom: 1, panX: 0.5, panY: 0 })).toBe(false);
    expect(viewportIsDefault({ zoom: 1, panX: 0, panY: -2 })).toBe(false);
  });
});
