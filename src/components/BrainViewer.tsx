import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import type { ColorMode, NeuronDataset, FilterState, SelectionState, SettingsState, ProjectionMode } from '../data/types';
import type { CameraState } from '../utils/urlState';
import {
  allocColoring,
  anyFilterActive,
  applySelectionAsFilterGhost,
  cellInSet,
  cellIsRenderable,
} from '../utils/coloring';
import type { SharedColoring } from '../hooks/useColoring';
import vertSrc from '../shaders/neuron.vert.glsl?raw';
import fragSrc from '../shaders/neuron.frag.glsl?raw';
import ghostContextVertSrc from '../shaders/neuron_ghost_context.vert.glsl?raw';
import ghostContextFragSrc from '../shaders/neuron_ghost_context.frag.glsl?raw';
import projectionVertSrc from '../shaders/projection.vert.glsl?raw';
import projectionFragSrc from '../shaders/projection.frag.glsl?raw';
import projectionCompositeVertSrc from '../shaders/projection_composite.vert.glsl?raw';
import projectionCompositeFragSrc from '../shaders/projection_composite.frag.glsl?raw';
import projectionIdVertSrc from '../shaders/projection_id.vert.glsl?raw';
import projectionIdFragSrc from '../shaders/projection_id.frag.glsl?raw';
import projectionScalarChunkSrc from '../shaders/projection_scalar.glsl?raw';
import projectionScalarColorChunkSrc from '../shaders/projection_scalar_color.glsl?raw';
import { AmbientOcclusion, skipAmbientOcclusionUserData } from './AmbientOcclusion';
import { coolwarm, plasma } from '../utils/colorMaps';
import { zoomSizeScale, flatSizeFactor } from '../utils/zoomSizing';

// Three's ShaderMaterial preprocessor resolves #include <...> through
// ShaderChunk. Register WARP-specific chunks once at module load so the
// visible projection, ID-picking projection, and mean/sum composite all
// share exactly the same scalar-to-palette mapping.
const shaderChunks = THREE.ShaderChunk as unknown as Record<string, string>;
shaderChunks.warp_projection_scalar = projectionScalarChunkSrc;
shaderChunks.warp_projection_scalar_color = projectionScalarColorChunkSrc;

const VIEWER_BACKGROUND = '#0a0a0a';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  /** Shared base coloring computed once in App. We copy it into our
   *  own buffers so we can stamp the focused-neuron brighter on top
   *  without corrupting what UmapPanel reads. */
  coloring: SharedColoring | null;
  /** Active group selection. The 3D viewer treats a non-empty t-SNE
   *  lasso ('umap' source) as an additional filter — cells outside the
   *  lasso get the standard ghost treatment so the selected subset
   *  reads as the foreground population. The t-SNE panel itself does
   *  NOT apply this demotion (so the user can re-lasso). */
  selection: SelectionState;
  /** Single-neuron focus, separate from the group selection. */
  focusedNeuron: number | null;
  /** Click on a neuron sets focus; click on empty space sets to null. */
  onFocus: (i: number | null) => void;
  /** Fires whenever the wrapping div is resized. App threads this back
   *  into useColoring so the auto-mode formulas (point size + ghost
   *  visibility derived from canvas height) reflect the current 3D
   *  canvas size. */
  onCanvasSizeChange?: (size: { w: number; h: number }) => void;
  /** Camera position + orbit target restored from URL on first mount. */
  initialCamera?: CameraState | null;
  /** Fired whenever the user moves/orbits/zooms the camera. */
  onCameraChange?: (cam: CameraState) => void;
  /** Fired when the user picks a projection mode from the in-viewer
   *  status pill. Wired to the same settings.projectionMode the
   *  Settings tab drives, so the two controls stay in sync. */
  onProjectionModeChange?: (mode: ProjectionMode) => void;
}

interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}

interface ScreenPanState {
  /** CSS-pixel offset applied in projection space. Positive values move
   *  the volume right/down in the viewport. */
  x: number;
  y: number;
}

const VOLUME_CENTER: [number, number, number] = [0, 0, 0];
const VOLUME_CENTER_VEC = new THREE.Vector3(...VOLUME_CENTER);

type ProjectionColorMapKind = 'plasma' | 'coolwarm';

interface ScalarProjectionConfig {
  supported: boolean;
  /** 0 = sequential linear, 1 = sequential log1p, 2 = signed/diverging. */
  scalarMode: 0 | 1 | 2;
  scalarLo: number;
  scalarHi: number;
  /** Negative-side endpoint magnitude for signed mode; equals scalarHi
   *  except when Stim split saturation is enabled. Ignored by sequential
   *  modes. */
  scalarHiNeg: number;
  scalarLogDen: number;
  colorMapKind: ProjectionColorMapKind;
}

const DEFAULT_SCALAR_PROJECTION: ScalarProjectionConfig = {
  supported: false,
  scalarMode: 0,
  scalarLo: 0,
  scalarHi: 1,
  scalarHiNeg: 1,
  scalarLogDen: Math.log(2),
  colorMapKind: 'plasma',
};

function supportsScalarProjection(colorMode: ColorMode): boolean {
  return colorMode === 'gene' || colorMode === 'activity' || colorMode === 'stim' || colorMode === 'swim';
}

function effectiveProjectionMode(
  colorMode: ColorMode,
  mode: SettingsState['projectionMode'],
): SettingsState['projectionMode'] {
  return supportsScalarProjection(colorMode) ? mode : 'off';
}

// Display labels for the in-viewer status pill / mode menu. The raw
// enum value 'maxabs' reads poorly; everything else is its own label.
const PROJECTION_MODE_LABELS: Record<ProjectionMode, string> = {
  off: 'off',
  min: 'min',
  max: 'max',
  maxabs: 'min/max',
  mean: 'mean',
  sum: 'sum',
};
// Order the pill menu winner-take-all first (min/max/min-max), then the
// accumulation modes (mean/sum), with off on top.
const PROJECTION_MODE_ORDER: ProjectionMode[] = ['off', 'min', 'max', 'maxabs', 'mean', 'sum'];

// Scene-object names so the projection render pass (a sibling of
// PointCloud in the same scene) can find the projection overlay and its
// ghost/context underlay without prop-threading refs across components.
const PROJECTION_POINTS_NAME = 'projectionPoints';
const PROJECTION_CONTEXT_NAME = 'projectionContext';

function scalarProjectionConfig(
  data: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
): ScalarProjectionConfig {
  switch (filter.colorMode) {
    case 'gene': {
      const selected = filter.selectedGenes.length;
      const richnessMax =
        filter.txMode !== 'gene' || selected === 0
          ? data.geneNames.length
          : settings.geneMultiColor === 'richness'
            ? selected
            : settings.geneMaxSpots;
      const hi = Math.max(1, richnessMax);
      return {
        supported: true,
        scalarMode: filter.geneScale === 'linear' ? 0 : 1,
        scalarLo: 0,
        scalarHi: hi,
        scalarHiNeg: hi,
        scalarLogDen: Math.log(1 + hi),
        colorMapKind: 'plasma',
      };
    }
    case 'activity': {
      const lo = settings.activityLo;
      const hi = Math.max(lo + 0.001, settings.activityHi);
      return {
        supported: true,
        scalarMode: 0,
        scalarLo: lo,
        scalarHi: hi,
        scalarHiNeg: hi,
        scalarLogDen: Math.log(2),
        colorMapKind: 'plasma',
      };
    }
    case 'stim': {
      // In Visual Stimuli "no filter" mode, selected stimuli scope the
      // signed scalar but should not apply the responsive floor as a gate.
      // Use the floor only when a sign-band filter is armed; otherwise map
      // correlations continuously from zero so no-filter projection does
      // not collapse to the same contributor set as "± either".
      const stimFilterActive = filter.selectedStimuli.length > 0 && filter.stimMode !== 'off';
      const lo = stimFilterActive ? Math.max(0, settings.stimLo) : 0;
      // Split saturation: each side gets its own endpoint so the
      // positive-skewed correlation distribution doesn't wash out one
      // sign. Off → symmetric (both use stimHi). Mirrors applyColoring.
      const hi = Math.max(
        lo + 0.001,
        settings.stimSplitSaturation ? settings.stimHiPos : settings.stimHi,
      );
      const hiNeg = settings.stimSplitSaturation
        ? Math.max(lo + 0.001, settings.stimHiNeg)
        : hi;
      return {
        supported: true,
        scalarMode: 2,
        scalarLo: lo,
        scalarHi: hi,
        scalarHiNeg: hiNeg,
        scalarLogDen: Math.log(2),
        colorMapKind: 'coolwarm',
      };
    }
    case 'swim': {
      const lo = Math.max(0, settings.swimLo);
      const hi = Math.max(lo + 0.001, settings.swimHi);
      return {
        supported: true,
        scalarMode: 2,
        scalarLo: lo,
        scalarHi: hi,
        scalarHiNeg: hi,
        scalarLogDen: Math.log(2),
        colorMapKind: 'coolwarm',
      };
    }
    case 'highlight':
    case 'region':
    case 'fish':
      return DEFAULT_SCALAR_PROJECTION;
  }
}

