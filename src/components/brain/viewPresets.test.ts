import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  EMBEDDED_DEFAULT_PRESET,
  VIEWER_FOV_DEG,
  VIEW_PRESETS,
  fitDistance,
  isAtDefaultCamera,
  presetPosition,
} from './viewPresets';

/** The camera basis a preset produces: what the viewer will actually show. */
function basis(dir: [number, number, number], up: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(VIEWER_FOV_DEG, 1.6, 0.1, 10000);
  cam.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
  cam.up.set(...up);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const m = cam.matrixWorld;
  return {
    right: new THREE.Vector3().setFromMatrixColumn(m, 0).normalize(),
    screenUp: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
    // Camera looks along its local -Z.
    view: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize().negate(),
  };
}

describe('VIEW_PRESETS', () => {
  it('has the seven mapZebrain orientations in bar order', () => {
    expect(VIEW_PRESETS.map((p) => p.key)).toEqual([
      'dorsal',
      'ventral',
      'sagittalVerticalLeft',
      'sagittalVerticalRight',
      'sagittalHorizontalLeft',
      'sagittalHorizontalRight',
      'coronal',
    ]);
  });

  it('uses unit directions and unit up vectors', () => {
    for (const p of VIEW_PRESETS) {
      expect(new THREE.Vector3(...p.dir).length()).toBeCloseTo(1, 6);
      expect(new THREE.Vector3(...p.up).length()).toBeCloseTo(1, 6);
    }
  });

  it('never puts up parallel to the view direction', () => {
    for (const p of VIEW_PRESETS) {
      const dot = new THREE.Vector3(...p.dir).dot(new THREE.Vector3(...p.up));
      expect(Math.abs(dot)).toBeLessThan(0.999);
    }
  });

  it('yields an orthonormal right-handed camera basis for every preset', () => {
    for (const p of VIEW_PRESETS) {
      const { right, screenUp, view } = basis(p.dir, p.up);
      expect(right.dot(screenUp)).toBeCloseTo(0, 5);
      expect(right.dot(view)).toBeCloseTo(0, 5);
      expect(screenUp.dot(view)).toBeCloseTo(0, 5);
      // right x up = -view for a right-handed camera looking along -Z.
      const cross = new THREE.Vector3().crossVectors(right, screenUp);
      expect(cross.dot(view)).toBeCloseTo(-1, 5);
    }
  });

  it('shows dorsal from above with rostral up (mapZebrain portrait)', () => {
    const dorsal = VIEW_PRESETS[0];
    expect(dorsal.key).toBe('dorsal');
    const { view, screenUp } = basis(dorsal.dir, dorsal.up);
    // Looking down the dorsal axis: view direction is world -Z.
    expect(view.z).toBeCloseTo(-1, 5);
    // Screen-up is world +X, which volumeTransform documents as rostral.
    expect(screenUp.x).toBeCloseTo(1, 5);
  });

  it('shows ventral from below, also rostral up', () => {
    const ventral = VIEW_PRESETS[1];
    const { view, screenUp } = basis(ventral.dir, ventral.up);
    expect(view.z).toBeCloseTo(1, 5);
    expect(screenUp.x).toBeCloseTo(1, 5);
  });

  it('shows coronal along the rostral axis with dorsal up', () => {
    const coronal = VIEW_PRESETS[6];
    expect(coronal.key).toBe('coronal');
    const { view, screenUp } = basis(coronal.dir, coronal.up);
    expect(view.x).toBeCloseTo(-1, 5);
    expect(screenUp.z).toBeCloseTo(1, 5);
  });

  it('gives the two sagittal pairs opposite sides and different rolls', () => {
    const [, , vLeft, vRight, hLeft, hRight] = VIEW_PRESETS;
    expect(vLeft.dir[1]).toBe(-vRight.dir[1]);
    expect(hLeft.dir[1]).toBe(-hRight.dir[1]);
    // "vertical" is rostral-up, "horizontal" is dorsal-up.
    expect(vLeft.up).toEqual([1, 0, 0]);
    expect(hLeft.up).toEqual([0, 0, 1]);
  });

  it('embedded default is the dorsal preset', () => {
    expect(EMBEDDED_DEFAULT_PRESET.key).toBe('dorsal');
  });
});

describe('presetPosition', () => {
  it('scales the unit direction to the requested distance', () => {
    expect(presetPosition(VIEW_PRESETS[0], 900)).toEqual([0, 0, 900]);
    expect(presetPosition(VIEW_PRESETS[6], 900)).toEqual([900, 0, 0]);
    expect(
      new THREE.Vector3(...presetPosition(VIEW_PRESETS[2], 900)).length(),
    ).toBeCloseTo(900, 6);
  });
});

describe('fitDistance', () => {
  it('fits the extent in the vertical field of view', () => {
    // This is the check that catches the portrait clipping bug: warp's old
    // landscape distance of span*0.95 is too close once the 784-unit AP
    // extent is rolled from horizontal to vertical.
    const span = 784.15;
    const exact = span / 2 / Math.tan(((VIEWER_FOV_DEG / 2) * Math.PI) / 180);
    expect(exact).toBeGreaterThan(span * 0.95);
    expect(fitDistance(span)).toBeGreaterThanOrEqual(exact);
    expect(fitDistance(span)).toBeCloseTo(993.88, 1);
  });

  it('scales linearly with the extent', () => {
    expect(fitDistance(200)).toBeCloseTo(fitDistance(100) * 2, 6);
  });

  it('honours an explicit margin', () => {
    expect(fitDistance(500, VIEWER_FOV_DEG, 1)).toBeLessThan(fitDistance(500));
  });
});

describe('isAtDefaultCamera', () => {
  const base = {
    position: [0, 0, 900] as [number, number, number],
    up: [1, 0, 0] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    defaultPosition: [0, 0, 900] as [number, number, number],
    defaultUp: [1, 0, 0] as [number, number, number],
    volumeCenter: [0, 0, 0] as [number, number, number],
    pan: { x: 0, y: 0 },
    posEps: 0.1,
  };

  it('is true when everything matches', () => {
    expect(isAtDefaultCamera(base)).toBe(true);
  });

  it('is false after the camera moves', () => {
    expect(isAtDefaultCamera({ ...base, position: [10, 0, 900] })).toBe(false);
  });

  it('is false when rolled away from the default up', () => {
    expect(isAtDefaultCamera({ ...base, up: [0, 1, 0] })).toBe(false);
  });

  it('compares against defaultUp, not a hardcoded (0,1,0)', () => {
    // The embedded default up is (1,0,0); (0,1,0) must not count as default.
    const landscape = { ...base, defaultUp: [0, 1, 0] as [number, number, number] };
    expect(isAtDefaultCamera({ ...landscape, up: [0, 1, 0] })).toBe(true);
    expect(isAtDefaultCamera({ ...landscape, up: [1, 0, 0] })).toBe(false);
  });

  it('is false when panned or when the orbit target moved', () => {
    expect(isAtDefaultCamera({ ...base, pan: { x: 5, y: 0 } })).toBe(false);
    expect(isAtDefaultCamera({ ...base, target: [0, 50, 0] })).toBe(false);
  });

  it('tolerates sub-epsilon damping residue', () => {
    expect(isAtDefaultCamera({ ...base, position: [0.05, 0, 900] })).toBe(true);
  });
});
