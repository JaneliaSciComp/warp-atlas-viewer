import { describe, it, expect } from 'vitest';
import { screenPointToRenderTargetPixel } from './projectionPicking';

// A 800×600 CSS canvas at devicePixelRatio 1 → 800×600 render target,
// so valid texel indices are x ∈ [0, 799], y ∈ [0, 599].
const CSS_W = 800;
const CSS_H = 600;
const RT_W = 800;
const RT_H = 600;

describe('screenPointToRenderTargetPixel', () => {
  it('maps the top-left corner (0,0) to the bottom-left texel after the Y flip', () => {
    // Top-down Y=0 is the top edge; bottom-up the bottom row is y = H-1.
    expect(screenPointToRenderTargetPixel({ x: 0, y: 0 }, CSS_H, 1, RT_W, RT_H)).toEqual({
      x: 0,
      y: RT_H - 1, // 599, not 600 — clamped off the one-past edge
    });
  });

  it('maps the top-right corner (W,0) into the last column and clamps Y', () => {
    expect(screenPointToRenderTargetPixel({ x: CSS_W, y: 0 }, CSS_H, 1, RT_W, RT_H)).toEqual({
      x: RT_W - 1, // 799, not 800
      y: RT_H - 1, // 599, not 600
    });
  });

  it('maps the bottom-left corner (0,H) to the origin texel', () => {
    expect(screenPointToRenderTargetPixel({ x: 0, y: CSS_H }, CSS_H, 1, RT_W, RT_H)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('maps the bottom-right corner (W,H) to the last column, first row', () => {
    expect(screenPointToRenderTargetPixel({ x: CSS_W, y: CSS_H }, CSS_H, 1, RT_W, RT_H)).toEqual({
      x: RT_W - 1, // 799, not 800
      y: 0,
    });
  });

  it('floors fractional cursor coordinates', () => {
    expect(
      screenPointToRenderTargetPixel({ x: 100.9, y: 200.1 }, CSS_H, 1, RT_W, RT_H),
    ).toEqual({
      x: 100,
      y: Math.floor(CSS_H - 200.1), // 399
    });
  });

  it('scales by a high device pixel ratio and clamps to the larger target', () => {
    // dpr 3 → 2400×1800 render target.
    const dpr = 3;
    const rtW = CSS_W * dpr;
    const rtH = CSS_H * dpr;
    // Interior point scales straight through.
    expect(
      screenPointToRenderTargetPixel({ x: 400, y: 300 }, CSS_H, dpr, rtW, rtH),
    ).toEqual({
      x: 1200,
      y: Math.floor((CSS_H - 300) * dpr), // 900
    });
    // Top-right corner still clamps off the one-past edge at high dpr.
    expect(
      screenPointToRenderTargetPixel({ x: CSS_W, y: 0 }, CSS_H, dpr, rtW, rtH),
    ).toEqual({
      x: rtW - 1, // 2399
      y: rtH - 1, // 1799
    });
  });

  it('clamps cursor positions outside the canvas back into range', () => {
    // Defensive: pos can briefly fall slightly outside on pointer events.
    expect(
      screenPointToRenderTargetPixel({ x: -5, y: -5 }, CSS_H, 1, RT_W, RT_H),
    ).toEqual({ x: 0, y: RT_H - 1 });
    expect(
      screenPointToRenderTargetPixel({ x: CSS_W + 50, y: CSS_H + 50 }, CSS_H, 1, RT_W, RT_H),
    ).toEqual({ x: RT_W - 1, y: 0 });
  });
});
