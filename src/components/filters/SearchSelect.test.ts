import { describe, expect, it } from 'vitest';
import { placePopover } from './SearchSelect';

// Viewport 800 tall throughout.
describe('placePopover', () => {
  it('drops up when the trigger sits low (bottom filter panel)', () => {
    const p = placePopover(700, 724, 800);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(104); // 800 - 700 + 4
  });

  it('drops down when the trigger sits high (embed-mode transcriptomics)', () => {
    const p = placePopover(60, 84, 800);
    expect(p.bottom).toBeUndefined();
    expect(p.top).toBe(88); // 84 + 4
    // ...and the popover must fit between there and the viewport bottom.
    expect(p.top! + p.maxHeight).toBeLessThanOrEqual(800);
  });

  it('never exceeds the room on the chosen side', () => {
    for (const top of [0, 20, 100, 300, 500, 700, 780]) {
      const p = placePopover(top, top + 24, 800);
      const room = p.top === undefined ? top : 800 - (top + 24);
      expect(p.maxHeight).toBeLessThanOrEqual(Math.max(room, 120));
    }
  });
});
