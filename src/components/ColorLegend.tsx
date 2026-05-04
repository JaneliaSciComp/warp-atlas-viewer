import type { NeuronDataset, FilterState } from '../data/types';
import { regionColor, viridis, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
}

export function ColorLegend({ data, filter }: Props) {

  if (filter.colorMode === 'region') {
    return (
      <div className="absolute top-2 right-2 bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 max-h-72 overflow-y-auto">
        <div className="text-neutral-400 mb-1">Brain region</div>
        {data.regionNames.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rgbToHex(regionColor(i)) }}
            />
            <span>{r}</span>
          </div>
        ))}
      </div>
    );
  }
  if (filter.colorMode === 'gene') {
    const ramp = Array.from({ length: 8 }, (_, i) => viridis(i / 7));
    return (
      <div className="absolute top-2 right-2 bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200">
        <div className="text-neutral-400 mb-1">Gene: {data.geneNames[filter.selectedGene]}</div>
        <div className="flex">
          {ramp.map((c, i) => (
            <div key={i} className="w-4 h-3" style={{ background: rgbToHex(c) }} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-neutral-400 mt-0.5">
          <span>0</span>
          <span>max</span>
        </div>
      </div>
    );
  }
  if (filter.colorMode === 'cluster') {
    const picked = filter.selectedCluster >= 0;
    return (
      <div className="absolute top-2 right-2 bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200">
        <div className="text-neutral-400 mb-1">Cluster</div>
        {picked ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f226bf' }} />
            <span>{data.clusterNames[filter.selectedCluster]}</span>
          </div>
        ) : (
          <span className="text-neutral-500">— pick a cluster —</span>
        )}
      </div>
    );
  }
  // bivariate
  // Two stacked 1D ramps — one per gene+/gene- group — instead of a 2D
  // colormap. The gene axis is binary in the data, so a 2D map would
  // imply a continuous interior that no cell ever takes. CSS linear
  // gradients are exact here because each band is linear in r.
  const geneName = data.geneNames[filter.selectedGene];
  const stimName = data.stimulusNames[filter.selectedStimulus];
  // Endpoint colors come from the bivariate() function:
  //   gene-:  (0,0)=gray  → (0,1)=green
  //   gene+:  (1,0)=blue  → (1,1)=red
  const GENE_NEG = 'linear-gradient(to right, rgb(41,41,41), rgb(41,255,41))';
  const GENE_POS = 'linear-gradient(to right, rgb(41,41,255), rgb(255,41,41))';
  return (
    <div className="absolute top-2 right-2 bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200">
      <div className="text-neutral-400 mb-1.5">
        {geneName} × {stimName}
      </div>

      {/* Two horizontal bands: gene+ on top, gene- below. */}
      <div className="flex flex-col gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-300 w-10">gene+</span>
          <div
            className="h-4 w-32 border border-neutral-700"
            style={{ background: GENE_POS }}
            title="gene-positive cells: blue (uncorrelated) → red (highly stim-correlated)"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-300 w-10">gene−</span>
          <div
            className="h-4 w-32 border border-neutral-700"
            style={{ background: GENE_NEG }}
            title="gene-negative cells: gray (uncorrelated) → green (highly stim-correlated)"
          />
        </div>
        {/* Shared x axis: ticks + label */}
        <div className="flex justify-between text-[9px] text-neutral-400 ml-[2.875rem] w-32">
          <span>r ≤ 0.30</span>
          <span>r ≥ 0.65</span>
        </div>
        <div className="text-[9px] text-neutral-400 text-center ml-[2.875rem] w-32">
          stim correlation →
        </div>
      </div>

      {/* Punchline: which color = which biology */}
      <div className="border-t border-neutral-700 pt-1 mt-1 text-[9px] text-neutral-400 leading-tight">
        <span className="text-red-400 font-semibold">red</span> = co-coding (gene+ AND stim+)
      </div>
    </div>
  );
}
