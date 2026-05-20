import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const AO_ALPHA_MIN = 0.5;
const AO_SKIP_FLAG = 'skipAmbientOcclusion';

/** Mark an object that should not contribute to the SAO depth/normal pass. */
export const skipAmbientOcclusionUserData = {
  [AO_SKIP_FLAG]: true,
} as const;

const pointCloudNormalVertexShader = /* glsl */ `
  attribute float instAlpha;
  attribute float instSize;

  uniform float pixelRatio;

  varying float vAlpha;

  void main() {
    vAlpha = instAlpha;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = -mvPosition.z;
    float size = instSize * pixelRatio * (160.0 / max(dist, 40.0));
    gl_PointSize = max(1.5, size);
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
    if (r2 > 1.0) discard;

    // MeshNormalMaterial outputs normals packed as normal * 0.5 + 0.5.
    // Treat each point sprite as a small screen-facing sphere cap so SAO
    // has useful normals instead of the 1px/mesh default for THREE.Points.
    vec3 normal = normalize(vec3(p, sqrt(max(0.0, 1.0 - r2))));
    gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
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
    },
  });
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

export function AmbientOcclusion({ intensity }: { intensity: number }) {
  const { gl, scene, camera, size } = useThree();

  const { composer, outputPass, saoPass, pointNormalMaterial } = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const saoPass = new PointCloudSAOPass(scene, camera, new THREE.Vector2(1, 1));
    const outputPass = new OutputPass();
    const pointNormalMaterial = makePointCloudNormalMaterial(gl.getPixelRatio());

    saoPass.normalMaterial.dispose();
    saoPass.normalMaterial = pointNormalMaterial as unknown as THREE.MeshNormalMaterial;
    saoPass.params.output = SAOPass.OUTPUT.Default;
    saoPass.params.saoBias = 0.35;
    saoPass.params.saoScale = 1.35;
    saoPass.params.saoKernelRadius = 42;
    saoPass.params.saoMinResolution = 0.001;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 4;
    saoPass.params.saoBlurStdDev = 2.5;
    saoPass.params.saoBlurDepthCutoff = 0.02;

    composer.addPass(renderPass);
    composer.addPass(saoPass);
    composer.addPass(outputPass);

    return { composer, outputPass, saoPass, pointNormalMaterial };
  }, [camera, gl, scene]);

  useEffect(() => {
    saoPass.params.saoIntensity = intensity;
  }, [intensity, saoPass]);

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio();
    composer.setPixelRatio(pixelRatio);
    composer.setSize(size.width, size.height);
    pointNormalMaterial.uniforms.pixelRatio.value = pixelRatio;
  }, [composer, gl, pointNormalMaterial, size.height, size.width]);

  useEffect(() => {
    return () => {
      composer.dispose();
      outputPass.dispose();
      saoPass.dispose();
    };
  }, [composer, outputPass, saoPass]);

  useFrame((_, delta) => {
    pointNormalMaterial.uniforms.pixelRatio.value = gl.getPixelRatio();
    saoPass.saoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
      camera.projectionMatrixInverse,
    );
    saoPass.saoMaterial.uniforms.cameraProjectionMatrix.value = camera.projectionMatrix;
    composer.render(delta);
  }, 1);

  return null;
}
