import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProjectionMode } from '../../data/types';
import projectionCompositeVertSrc from '../../shaders/projection_composite.vert.glsl?raw';
import projectionCompositeFragSrc from '../../shaders/projection_composite.frag.glsl?raw';
import type { ScalarProjectionConfig } from './projectionModel';
import {
  FOCUS_MARKER_NAME,
  PROJECTION_CONTEXT_NAME,
  PROJECTION_POINTS_NAME,
} from './sceneObjectNames';

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
export function ProjectionRenderPass({
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
    const marker = scene.getObjectByName(FOCUS_MARKER_NAME);
    const prevTarget = gl.getRenderTarget();
    const prevBackground = scene.background;
    const prevClearColor = gl.getClearColor(new THREE.Color());
    const prevClearAlpha = gl.getClearAlpha();
    const prevAutoClear = gl.autoClear;
    const prevCtxVisible = ctx ? ctx.visible : true;
    const prevProjVisible = proj ? proj.visible : true;
    const prevMarkerVisible = marker ? marker.visible : true;
    try {
      // 1. Ghost-only context pass → back buffer. Keep the scene's opaque
      //    background and let autoClear paint it (and reset depth), then
      //    ghost/context points draw over it. Projection hidden so only the
      //    visual context lands here.
      gl.autoClear = true;
      if (ctx) ctx.visible = true;
      if (proj) proj.visible = false;
      if (marker) marker.visible = false;
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
        if (marker) marker.visible = false;
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
        if (marker) marker.visible = false;
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
      if (marker && prevMarkerVisible) {
        // 4. Focus marker overlay. Keep it out of the projection reduction
        // targets above, then draw it last over the final projected image.
        if (ctx) ctx.visible = false;
        if (proj) proj.visible = false;
        marker.visible = true;
        scene.background = null;
        gl.setRenderTarget(null);
        gl.autoClear = false;
        gl.render(scene, camera);
      }
    } finally {
      scene.background = prevBackground;
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(prevClearColor, prevClearAlpha);
      gl.autoClear = prevAutoClear;
      if (ctx) ctx.visible = prevCtxVisible;
      if (proj) proj.visible = prevProjVisible;
      if (marker) marker.visible = prevMarkerVisible;
    }
  }, 1);

  return null;
}
