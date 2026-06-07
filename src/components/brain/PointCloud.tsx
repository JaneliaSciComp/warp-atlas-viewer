import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../../data/types';
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
import { usePointCloudPicking, type PickState } from './usePointCloudPicking';
import { useFocusMarker } from './useFocusMarker';
import { usePointCloudGeometry } from './usePointCloudGeometry';
import { usePointCloudBufferUploads } from './usePointCloudBufferUploads';

export type { PickState };

registerProjectionShaderChunks();

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

  const {
    buffers,
    projectableMask,
    activityValues,
    activityActiveMask,
    geometry,
  } = usePointCloudGeometry(data);

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

  usePointCloudBufferUploads({
    data,
    filter,
    settings,
    coloring,
    selection,
    focusedNeuron,
    projectionMode,
    buffers,
    projectableMask,
    activityValues,
    activityActiveMask,
    geometry,
    opaqueMaterial,
    transparentMaterial,
  });

  const { markerGeometry, markerMaterial, markerPointsRef } = useFocusMarker({
    data,
    focusedNeuron,
    gl,
    initialPointSize: settings.pointSize,
    effectiveMarkerSize: coloring?.effectivePointSize ?? settings.pointSize,
  });

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


  usePointCloudPicking({
    data,
    filter,
    settings,
    coloring,
    selection,
    buffers,
    projectionMode,
    pickRef,
    onHoverChange,
    idMaterial,
    idRt,
    contextPointsRef,
    markerPointsRef,
    gl,
    scene,
    camera,
    size,
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
