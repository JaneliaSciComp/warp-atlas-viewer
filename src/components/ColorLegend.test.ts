import { describe, expect, it } from 'vitest';
import {
  chooseVisibleTicks,
  formatCorrelationTick,
  signedCorrelationTicks,
} from './ColorLegend';

function visibleSignedLabels(lo: number, hi: number): string[] {
  const tickPos = (t: number) => ((t + hi) / (2 * hi)) * 100;
  return chooseVisibleTicks(
    signedCorrelationTicks(lo, hi),
    tickPos,
    formatCorrelationTick,
  ).map((tick) => tick.label);
}

describe('chooseVisibleTicks', () => {
  it('keeps all signed correlation anchors when the default scale has room', () => {
    expect(visibleSignedLabels(0.10, 0.35)).toEqual([
      '-0.35',
      '-0.10',
      '0',
      '0.10',
      '0.35',
    ]);
  });

  it('drops crowded inner anchors before endpoints and zero', () => {
    expect(visibleSignedLabels(0.10, 0.13)).toEqual([
      '-0.13',
      '0',
      '0.13',
    ]);
  });

  it('deduplicates zero when the floor is zero', () => {
    expect(visibleSignedLabels(0, 0.35)).toEqual([
      '-0.35',
      '0',
      '0.35',
    ]);
  });

  it('labels each endpoint with its own anchor under split saturation', () => {
    // hi (positive) = 0.6, hiNeg (negative) = 0.3. With the gradient bar
    // kept symmetric, 0 sits at 50% and each half scales to its anchor.
    const hi = 0.6;
    const hiNeg = 0.3;
    const tickPos = (t: number) => (t < 0 ? 50 + (t / hiNeg) * 50 : 50 + (t / hi) * 50);
    const labels = chooseVisibleTicks(
      signedCorrelationTicks(0, hi, hiNeg),
      tickPos,
      formatCorrelationTick,
    ).map((tick) => tick.label);
    expect(labels).toEqual(['-0.30', '0', '0.60']);
  });
});
