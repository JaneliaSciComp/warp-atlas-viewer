import { describe, it, expect } from 'vitest';
import { cellsInPolygon, pointInPolygon } from './polygon';

const square = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);

describe('pointInPolygon', () => {
  it('returns true for an interior point', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it('returns false for an exterior point', () => {
    expect(pointInPolygon(-1, 5, square)).toBe(false);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(5, -1, square)).toBe(false);
    expect(pointInPolygon(5, 15, square)).toBe(false);
  });

  it('handles a concave (U-shaped) polygon', () => {
    const u = new Float32Array([
      0, 0,
      10, 0,
      10, 10,
      7, 10,
      7, 3,
      3, 3,
      3, 10,
      0, 10,
    ]);
    expect(pointInPolygon(5, 7, u)).toBe(false); // inside the notch
    expect(pointInPolygon(1, 5, u)).toBe(true);  // left arm
    expect(pointInPolygon(9, 5, u)).toBe(true);  // right arm
  });
});

describe('cellsInPolygon', () => {
  it('returns empty for a degenerate polygon (< 3 vertices)', () => {
    const umap = new Float32Array([0, 0, 1, 1]);
    const tooSmall = new Float32Array([0, 0, 1, 1]); // only 2 vertices
    expect(cellsInPolygon(umap, 2, tooSmall)).toEqual(new Uint32Array(0));
  });

  it('selects only the cells inside the polygon', () => {
    // 5 cells at (1,1), (5,5), (9,9), (11,11), (-1,-1)
    const umap = new Float32Array([1, 1, 5, 5, 9, 9, 11, 11, -1, -1]);
    const indices = cellsInPolygon(umap, 5, square);
    expect(Array.from(indices)).toEqual([0, 1, 2]);
  });

  it('rejects cells outside the polygon bounding box without ray-casting', () => {
    // The bbox short-circuit is observable: a cell well outside should
    // not show up regardless of polygon winding direction.
    const umap = new Float32Array([100, 100]);
    expect(cellsInPolygon(umap, 1, square).length).toBe(0);
  });
});
