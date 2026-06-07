import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SettingsState } from '../../data/types';
import vertSrc from '../../shaders/neuron.vert.glsl?raw';
import fragSrc from '../../shaders/neuron.frag.glsl?raw';
import ghostContextVertSrc from '../../shaders/neuron_ghost_context.vert.glsl?raw';
import ghostContextFragSrc from '../../shaders/neuron_ghost_context.frag.glsl?raw';
import projectionVertSrc from '../../shaders/projection.vert.glsl?raw';
import projectionFragSrc from '../../shaders/projection.frag.glsl?raw';
import projectionIdVertSrc from '../../shaders/projection_id.vert.glsl?raw';
import projectionIdFragSrc from '../../shaders/projection_id.frag.glsl?raw';
import type { ScalarProjectionConfig } from './projectionModel';

interface UsePointCloudMaterialsParams {
  gl: THREE.WebGLRenderer;
  size: { width: number; height: number };
  projectionMode: SettingsState['projectionMode'];
  projectionConfig: ScalarProjectionConfig;
  projectionColorMap: THREE.DataTexture;
  settings: SettingsState;
}

interface PointCloudMaterials {
  opaqueMaterial: THREE.ShaderMaterial;
  transparentMaterial: THREE.ShaderMaterial;
  contextMaterial: THREE.ShaderMaterial;
  projectionMaterial: THREE.ShaderMaterial;
  idRt: THREE.WebGLRenderTarget;
  idMaterial: THREE.ShaderMaterial;
}

/** Creates and keeps the point-cloud shader materials in sync with projection settings. */
export function usePointCloudMaterials({
  gl,
  size,
  projectionMode,
  projectionConfig,
  projectionColorMap,
  settings,
}: UsePointCloudMaterialsParams): PointCloudMaterials {
  // Initial projection uniform values, captured once. The projection /
  // ID materials below are created a single time (keyed on `gl` only) and
  // are NOT recreated when projectionConfig or projectionColorMap change:
  // projectionConfig is memoized upstream on [data, filter, settings], so
  // it takes a fresh identity on every filter/settings change. Keying the
  // materials on it recompiled the GLSL program on every interaction and,
  // for projectionMaterial (which had no disposal), leaked the previous
  // program each time. The reconciliation effects further down own all
  // subsequent uniform updates, so the only role of these initial values
  // is to give the first frame a valid color map before the effects run.
  const initialProjectionRef = useRef({
    colorMap: projectionColorMap,
    config: projectionConfig,
  });

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
        activityMode: { value: 0 },
        activityLo: { value: 0 },
        activityHi: { value: 1.5 },
        activityNoSignalAlpha: { value: 0.22 },
        activityActiveBrightness: { value: 0 },
        activityOpaqueActiveCells: { value: 0 },
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
        activityMode: { value: 0 },
        activityLo: { value: 0 },
        activityHi: { value: 1.5 },
        activityNoSignalAlpha: { value: 0.22 },
        activityActiveBrightness: { value: 0 },
        activityOpaqueActiveCells: { value: 0 },
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
        colorMap: { value: initialProjectionRef.current.colorMap },
        scalarMode: { value: initialProjectionRef.current.config.scalarMode },
        scalarLo: { value: initialProjectionRef.current.config.scalarLo },
        scalarHi: { value: initialProjectionRef.current.config.scalarHi },
        scalarHiNeg: { value: initialProjectionRef.current.config.scalarHiNeg },
        scalarLogDen: { value: initialProjectionRef.current.config.scalarLogDen },
        activeBrightness: { value: 0 },
        fadeWeakCorrelation: { value: 1 },
      },
    });
  }, [gl]);
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
          scalarMode: { value: initialProjectionRef.current.config.scalarMode },
          scalarLo: { value: initialProjectionRef.current.config.scalarLo },
          scalarHi: { value: initialProjectionRef.current.config.scalarHi },
          scalarHiNeg: { value: initialProjectionRef.current.config.scalarHiNeg },
          scalarLogDen: { value: initialProjectionRef.current.config.scalarLogDen },
        },
      }),
    [gl],
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
  // Explicit disposal of every resource this hook owns. These materials
  // and the ID render target are created here and only referenced by the
  // <points> primitives in PointCloud via the `material` prop — React
  // Three Fiber does not own materials it didn't construct from JSX
  // args, so it won't free their GLSL programs. All six instances are now
  // stable (keyed on `gl`/`[]`), so this cleanup runs on unmount or a
  // renderer swap rather than per interaction.
  useEffect(
    () => () => {
      opaqueMaterial.dispose();
      transparentMaterial.dispose();
      contextMaterial.dispose();
      projectionMaterial.dispose();
      idRt.dispose();
      idMaterial.dispose();
    },
    [
      opaqueMaterial,
      transparentMaterial,
      contextMaterial,
      projectionMaterial,
      idRt,
      idMaterial,
    ],
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


  return {
    opaqueMaterial,
    transparentMaterial,
    contextMaterial,
    projectionMaterial,
    idRt,
    idMaterial,
  };
}
