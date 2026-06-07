import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NeuronDataset } from '../../data/types';

/** Creates and updates the white focus-ring marker for the selected neuron. */
export function useFocusMarker({
  data,
  focusedNeuron,
  gl,
  initialPointSize,
  effectiveMarkerSize,
}: {
  data: NeuronDataset;
  focusedNeuron: number | null;
  gl: THREE.WebGLRenderer;
  initialPointSize: number;
  effectiveMarkerSize: number;
}) {
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
  const mountPointSize = useRef(initialPointSize).current;
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
        baseSize: { value: mountPointSize },
        sizeScale: { value: 1 },
        flatPointSize: { value: 0 },
        flatSizeFactor: { value: 0.4 },
      },
    });
  }, [gl, mountPointSize]);

  // Marker tracks the *effective* point size used by the cell shader so
  // the focus ring stays sized relative to the dots it surrounds.
  // basePointSize already reflects the canvas-area adaptation (auto mode);
  // we use the in-set-boosted effectivePointSize to match what active
  // cells get on screen.
  useEffect(() => {
    markerMaterial.uniforms.baseSize.value = effectiveMarkerSize;
  }, [markerMaterial, effectiveMarkerSize]);

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

  return { markerGeometry, markerMaterial, markerPointsRef };
}
