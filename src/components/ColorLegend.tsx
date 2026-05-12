import type { ReactNode, CSSProperties } from 'react';
import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  /** Sorted unique fish ids in the dataset; lifted to a shared memo in
   *  App so the header, anatomy dropdown, and this legend agree. */
  uniqueFishIds: Uint8Array;
}

// The plasma gradient strip is identical across the gene / activity /
// stim legends; build the CSS string once at module load.
const PLASMA_STOP_COUNT = 16;
const PLASMA_GRADIENT = `linear-gradient(to right, ${Array.from(
  { length: PLASMA_STOP_COUNT },
  (_, i) => rgbToHex(plasma(i / (PLASMA_STOP_COUNT - 1))),
).join(', ')})`;

interface GradientLegendProps {
  title: ReactNode;
  axisLabel: string;
  ticks: number[];
  /** Position of a tick along the bar in 0..100 percent. */
  tickPos: (t: number) => number;
  /** Formatter for tick labels (default: `String`). Gene legend uses
   *  integers, activity uses one decimal, stim uses two. */
  formatTick?: (t: number) => string;
  positionStyle: CSSProperties;
}

/** Shared gradient-bar legend used by the gene, activity, and stim
 *  color modes. The three branches differ only in title, ticks, tick
 *  format, and axis label — extracted here so each mode's branch in
 *  ColorLegend stays focused on computing those four things. */