function createProjectionColorMapTexture(kind: ProjectionColorMapKind): THREE.DataTexture {
  const w = 256;
  const bytes = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    const rgb = kind === 'coolwarm' ? coolwarm(-1 + 2 * t) : plasma(t);
    bytes[i * 4] = Math.round(rgb[0] * 255);
    bytes[i * 4 + 1] = Math.round(rgb[1] * 255);
    bytes[i * 4 + 2] = Math.round(rgb[2] * 255);
    bytes[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(bytes, w, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}


/** Inner R3F component: owns the Points object and shader updates.
 *  Filter / settings / selection are already baked into `coloring`;
 *  this component reads them directly only for the picker's
 *  in-filter prioritization. */
function PointCloud({
  data,
  filter,
  settings,
  coloring,
  projectionMode,
  projectionConfig,
  projectionColorMap,
  selection,
  focusedNeuron,
  pickRef,
  onHoverChange,
  defaultCamDistance,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
  projectionMode: SettingsState['projectionMode'];
  projectionConfig: ScalarProjectionConfig;
  projectionColorMap: THREE.DataTexture;
  selection: SelectionState;
  focusedNeuron: number | null;
  pickRef: React.MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
  /** Camera-to-target distance at the default zoom (span * 0.95). The basis
   *  for the flat-mode zoom-size correction below. */
  defaultCamDistance: number;
}) {
  const { gl, scene, camera, size } = useThree();
  // drei's makeDefault publishes the TrackballControls instance here. Used
  // to read the live orbit target for the zoom-size correction; may be null
  // for the first frame or two before the controls mount.
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  // The ghost/context underlay. Hidden during the ID-buffer picking render
  // so hover/click resolve to the projection cell on top, not a context
  // dot behind it.
  const contextPointsRef = useRef<THREE.Points>(null);

  const buffers = useMemo(() => allocColoring(data.count), [data]);
  const projectableMask = useMemo(() => new Float32Array(data.count), [data]);

  // Static per-cell index attribute (0..count-1). Used by the
  // projection-mode ID pass to encode the winning cell per pixel.
  // Values never change after dataset load so we don't track
  // needsUpdate after the initial upload.
  const cellIds = useMemo(() => {
    const arr = new Float32Array(data.count);
    for (let i = 0; i < data.count; i++) arr[i] = i;
    return arr;
  }, [data]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('instColor', new THREE.BufferAttribute(buffers.colors, 3));
    g.setAttribute('instAlpha', new THREE.BufferAttribute(buffers.alphas, 1));
    g.setAttribute('instSize', new THREE.BufferAttribute(buffers.sizes, 1));
    // Projection-mode intensity (scheme-aware magnitude). Separate from
    // alpha so projection works even when fadeWeakCorrelation collapses
    // alpha to 1 for all in-set cells. Only the projection vertex
    // shader reads this attribute.
    g.setAttribute('instIntensity', new THREE.BufferAttribute(buffers.intensities, 1));
    g.setAttribute('instScalar', new THREE.BufferAttribute(buffers.scalarValues, 1));
    g.setAttribute('instProjectable', new THREE.BufferAttribute(projectableMask, 1));
    g.setAttribute('instCellId', new THREE.BufferAttribute(cellIds, 1));
    g.computeBoundingSphere();
    return g;
  }, [data, buffers, projectableMask, cellIds]);

  // Two-pass rendering. Opaque-ish cells (α ≥ 0.5: region/fish/highlight
  // colors at 0.85+, signal-saturated gene/stim/swim cells at 1.0) write
  // depth so they correctly occlude cells behind them — fixes the
  // "stratified" look where back cells punched through front cells.
  // Transparent cells (α < 0.5: ghosts, fade-weak midpoints, dim
  // backdrops) don't write depth so they still let near cells see
  // through them. The fragment shader pre-filters by vAlpha so each
  // material only renders its half.
  const ALPHA_PASS_SPLIT = 0.5;
  const opaqueMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: true,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
        alphaMin: { value: ALPHA_PASS_SPLIT },
        alphaMax: { value: 1e6 },
      },
    });
  }, [gl]);
  const transparentMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
        alphaMin: { value: 0 },
        alphaMax: { value: ALPHA_PASS_SPLIT },
      },
    });
  }, [gl]);

  // Projection ghost/context material. It uses the same per-cell color,
  // alpha, size, ghost visibility, and auto-sizing buffers as normal
  // rendering, but masks on an explicit projectable flag so active
  // low-alpha cells (e.g. weak stim/swim correlations) are not drawn as
  // "ghosts".
  const contextMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: ghostContextVertSrc,
      fragmentShader: ghostContextFragSrc,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
      },
    });
  }, [gl]);

  // Projection material. One ShaderMaterial whose blending / depth-write
  // state is reconciled to the active projectionMode each frame.
  //   max       → depth-test trick picks the highest scalar cell.
  //   min       → mirror of max with inverted scalar-depth encoding.
  //   mean/sum  → additive blending into an off-screen target; the
  //               AccumulationProjectionPass component below composites
  //               raw scalar accumulations back through the active color map.
  // Intensity floor is now a threshold/mask on top of scalar reduction:
  // it culls weak values and ghosts before any scalar math runs.
  const projectionMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: projectionVertSrc,
      fragmentShader: projectionFragSrc,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
        mode: { value: 0 },
        intensityFloor: { value: 0.05 },
        colorMap: { value: projectionColorMap },
        scalarMode: { value: projectionConfig.scalarMode },
        scalarLo: { value: projectionConfig.scalarLo },
        scalarHi: { value: projectionConfig.scalarHi },
        scalarHiNeg: { value: projectionConfig.scalarHiNeg },
        scalarLogDen: { value: projectionConfig.scalarLogDen },
        activeBrightness: { value: 0 },
        fadeWeakCorrelation: { value: 1 },
      },
    });
  }, [gl, projectionColorMap, projectionConfig]);
  // ID-pass machinery for projection-mode picking. Same depth-test
  // reduction as the visible max/min projection, but writes the
  // winning cell's packed index per pixel to an offscreen RGBA8
  // target. The picker reads a single pixel under the cursor and
  // decodes it, so hover/click lands on the cell the user is actually
  // looking at (not the nearest cell center in screen space). Only
  // armed when projectionMode is max or min; mean/sum disable picking
  // entirely since there's no single cell that "won" the pixel.
  const idRt = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false,
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      }),
    [],
  );
  const idMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: projectionIdVertSrc,
        fragmentShader: projectionIdFragSrc,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        blending: THREE.NoBlending,
        uniforms: {
          pixelRatio: { value: gl.getPixelRatio() },
          sizeScale: { value: 1 },
          flatPointSize: { value: 0 },
          flatSizeFactor: { value: 0.4 },
          mode: { value: 0 },
          intensityFloor: { value: 0.05 },
          scalarMode: { value: projectionConfig.scalarMode },
          scalarLo: { value: projectionConfig.scalarLo },
          scalarHi: { value: projectionConfig.scalarHi },
          scalarHiNeg: { value: projectionConfig.scalarHiNeg },
          scalarLogDen: { value: projectionConfig.scalarLogDen },
        },
      }),
    [gl, projectionConfig],
  );
  useEffect(() => {
    const pr = gl.getPixelRatio();
    idRt.setSize(
      Math.max(1, Math.floor(size.width * pr)),
      Math.max(1, Math.floor(size.height * pr)),
    );
  }, [gl, idRt, size.height, size.width]);
  useEffect(() => {
    idMaterial.uniforms.mode.value =
      projectionMode === 'min' ? 1 : projectionMode === 'maxabs' ? 4 : 0;
  }, [idMaterial, projectionMode]);
  useEffect(() => {
    const floor = Math.max(0, Math.min(1, settings.projectionIntensityFloor));
    projectionMaterial.uniforms.intensityFloor.value = floor;
    idMaterial.uniforms.intensityFloor.value = floor;
  }, [idMaterial, projectionMaterial, settings.projectionIntensityFloor]);
  useEffect(() => {
    projectionMaterial.uniforms.colorMap.value = projectionColorMap;
    projectionMaterial.uniforms.scalarMode.value = projectionConfig.scalarMode;
    projectionMaterial.uniforms.scalarLo.value = projectionConfig.scalarLo;
    projectionMaterial.uniforms.scalarHi.value = projectionConfig.scalarHi;
    projectionMaterial.uniforms.scalarHiNeg.value = projectionConfig.scalarHiNeg;
    projectionMaterial.uniforms.scalarLogDen.value = projectionConfig.scalarLogDen;
    projectionMaterial.uniforms.activeBrightness.value = settings.activeBrightness;
    projectionMaterial.uniforms.fadeWeakCorrelation.value = settings.fadeWeakCorrelation ? 1 : 0;
    idMaterial.uniforms.scalarMode.value = projectionConfig.scalarMode;
    idMaterial.uniforms.scalarLo.value = projectionConfig.scalarLo;
    idMaterial.uniforms.scalarHi.value = projectionConfig.scalarHi;
    idMaterial.uniforms.scalarHiNeg.value = projectionConfig.scalarHiNeg;
    idMaterial.uniforms.scalarLogDen.value = projectionConfig.scalarLogDen;
  }, [
    idMaterial,
    projectionColorMap,
    projectionConfig,
    projectionMaterial,
    settings.activeBrightness,
    settings.fadeWeakCorrelation,
  ]);
  useEffect(
    () => () => {
      idRt.dispose();
      idMaterial.dispose();
    },
    [idRt, idMaterial],
  );

  // Reconcile material state to the active projection mode. Three.js
  // material properties (blending, depthWrite, transparent) are JS-side
  // flags, not uniforms — mutating them in-place avoids re-creating the
  // shader program on every mode flip.
  useEffect(() => {
    const m = projectionMaterial;
    const mode = projectionMode;
    if (mode === 'mean' || mode === 'sum') {
      // Mean and sum both additively blend signed scalar components and
      // a sample count into the off-screen target. The composite pass
      // differentiates them: mean divides by count, while sum leaves the
      // accumulated scalar undivided (with user-controlled exposure).
      m.uniforms.mode.value = mode === 'sum' ? 3 : 2;
      // Use raw ONE/ONE additive blending. Three's built-in
      // AdditiveBlending uses SRC_ALPHA/ONE when the renderer is not
      // premultiplied, which would multiply the emitted RGB and alpha by
      // alpha again. For mean that turns Σ(color*i)/Σ(i) into an
      // unintended intensity-squared weighting.
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneFactor;
      m.transparent = true;
      m.depthWrite = false;
      m.depthTest = false;
    } else {
      m.uniforms.mode.value = mode === 'min' ? 1 : mode === 'maxabs' ? 4 : 0;
      if (projectionConfig.scalarMode === 2) {
        // Signed stim/swim max/min/min-max: order-independent MAX-blend
        // accumulation into the off-screen target. Max stores max(t), Min
        // stores max(1-t), and Min/Max stores sign-split magnitude, so the
        // composite can recover the true signed winner without depth-culling
        // stronger signal behind a near-neutral transparent point.
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.MaxEquation;
        m.blendSrc = THREE.OneFactor;
        m.blendDst = THREE.OneFactor;
        m.blendEquationAlpha = THREE.MaxEquation;
        m.blendSrcAlpha = THREE.OneFactor;
        m.blendDstAlpha = THREE.OneFactor;
        m.transparent = true;
        m.depthWrite = false;
        m.depthTest = false;
      } else {
        // Sequential gene/activity: opaque depth-test MIP straight to the
        // back buffer. No negative half and no transparency, so the
        // scalar-depth winner does not create transparent occlusion holes.
        m.blending = THREE.NoBlending;
        m.transparent = false;
        m.depthWrite = true;
        m.depthTest = true;
      }
    }
    m.needsUpdate = true;
  }, [projectionConfig.scalarMode, projectionMaterial, projectionMode]);

  // Canvas-size adaptation now lives inside applyColoring's auto-mode
  // formulas (basePointSize is derived from canvas height), so the
  // shader uniform stays at its default 1.0. We keep the uniform
  // around for shader-source compatibility but no longer drive it
  // from JS.

  useEffect(() => {
    if (!coloring) return;
    // Copy the shared base coloring into our own buffers so the
    // focused-neuron stamp and selection-as-filter ghost pass below
    // don't corrupt what other consumers (UmapPanel) read from the
    // same shared result.
    buffers.colors.set(coloring.result.colors);
    buffers.alphas.set(coloring.result.alphas);
    buffers.sizes.set(coloring.result.sizes);
    buffers.intensities.set(coloring.result.intensities);
    buffers.scalarValues.set(coloring.result.scalarValues);
    // Treat a t-SNE lasso selection as an additional filter for the 3D
    // viewer only: demote in-set cells outside the lasso to standard
    // ghost values. UmapPanel reads the shared (non-demoted) buffer so
    // the user can lasso new subsets from the dimmed cells.
    // basePointSize (the un-boosted size) keeps the in-set boost from
    // scale-by-filter confined to active cells — the helper sizes
    // ghosts as basePointSize × ghostFactor.
    applySelectionAsFilterGhost(
      buffers,
      data.count,
      coloring.drawOrder,
      coloring.filterSelection,
      coloring.basePointSize,
      coloring.effectiveGhostIntensity,
      selection,
    );
    // Stamp the focused neuron on top of whatever group coloring chose
    // for it: full alpha, brightened, so it stays visible inside a
    // dimmed group. The ring marker (below) handles the actual focus
    // indicator — we don't bump the cell size.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const i = focusedNeuron;
      buffers.colors[i * 3] = Math.min(1, buffers.colors[i * 3] * 1.2 + 0.25);
      buffers.colors[i * 3 + 1] = Math.min(1, buffers.colors[i * 3 + 1] * 1.2 + 0.25);
      buffers.colors[i * 3 + 2] = Math.min(1, buffers.colors[i * 3 + 2] * 1.2 + 0.25);
      buffers.alphas[i] = 1.0;
    }
    for (let i = 0; i < data.count; i++) {
      projectableMask[i] = Number.isFinite(buffers.scalarValues[i]) ? 1 : 0;
    }
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instIntensity as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instScalar as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instProjectable as THREE.BufferAttribute).needsUpdate = true;
    // drawOrder partitions cells so out-of-filter indices come first
    // and in-filter ones last. Setting it as the geometry's index
    // buffer makes Three.js draw them in that order — combined with
    // depthWrite: false (so the depth buffer doesn't enforce true 3D
    // ordering for transparents) this guarantees in-set cells
    // composite over the dim ghost haze regardless of where they
    // sit in space. When no filter is active drawOrder is null and
    // we clear the index so the renderer falls back to natural order.
    if (coloring.drawOrder) {
      geometry.setIndex(new THREE.BufferAttribute(coloring.drawOrder, 1));
    } else if (geometry.index) {
      geometry.setIndex(null);
    }
  }, [data, filter, settings, coloring, selection, focusedNeuron, buffers, projectableMask, geometry]);

  // Focused-neuron ring marker. Mirrors the t-SNE white outline: a
  // hollow circle that grows with the cell up close and floors at a
  // visible minimum when the cell shrinks at distance.
  const markerGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  // The marker material is created once per renderer. Subsequent
  // pointSize changes flow through the effect below by mutating
  // baseSize.value in place — re-creating the ShaderMaterial on every
  // slider tick would be wasteful. Capturing only the mount-time value
  // via a ref makes that "initial value, then mutate" contract
  // structural so the linter doesn't have to take our word for it.
  const initialPointSize = useRef(settings.pointSize).current;
  const markerMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        uniform float pixelRatio;
        uniform float baseSize;
        uniform float sizeScale;
        uniform float flatPointSize;
        uniform float flatSizeFactor;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float dist = -mvPosition.z;
          float depthFactor = 160.0 / max(dist, 40.0);
          float factor = mix(depthFactor, flatSizeFactor, flatPointSize);
          float cellSize = baseSize * sizeScale * pixelRatio * factor;
          // Same recipe as the t-SNE ring: at least a visible floor,
          // otherwise track the cell with a small buffer.
          gl_PointSize = max(14.0 * pixelRatio, cellSize + 6.0 * pixelRatio);
        }
      `,
      fragmentShader: `
        precision mediump float;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r = length(c);
          // Hollow ring with a soft 1.5-px-ish edge on either side.
          float outer = smoothstep(0.50, 0.46, r);
          float inner = smoothstep(0.40, 0.44, r);
          float a = outer * inner;
          if (a < 0.02) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        baseSize: { value: initialPointSize },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
      },
    });
  }, [gl, initialPointSize]);

  // Marker tracks the *effective* point size used by the cell shader so
  // the focus ring stays sized relative to the dots it surrounds.
  // basePointSize already reflects the canvas-area adaptation (auto mode);
  // we use the in-set-boosted effectivePointSize to match what active
  // cells get on screen.
  const effectiveMarkerSize =
    coloring?.effectivePointSize ?? settings.pointSize;
  useEffect(() => {
    markerMaterial.uniforms.baseSize.value = effectiveMarkerSize;
  }, [markerMaterial, effectiveMarkerSize]);

  useEffect(() => {
    // Single source of truth: settings.scaleByDepth fans out to every
    // material that computes gl_PointSize. The shader-side uniform is
    // `flatPointSize` (1 = flat, 0 = attenuated) — the inversion lives
    // here so the user-facing setting reads positively ("scale by depth
    // is on, by default"). AmbientOcclusion's internal material gets
    // the same flag via a prop on the JSX element.
    const v = settings.scaleByDepth ? 0 : 1;
    opaqueMaterial.uniforms.flatPointSize.value = v;
    transparentMaterial.uniforms.flatPointSize.value = v;
    projectionMaterial.uniforms.flatPointSize.value = v;
    contextMaterial.uniforms.flatPointSize.value = v;
    idMaterial.uniforms.flatPointSize.value = v;
    markerMaterial.uniforms.flatPointSize.value = v;
  }, [
    settings.scaleByDepth,
    opaqueMaterial,
    transparentMaterial,
    projectionMaterial,
    contextMaterial,
    idMaterial,
    markerMaterial,
  ]);

  // Flat-mode constant size factor. Match depth mode's attenuation at the
  // default zoom so toggling scale-by-depth doesn't shift density. Depends
  // only on the dataset (via defaultCamDistance), so a plain effect — not the
  // per-frame loop below — keeps it current.
  useEffect(() => {
    const f = flatSizeFactor(defaultCamDistance);
    opaqueMaterial.uniforms.flatSizeFactor.value = f;
    transparentMaterial.uniforms.flatSizeFactor.value = f;
    projectionMaterial.uniforms.flatSizeFactor.value = f;
    contextMaterial.uniforms.flatSizeFactor.value = f;
    idMaterial.uniforms.flatSizeFactor.value = f;
    markerMaterial.uniforms.flatSizeFactor.value = f;
  }, [
    defaultCamDistance,
    opaqueMaterial,
    transparentMaterial,
    projectionMaterial,
    contextMaterial,
    idMaterial,
    markerMaterial,
  ]);

  // Flat-mode zoom-size correction. Auto sizing is calibrated for the volume
  // filling the viewport at the default zoom; in flat mode it otherwise stays
  // fixed on screen while the volume grows/shrinks with zoom. Drive sizeScale
  // from the live camera distance each frame (cheap uniform write — no
  // coloring recompute) so flat-mode coverage stays roughly constant. Depth
  // mode keeps sizeScale = 1; its per-point 1/dist term already handles zoom.
  useFrame(() => {
    const flat = !settings.scaleByDepth;
    const target = controls?.target ?? VOLUME_CENTER_VEC;
    const s = zoomSizeScale(camera, target, defaultCamDistance, flat);
    opaqueMaterial.uniforms.sizeScale.value = s;
    transparentMaterial.uniforms.sizeScale.value = s;
    projectionMaterial.uniforms.sizeScale.value = s;
    contextMaterial.uniforms.sizeScale.value = s;
    idMaterial.uniforms.sizeScale.value = s;
    markerMaterial.uniforms.sizeScale.value = s;
  });

  useEffect(() => {
    if (focusedNeuron == null || focusedNeuron < 0 || focusedNeuron >= data.count) {
      markerGeometry.setDrawRange(0, 0);
      return;
    }
    const i = focusedNeuron;
    const pos = markerGeometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
    pos.needsUpdate = true;
    markerGeometry.setDrawRange(0, 1);
  }, [focusedNeuron, data, markerGeometry]);

  const ndcRef = useRef(new THREE.Vector3());
  const idPixelRef = useRef(new Uint8Array(4));

  useFrame(() => {
    const projMode = projectionMode;
    // Mean / sum projection: no single cell "wins" a pixel, so there's
    // no meaningful target for hover/click — disable picking entirely
    // and let the cursor pass through to camera controls.
    if (projMode === 'mean' || projMode === 'sum') {
      if (pickRef.current.hovered !== -1) {
        pickRef.current.hovered = -1;
        onHoverChange(-1);
      }
      return;
    }
    // Max / min projection: pick via an ID-buffer readback so the
    // selected cell matches the pixel actually drawn on screen
    // (rather than the geometrically-nearest cell center, which can
    // diverge wildly when a deep high-intensity cell punches through
    // a shallow low-intensity one). Same depth-test reduction as the
    // visible projection pass, written into an RGBA8 offscreen with
    // cell index packed across RGB.
    if (projMode === 'max' || projMode === 'min' || projMode === 'maxabs') {
      const pos = pickRef.current.pos;
      if (!pos) {
        if (pickRef.current.hovered !== -1) {
          pickRef.current.hovered = -1;
          onHoverChange(-1);
        }
        return;
      }
      const prevOverride = scene.overrideMaterial;
      const prevBackground = scene.background;
      const prevTarget = gl.getRenderTarget();
      const prevClearColor = gl.getClearColor(new THREE.Color());
      const prevClearAlpha = gl.getClearAlpha();
      const ctx = contextPointsRef.current;
      const prevCtxVisible = ctx ? ctx.visible : true;
      try {
        // Exclude the ghost/context underlay so its cells (which share the
        // geometry, hence the same scalar attributes) don't win ID pixels
        // over the projection cells the user actually sees.
        if (ctx) ctx.visible = false;
        scene.overrideMaterial = idMaterial;
        // The viewer scene has an opaque background color for the normal
        // backbuffer render. Suppress it for the ID target so empty pixels
        // stay the packed background value (0,0,0) and decode to "no cell".
        scene.background = null;
        gl.setRenderTarget(idRt);
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, false);
        gl.render(scene, camera);
      } finally {
        if (ctx) ctx.visible = prevCtxVisible;
        scene.overrideMaterial = prevOverride;
        scene.background = prevBackground;
        gl.setRenderTarget(prevTarget);
        gl.setClearColor(prevClearColor, prevClearAlpha);
      }
      const pr = gl.getPixelRatio();
      // readPixels uses bottom-up Y; our cursor coords are top-down.
      const px = Math.floor(pos.x * pr);
      const py = Math.floor((size.height - pos.y) * pr);
      const pixel = idPixelRef.current;
      gl.readRenderTargetPixels(idRt, px, py, 1, 1, pixel);
      const packed = pixel[0] | (pixel[1] << 8) | (pixel[2] << 16);
      const id = packed === 0 ? -1 : packed - 1;
      if (id !== pickRef.current.hovered) {
        pickRef.current.hovered = id;
        onHoverChange(id);
      }
      return;
    }
    const pos = pickRef.current.pos;
    if (!pos) {
      if (pickRef.current.hovered !== -1) {
        pickRef.current.hovered = -1;
        onHoverChange(-1);
      }
      return;
    }
    const { x: mx, y: my } = pos;
    const positions = data.positions;
    const w = size.width;
    const h = size.height;
    const projMat = camera.projectionMatrix;
    const viewMat = camera.matrixWorldInverse;
    const tmp = ndcRef.current;
    const CENTER_FALLBACK_RADIUS = 16;
    const CENTER_FALLBACK_RADIUS_SQ = CENTER_FALLBACK_RADIUS * CENTER_FALLBACK_RADIUS;
    const PICK_PAD_PX = 2;
    const MIN_DISK_PICK_RADIUS = 3;

    // Match the world transform applied by <group> below: scale y by
    // −1 (flip the AP/longitudinal axis to match the paper figures),
    // then rotate +90° around Z. Net effect on raw data coords:
    //   (dx, dy, dz) → (dy, dx, dz)
    // so AP/world-y → +screen-x and ML/world-x → +screen-y.

    // Pick in two tiers:
    //   1. If the cursor is inside one or more rendered point disks,
    //      choose the front-most disk. This matches what the depth
    //      buffer shows, so a rear cell center cannot steal a click
    //      from a visible front cell.
    //   2. If the cursor is near but not on any disk, fall back to the
    //      nearest center in a 16 px radius to keep small/far points
    //      easy to acquire.
    //
    // When a filter is active, in-filter cells outrank out-of-filter
    // ones regardless of distance/depth: the dimmed background cells
    // are visually de-emphasized, so a click on a coloured cell that
    // happens to sit a hair behind a greyed-out one should still land
    // on the coloured cell. Out-of-filter cells are only considered if
    // no in-filter cell is within the pick window — and not at all
    // when ghost mode is on, since they're effectively invisible.
    //
    // The t-SNE lasso is treated as an additional filter in the 3D
    // viewer (see applySelectionAsFilterGhost), so it contributes to
    // both `filterActive` and per-cell `inFilter`. That keeps the
    // picker's priority aligned with the rendered ghost demotion.
    const hasLasso = selection.source === 'umap' && selection.indices.length > 0;
    const lassoSet = hasLasso ? new Set<number>(Array.from(selection.indices)) : null;
    const filterActive = anyFilterActive(data, filter) || hasLasso;
    // Below half visibility, ghosts are too faint to aim at — skip
    // them in the picker so clicks always land on cells the user can
    // actually see. Use coloring's effective ghost intensity so this
    // tracks autoSizing too.
    const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
    const ghost = filterActive && effGhost < 0.5;
    // Read from our LOCAL buffers (not coloring.result) so the picker
    // honors the selection-as-filter ghost override: a cell that was
    // demoted to ghost in the 3D pass should also be unpickable below
    // the visibility threshold, even though the shared buffer still
    // marks it as in-set.
    const alphas = buffers.alphas;
    const pointSizes = buffers.sizes;
    const defaultPointSize = coloring?.effectivePointSize ?? settings.pointSize;
    const pixelRatio = gl.getPixelRatio();
    let bestDiskI = -1;
    let bestDiskD2 = Infinity;
    let bestDiskZ = Infinity;
    let bestDiskInFilter = false;
    let bestNearI = -1;
    let bestNearD2 = Infinity;
    let bestNearZ = Infinity;
    let bestNearInFilter = false;
    for (let i = 0; i < data.count; i++) {
      if (!cellIsRenderable(data, filter, i)) continue;
      if (alphas && alphas[i] < 0.02) continue;
      const ox = positions[i * 3];
      const x = positions[i * 3 + 1];
      const y = ox;
      const z = positions[i * 3 + 2];
      tmp.set(x, y, z);
      tmp.applyMatrix4(viewMat);
      const cz = tmp.z;
      if (cz > -1) continue;
      tmp.applyMatrix4(projMat);
      const px = (tmp.x * 0.5 + 0.5) * w;
      const py = (-tmp.y * 0.5 + 0.5) * h;
      const dx = px - mx;
      const dy = py - my;
      const d2 = dx * dx + dy * dy;
      const depth = -cz;
      const pointSize = pointSizes ? pointSizes[i] : defaultPointSize;
      const diameter = Math.max(1.5 / pixelRatio, pointSize * (160 / Math.max(depth, 40)));
      const diskRadius = Math.max(MIN_DISK_PICK_RADIUS, diameter * 0.5 + PICK_PAD_PX);
      const diskHit = d2 <= diskRadius * diskRadius;
      const nearHit = d2 <= CENTER_FALLBACK_RADIUS_SQ;
      if (!diskHit && !nearHit) continue;
      // "In filter" for picker priority: passes the active filter cards
       // AND is inside the active lasso (if any).
      const inFilter =
        !filterActive ||
        (cellInSet(data, filter, settings, i) && (!lassoSet || lassoSet.has(i)));
      if (diskHit) {
        if (inFilter) {
          if (
            !bestDiskInFilter ||
            depth < bestDiskZ ||
            (depth === bestDiskZ && d2 < bestDiskD2)
          ) {
            bestDiskInFilter = true;
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        } else if (!bestDiskInFilter && !ghost) {
          if (depth < bestDiskZ || (depth === bestDiskZ && d2 < bestDiskD2)) {
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        }
      }
      if (nearHit) {
        if (inFilter) {
          if (!bestNearInFilter || d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearInFilter = true;
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        } else if (!bestNearInFilter && !ghost) {
          if (d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        }
      }
    }

    const bestI = bestDiskI >= 0 ? bestDiskI : bestNearI;
    if (bestI !== pickRef.current.hovered) {
      pickRef.current.hovered = bestI;
      onHoverChange(bestI);
    }
  });

  const projectionOn = projectionMode !== 'off';
  return (
    <group rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
      {projectionOn ? (
        // Projection mode replaces the normal opaque + transparent
        // foreground with an existing-buffer ghost pass plus the
        // projection overlay. The underlay uses the same instColor,
        // instAlpha, instSize, ghost visibility, and auto-sizing logic as
        // normal rendering, but masks to actual non-projectable ghosts, so
        // low-alpha active signal cells do not become context.
        <>
          <points
            ref={contextPointsRef}
            name={PROJECTION_CONTEXT_NAME}
            geometry={geometry}
            material={contextMaterial}
            renderOrder={-1}
            userData={skipAmbientOcclusionUserData}
          />
          <points
            name={PROJECTION_POINTS_NAME}
            geometry={geometry}
            material={projectionMaterial}
            renderOrder={0}
            userData={skipAmbientOcclusionUserData}
          />
        </>
      ) : (
        <>
          {/* Opaque pass first so its depth values are in place before the
            * transparent pass reads them. Both points share the same
            * geometry — the materials' alphaMin / alphaMax uniforms
            * partition cells by alpha at the fragment level. */}
          <points geometry={geometry} material={opaqueMaterial} renderOrder={0} />
          <points
            geometry={geometry}
            material={transparentMaterial}
            renderOrder={1}
            userData={skipAmbientOcclusionUserData}
          />
          <points
            geometry={markerGeometry}
            material={markerMaterial}
            renderOrder={2}
            userData={skipAmbientOcclusionUserData}
          />
        </>
      )}
    </group>
  );
}

export function BrainViewer({
  data,
  filter,
  settings,
  coloring,
  selection,
  focusedNeuron,
  onFocus,
  onCanvasSizeChange,
  initialCamera,
  onCameraChange,
  onProjectionModeChange,
}: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });
  // Wrapping-div size — the R3F Canvas fills its parent so this is
  // also the rendered canvas size. Tracked unconditionally because the
  // auto-mode point-size / ghost-visibility formulas depend on it.
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const next = { w: Math.floor(rect.width), h: Math.floor(rect.height) };
      setCanvasSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Mirror the measured size up to App so useColoring's deps update.
  // Skip the (0, 0) mount value — App seeds with the upper anchor so
  // first paint already renders sensibly.
  useEffect(() => {
    if (!onCanvasSizeChange) return;
    if (canvasSize.w === 0 || canvasSize.h === 0) return;
    onCanvasSizeChange(canvasSize);
  }, [canvasSize, onCanvasSizeChange]);

  // Default camera position derived from the data bounds — straight-on
  // dorsal view with the brain comfortably filling the landscape panel.
  // span doubles as the basis for the zoom limits below.
  const { defaultCamPosition, minDistance, maxDistance } = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return {
      defaultCamPosition: [0, 0, span * 0.95] as [number, number, number],
      // Hard zoom-in floor. Without it, TrackballControls' default
      // minDistance=0 lets the wheel keep shrinking the camera-to-
      // target offset asymptotically: the view stops changing once
      // the eye is sub-pixel close, but further wheel ticks keep
      // updating it, and zooming back out is a slow exponential climb
      // back through all that compounded zoom. With minDistance set,
      // TrackballControls._checkDistances clamps the eye and resets
      // the zoom accumulator (_zoomStart.copy(_zoomEnd)) the instant
      // we hit the floor, turning it into a hard wall.
      minDistance: span * 0.15,
      maxDistance: span * 5,
    };
  }, [data]);
  // initialCamera is the URL-restored seed. Capture it once at mount in
  // a ref so a later prop update (e.g. a parent re-emitting the URL
  // state) can't yank the camera mid-interaction.
  const mountCameraRef = useRef(initialCamera);
  const screenPanRef = useRef<ScreenPanState>({
    x: mountCameraRef.current?.pan?.[0] ?? 0,
    y: mountCameraRef.current?.pan?.[1] ?? 0,
  });
  const camPosition = useMemo(() => {
    if (mountCameraRef.current) return mountCameraRef.current.pos;
    return defaultCamPosition;
  }, [defaultCamPosition]);

  // Imperative handle into CameraSync so the overlay button can snap
  // the camera back to its default position/pan without lifting the
  // r3f controls instance out of the Canvas.
  const resetRef = useRef<(() => void) | null>(null);
  const initiallyAtDefault = !mountCameraRef.current;
  const [atDefault, setAtDefault] = useState(initiallyAtDefault);

  // Track the pointer-down position so we can distinguish a click (no
  // movement) from a drag-rotate. Without this, a drag-rotate ending
  // over a neuron fires the same DOM click event a true click would,
  // and the user accidentally selects that neuron.
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const DRAG_THRESHOLD_PX = 4;

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pickRef.current.pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Promote pointerdown → drag once movement exceeds the threshold.
    // The tooltip is hidden the moment a drag starts and stays hidden
    // until the next mousedown so it doesn't trail the cursor across
    // a rotate/pan.
    if (downRef.current && !draggedRef.current) {
      const dx = e.clientX - downRef.current.x;
      const dy = e.clientY - downRef.current.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        draggedRef.current = true;
        setHover(null);
      }
    }
    if (!draggedRef.current && pickRef.current.hovered >= 0) {
      setHover({
        i: pickRef.current.hovered,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };
  const onPointerLeave = () => {
    pickRef.current.pos = null;
    pickRef.current.hovered = -1;
    setHover(null);
    downRef.current = null;
    draggedRef.current = false;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };
  const onPointerUp = () => {
    downRef.current = null;
  };
  const onClickDiv = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      // Suppress the click that closes a drag-rotate so it doesn't get
      // interpreted as "focus this neuron".
      draggedRef.current = false;
      return;
    }
    const i = pickRef.current.hovered;
    // Click on a neuron → focus it. Click on empty space → unfocus.
    // Either way the group selection is left alone.
    onFocus(i >= 0 ? i : null);
    e.stopPropagation();
  };

  // useFrame in PointCloud calls this when the hovered index changes; we
  // mirror it into React state so the tooltip re-renders. Suppressed
  // while a drag is in progress so the tooltip doesn't reappear behind
  // a rotate/pan as the picker keeps walking over cells.
  const handleHoverChange = useCallback((i: number) => {
    if (i < 0) {
      setHover(null);
      return;
    }
    if (draggedRef.current) return;
    const pos = pickRef.current.pos;
    if (!pos) return;
    setHover({ i, x: pos.x, y: pos.y });
  }, []);

  const projectionConfig = useMemo(
    () => scalarProjectionConfig(data, filter, settings),
    [data, filter, settings],
  );
  const activeProjectionMode = effectiveProjectionMode(filter.colorMode, settings.projectionMode);
  const projectionColorMap = useMemo(
    () => createProjectionColorMapTexture(projectionConfig.colorMapKind),
    [projectionConfig.colorMapKind],
  );
  useEffect(() => () => projectionColorMap.dispose(), [projectionColorMap]);

  const tooltip = hover ? buildTooltip(data, filter, settings, coloring, hover.i) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-neutral-900"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClickDiv}
    >
      <Canvas
        camera={{ position: camPosition, fov: 45, near: 0.1, far: 10000 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[VIEWER_BACKGROUND]} />
        <PointCloud
          data={data}
          filter={filter}
          settings={settings}
          coloring={coloring}
          projectionMode={activeProjectionMode}
          projectionConfig={projectionConfig}
          projectionColorMap={projectionColorMap}
          selection={selection}
          focusedNeuron={focusedNeuron}
          pickRef={pickRef}
          onHoverChange={handleHoverChange}
          defaultCamDistance={defaultCamPosition[2]}
        />
        <TrackballControls
          makeDefault
          // rotationMomentum maps inversely to TrackballControls' damping:
          // 0 → staticMoving (zero inertia), 1 → factor 0.05 (most drift).
          // The default 0.9 yields ~0.1, matching the original feel.
          staticMoving={settings.rotationMomentum === 0}
          dynamicDampingFactor={Math.max(0.05, 1 - settings.rotationMomentum)}
          rotateSpeed={4.0}
          zoomSpeed={1.5}
          minDistance={minDistance}
          maxDistance={maxDistance}
          // Object-centric mode disables native pan in favor of the
          // screen-space projection offset below, which keeps the orbit
          // target pinned to the volume center so rotation always pivots
          // around the volume. With object-centric off, native pan moves
          // the target, and rotation follows.
          noPan={settings.objectCentricRotation}
        />
        <ScreenSpacePan
          panRef={screenPanRef}
          enabled={settings.objectCentricRotation}
        />
        <CameraSync
          initialCamera={initialCamera ?? null}
          onCameraChange={onCameraChange}
          panRef={screenPanRef}
          defaultCamPosition={defaultCamPosition}
          resetRef={resetRef}
          onAtDefaultChange={setAtDefault}
          lockTargetToCenter={settings.objectCentricRotation}
        />
        {settings.ambientOcclusion && activeProjectionMode === 'off' && (
          <AmbientOcclusion
            intensity={settings.ambientOcclusionIntensity}
            radius={settings.ambientOcclusionRadius}
            flatPointSize={!settings.scaleByDepth}
            defaultCamDistance={defaultCamPosition[2]}
          />
        )}
        {activeProjectionMode !== 'off' && (
          <ProjectionRenderPass
            mode={activeProjectionMode}
            sumExposure={settings.projectionSumExposure}
            intensityFloor={settings.projectionIntensityFloor}
            projectionConfig={projectionConfig}
            projectionColorMap={projectionColorMap}
            activeBrightness={settings.activeBrightness}
            fadeWeakCorrelation={settings.fadeWeakCorrelation}
          />
        )}
      </Canvas>
      {tooltip && hover && (
        <div className="neuron-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {tooltip}
        </div>
      )}
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 pointer-events-none">
        {supportsScalarProjection(filter.colorMode) && (
          // Status pill: a per-pixel projection through the point cloud
          // is a non-default render, so it gets a persistent control at
          // the top of the overlay. Click to switch projection mode (or
          // turn it off) without leaving the 3D view — mirrors the
          // Settings tab's projection control. Shares the reset button's
          // neutral grey so the two read as one control group.
          <div className="relative pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProjMenuOpen((v) => !v);
              }}
              className="font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
              title="per-pixel projection through the point cloud — click to change"
            >
              projection: {PROJECTION_MODE_LABELS[activeProjectionMode]} ▾
            </button>
            {projMenuOpen && (
              <>
                {/* Click-away backdrop. Sits under the menu but over the
                    canvas so an outside click closes without selecting. */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjMenuOpen(false);
                  }}
                />
                <div className="absolute top-full left-0 mt-1 z-20 flex flex-col bg-neutral-900/95 border border-neutral-700 rounded overflow-hidden min-w-[88px]">
                  {PROJECTION_MODE_ORDER.map((m) => (
                    <button
                      key={m}
                      onClick={(e) => {
                        e.stopPropagation();
                        onProjectionModeChange?.(m);
                        setProjMenuOpen(false);
                      }}
                      className={
                        'font-mono text-[10px] text-left px-2 py-1 hover:bg-neutral-700 ' +
                        (m === activeProjectionMode
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-200')
                      }
                    >
                      {PROJECTION_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {!atDefault && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetRef.current?.();
            }}
            className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
          >
            reset view
          </button>
        )}
        {settings.debugMode && (
          <DebugOverlay
            canvasSize={canvasSize}
            settings={settings}
            coloring={coloring}
            totalCells={data.count}
          />
        )}
      </div>
    </div>
  );
}

function DebugOverlay({
  canvasSize,
  settings,
  coloring,
  totalCells,
}: {
  canvasSize: { w: number; h: number };
  settings: SettingsState;
  coloring: SharedColoring | null;
  totalCells: number;
}) {
  const inSetCount = coloring?.filterSelection?.length ?? totalCells;
  // basePointSize / effGhost come straight from the shared coloring
  // (computed in applyColoring), so the overlay doesn't re-derive the
  // auto-mode formulas — it just reports what the renderer used.
  const AUTO_MIN_INSET = 50;
  const useFilterLerp = settings.autoSizing && settings.scaleByFilterCount;
  const tFilter = useFilterLerp
    ? Math.max(
        0,
        Math.min(
          1,
          (Math.log(Math.max(AUTO_MIN_INSET, inSetCount)) - Math.log(AUTO_MIN_INSET)) /
            (Math.log(Math.max(AUTO_MIN_INSET + 1, totalCells)) - Math.log(AUTO_MIN_INSET)),
        ),
      )
    : 0;
  const inSetBoost = useFilterLerp ? 2 - tFilter : 1;
  const basePointSize = coloring?.basePointSize ?? settings.pointSize;
  const effPointSize = coloring?.effectivePointSize ?? settings.pointSize;
  const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-100 tabular-nums">{value}</span>
    </div>
  );
  const fx = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
  return (
    <div className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-2 py-1.5 rounded min-w-[220px] leading-tight">
      <div className="text-neutral-500 uppercase tracking-wider text-[9px] mb-1">debug</div>
      {row('canvas', `${canvasSize.w}×${canvasSize.h}`)}
      {row('cells (total)', totalCells.toLocaleString())}
      {row('cells (in set)', inSetCount.toLocaleString())}
      {row('auto', settings.autoSizing ? 'on' : 'off')}
      {row('scale by filter', settings.scaleByFilterCount ? 'on' : 'off')}
      {row('settings.pointSize', fx(settings.pointSize, 1))}
      {row('settings.ghost', fx(settings.ghostIntensity, 2))}
      {row('tFilter (boost)', fx(tFilter, 3))}
      {row('inSetBoost', fx(inSetBoost, 3) + '×')}
      {row('base pointSize', fx(basePointSize, 2))}
      {row('eff. pointSize', fx(effPointSize, 2))}
      {row('eff. ghost', fx(effGhost, 3))}
    </div>
  );
}

function supportsViewOffset(
  camera: THREE.Camera,
): camera is THREE.PerspectiveCamera | THREE.OrthographicCamera {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera;
}

/** Screen-space panning is implemented as a projection offset, not as a
 *  camera/target translation. TrackballControls therefore keeps a stable
 *  orbit target at the volume center, while right-drag simply shifts where
 *  that centered view lands inside the canvas.
 *
 *  When `enabled` is false (the user toggled off object-centric rotation),
 *  this component clears any active view offset and detaches its pointer
 *  listeners so TrackballControls' native pan can take over the right
 *  mouse button. The cached `panRef` is preserved so toggling the mode
 *  back on restores the previous screen-space pan. */
function ScreenSpacePan({
  panRef,
  enabled,
}: {
  panRef: React.MutableRefObject<ScreenPanState>;
  enabled: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const applyViewOffset = useCallback(() => {
    if (!supportsViewOffset(camera)) return;
    if (size.width <= 0 || size.height <= 0) return;
    const pan = panRef.current;
    camera.setViewOffset(size.width, size.height, -pan.x, -pan.y, size.width, size.height);
    invalidate();
  }, [camera, invalidate, panRef, size.height, size.width]);

  useEffect(() => {
    if (!enabled) {
      // Drop any active projection offset so the native trackball pan
      // sees a centered frustum to work against.
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
        invalidate();
      }
      return;
    }
    applyViewOffset();
  }, [applyViewOffset, camera, enabled, invalidate, size.height, size.width]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      el.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      panRef.current.x += dx;
      panRef.current.y += dy;
      applyViewOffset();
      event.preventDefault();
    };

    const stopDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', stopDrag);
      el.removeEventListener('pointercancel', stopDrag);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [applyViewOffset, enabled, gl, panRef]);

  return null;
}

