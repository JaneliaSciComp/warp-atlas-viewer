// Pure coordinate math for projection-mode ID-buffer picking.
//
// Projection picking reads a single texel out of an offscreen ID render
// target to find which cell was drawn under the cursor. The cursor
// arrives in CSS pixels with a top-down Y origin; the render target is
// addressed in device pixels with a bottom-up Y origin (the WebGL
// readPixels convention). This converts between the two and — critically
// — clamps the result into the target's addressable range.

export interface RenderTargetPixel {
  x: number;
  y: number;
}

/**
 * Convert a cursor position (CSS pixels, top-down) into an integer texel
 * coordinate inside an ID render target (device pixels, bottom-up),
 * clamped to the target's valid index range.
 *
 * Regression note — one-past-the-edge read: the render target has
 * `rtWidth × rtHeight` texels addressable at indices 0..rtWidth-1 /
 * 0..rtHeight-1. A cursor sitting exactly on the right edge
 * (`pos.x === cssWidth`) scales to `floor(cssWidth * pixelRatio)`, which
 * equals `rtWidth` once the target is sized `floor(cssWidth *
 * pixelRatio)` — one texel past the last column. The top edge
 * (`pos.y === 0`) maps the same way to `rtHeight` after the Y flip.
 * Reading there walks outside the buffer. Clamping to
 * [0, rtWidth-1] / [0, rtHeight-1] keeps the readback in bounds.
 *
 * @param pos        Cursor in CSS pixels, top-down (origin top-left).
 * @param cssHeight  Canvas CSS height, used to flip Y to bottom-up.
 * @param pixelRatio Device pixel ratio (renderer.getPixelRatio()).
 * @param rtWidth    Render target width in device pixels.
 * @param rtHeight   Render target height in device pixels.
 */
export function screenPointToRenderTargetPixel(
  pos: { x: number; y: number },
  cssHeight: number,
  pixelRatio: number,
  rtWidth: number,
  rtHeight: number,
): RenderTargetPixel {
  const rawX = Math.floor(pos.x * pixelRatio);
  // readPixels uses bottom-up Y; the cursor is top-down, so flip against
  // the CSS height before scaling into device pixels.
  const rawY = Math.floor((cssHeight - pos.y) * pixelRatio);
  return {
    x: Math.max(0, Math.min(rtWidth - 1, rawX)),
    y: Math.max(0, Math.min(rtHeight - 1, rawY)),
  };
}