function GradientLegend({
  title,
  axisLabel,
  ticks,
  tickPos,
  formatTick = String,
  positionStyle,
}: GradientLegendProps) {
  return (
    <div
      style={positionStyle}
      className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
    >
      <div className="text-neutral-400 mb-1 whitespace-nowrap">{title}</div>
      <div className="relative w-32">
        <div className="h-3 border border-neutral-700" style={{ background: PLASMA_GRADIENT }} />
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
                {formatTick(t)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="text-[9px] text-neutral-500 mt-3">{axisLabel}</div>
    </div>
  );
}

export function ColorLegend({ data, filter, settings, uniqueFishIds }: Props) {
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
  if (filter.colorMode === 'fish') {
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
      >
        <div className="text-neutral-400 mb-1">Specimen</div>
        {Array.from(uniqueFishIds, (id) => (
          <div key={id} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: rgbToHex(fishColor(id)) }}
            />
            <span>fish {id + 1}</span>
          </div>
        ))}
      </div>
    );
  }
  if (filter.colorMode === 'gene') {
    // Sub-modes (mirrors the painting branches in coloring.ts):
    //   0 genes (or subtype mode) → richness over the full 41-gene panel
    //   1 gene → plasma over its raw FISH spot count
    //   2+ genes → driven by settings.geneMultiColor (max/sum/richness)
    const sel = filter.selectedGenes;
    const useRichness =
      filter.txMode === 'subtype' || (filter.txMode === 'gene' && sel.length === 0);
    const multiGenes = filter.txMode === 'gene' && sel.length >= 2;
    const multiMode = settings.geneMultiColor;
    // "Richness within selection" reuses the richness branch but
    // anchored at the selected-gene count instead of G.
    const useSelRichness = multiGenes && multiMode === 'richness';
    const isLog = filter.geneScale !== 'linear';
    const G = data.geneNames.length;
    const maxSpots = Math.max(1, settings.geneMaxSpots);
    const richnessTickCeiling = useSelRichness ? sel.length : G;
    const maxVal = useRichness || useSelRichness ? richnessTickCeiling : maxSpots;
    // Pick reasonable ticks for either mode. For richness G is small
    // (~41) so we snap at fractions of G; for spot count we use
    // powers of 10 in log mode (clipped at the configured ceiling)
    // and quartiles in linear.
    //
    // Keep at most 4 ticks total so labels never overlap on the
    // narrow legend bar. Build the full set (0, every power of 10
    // ≤ ceiling, ceiling), then trim any intermediate tick whose
    // label rectangle would collide with the ceiling's. The required
    // gap is computed from actual label widths because label width
    // scales with the digit count — a 4-digit ceiling like "2600"
    // takes nearly twice the horizontal space of a 3-digit "1000".
    //
    // After that, if still > 4 ticks total, keep 0, the ceiling, and
    // the two largest intermediate powers of 10.
    const maxLogLocal = Math.log(1 + maxSpots);
    const logPos = (t: number) => (Math.log(1 + t) / maxLogLocal) * 100;
    // Empirical label width: w-32 bar = 128 px, text-[9px] monospace
    // ≈ 5.7 px per glyph → ~4.5% of bar per character. Used to size
    // the minimum log-space gap between adjacent label centers.
    const labelWidthPct = (n: number) => String(n).length * 4.5;
    let logSpotTicks: number[] = [0];
    for (let p = 1; p < maxSpots; p *= 10) logSpotTicks.push(p);
    logSpotTicks.push(maxSpots);
    while (logSpotTicks.length > 2) {
      const ceil = logSpotTicks[logSpotTicks.length - 1];
      const prev = logSpotTicks[logSpotTicks.length - 2];
      // Ceiling label is right-anchored (its FULL width sits left of
      // its position); the prev label is center-anchored (only HALF
      // its width is on the side facing the ceiling). Anything less
      // than the sum of those two extents overlaps.
      const minGap = labelWidthPct(ceil) + labelWidthPct(prev) / 2;
      if (logPos(ceil) - logPos(prev) >= minGap) break;
      logSpotTicks.splice(logSpotTicks.length - 2, 1);
    }
    if (logSpotTicks.length > 4) {
      const interior = logSpotTicks.slice(1, -1);
      logSpotTicks = [0, ...interior.slice(-2), maxSpots];
    }
    // Cap every tick row at 4 so labels never collide on the narrow
    // bar. For the 5-tick patterns we drop the second-to-last entry
    // (the one that crowds the ceiling label).
    // For selection-richness, the ceiling is small (typically 2..10).
    // Show every integer when the bar isn't crowded, fall back to
    // quartile-style only when N > 6 so labels never collide.
    const selN = sel.length;
    const richnessLogTicks = useSelRichness
      ? selN <= 6
        ? Array.from({ length: selN + 1 }, (_, k) => k)
        : [0, 1, Math.round(selN / 2), selN]
      : [0, 1, Math.round(G / 4), G];
    const richnessLinearTicks = useSelRichness
      ? selN <= 6
        ? Array.from({ length: selN + 1 }, (_, k) => k)
        : [0, Math.round(selN / 4), Math.round(selN / 2), selN]
      : [0, Math.round(G / 4), Math.round(G / 2), G];
    const linearSpotTicks = [0, Math.round(maxSpots / 4), Math.round(maxSpots / 2), maxSpots];
    const useRichnessTicks = useRichness || useSelRichness;
    const ticks = useRichnessTicks
      ? isLog
        ? richnessLogTicks
        : richnessLinearTicks
      : isLog
        ? logSpotTicks
        : linearSpotTicks;
    const maxLog = Math.log(1 + maxVal);
    const tickPos = (t: number) =>
      isLog ? (Math.log(1 + t) / maxLog) * 100 : (t / maxVal) * 100;
    const title = useRichness
      ? 'Gene richness'
      : sel.length === 1
        ? `Gene: ${data.geneNames[sel[0]]}`
        : multiMode === 'max'
          ? `Genes: max across ${sel.length}`
          : multiMode === 'sum'
            ? `Genes: sum across ${sel.length}`
            : `Genes: # of ${sel.length} expressed`;
    const axisLabel = useRichness
      ? '# genes expressed'
      : useSelRichness
        ? '# selected genes expressed'
        : 'mRNA spot count';
    return (
      <GradientLegend
        title={title}
        axisLabel={axisLabel}
        ticks={ticks}
        tickPos={tickPos}
        positionStyle={positionStyle}
      />
    );
  }
  if (filter.colorMode === 'highlight') {
    return null;
  }
  if (filter.colorMode === 'activity') {
    // Plasma gradient over the ΔF/F anchors from settings (must match
    // utils/coloring.ts). Time readout reflects the current scrub
    // sample so the user knows what moment the brain is colored for
    // without looking back at the slider.
    const ACTIVITY_LO = settings.activityLo;
    const ACTIVITY_HI = settings.activityHi;
    const maxSample = Math.max(0, data.traceLength - 1);
    const sample = Math.max(0, Math.min(maxSample, filter.activitySample | 0));
    const seconds = sample / Math.max(0.0001, data.traceSampleRateHz);
    const ticks = [ACTIVITY_LO, (ACTIVITY_LO + ACTIVITY_HI) / 2, ACTIVITY_HI];
    const tickPos = (t: number) =>
      ((t - ACTIVITY_LO) / (ACTIVITY_HI - ACTIVITY_LO)) * 100;
    return (
      <GradientLegend
        title={`Activity · t = ${Math.round(seconds)} s`}
        axisLabel="mean ΔF/F"
        ticks={ticks}
        tickPos={tickPos}
        formatTick={(t) => t.toFixed(1)}
        positionStyle={positionStyle}
      />
    );
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
  // Use the user-configured stim cutoffs as the bar's anchor points.
  // The mid tick is the simple average; if stimHi <= stimLo the divisor
  // collapses, so guard against it.
  const stimLo = settings.stimLo;
  const stimHi = settings.stimHi;
  const stimRange = Math.max(0.001, stimHi - stimLo);
  const stimMid = (stimLo + stimHi) / 2;
  const ticks = [stimLo, stimMid, stimHi];
  const tickPos = (t: number) => ((t - stimLo) / stimRange) * 100;
  return (
    <GradientLegend
      title={stimTitle}
      axisLabel="stim correlation r"
      ticks={ticks}
      tickPos={tickPos}
      formatTick={(t) => t.toFixed(2)}
      positionStyle={positionStyle}
    />
  );
}
