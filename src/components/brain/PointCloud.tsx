import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../../data/types';
import {
  allocColoring,
  anyFilterActive,
  applySelectionAsFilterGhost,
  cellInSet,
  cellIsRenderable,
} from '../../utils/coloring';
import type { SharedColoring } from '../../hooks/useColoring';
import { skipAmbientOcclusionUserData } from '../AmbientOcclusion';
import { zoomSizeScale, flatSizeFactor } from '../../utils/zoomSizing';
import type { ScalarProjectionConfig } from './projectionModel';
import {
  FOCUS_MARKER_NAME,
  PROJECTION_CONTEXT_NAME,
  PROJECTION_POINTS_NAME,
} from './sceneObjectNames';
import { registerProjectionShaderChunks } from './registerProjectionShaderChunks';
import { usePointCloudMaterials } from './usePointCloudMaterials';

registerProjectionShaderChunks();

export interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}

/** Inner R3F component: owns the Points object and shader updates.
 *  Filter / settings / selection are already baked into `coloring`;
 *  this component reads them directly only for the picker's
 *  in-filter prioritization. */
export function PointCloud({
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
  volumeCenter,
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
  pickRef: MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
  /** Camera-to-target distance at the default zoom (span * 0.95). The basis
   *  for the flat-mode zoom-size correction below. */
  defaultCamDistance: number;
  /** Volume center in rendered world coordinates. Used as the camera-distance fallback before controls mount. */
  volumeCenter: THREE.Vector3;
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
  const activityValues = useMemo(() => new Float32Array(data.count), [data]);
  const activityActiveMask = useMemo(() => new Float32Array(data.count), [data]);

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
    g.setAttribute('instActivity', new THREE.BufferAttribute(activityValues, 1));
    g.setAttribute('instActivityActive', new THREE.BufferAttribute(activityActiveMask, 1));
    g.setAttribute('instCellId', new THREE.BufferAttribute(cellIds, 1));
    g.computeBoundingSphere();
    return g;
  }, [data, buffers, projectableMask, activityValues, activityActiveMask, cellIds]);

  const {
    opaqueMaterial,
    transparentMaterial,
    contextMaterial,
    projectionMaterial,
    idRt,
    idMaterial,
  } = usePointCloudMaterials({
    gl,
    size,
    projectionMode,
    projectionConfig,
    projectionColorMap,
    settings,
  });

  // Canvas-size adaptation now lives inside applyColoring's auto-mode
  // formulas (basePointSize is derived from canvas height), so the
  // shader uniform stays at its default 1.0. We keep the uniform
  // around for shader-source compatibility but no longer drive it
  // from JS.

  const lastStaticUploadRef = useRef<{
    focusedNeuron: number | null;
    selection: SelectionState;
    coloringRevision: number;
  } | null>(null);

  useEffect(() => {
    if (!coloring) return;
    const activityShaderMode =
      filter.colorMode === 'activity' && projectionMode === 'off';
    const skipStaticUpload =
      activityShaderMode &&
      lastStaticUploadRef.current?.focusedNeuron === focusedNeuron &&
      lastStaticUploadRef.current?.selection === selection &&
      lastStaticUploadRef.current?.coloringRevision === coloring.revision;
    if (skipStaticUpload) return;
    // Copy the shared base coloring into our own buffers so the
    // focused-neuron stamp and selection-as-filter ghost pass below
    // don't corrupt what other consumers (UmapPanel) read from the
    // same shared result.
    buffers.colors.set(coloring.result.colors);
    buffers.alphas.set(coloring.result.alphas);
    buffers.sizes.set(coloring.result.sizes);
    const projectionAttributesNeeded = projectionMode !== 'off';
    const scalarAttributesNeeded = projectionAttributesNeeded || activityShaderMode;
    if (scalarAttributesNeeded) {
      buffers.intensities.set(coloring.result.intensities);
      buffers.scalarValues.set(coloring.result.scalarValues);
    }
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
    // Note: in activityShaderMode the shader recomputes color/alpha from
    // instActivity for active cells, so this stamp is overridden there —
    // the ring still marks focus, but a focused no-signal cell shows at the
    // dim no-signal alpha rather than being lifted to 1.0.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const i = focusedNeuron;
      buffers.colors[i * 3] = Math.min(1, buffers.colors[i * 3] * 1.2 + 0.25);
      buffers.colors[i * 3 + 1] = Math.min(1, buffers.colors[i * 3 + 1] * 1.2 + 0.25);
      buffers.colors[i * 3 + 2] = Math.min(1, buffers.colors[i * 3 + 2] * 1.2 + 0.25);
      buffers.alphas[i] = 1.0;
    }
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
    if (activityShaderMode) {
      for (let i = 0; i < data.count; i++) {
        activityActiveMask[i] = Number.isFinite(buffers.scalarValues[i]) ? 1 : 0;
      }
      (geometry.attributes.instActivityActive as THREE.BufferAttribute).needsUpdate = true;
    }
    if (projectionAttributesNeeded) {
      for (let i = 0; i < data.count; i++) {
        projectableMask[i] = Number.isFinite(buffers.scalarValues[i]) ? 1 : 0;
      }
      (geometry.attributes.instIntensity as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.instScalar as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.instProjectable as THREE.BufferAttribute).needsUpdate = true;
    }
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
    lastStaticUploadRef.current = {
      focusedNeuron,
      selection,
      coloringRevision: coloring.revision,
    };
  }, [data, filter, settings, coloring, selection, focusedNeuron, buffers, projectableMask, activityActiveMask, geometry, projectionMode]);

  useEffect(() => {
    const activityShaderMode =
      filter.colorMode === 'activity' && projectionMode === 'off';
    const mode = activityShaderMode ? 1 : 0;
    const lo = settings.activityLo;
    const hi = Math.max(lo + 0.001, settings.activityHi);
    const noSignalAlpha =
      (filter.anatomyAtlas === 'mapzebrain'
        ? filter.isolatedAtlasRegion
        : filter.isolatedRegion) >= 0
        ? 0.5
        : 0.22;
    for (const material of [opaqueMaterial, transparentMaterial]) {
      material.uniforms.activityMode.value = mode;
      material.uniforms.activityLo.value = lo;
      material.uniforms.activityHi.value = hi;
      material.uniforms.activityNoSignalAlpha.value = noSignalAlpha;
      material.uniforms.activityActiveBrightness.value = settings.activeBrightness;
      material.uniforms.activityOpaqueActiveCells.value = settings.opaqueActiveCells ? 1 : 0;
    }
  }, [
    filter.anatomyAtlas,
    filter.colorMode,
    filter.isolatedAtlasRegion,
    filter.isolatedRegion,
    opaqueMaterial,
    projectionMode,
    settings.activeBrightness,
    settings.activityHi,
    settings.activityLo,
    settings.opaqueActiveCells,
    transparentMaterial,
  ]);

  useEffect(() => {
    if (filter.colorMode !== 'activity' || projectionMode !== 'off') return;
    const sample = Math.max(0, Math.min(data.traceLength - 1, filter.activitySample | 0));
    const trace = data.activityTrace;
    const T = data.traceLength;
    for (let i = 0; i < data.count; i++) {
      activityValues[i] = trace[i * T + sample];
    }
    (geometry.attributes.instActivity as THREE.BufferAttribute).needsUpdate = true;
  }, [
    activityValues,
    data,
    filter.activitySample,
    filter.colorMode,
    geometry,
    projectionMode,
  ]);

  // Focused-neuron ring marker. Mirrors the t-SNE white outline: a
  // hollow circle that grows with the cell up close and floors at a
  // visible minimum when the cell shrinks at distance.
  const markerGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const markerPointsRef = useRef<THREE.Points>(null);

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
    const target = controls?.target ?? volumeCenter;
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
    // Mean / sum projection has no single per-pixel winner. It still
    // needs click focus, so those modes fall through to the geometric
    // picker below, restricted to cells that contribute to projection.
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
      const marker = markerPointsRef.current;
      const prevMarkerVisible = marker ? marker.visible : true;
      try {
        // Exclude the ghost/context underlay so its cells (which share the
        // geometry, hence the same scalar attributes) don't win ID pixels
        // over the projection cells the user actually sees.
        if (ctx) ctx.visible = false;
        if (marker) marker.visible = false;
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
        if (marker) marker.visible = prevMarkerVisible;
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
    const projectionFallbackPicking = projMode === 'mean' || projMode === 'sum';
    const projectionFloor = Math.max(0, Math.min(1, settings.projectionIntensityFloor));
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
      if (projectionFallbackPicking) {
        if (!Number.isFinite(buffers.scalarValues[i])) continue;
        if (buffers.intensities[i] < projectionFloor) continue;
      }
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
          <points
            ref={markerPointsRef}
            name={FOCUS_MARKER_NAME}
            geometry={markerGeometry}
            material={markerMaterial}
            renderOrder={2}
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
            ref={markerPointsRef}
            name={FOCUS_MARKER_NAME}
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
