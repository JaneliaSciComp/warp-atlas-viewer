import { describe, it, expect } from 'vitest';
import type { NeuronDataset } from '../data/types';
import {
  buildCsv,
  buildFilename,
  csvEscape,
  estimateCsvBytes,
} from './exportCsv';

// Two-cell fixture exercising every column path. Region and cluster
// names are chosen to be CSV-safe so positional tests can split on
// commas directly; the CSV-escape path is exercised by the dedicated
// csvEscape unit tests below.
const TEST_DATA: NeuronDataset = {
  count: 2,
  positions: new Float32Array([1.234, -5.6789, 7, 10.111, -2.5, 0]),
  regionIds: new Int16Array([1, 0]),
  clusterIds: new Int16Array([1, 0]),
  fishIds: new Uint8Array([0, 2]),
  geneCounts: new Float32Array([3, 0, 7, 12]),
  geneBinary: new Uint8Array([1, 0, 1, 1]),
  umap: new Float32Array([0.1, -0.2, 12, 13]),
  stimulusCorr: new Float32Array([0.5, -0.25, 0.0, 0.123]),
  swimCorr: new Float32Array([0.3, -0.4]),
  activityTrace: new Float32Array(8),
  traceLength: 4,
  traceSampleRateHz: 1,
  // 3 atlas regions, 1 byte/cell:
  //   cell 0 in {a0, a2} → 0b101 = 5
  //   cell 1 in {a1}     → 0b010 = 2
  atlasRegionMask: new Uint8Array([5, 2]),
  atlasRegionNames: ['a0', 'a1', 'a2'],
  geneNames: ['g0', 'g1'],
  regionNames: ['unassigned', 'Pal'],
  stimulusNames: ['s0', 's1'],
  clusterNames: ['c0', 'c1'],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  source: 'mock',
};

describe('buildCsv', () => {
  it('emits a header row followed by one row per indexed cell', () => {
    const csv = buildCsv(TEST_DATA, null);
    const rows = csv.trim().split('\n');
    expect(rows).toHaveLength(3); // header + 2 cells
    expect(rows[0]).toBe(
      'cell_id,x,y,z,tsne_x,tsne_y,fish,manuscript_region,mapzebrain_regions,cluster,gene_g0,gene_g1,corr_s0,corr_s1,swim_corr',
    );
  });

  it('formats positions to 2 decimals and correlations to 3', () => {
    const csv = buildCsv(TEST_DATA, new Uint32Array([0]));
    const row = csv.trim().split('\n')[1];
    const cols = row.split(',');
    // x = 1.234 → "1.23"; y = -5.6789 → "-5.68"; z = 7 → "7.00"
    expect(cols[1]).toBe('1.23');
    expect(cols[2]).toBe('-5.68');
    expect(cols[3]).toBe('7.00');
    // stimulus_s0 = 0.5 → "0.500"
    expect(cols[12]).toBe('0.500');
    // swim_corr = 0.3 → "0.300"
    expect(cols[14]).toBe('0.300');
  });

  it('joins mapzebrain memberships with a semicolon', () => {
    const csv = buildCsv(TEST_DATA, null);
    const cell0 = csv.trim().split('\n')[1].split(',');
    // mapzebrain_regions is the 9th column (index 8)
    expect(cell0[8]).toBe('a0;a2');
    const cell1 = csv.trim().split('\n')[2].split(',');
    expect(cell1[8]).toBe('a1');
  });

  it('remaps fish ids from internal 0/1/2 to user-facing 1/2/3', () => {
    const csv = buildCsv(TEST_DATA, null);
    const cell0 = csv.trim().split('\n')[1].split(',');
    expect(cell0[6]).toBe('1'); // fishIds[0] === 0 → "1"
    const cell1 = csv.trim().split('\n')[2].split(',');
    expect(cell1[6]).toBe('3'); // fishIds[1] === 2 → "3"
  });

  it('quote-escapes region/cluster names containing commas', () => {
    // Build a dataset variant whose region name needs escaping.
    const escaped: NeuronDataset = {
      ...TEST_DATA,
      regionNames: ['unassigned', 'Pal, escaped'],
    };
    const csv = buildCsv(escaped, new Uint32Array([0]));
    expect(csv).toContain('"Pal, escaped"');
  });

  it('respects the provided indices and order', () => {
    const csv = buildCsv(TEST_DATA, new Uint32Array([1, 0]));
    const rows = csv.trim().split('\n');
    expect(rows[1].startsWith('1,')).toBe(true); // cell 1 first
    expect(rows[2].startsWith('0,')).toBe(true); // cell 0 second
  });

  it('appends activity-trace columns when includeActivityTrace is true', () => {
    // Build a fixture with a non-trivial trace so we can confirm both
    // the header columns and the row values land in the expected slots.
    const withTrace: NeuronDataset = {
      ...TEST_DATA,
      traceLength: 3,
      activityTrace: new Float32Array([0.5, -0.25, 1.5, 0.0, 2.0, -1.0]),
    };
    const csv = buildCsv(withTrace, null, { includeActivityTrace: true });
    const rows = csv.trim().split('\n');
    const header = rows[0].split(',');
    expect(header.slice(-3)).toEqual(['dff_t0', 'dff_t1', 'dff_t2']);
    const cell0 = rows[1].split(',');
    expect(cell0.slice(-3)).toEqual(['0.500', '-0.250', '1.500']);
    const cell1 = rows[2].split(',');
    expect(cell1.slice(-3)).toEqual(['0.000', '2.000', '-1.000']);
  });

  it('omits activity-trace columns by default', () => {
    const csv = buildCsv(TEST_DATA, null);
    const header = csv.split('\n')[0];
    expect(header).not.toMatch(/dff_t/);
  });
});

describe('csvEscape', () => {
  it('passes through values without separators or quotes', () => {
    expect(csvEscape('plain')).toBe('plain');
  });
  it('wraps in quotes and doubles embedded quotes when needed', () => {
    expect(csvEscape('has,comma')).toBe('"has,comma"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('two\nlines')).toBe('"two\nlines"');
  });
});

describe('buildFilename', () => {
  it('encodes timestamp and row count', () => {
    const now = new Date(2026, 5, 1, 9, 7, 3); // 2026-06-01 09:07:03 local
    expect(buildFilename(12345, now)).toBe('warp-export-20260601-090703-12345cells.csv');
  });
});

describe('estimateCsvBytes', () => {
  it('returns 0 for an empty export and grows with row count', () => {
    expect(estimateCsvBytes(TEST_DATA, 0)).toBe(0);
    const small = estimateCsvBytes(TEST_DATA, 1);
    const big = estimateCsvBytes(TEST_DATA, 100);
    expect(big).toBeGreaterThan(small);
  });
});
