import * as THREE from 'three';
import type { ColorMode, FilterState, NeuronDataset, ProjectionMode, SettingsState } from '../../data/types';
import { coolwarm, plasma } from '../../utils/colorMaps';

export type ProjectionColorMapKind = 'plasma' | 'coolwarm';

export interface ScalarProjectionConfig {
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

export function supportsScalarProjection(colorMode: ColorMode): boolean {
  return colorMode === 'gene' || colorMode === 'activity' || colorMode === 'stim' || colorMode === 'swim';
}

export function effectiveProjectionMode(
  colorMode: ColorMode,
  mode: SettingsState['projectionMode'],
): SettingsState['projectionMode'] {
  return supportsScalarProjection(colorMode) ? mode : 'off';
}

// Display labels for the in-viewer status pill / mode menu. The raw
// enum value 'maxabs' reads poorly; everything else is its own label.
export const PROJECTION_MODE_LABELS: Record<ProjectionMode, string> = {
  off: 'off',
  min: 'min',
  max: 'max',
  maxabs: 'min/max',
  mean: 'mean',
  sum: 'sum',
};

// Order the pill menu winner-take-all first (min/max/min-max), then the
// accumulation modes (mean/sum), with off on top.
export const PROJECTION_MODE_ORDER: ProjectionMode[] = ['off', 'min', 'max', 'maxabs', 'mean', 'sum'];

export function scalarProjectionConfig(
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

export function createProjectionColorMapTexture(kind: ProjectionColorMapKind): THREE.DataTexture {
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
