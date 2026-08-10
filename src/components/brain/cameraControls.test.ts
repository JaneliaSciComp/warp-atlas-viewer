import { describe, it, expect } from 'vitest';
import { NO_PAN, viewOffsetFor } from './cameraControls';

describe('viewOffsetFor', () => {
  it('is a no-op with no pan', () => {
    expect(viewOffsetFor(NO_PAN)).toEqual({ x: 0, y: 0 });
  });

  // ScreenPanState's convention is "positive moves the volume right/down";
  // setViewOffset's x/y move the viewing WINDOW, which moves the rendered
  // volume the other way. So the sign has to flip exactly once. Getting this
  // backwards moves the brain the wrong way by the right amount — the kind of
  // bug that reads as "the nudge didn't work" rather than as an inverted sign.
  it('negates a user pan', () => {
    expect(viewOffsetFor({ x: 7, y: 3 })).toEqual({ x: -7, y: -3 });
  });
});
