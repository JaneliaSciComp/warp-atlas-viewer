import type { NeuronDataset, FilterState } from '../data/types';
import { regionColor, plasma, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
}

export function ColorLegend({ data, filter }: Props) {
  const positionStyle = { top: 8, right: 8 } as const;

  if (filter.colorMode === 'region') {
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 max-h-72 overflow-y-auto"
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
    // Two sub-modes: richness (number of panel genes expressed per cell)
    // when no specific gene is in focus, otherwise the classic plasma
    // gradient over absolute FISH spot count for the selected gene.
    const useRichness =
      filter.txMode === 'subtype' || (filter.txMode === 'gene' && filter.geneAll);
    const N = 16;
    const stops = Array.from({ length: N }, (_, i) => rgbToHex(plasma(i / (N - 1))));
    const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
    const isLog = filter.geneScale !== 'linear';
    const G = data.geneNames.length;
    const maxVal = useRichness ? G : 1000;
    // Pick reasonable ticks for either mode. For richness G is small
    // (e.g. 41) so we just snap at fractions of G; for spot-count we
    // keep the existing canonical anchors.
    const ticks = useRichness
      ? isLog
        ? [0, 1, Math.round(G / 4), Math.round(G / 2), G]
        : [0, Math.round(G / 4), Math.round(G / 2), Math.round((3 * G) / 4), G]
      : isLog
        ? [0, 1, 10, 100, 1000]
        : [0, 250, 500, 750, 1000];
    const maxLog = Math.log(1 + maxVal);
    const tickPos = (t: number) =>
      isLog ? (Math.log(1 + t) / maxLog) * 100 : (t / maxVal) * 100;
    const title = useRichness
      ? 'Gene richness'
      : `Gene: ${data.geneNames[filter.selectedGene]}`;
    const axisLabel = useRichness
      ? `# genes expressed (${isLog ? 'log' : 'linear'})`
      : `spot count (${isLog ? 'log' : 'linear'})`;
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
      >
        <div className="text-neutral-400 mb-1">{title}</div>
        <div className="relative w-32">
          <div className="h-3 border border-neutral-700" style={{ background: gradient }} />
          <div className="relative h-3 mt-0.5 text-[9px] text-neutral-400">
            {ticks.map((t, idx) => {
              // Anchor the first/last tick label to the bar edge instead
              // of centering it, so e.g. "1000" doesn't overflow past
              // the gradient's right edge into the legend's border.
              const transform =
                idx === 0
                  ? 'translateX(0)'
                  : idx === ticks.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)';
              return (
                <span
                  key={t}
                  className="absolute"
                  style={{
                    left: `${Math.min(100, Math.max(0, tickPos(t)))}%`,
                    transform,
                  }}
                >
                  {t}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-[9px] text-neutral-500 mt-3">{axisLabel}</div>
      </div>
    );
  }
  if (filter.colorMode === 'highlight') {
    return null;
  }
  // stim correlation — 1D plasma from STIM_LO to STIM_HI, mirroring the
  // gene scheme's structure. Co-coding falls out by composing this with
  // a single-gene filter. The scheme follows the Activity panel's
  // selection: empty/full → max across every stimulus; one toggle →
  // that stim's correlation; a 2..S-1 subset → max across the subset.
  const sel = filter.selectedStimuli;
  const S = data.stimulusNames.length;
  const stimTitle =
    sel.length === 1
      ? `Stim: ${data.stimulusNames[sel[0]]}`
      : sel.length === 0 || sel.length === S
        ? 'Stim: max across all'
        : `Stim: max across ${sel.length}`;
  const N = 16;
  const stops = Array.from({ length: N }, (_, i) => rgbToHex(plasma(i / (N - 1))));
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
  const ticks = [0.30, 0.50, 0.65];
  const tickPos = (t: number) => ((t - 0.30) / (0.65 - 0.30)) * 100;
  return (
    <div
      style={positionStyle}
      className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
    >
      <div className="text-neutral-400 mb-1">{stimTitle}</div>
      <div className="relative w-32">
        <div className="h-3 border border-neutral-700" style={{ background: gradient }} />
        <div className="relative h-3 mt-0.5 text-[9px] text-neutral-400">
          {ticks.map((t, idx) => {
            const transform =
              idx === 0
                ? 'translateX(0)'
                : idx === ticks.length - 1
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)';
            return (
              <span
                key={t}
                className="absolute"
                style={{
                  left: `${Math.min(100, Math.max(0, tickPos(t)))}%`,
                  transform,
                }}
              >
                {t.toFixed(2)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="text-[9px] text-neutral-500 mt-3">stim correlation r</div>
    </div>
  );
}
