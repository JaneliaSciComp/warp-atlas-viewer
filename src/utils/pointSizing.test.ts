import { describe, expect, it } from 'vitest';
import ambientOcclusionSrc from '../components/AmbientOcclusion.tsx?raw';
import brainViewerSrc from '../components/BrainViewer.tsx?raw';
import { canvasPointSizeScale } from './pointSizing';

describe('canvasPointSizeScale', () => {
  it('returns 1 in manual sizing mode regardless of canvas dimensions', () => {
    expect(canvasPointSizeScale(false, 1100, 700)).toBe(1);
    expect(canvasPointSizeScale(false, 1, 1)).toBe(1);
    expect(canvasPointSizeScale(false, 5000, 3000)).toBe(1);
  });

  it('is normalized to the 1100×700 reference canvas in auto mode', () => {
    expect(canvasPointSizeScale(true, 1100, 700)).toBeCloseTo(1, 6);
    // Same area, different aspect ratio: density scaling should still match.
    expect(canvasPointSizeScale(true, 770, 1000)).toBeCloseTo(1, 6);
  });

  it('scales with the square root of canvas area and clamps extremes', () => {
    expect(canvasPointSizeScale(true, 2200, 700)).toBeCloseTo(Math.sqrt(2), 6);
    expect(canvasPointSizeScale(true, 110, 70)).toBe(0.6);
    expect(canvasPointSizeScale(true, 4400, 1400)).toBe(2.0);
  });

  it('keeps the visible and ambient-occlusion point passes wired to the shared scale', () => {
    // Regression guard for the AO alignment bug: the visible shader path
    // and the AO normal/depth shader path must both consume the same
    // canvasPointSizeScale value, and the AO GLSL must multiply point
    // sprites by sizeScale just like the visible neuron shader does.
    expect(brainViewerSrc).toMatch(
      /canvasPointSizeScale\(settings\.autoSizing,\s*size\.width,\s*size\.height\)/,
    );
    expect(ambientOcclusionSrc).toMatch(
      /canvasPointSizeScale\(autoSizing,\s*size\.width,\s*size\.height\)/,
    );
    expect(ambientOcclusionSrc).toMatch(/uniform float sizeScale;/);
    expect(ambientOcclusionSrc).toMatch(/instSize\s*\*\s*sizeScale\s*\*\s*pixelRatio/);
  });
});
