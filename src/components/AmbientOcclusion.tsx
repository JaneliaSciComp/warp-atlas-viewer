import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { zoomSizeScale, flatSizeFactor } from '../utils/zoomSizing';

// AO is only active with the orbit target at the volume center; native pan
// (which can move it) is irrelevant here, so the center is a fine fallback.
const AO_TARGET = new THREE.Vector3(0, 0, 0);

const AO_ALPHA_MIN = 0.5;
const AO_SKIP_FLAG = 'skipAmbientOcclusion';
// 0.15 is the current "strong but still natural" point. The UI allows
// pushing beyond it for screenshots / stylized depth cues; map that
// extra range more gently so the lower slider values keep their feel.
const AO_STRENGTH_NATURAL_MAX = 0.15;
const AO_STRENGTH_HARD_MAX = 0.4;

/** Mark an object that should not contribute to the SAO depth/normal pass. */
export const skipAmbientOcclusionUserData = {
  [AO_SKIP_FLAG]: true,
} as const;

const pointCloudNormalVertexShader = /* glsl */ `
  attribute float instAlpha;
  attribute float instSize;

  uniform float pixelRatio;
  uniform float sizeScale;
  uniform float flatPointSize;
  uniform float flatSizeFactor;

  varying float vAlpha;

  void main() {
    // Reads the static instAlpha attribute, NOT the per-sample alpha the
    // main cell shader derives from instActivity during Activity playback.
    // While playback is deferred (see BrainViewer's activity fast path) the
    // static buffers aren't refreshed per sample, so this pre-pass's
    // participating-point set is pinned to the playback-start sample. AO is
    // off by default and the drift is subtle; if it matters, thread the
    // activityMode/instActivity uniforms through here too.
    vAlpha = instAlpha;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = -mvPosition.z;
    float depthFactor = 160.0 / max(dist, 40.0);
    float factor = mix(depthFactor, flatSizeFactor, flatPointSize);
    gl_PointSize = max(1.5, instSize * sizeScale * pixelRatio * factor);
  }
`;

const pointCloudNormalFragmentShader = /* glsl */ `
  precision highp float;

  uniform float alphaMin;

  varying float vAlpha;

  void main() {
    if (vAlpha < alphaMin) discard;

    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    // Use a slightly shrunken hard mask for the AO depth/normal pass so
    // the visible point sprites do not get dark SAO rims at every soft
    // alpha edge.
    if (r2 > 0.82) discard;

    // MeshNormalMaterial outputs normals packed as normal * 0.5 + 0.5.
    // A previous sphere-cap normal made each point's edge self-occlude,
    // which read as thick, wavy black outlines. Flat camera-facing normals
    // keep SAO focused on actual point-cloud depth/density differences.
    gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0);
  }
`;

function makePointCloudNormalMaterial(pixelRatio: number) {
  return new THREE.ShaderMaterial({
    name: 'PointCloudSAONormalMaterial',
    vertexShader: pointCloudNormalVertexShader,
    fragmentShader: pointCloudNormalFragmentShader,
    blending: THREE.NoBlending,
    depthTest: true,
    depthWrite: true,
    uniforms: {
      alphaMin: { value: AO_ALPHA_MIN },
      pixelRatio: { value: pixelRatio },
      sizeScale: { value: 1 },
      flatPointSize: { value: 0 },
      flatSizeFactor: { value: 0.4 },
    },
  });
}

function capSaoDarkening(material: THREE.ShaderMaterial, maxDarkening: number) {
  material.uniforms.maxDarkening = { value: maxDarkening };
  material.fragmentShader = material.fragmentShader
    .replace(
      'uniform float randomSeed;',
      'uniform float randomSeed;\n\t\tuniform float maxDarkening;',
    )
    .replace(
      'gl_FragColor.xyz *=  1.0 - ambientOcclusion;',
      [
        'float limitedAmbientOcclusion = clamp( ambientOcclusion, 0.0, maxDarkening );',
        '\t\t\tgl_FragColor.xyz *= 1.0 - limitedAmbientOcclusion;',
      ].join('\n\t\t\t'),
    );
  material.needsUpdate = true;
}

function applySaoStrength(saoPass: SAOPass, strength: number) {
  if (strength <= 0) {
    saoPass.params.saoIntensity = 0;
    saoPass.saoMaterial.uniforms.maxDarkening.value = 0;
    return;
  }
  const natural = THREE.MathUtils.clamp(strength / AO_STRENGTH_NATURAL_MAX, 0, 1);
  const extra = THREE.MathUtils.clamp(
    (strength - AO_STRENGTH_NATURAL_MAX) / (AO_STRENGTH_HARD_MAX - AO_STRENGTH_NATURAL_MAX),
    0,
    1,
  );

  // Decouple SAO sampling from display darkness. SAOPass can return huge
  // values at point-sprite depth discontinuities; letting those values
  // through creates black outlines. Instead, sample strongly enough to be
  // visible, then clamp the final multiplier to a bounded grey shadow.
  saoPass.params.saoIntensity = 0.35 + natural * 1.4 + extra * 1.5;
  saoPass.saoMaterial.uniforms.maxDarkening.value = 0.012 + natural * 0.22 + extra * 0.28;
}

