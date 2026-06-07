import type { FilterState, NeuronDataset, SettingsState } from '../../data/types';
import type { SharedColoring } from '../../hooks/useColoring';

/** Builds the hover tooltip text for a single neuron. */
export function buildTooltip(
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

/** Formats the active scalar value line shown inside a neuron tooltip. */
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
