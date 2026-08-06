import { describe, it, expect } from 'vitest';
import { NO_PAN, viewOffsetFor } from './cameraControls';

describe('viewOffsetFor', () => {
  it('is a no-op with no pan and no baseline', () => {
    expect(viewOffsetFor(NO_PAN, NO_PAN)).toEqual({ x: 0, y: 0 });
  });

  // ScreenPanState's convention is "positive moves the volume right/down";
  // setViewOffset's x/y move the viewing WINDOW, which moves the rendered
  // volume the other way. So the sign has to flip exactly once. Getting this
  // backwards moves the brain the wrong way by the right amount — the kind of
  // bug that reads as "the nudge didn't work" rather than as an inverted sign.
  it('negates a user pan', () => {
    expect(viewOffsetFor({ x: 7, y: 3 }, NO_PAN)).toEqual({ x: -7, y: -3 });
  });

  it("negates the baseline the same way, so embedded mode's up-10 is +10", () => {
    // BrainViewer's EMBEDDED_VIEW_OFFSET is { x: 0, y: -10 } — "up 10px" in
    // pan convention — which has to reach setViewOffset as y = +10.
    expect(viewOffsetFor(NO_PAN, { x: 0, y: -10 })).toEqual({ x: 0, y: 10 });
  });

  it('composes pan and baseline additively', () => {
    // A user panning the volume down 4px on top of a 10px-up baseline should
    // net to 6px up, not replace it.
    expect(viewOffsetFor({ x: 0, y: 4 }, { x: 0, y: -10 })).toEqual({ x: 0, y: 6 });
  });
});
