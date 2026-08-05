import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  EMBEDDED_DEFAULT_PRESET,
  VIEWER_FOV_DEG,
  VIEW_PRESETS,
  boundsMaxAbs,
  embeddedFramingPan,
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

  it('matches mapZebrain\'s sagittal glyphs: "left" points the snout screen-left', () => {
    // Anatomical handedness is not derivable here (near-symmetric brain, and
    // the volume group transform is a mirror), so the sides are pinned to the
    // icon artwork the user clicks. left_sagittal.webp draws the fish facing
    // screen-left, right_sagittal.webp facing screen-right. Screen-right is
    // the camera basis' +X column, so rostral (world +X) must land on the
    // negative side for "left" and the positive side for "right".
    const [, , vLeft, vRight, hLeft, hRight] = VIEW_PRESETS;
    expect(basis(hLeft.dir, hLeft.up).right.x).toBeCloseTo(-1, 5);
    expect(basis(hRight.dir, hRight.up).right.x).toBeCloseTo(1, 5);
    // The vertical pair views from the same sides, rolled 90° so rostral is
    // up; there screen-right carries the dorsoventral axis instead.
    expect(basis(vLeft.dir, vLeft.up).screenUp.x).toBeCloseTo(1, 5);
    expect(basis(vLeft.dir, vLeft.up).right.z).toBeCloseTo(1, 5);
    expect(basis(vRight.dir, vRight.up).right.z).toBeCloseTo(-1, 5);
    // Same side as its horizontal counterpart.
    expect(vLeft.dir).toEqual(hLeft.dir);
    expect(vRight.dir).toEqual(hRight.dir);
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

describe('boundsMaxAbs', () => {
  it('takes the largest arm, not half the span', () => {
    // The real dataset: centered on the population mean, so the bounding box
    // is lopsided and the caudal arm is the one the camera has to cover.
    const bounds = {
      min: [-217.04, -415.79, -165.54],
      max: [241.32, 368.36, 113.32],
    };
    expect(boundsMaxAbs(bounds)).toBeCloseTo(415.79, 2);
    // Half the span would understate it, which is what clipped the tail.
    const halfSpan = (368.36 + 415.79) / 2;
    expect(boundsMaxAbs(bounds)).toBeGreaterThan(halfSpan);
  });
});

describe('fitDistance', () => {
  const REAL_BOUNDS = {
    min: [-217.04, -415.79, -165.54],
    max: [241.32, 368.36, 113.32],
  };
  const halfFov = ((VIEWER_FOV_DEG / 2) * Math.PI) / 180;
  /** World half-height visible at the target plane from distance d. */
  const visibleHalfExtent = (d: number) => d * Math.tan(halfFov);

  it('frames the whole cell cloud in the vertical field of view', () => {
    // The check that catches the portrait clipping bug: warp's landscape
    // distance is too close once the rostro-caudal extent is rolled vertical.
    const d = fitDistance(boundsMaxAbs(REAL_BOUNDS));
    expect(visibleHalfExtent(d)).toBeGreaterThan(415.79);
    const span = 784.15;
    expect(d).toBeGreaterThan(span * 0.95);
  });

  it('also frames the mapZebrain outline mesh, which is larger than the cells', () => {
    // The outline reaches ~499 units caudally (it includes the spinal-cord
    // stub); framing to the cells alone cut its tail off on screen.
    const d = fitDistance(boundsMaxAbs(REAL_BOUNDS));
    expect(visibleHalfExtent(d)).toBeGreaterThan(499.2);
  });

  it('scales linearly with the extent', () => {
    expect(fitDistance(200)).toBeCloseTo(fitDistance(100) * 2, 6);
  });

  it('honours an explicit margin', () => {
    expect(fitDistance(500, VIEWER_FOV_DEG, 1)).toBeLessThan(fitDistance(500));
  });
});

describe('embeddedFramingPan', () => {
  // Where the outline mesh actually lands on a 900px canvas at the embedded
  // framing distance, with no nudge applied: measured off the rendered canvas
  // and reproduced by projecting every outline vertex. These are PROJECTED
  // rows, not bounds — perspective magnifies the caudal tip, which is why the
  // extent runs past the bottom edge even though fitDistance's linear margin
  // says it fits.
  const TOP_ROW_AT_900 = 127.2;
  const BOTTOM_ROW_AT_900 = 913.4;

  it('centres the brain vertically, at any canvas height', () => {
    for (const height of [600, 900, 1800]) {
      const scale = height / 900;
      // Negative y moves the volume up, so it adds to both projected rows.
      const { y } = embeddedFramingPan(height);
      const top = TOP_ROW_AT_900 * scale + y;
      const bottom = BOTTOM_ROW_AT_900 * scale + y;
      // Equal gaps top and bottom. The wrong-but-plausible constants miss by
      // far more than this tolerance: the 10px it replaces leaves ~55px of
      // asymmetry at 900px and ~90px at 1800px, and the outline's bounds
      // midpoint (4.5%, ignoring perspective) leaves ~30px.
      expect(Math.abs(top - (height - bottom))).toBeLessThan(2);
      // And nothing clipped, which the old framing could not claim: the
      // spinal stub ran 13px past the bottom of a 900px canvas.
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(height);
    }
  });

  it('moves the volume up, in proportion to the height', () => {
    // Sign, because down is the one thing that would look like no fix at all.
    expect(embeddedFramingPan(900).y).toBeLessThan(0);
    expect(embeddedFramingPan(1800).y).toBeCloseTo(embeddedFramingPan(900).y * 2, 6);
    expect(embeddedFramingPan(0).y).toBeCloseTo(0, 10);
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
