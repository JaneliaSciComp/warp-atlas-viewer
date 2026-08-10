import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  EMBEDDED_DEFAULT_PRESET,
  EMBEDDED_FIT_MARGIN,
  MZ_REFERENCE_CENTER,
  MZ_REFERENCE_HALF_SPAN,
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

  it('shows ventral from below, rostral up, tilted onto the caudal face', () => {
    const ventral = VIEW_PRESETS[1];
    const { view, screenUp } = basis(ventral.dir, ventral.up);
    // Mostly straight up the ventral axis...
    expect(view.z).toBeGreaterThan(0.9);
    // ...but tilted caudally, which is the whole point of this preset: dead-on
    // ventral hides the caudal face that mapZebrain's own ventral view shows.
    const tilt = (Math.atan2(-ventral.dir[0], -ventral.dir[2]) * 180) / Math.PI;
    expect(tilt).toBeCloseTo(18.9, 1);
    // up is not perpendicular to dir here; lookAt orthogonalises it to the
    // vector mapZebrain saved for this view, rostral tilted ventrally.
    expect(screenUp.x).toBeCloseTo(0.946, 3);
    expect(screenUp.z).toBeCloseTo(-0.324, 3);
  });

  it('parks the four rostral-up views further back than the dorsal-up ones', () => {
    // mapZebrain backs its camera off when the brain's long axis runs up the
    // screen (800 units for the dorsal-up views, 905-923 for the vertical
    // sagittal pair). Keyed to `up` because that is what makes a view portrait.
    for (const p of VIEW_PRESETS) {
      const portrait = p.up[0] === 1;
      expect(portrait ? p.distanceScale : (p.distanceScale ?? 1)).toBe(portrait ? 1.08 : 1);
    }
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

  it("takes each sagittal button's side from mapZebrain's own camera", () => {
    // web-gl.service.ts:732-766, rotated into our frame by world = (-y, x, z).
    // Its vertical pair sits at x = -905 / +923 and its horizontal pair at
    // x = +848 / -800, so "left" is world -Y for the vertical buttons and
    // world +Y for the horizontal ones. Inconsistent, and deliberately copied:
    // the same glyph must produce the same picture in both viewers.
    const [, , vLeft, vRight, hLeft, hRight] = VIEW_PRESETS;
    expect(vLeft.dir).toEqual([0, -1, 0]);
    expect(vRight.dir).toEqual([0, 1, 0]);
    expect(hLeft.dir).toEqual([0, 1, 0]);
    expect(hRight.dir).toEqual([0, -1, 0]);
    // Each "left" therefore views from the opposite side of its counterpart.
    expect(vLeft.dir[1]).toBe(-hLeft.dir[1]);
    // The horizontal pair is dorsal-up, so the snout reads screen-left for
    // hLeft and screen-right for hRight — matching their glyph artwork.
    expect(basis(hLeft.dir, hLeft.up).right.x).toBeCloseTo(-1, 5);
    expect(basis(hRight.dir, hRight.up).right.x).toBeCloseTo(1, 5);
  });

  it('embedded default is the dorsal preset', () => {
    expect(EMBEDDED_DEFAULT_PRESET.key).toBe('dorsal');
  });
});

