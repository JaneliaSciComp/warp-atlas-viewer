import type { NeuronDataset, FilterState } from '../data/types';
import { regionColor, plasma, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  /** Right-edge offset in px, lets the parent push the legend left when
   *  the floating detail panel is open. */
  rightOffset?: number;
}

export function ColorLegend({ data, filter, rightOffset = 8 }: Props) {
  const positionStyle = { top: 8, right: rightOffset } as const;

  if (filter.colorMode === 'region') {
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 max-h-72 overflow-y-auto transition-[right] duration-200"
      >
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
    // Continuous plasma gradient over the absolute FISH spot count.
    // Tick marks (and their layout) follow the active scale: log-spaced
    // for log mode, evenly-spaced for linear.
    const N = 16;
    const stops = Array.from({ length: N }, (_, i) => rgbToHex(plasma(i / (N - 1))));
    const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
    const isLog = filter.geneScale !== 'linear';
    const ticks = isLog ? [0, 1, 10, 100, 1000] : [0, 250, 500, 750, 1000];
    const maxLog = Math.log(1 + 1000);
    const tickPos = (t: number) =>
      isLog ? (Math.log(1 + t) / maxLog) * 100 : (t / 1000) * 100;
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 transition-[right] duration-200"
      >
        <div className="text-neutral-400 mb-1">Gene: {data.geneNames[filter.selectedGene]}</div>
        <div className="relative w-32">
          <div className="h-3 border border-neutral-700" style={{ background: gradient }} />
          <div className="relative h-3 mt-0.5 text-[9px] text-neutral-400">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2"
                style={{ left: `${Math.min(100, Math.max(0, tickPos(t)))}%` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="text-[9px] text-neutral-500 mt-3">spot count ({isLog ? 'log' : 'linear'})</div>
      </div>
    );
  }
  if (filter.colorMode === 'cluster') {
    const picked = filter.selectedCluster >= 0;
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 transition-[right] duration-200"
      >
        <div className="text-neutral-400 mb-1">Cluster</div>
        {picked ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f0f921' }} />
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
    <div
      style={positionStyle}
      className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 transition-[right] duration-200"
    >
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
