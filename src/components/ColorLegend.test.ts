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
});