describe('presetPosition', () => {
  it('scales the unit direction to the requested distance', () => {
    expect(presetPosition(VIEW_PRESETS[6], 900)).toEqual([900, 0, 0]);
    expect(
      new THREE.Vector3(...presetPosition(VIEW_PRESETS[6], 900)).length(),
    ).toBeCloseTo(900, 6);
  });

  it("applies the preset's own distance scale", () => {
    // Dorsal is a portrait view, so it sits 8% further out than the framing
    // distance it is handed. Forgetting this is how the default camera and the
    // dorsal button would end up at different zooms.
    expect(presetPosition(VIEW_PRESETS[0], 900)[2]).toBeCloseTo(972, 6);
    expect(
      new THREE.Vector3(...presetPosition(VIEW_PRESETS[2], 900)).length(),
    ).toBeCloseTo(972, 6);
  });

  it('offsets from the orbit target, keeping the distance to it', () => {
    // The bug this guards: placing the camera at dir * distance from the ORIGIN
    // while the controls target MZ_REFERENCE_CENTER tilts every preset off-axis
    // and changes its zoom.
    for (const preset of VIEW_PRESETS) {
      const pos = presetPosition(preset, 900, MZ_REFERENCE_CENTER);
      const offset = new THREE.Vector3(...pos).sub(new THREE.Vector3(...MZ_REFERENCE_CENTER));
      expect(offset.length()).toBeCloseTo(900 * (preset.distanceScale ?? 1), 3);
      expect(offset.normalize().dot(new THREE.Vector3(...preset.dir))).toBeCloseTo(1, 6);
    }
  });
});

describe('fitDistance', () => {
  const halfFov = ((VIEWER_FOV_DEG / 2) * Math.PI) / 180;
  /** World half-height visible at the target plane from distance d. */
  const visibleHalfExtent = (d: number) => d * Math.tan(halfFov);

  it('frames the whole outline mesh in the vertical field of view', () => {
    // The check that catches the portrait clipping bug: warp's landscape
    // distance is too close once the rostro-caudal extent is rolled vertical.
    const d = fitDistance(MZ_REFERENCE_HALF_SPAN);
    expect(visibleHalfExtent(d)).toBeGreaterThan(MZ_REFERENCE_HALF_SPAN);
    const span = 784.15;
    expect(d).toBeGreaterThan(span * 0.95);
  });

  it('clears the perspective magnification every preset can produce', () => {
    // Projecting all 164k outline vertices through the seven presets, the
    // vertical sagittal pair is the binding case at 1221 units; the linear
    // bound alone gives 1093. Under-margining here clips the snout.
    const d = fitDistance(MZ_REFERENCE_HALF_SPAN);
    expect(EMBEDDED_FIT_MARGIN).toBeGreaterThan(1.118);
    expect(d).toBeGreaterThan(1221.2);
  });

  it('scales linearly with the extent', () => {
    expect(fitDistance(200)).toBeCloseTo(fitDistance(100) * 2, 6);
  });

  it('honours an explicit margin', () => {
    expect(fitDistance(500, VIEWER_FOV_DEG, 1)).toBeLessThan(fitDistance(500));
  });
});

describe('MZ_REFERENCE_CENTER', () => {
  // The outline mesh's world bounding box, from preprocessed/meshOutline.bin.gz
  // (scripts/fetch_meshes.py prints these as `outline world centre / half-span`).
  const OUTLINE_MIN = [-499.19, -283.5, -219.92];
  const OUTLINE_MAX = [405.92, 269.61, 138.47];

  it('is the outline mesh bounding-box centre, as mapZebrain uses', () => {
    for (let i = 0; i < 3; i++) {
      expect(MZ_REFERENCE_CENTER[i]).toBeCloseTo((OUTLINE_MIN[i] + OUTLINE_MAX[i]) / 2, 1);
    }
  });

  it("does NOT carry mapZebrain's extra 100-unit caudal shift", () => {
    // That shift compensates for its canvas being cropped by the page it sits
    // in; ours is not, so copying it would push the brain 8% of the frame too
    // high. Guard the sign and magnitude, since -146.6 would look plausible.
    expect(MZ_REFERENCE_CENTER[0]).toBeGreaterThan(-100);
  });

  it('has the half-span the framing distance is derived from', () => {
    const halfSpans = [0, 1, 2].map((i) => (OUTLINE_MAX[i] - OUTLINE_MIN[i]) / 2);
    expect(MZ_REFERENCE_HALF_SPAN).toBeCloseTo(Math.max(...halfSpans), 1);
    // The rostro-caudal axis is the largest, which is why it is the one that
    // has to fit the VERTICAL fov in the embedded portrait framing.
    expect(halfSpans.indexOf(Math.max(...halfSpans))).toBe(0);
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