/** Reads/writes the camera-controls + camera state so App can mirror
 *  it to the URL hash. Restores `initialCamera` once on mount;
 *  thereafter polls the camera each frame and fires `onCameraChange`
 *  only after a few idle frames so the URL update lands when the user
 *  has truly stopped moving (covers TrackballControls' damping settle
 *  without spamming a write per frame). */
function CameraSync({
  initialCamera,
  onCameraChange,
  panRef,
  defaultCamPosition,
  resetRef,
  onAtDefaultChange,
  lockTargetToCenter,
}: {
  initialCamera: CameraState | null;
  onCameraChange?: (cam: CameraState) => void;
  panRef: React.MutableRefObject<ScreenPanState>;
  defaultCamPosition: [number, number, number];
  resetRef: React.MutableRefObject<(() => void) | null>;
  onAtDefaultChange: (atDefault: boolean) => void;
  /** When true, the orbit target is forced back to VOLUME_CENTER each
   *  frame so rotation always pivots around the volume. When false, the
   *  user-driven pan (native TrackballControls pan) is allowed to move
   *  the target freely. */
  lockTargetToCenter: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  // The drei controls wire themselves in via makeDefault; useThree
  // exposes the instance on .controls. Use any to avoid a public-API
  // dependency on TrackballControlsImpl.
  const controls = useThree((s) => s.controls) as any;
  const restoredRef = useRef(false);
  const lastRef = useRef<CameraState | null>(null);
  // Position tolerance for the at-default check. Trackball damping
  // can leave sub-unit residue after a snap, so compare against a
  // fraction of the default eye distance rather than using exact
  // equality.
  const POS_EPS = Math.max(1e-3, Math.hypot(...defaultCamPosition) * 1e-4);
  const atDefaultRef = useRef<boolean | null>(null);

  useEffect(() => {
    resetRef.current = () => {
      camera.position.set(...defaultCamPosition);
      // TrackballControls rotates camera.up during orbit, so position
      // + target alone leaves the view rolled. Restore the canonical
      // up vector so the volume returns to its original orientation.
      camera.up.set(0, 1, 0);
      controls?.target.set(...VOLUME_CENTER);
      controls?.update();
      panRef.current.x = 0;
      panRef.current.y = 0;
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
      }
      invalidate();
    };
    return () => {
      resetRef.current = null;
    };
  }, [camera, controls, defaultCamPosition, invalidate, panRef, resetRef, size.height, size.width]);

  useEffect(() => {
    if (!controls || restoredRef.current) return;
    if (initialCamera) {
      camera.position.set(...initialCamera.pos);
      // Orient the camera. Current URLs carry both an explicit quaternion
      // (captures any roll the trackball produced) and the orbit target
      // (captures native pan). Older v2 URLs may only have pos + quat and
      // implicitly target the volume center; v1 URLs only had pos + target,
      // so fall back to look-at with the canonical up vector (roll for
      // those links is unrecoverable).
      const target = initialCamera.target ?? VOLUME_CENTER;
      if (initialCamera.quat) {
        camera.quaternion.set(
          initialCamera.quat[0],
          initialCamera.quat[1],
          initialCamera.quat[2],
          initialCamera.quat[3],
        );
        // Derive `up` from the quaternion so subsequent trackball
        // rotations have the correct local frame to spin around.
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      } else if (initialCamera.target) {
        camera.up.set(0, 1, 0);
        camera.lookAt(target[0], target[1], target[2]);
      }
      controls.target.set(...target);
      controls.update();
    }
    restoredRef.current = true;
  }, [controls, camera, initialCamera]);

  useFrame(() => {
    if (!controls) return;
    if (
      lockTargetToCenter &&
      (controls.target.x !== VOLUME_CENTER[0] ||
        controls.target.y !== VOLUME_CENTER[1] ||
        controls.target.z !== VOLUME_CENTER[2])
    ) {
      controls.target.set(...VOLUME_CENTER);
      controls.update();
    }
    const targetAtCenter =
      Math.abs(controls.target.x - VOLUME_CENTER[0]) < POS_EPS &&
      Math.abs(controls.target.y - VOLUME_CENTER[1]) < POS_EPS &&
      Math.abs(controls.target.z - VOLUME_CENTER[2]) < POS_EPS;
    const isAtDefault =
      Math.abs(camera.position.x - defaultCamPosition[0]) < POS_EPS &&
      Math.abs(camera.position.y - defaultCamPosition[1]) < POS_EPS &&
      Math.abs(camera.position.z - defaultCamPosition[2]) < POS_EPS &&
      Math.abs(camera.up.x) < 1e-3 &&
      Math.abs(camera.up.y - 1) < 1e-3 &&
      Math.abs(camera.up.z) < 1e-3 &&
      panRef.current.x === 0 &&
      panRef.current.y === 0 &&
      targetAtCenter;
    if (atDefaultRef.current !== isAtDefault) {
      atDefaultRef.current = isAtDefault;
      onAtDefaultChange(isAtDefault);
    }
    if (!onCameraChange) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const quat: [number, number, number, number] = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ];
    const target: [number, number, number] = [
      controls.target.x,
      controls.target.y,
      controls.target.z,
    ];
    const rawPan = panRef.current;
    const pan: [number, number] | undefined =
      rawPan.x !== 0 || rawPan.y !== 0 ? [rawPan.x, rawPan.y] : undefined;
    const cam: CameraState = pan ? { pos, quat, target, pan } : { pos, quat, target };
    const last = lastRef.current;
    // Sub-pixel epsilon: anything below this per-frame delta is
    // numerically still as far as the rendered image cares about, so
    // we stop emitting and let the App-side debounce write the URL.
    // Exact float equality would keep counting the tail of trackball
    // damping (~0.9× velocity decay each frame) as "movement" for
    // ~130 frames after release — which kept resetting the debounce
    // and stalled the URL hash for ~2 s. The remaining residue past
    // this threshold is bounded by epsilon / dampingFactor (~1e-3
    // unit), well inside the rounded URL precision.
    const POS_DELTA_EPS = 1e-4;
    const TARGET_DELTA_EPS = 1e-4;
    const QUAT_DELTA_EPS = 1e-5;
    const PAN_DELTA_EPS = 1e-4;
    const moved =
      !last ||
      Math.abs(pos[0] - last.pos[0]) > POS_DELTA_EPS ||
      Math.abs(pos[1] - last.pos[1]) > POS_DELTA_EPS ||
      Math.abs(pos[2] - last.pos[2]) > POS_DELTA_EPS ||
      Math.abs(target[0] - (last.target?.[0] ?? VOLUME_CENTER[0])) > TARGET_DELTA_EPS ||
      Math.abs(target[1] - (last.target?.[1] ?? VOLUME_CENTER[1])) > TARGET_DELTA_EPS ||
      Math.abs(target[2] - (last.target?.[2] ?? VOLUME_CENTER[2])) > TARGET_DELTA_EPS ||
      Math.abs(quat[0] - (last.quat?.[0] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[1] - (last.quat?.[1] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[2] - (last.quat?.[2] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[3] - (last.quat?.[3] ?? 1)) > QUAT_DELTA_EPS ||
      Math.abs((pan?.[0] ?? 0) - (last.pan?.[0] ?? 0)) > PAN_DELTA_EPS ||
      Math.abs((pan?.[1] ?? 0) - (last.pan?.[1] ?? 0)) > PAN_DELTA_EPS;
    if (!moved) return;
    // Emit on every (above-epsilon) change so the upstream camera ref
    // stays current — the URL hash write is debounced 50 ms in App,
    // which is what coalesces the per-frame stream into a single
    // replaceState call once the damping settles below the epsilon.
    // Holding emits until N idle frames meant a tab duplicated
    // mid-rotation (or mid-damping) saw a stale hash.
    lastRef.current = cam;
    onCameraChange(cam);
  });

  return null;
}

/** Projection render hijack for every active projection mode. Takes over
 *  the render loop at priority 1 (so r3f stops auto-rendering) so it can
 *  draw a ghost-only context pass first and then composite the projection
 *  on top in an explicit, queue-independent order — weak/empty regions
 *  stay transparent and reveal the same ghost buffers used by normal 3D
 *  rendering.
 *
 *  Step 1 (all modes): render the ghost/context underlay to the back
 *  buffer (projection hidden); autoClear also resets the depth buffer.
 *
 *  Sequential depth-MIP (gene/activity min/max/maxabs): step 2 renders the
 *  projection points straight over the ghost context with autoClear off —
 *  the GPU depth test (keyed on the scalar, not real distance) does the
 *  per-pixel reduction. These schemes are opaque with no negative half, so
 *  scalar-depth winner-take-all has no transparent-occlusion problem.
 *
 *  Accumulation (mean/sum, AND signed min/max/minmax): step 2 renders the
 *  projection into an off-screen RGBA float target. Mean/sum use additive
 *  blending to accumulate (positiveSum, negativeSum, denominator,
 *  denominator); for signed stim/swim mean with weak-correlation fade, the
 *  denominator is signal strength instead of raw count. Signed winner modes
 *  use MAX blending with invertible scalar keys. Step 3 alpha-blends a
 *  fullscreen composite quad over the ghost context, reconstructing the
 *  reduced scalar or signed winner and emitting transparency where the
 *  signal is weak.
 */
function ProjectionRenderPass({
  mode,
  sumExposure,
  intensityFloor,
  projectionConfig,
  projectionColorMap,
  activeBrightness,
  fadeWeakCorrelation,
}: {
  mode: Exclude<ProjectionMode, 'off'>;
  sumExposure: number;
  intensityFloor: number;
  projectionConfig: ScalarProjectionConfig;
  projectionColorMap: THREE.DataTexture;
  activeBrightness: number;
  fadeWeakCorrelation: boolean;
}) {
  const { gl, scene, camera, size } = useThree();

  const { rt, fullscreenScene, fullscreenCamera, compositeMaterial } = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const compositeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: projectionCompositeVertSrc,
      fragmentShader: projectionCompositeFragSrc,
      // Alpha-blended over the ghost/context underlay already in the
      // back buffer; weak/untouched pixels carry low alpha and reveal it.
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        src: { value: rt.texture },
        mode: { value: 0 },
        sumExposure: { value: 1 },
        intensityFloor: { value: 0.05 },
        colorMap: { value: projectionColorMap },
        scalarMode: { value: projectionConfig.scalarMode },
        scalarLo: { value: projectionConfig.scalarLo },
        scalarHi: { value: projectionConfig.scalarHi },
        scalarHiNeg: { value: projectionConfig.scalarHiNeg },
        scalarLogDen: { value: projectionConfig.scalarLogDen },
        activeBrightness: { value: 0 },
        fadeWeakCorrelation: { value: 1 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
    const fullscreenScene = new THREE.Scene();
    fullscreenScene.add(quad);
    const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { rt, fullscreenScene, fullscreenCamera, compositeMaterial };
  }, [projectionColorMap, projectionConfig]);

  useEffect(() => {
    // Composite reduction selector: 0 mean, 1 sum, 2 max, 3 min, 4 min/max.
    compositeMaterial.uniforms.mode.value =
      mode === 'sum' ? 1 : mode === 'max' ? 2 : mode === 'min' ? 3 : mode === 'maxabs' ? 4 : 0;
  }, [compositeMaterial, mode]);
  useEffect(() => {
    compositeMaterial.uniforms.sumExposure.value = Math.max(0.01, Math.min(10, sumExposure));
  }, [compositeMaterial, sumExposure]);
  useEffect(() => {
    compositeMaterial.uniforms.intensityFloor.value = Math.max(0, Math.min(1, intensityFloor));
  }, [compositeMaterial, intensityFloor]);
  useEffect(() => {
    compositeMaterial.uniforms.colorMap.value = projectionColorMap;
    compositeMaterial.uniforms.scalarMode.value = projectionConfig.scalarMode;
    compositeMaterial.uniforms.scalarLo.value = projectionConfig.scalarLo;
    compositeMaterial.uniforms.scalarHi.value = projectionConfig.scalarHi;
    compositeMaterial.uniforms.scalarHiNeg.value = projectionConfig.scalarHiNeg;
    compositeMaterial.uniforms.scalarLogDen.value = projectionConfig.scalarLogDen;
    compositeMaterial.uniforms.activeBrightness.value = activeBrightness;
    compositeMaterial.uniforms.fadeWeakCorrelation.value = fadeWeakCorrelation ? 1 : 0;
  }, [activeBrightness, compositeMaterial, fadeWeakCorrelation, projectionColorMap, projectionConfig]);

  useEffect(() => {
    return () => {
      rt.dispose();
      compositeMaterial.dispose();
      const quad = fullscreenScene.children[0] as THREE.Mesh;
      (quad.geometry as THREE.BufferGeometry).dispose();
    };
  }, [rt, compositeMaterial, fullscreenScene]);

  useEffect(() => {
    const pr = gl.getPixelRatio();
    rt.setSize(Math.max(1, Math.floor(size.width * pr)), Math.max(1, Math.floor(size.height * pr)));
  }, [gl, rt, size.height, size.width]);

  // Sequential gene/activity max/min/min-max render as an opaque depth-test
  // MIP straight to the back buffer. Everything else (mean/sum, plus signed
  // max/min/min-max) accumulates into the off-screen target and composites.
  const depthMip =
    (mode === 'min' || mode === 'max' || mode === 'maxabs') &&
    projectionConfig.scalarMode !== 2;

  useFrame(() => {
    const ctx = scene.getObjectByName(PROJECTION_CONTEXT_NAME);
    const proj = scene.getObjectByName(PROJECTION_POINTS_NAME);
    const prevTarget = gl.getRenderTarget();
    const prevBackground = scene.background;
    const prevClearColor = gl.getClearColor(new THREE.Color());
    const prevClearAlpha = gl.getClearAlpha();
    const prevAutoClear = gl.autoClear;
    const prevCtxVisible = ctx ? ctx.visible : true;
    const prevProjVisible = proj ? proj.visible : true;
    try {
      // 1. Ghost-only context pass → back buffer. Keep the scene's opaque
      //    background and let autoClear paint it (and reset depth), then
      //    ghost/context points draw over it. Projection hidden so only the
      //    visual context lands here.
      gl.autoClear = true;
      if (ctx) ctx.visible = true;
      if (proj) proj.visible = false;
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      if (depthMip) {
        // 2. Sequential MIP over the ghost context, straight to the back
        //    buffer. autoClear off preserves the context color; the depth
        //    buffer was just cleared in step 1, so the scalar-keyed depth
        //    test still does a clean per-pixel reduction among projection
        //    cells. Null the background so Three doesn't repaint it over the
        //    context this pass.
        if (ctx) ctx.visible = false;
        if (proj) proj.visible = true;
        scene.background = null;
        gl.autoClear = false;
        gl.render(scene, camera);
      } else {
        // 2. Projection accumulation → off-screen float target. Null the
        //    background (otherwise Three clears the float texture to it with
        //    alpha=1, making every pixel look "touched" and corrupting the
        //    mean/sum compositing) and render the projection points only.
        if (ctx) ctx.visible = false;
        if (proj) proj.visible = true;
        scene.background = null;
        gl.setRenderTarget(rt);
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
        gl.render(scene, camera);
        // 3. Composite the reduced scalar over the ghost context. autoClear
        //    off so the underlay survives; the composite is alpha-blended
        //    and transparent where the signal is weak, revealing context.
        gl.setRenderTarget(null);
        gl.autoClear = false;
        gl.render(fullscreenScene, fullscreenCamera);
      }
    } finally {
      scene.background = prevBackground;
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(prevClearColor, prevClearAlpha);
      gl.autoClear = prevAutoClear;
      if (ctx) ctx.visible = prevCtxVisible;
      if (proj) proj.visible = prevProjVisible;
    }
  }, 1);

  return null;
}

function buildTooltip(
  data: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  coloring: SharedColoring | null,
  i: number,
): string {
  const G = data.geneNames.length;
  const region = data.regionNames[data.regionIds[i]] ?? '?';
  const cluster = data.clusterIds[i];
  const fish = data.fishIds[i];
  const scalar = coloring?.result.scalarValues[i] ?? Number.NaN;
  const scalarLine = buildScalarTooltipLine(data, filter, settings, scalar);
  const tops: Array<{ name: string; v: number }> = [];
  for (let g = 0; g < G; g++) {
    const v = data.geneCounts[i * G + g];
    if (v > 0) tops.push({ name: data.geneNames[g], v });
  }
  tops.sort((a, b) => b.v - a.v);
  const topStr = tops.slice(0, 3).map((t) => `${t.name}:${t.v.toFixed(0)}`).join(' ');
  return `neuron ${i}\nfish ${fish + 1}  cluster ${cluster}\nregion ${region}\n${scalarLine}\ntop ${topStr || '-'}`;
}

function buildScalarTooltipLine(
  data: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  scalar: number,
): string {
  const formatValue = (v: number, digits = 3) =>
    Number.isFinite(v) ? v.toFixed(digits) : 'n/a';
  switch (filter.colorMode) {
    case 'gene': {
      const sel = filter.selectedGenes;
      let label: string;
      if (filter.txMode !== 'gene' || sel.length === 0) {
        label = 'gene richness';
      } else if (sel.length === 1) {
        label = `${data.geneNames[sel[0]] ?? 'gene'} spots`;
      } else if (settings.geneMultiColor === 'richness') {
        label = `selected-gene richness (${sel.length})`;
      } else if (settings.geneMultiColor === 'sum') {
        label = `selected-gene spot sum (${sel.length})`;
      } else {
        label = `selected-gene spot max (${sel.length})`;
      }
      return `${label}: ${formatValue(scalar, 0)}`;
    }
    case 'activity':
      return `activity ΔF/F: ${formatValue(scalar, 3)}`;
    case 'stim':
      return `stim r: ${formatValue(scalar, 3)}`;
    case 'swim':
      return `swim r: ${formatValue(scalar, 3)}`;
    case 'region':
    case 'fish':
    case 'highlight':
      return 'n/a (categorical color)';
  }
}
