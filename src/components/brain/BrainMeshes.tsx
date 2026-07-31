import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SettingsState } from '../../data/types';
import {
  BRAIN_MESH_CONTROLS,
  loadBrainMesh,
  loadMeshManifest,
  type BrainMeshKey,
  type MeshManifest,
} from '../../data/meshLoader';
import { skipAmbientOcclusionUserData } from '../AmbientOcclusion';
import { BRAIN_MESH_GROUP_NAME } from './sceneObjectNames';
import { VOLUME_GROUP_ROTATION, VOLUME_GROUP_SCALE } from './volumeTransform';

/** mapZebrain's whole-brain reference meshes (outline / fibers / cell bodies)
 *  as translucent anatomical context.
 *
 *  Blobs are in preprocessed coordinates, so this renders inside a group
 *  carrying the same rotation and scale as the point cloud — see
 *  volumeTransform.ts. Each mesh is fetched the first time its toggle goes
 *  true and cached in meshLoader thereafter, so nothing is downloaded for a
 *  user who never turns one on.
 */
export function BrainMeshes({ settings }: { settings: SettingsState }) {
  const invalidate = useThree((s) => s.invalidate);
  const [manifest, setManifest] = useState<MeshManifest | null>(null);
  const [geometries, setGeometries] = useState<
    Partial<Record<BrainMeshKey, THREE.BufferGeometry>>
  >({});

  const anyEnabled = BRAIN_MESH_CONTROLS.some((c) => settings[c.enabledKey]);

  useEffect(() => {
    if (!anyEnabled || manifest) return;
    let live = true;
    loadMeshManifest().then((m) => {
      if (live && m) setManifest(m);
    });
    return () => {
      live = false;
    };
  }, [anyEnabled, manifest]);

  // One effect per mesh key would be cleaner in isolation but the enabled
  // flags live on one settings object, so a single effect keyed on all three
  // is both simpler and enough: loadBrainMesh caches, so re-entry is cheap.
  useEffect(() => {
    let live = true;
    for (const control of BRAIN_MESH_CONTROLS) {
      if (!settings[control.enabledKey]) continue;
      if (geometries[control.key]) continue;
      loadBrainMesh(control.key)
        .then((positions) => {
          if (!live) return;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          // Non-indexed geometry, so this yields flat facet normals — the
          // same shading mapZebrain's own STL meshes produce.
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          setGeometries((prev) => {
            if (prev[control.key]) return prev;
            const next = { ...prev };
            next[control.key] = geometry;
            return next;
          });
          invalidate();
        })
        .catch((err) => {
          console.warn(`[BrainMeshes] ${control.key} unavailable:`, err);
        });
    }
    return () => {
      live = false;
    };
  }, [settings, geometries, invalidate]);

  // Dispose once on unmount. This reads through a ref rather than closing over
  // `geometries`: a mount-scoped cleanup would capture the initial empty object
  // and free nothing.
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  useEffect(
    () => () => {
      for (const geometry of Object.values(geometriesRef.current)) geometry?.dispose();
    },
    [],
  );

  if (!anyEnabled) return null;

  return (
    <>
      {/* The point cloud uses raw ShaderMaterials and is unaffected by lights,
          so before this there were none in the scene at all and a lit material
          would have rendered black. Fixed world direction rather than a
          headlight, so orbiting gives a shape cue. */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[0.4, 0.3, 1]} intensity={0.75} />
      <group
        name={BRAIN_MESH_GROUP_NAME}
        rotation={VOLUME_GROUP_ROTATION}
        scale={VOLUME_GROUP_SCALE}
      >
        {BRAIN_MESH_CONTROLS.map((control) => {
          const geometry = geometries[control.key];
          if (!geometry || !settings[control.enabledKey]) return null;
          return (
            <mesh
              key={control.key}
              geometry={geometry}
              // Above every point pass (-1 context, 0 opaque/projection,
              // 1 transparent, 2 focus marker) so the shell tints over the
              // cells, which is how mapZebrain reads.
              renderOrder={3}
              userData={skipAmbientOcclusionUserData}
            >
              <meshPhongMaterial
                color={manifest?.meshes[control.key].color ?? '#dddcdf'}
                transparent
                opacity={settings[control.opacityKey]}
                // The volume group is a mirror, so winding is inverted; and
                // the shell is seen from the inside as the camera orbits.
                side={THREE.DoubleSide}
                // Tint over the cells without hiding the ones behind it.
                depthWrite={false}
              />
            </mesh>
          );
        })}
      </group>
    </>
  );
}