class PointCloudSAOPass extends SAOPass {
  renderOverride(
    renderer: THREE.WebGLRenderer,
    overrideMaterial: THREE.Material,
    renderTarget: THREE.WebGLRenderTarget,
    clearColor?: THREE.ColorRepresentation,
    clearAlpha?: number,
  ) {
    const hidden: Array<{ object: THREE.Object3D; visible: boolean }> = [];

    this.scene.traverse((object) => {
      if (object.userData[AO_SKIP_FLAG] === true) {
        hidden.push({ object, visible: object.visible });
        object.visible = false;
      }
    });

    try {
      super.renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
    } finally {
      for (const { object, visible } of hidden) {
        object.visible = visible;
      }
    }
  }
}

export function AmbientOcclusion({
  intensity,
  radius,
  flatPointSize,
  defaultCamDistance,
}: {
  intensity: number;
  radius: number;
  /** Mirror of settings.flatPointSizes; threaded down so the SAO
   *  depth/normal pre-pass renders sprites at the same size as the
   *  visible cell pass. Otherwise occlusion samples land at the
   *  wrong scale and AO shows ghost-shaped halos. */
  flatPointSize: boolean;
  /** Camera-to-target distance at the default zoom. Feeds the same flat-mode
   *  zoom-size correction the visible cell pass applies, so the pre-pass keeps
   *  matching sprite sizes as the user zooms. */
  defaultCamDistance: number;
}) {
  const { gl, scene, camera, size } = useThree();

  const { composer, saoPass, pointNormalMaterial } = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const saoPass = new PointCloudSAOPass(scene, camera, new THREE.Vector2(1, 1));
    const pointNormalMaterial = makePointCloudNormalMaterial(gl.getPixelRatio());

    saoPass.normalMaterial.dispose();
    saoPass.normalMaterial = pointNormalMaterial as unknown as THREE.MeshNormalMaterial;
    capSaoDarkening(saoPass.saoMaterial, 0.025);
    saoPass.params.output = SAOPass.OUTPUT.Default;
    // Keep the effect subtle by default. The points shader emits display
    // colors directly, so do not add OutputPass here — its sRGB transfer
    // would brighten the whole custom-shader scene instead of just applying
    // occlusion.
    saoPass.params.saoBias = 0.45;
    saoPass.params.saoScale = 1.0;
    saoPass.params.saoMinResolution = 0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 2;
    saoPass.params.saoBlurStdDev = 1.5;
    saoPass.params.saoBlurDepthCutoff = 0.01;

    composer.addPass(renderPass);
    composer.addPass(saoPass);

    return { composer, saoPass, pointNormalMaterial };
  }, [camera, gl, scene]);

  useEffect(() => {
    applySaoStrength(saoPass, intensity);
  }, [intensity, saoPass]);

  useEffect(() => {
    saoPass.params.saoKernelRadius = radius;
  }, [radius, saoPass]);

  useEffect(() => {
    pointNormalMaterial.uniforms.flatPointSize.value = flatPointSize ? 1 : 0;
  }, [flatPointSize, pointNormalMaterial]);

  useEffect(() => {
    pointNormalMaterial.uniforms.flatSizeFactor.value = flatSizeFactor(defaultCamDistance);
  }, [defaultCamDistance, pointNormalMaterial]);

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio();
    composer.setPixelRatio(pixelRatio);
    composer.setSize(size.width, size.height);
    pointNormalMaterial.uniforms.pixelRatio.value = pixelRatio;
    // sizeScale is driven per-frame in the useFrame below (flat-mode zoom
    // correction). Canvas-area adaptation stays baked into basePointSize.
  }, [composer, gl, pointNormalMaterial, size.height, size.width]);

  useEffect(() => {
    return () => {
      composer.dispose();
      saoPass.dispose();
    };
  }, [composer, saoPass]);

  useFrame((_, delta) => {
    pointNormalMaterial.uniforms.pixelRatio.value = gl.getPixelRatio();
    pointNormalMaterial.uniforms.sizeScale.value = zoomSizeScale(
      camera,
      AO_TARGET,
      defaultCamDistance,
      flatPointSize,
    );
    saoPass.saoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
      camera.projectionMatrixInverse,
    );
    saoPass.saoMaterial.uniforms.cameraProjectionMatrix.value = camera.projectionMatrix;
    composer.render(delta);
  }, 1);

  return null;
}
