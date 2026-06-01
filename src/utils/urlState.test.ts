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
  regionPalette: 'nipy_spectral',
  isolatedRegion: -1,
  isolatedAtlasRegion: -1,
  isolatedFish: -1,
  txMode: 'all',
  selectedGenes: [],
  geneLogic: 'or',
  selectedCluster: 0,
  selectedStimuli: [],
  stimLogic: 'or',
  stimMode: 'off',
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

  it('round-trips non-default region palettes', () => {
    const hash = encodeHash({
      filter: { colorMode: 'region', regionPalette: 'turbo' },
    });
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.regionPalette).toBe('turbo');

    const distinctHash = encodeHash({
      filter: { colorMode: 'region', regionPalette: 'distinct' },
    });
    const distinctDecoded = decodeHash(distinctHash);
    expect(distinctDecoded?.filter?.regionPalette).toBe('distinct');
  });

  it('drops out-of-range numeric fields silently', () => {
    const bogus = encodeHash({
      filter: { isolatedRegion: -5 as number }, // schema requires >= -1
    });
    const decoded = decodeHash(bogus);
    expect(decoded?.filter?.isolatedRegion).toBeUndefined();
  });

  it('round-trips isolatedAtlasRegion', () => {
    const hash = encodeHash({ filter: { isolatedAtlasRegion: 42 } });
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.isolatedAtlasRegion).toBe(42);
    const bogus = encodeHash({ filter: { isolatedAtlasRegion: -7 as number } });
    expect(decodeHash(bogus)?.filter?.isolatedAtlasRegion).toBeUndefined();
  });

  it('dedupes and sorts selectedGenes / selectedStimuli on parse', () => {
    const hash = encodeHash({
      filter: { selectedGenes: [5, 1, 5, 3], selectedStimuli: [3, 1, 3] },
    });
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.selectedGenes).toEqual([1, 3, 5]);
    expect(decoded?.filter?.selectedStimuli).toEqual([1, 3]);
  });

  it('treats legacy selected-stimulus hashes without stimMode as positive filters', () => {
    const hash = '#!' + encodeURIComponent(JSON.stringify({
      filter: { selectedStimuli: [0] },
    }));
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.stimMode).toBe('positive');
  });

  it('keeps explicit no-filter mode in selected-stimulus hashes', () => {
    const hash = encodeHash({
      filter: { selectedStimuli: [0], stimMode: 'off' },
    });
    const decoded = decodeHash(hash);
    expect(decoded?.filter?.stimMode).toBe('off');
  });

  it('clamps stimulus cutoffs as nonnegative magnitudes', () => {
    const hash = encodeHash({
      settings: { stimLo: -0.2, stimHi: -0.5 } as Partial<SettingsState>,
    });
    const decoded = decodeHash(hash);
    expect(decoded?.settings?.stimLo).toBe(0);
    expect(decoded?.settings?.stimHi).toBe(0);
  });

  it('round-trips ambient occlusion settings', () => {
    const hash = encodeHash({
      settings: {
        ambientOcclusion: false,
        ambientOcclusionIntensity: 0.12,
        ambientOcclusionRadius: 18,
        opaqueActiveCells: true,
      } as Partial<SettingsState>,
    });
    const decoded = decodeHash(hash);
    expect(decoded?.settings?.ambientOcclusion).toBe(false);
    expect(decoded?.settings?.ambientOcclusionIntensity).toBe(0.12);
    expect(decoded?.settings?.ambientOcclusionRadius).toBe(18);
    expect(decoded?.settings?.opaqueActiveCells).toBe(true);
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

  it('emits explicit no-filter stim mode when stimuli are selected', () => {
    const changed: FilterState = { ...INITIAL_FILTER, selectedStimuli: [0] };
    expect(diffFilter(changed, INITIAL_FILTER)).toEqual({
      selectedStimuli: [0],
      stimMode: 'off',
    });
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

  it('emits ambient occlusion changes', () => {
    const changed: SettingsState = { ...DEFAULT_SETTINGS, ambientOcclusion: true };
    expect(diffSettings(changed, DEFAULT_SETTINGS)).toEqual({ ambientOcclusion: true });
  });
});

describe('rounding helpers', () => {
  it('roundLasso clamps to 3 decimals', () => {
    const out = roundLasso(new Float32Array([1.23456, 7.89123]));
    expect(out).toEqual([1.235, 7.891]);
  });

  it('roundCamera rounds pos, quat, and screen pan to 5 decimals (v2)', () => {
    const cam = roundCamera({
      pos: [1.1234567, 2.2222229, 3.33333334],
      quat: [0.123456789, -0.234567891, 0.345678912, 0.876543210],
      pan: [4.4444449, -5.5555551],
    });
    const isAt5 = (n: number) => Math.abs(n * 1e5 - Math.round(n * 1e5)) < 1e-7;
    expect(cam.pos.every(isAt5)).toBe(true);
    expect(cam.quat?.every(isAt5)).toBe(true);
    expect(cam.pan?.every(isAt5)).toBe(true);
    // Legacy `target` is intentionally not re-emitted by the encoder.
    expect(cam.target).toBeUndefined();
  });

  it('roundCamera preserves legacy target when no quat is present', () => {
    // A bare {pos} would fail validateCamera on the next read, so the
    // rounder keeps the v1 target until a quaternion is available to
    // replace it.
    const cam = roundCamera({
      pos: [1.111111, 2.222222, 3.333333],
      target: [0.123456, 0, 0],
    });
    expect(cam.quat).toBeUndefined();
    expect(cam.target).toBeDefined();
    const isAt5 = (n: number) => Math.abs(n * 1e5 - Math.round(n * 1e5)) < 1e-7;
    expect(cam.target!.every(isAt5)).toBe(true);
  });

  it('roundCamera drops legacy target once quat is present', () => {
    const cam = roundCamera({
      pos: [1, 2, 3],
      quat: [0, 0, 0, 1],
      target: [0, 0, 0],
    });
    expect(cam.quat).toBeDefined();
    expect(cam.target).toBeUndefined();
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
