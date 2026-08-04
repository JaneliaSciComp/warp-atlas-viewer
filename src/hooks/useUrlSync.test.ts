import { describe, it, expect } from 'vitest';
import { mayWriteUrl } from './useUrlSync';

describe('mayWriteUrl', () => {
  it('writes when the hash is ours and playback is stopped', () => {
    expect(mayWriteUrl({ playing: false, hashIsOurs: true })).toBe(true);
  });

  it('withholds during activity playback, so the hash stays stable while animating', () => {
    expect(mayWriteUrl({ playing: true, hashIsOurs: true })).toBe(false);
  });

  // The case this predicate exists for. Assigning `location.hash` does not
  // dispatch `hashchange` synchronously, so a debounced write already in flight
  // runs first and replaceStates our state over the hash the user just pasted;
  // the hashchange handler then reloads and restores the wrong state. Refusing
  // to overwrite a hash we did not write is what closes that window — the
  // handler cannot, because by the time it runs the damage is done.
  it('withholds when the hash is not ours, whatever the playback state', () => {
    expect(mayWriteUrl({ playing: false, hashIsOurs: false })).toBe(false);
    expect(mayWriteUrl({ playing: true, hashIsOurs: false })).toBe(false);
  });
});
