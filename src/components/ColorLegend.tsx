import type { ReactNode, CSSProperties } from 'react';
import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma, coolwarm, rgbToHex } from '../utils/colorMaps';
import { REGION_PAPER_ORDER } from '../utils/constants';

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

// Coolwarm divergent ramp used by the swim + stim color schemes.
// Two flavours: COOLWARM_GRADIENT_FADED scales alpha by |t| to mirror
// the in-app rendering when fadeWeakCorrelation is on (neutral cells
// fade so the bright midpoint doesn't bloom); COOLWARM_GRADIENT_OPAQUE
// is the unmodulated gradient for when the setting is off.
const COOLWARM_STOP_COUNT = 21;
const FADE_FLOOR = 0.12;
const COOLWARM_GRADIENT_FADED = `linear-gradient(to right, ${Array.from(
  { length: COOLWARM_STOP_COUNT },
  (_, i) => {
    const t = -1 + (2 * i) / (COOLWARM_STOP_COUNT - 1);
    const [r, g, b] = coolwarm(t);
    const a = FADE_FLOOR + (1 - FADE_FLOOR) * Math.abs(t);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`;
  },
).join(', ')})`;
const COOLWARM_GRADIENT_OPAQUE = `linear-gradient(to right, ${Array.from(
  { length: COOLWARM_STOP_COUNT },
  (_, i) => rgbToHex(coolwarm(-1 + (2 * i) / (COOLWARM_STOP_COUNT - 1))),
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
    // Paper-canonical order (Pal → … → InfMO → Unassigned) so the legend
    // matches the manuscript's figure captions. Fall back to data-index
    // order for datasets whose region count doesn't match the WARP
    // 17-entry layout.
    const matchesPaperLayout =
      data.regionNames.length === REGION_PAPER_ORDER.length;
    const order = matchesPaperLayout
      ? REGION_PAPER_ORDER
      : data.regionNames.map((_, i) => i);
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200 whitespace-nowrap"
      >
        <div className="text-neutral-400 mb-1">Brain region</div>
        {order.map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 shrink-0 rounded-sm border border-neutral-600"
              style={{ background: rgbToHex(regionColor(i)) }}
            />
            <span>{data.regionNames[i]}</span>
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
    //   txMode != 'gene' OR 0 genes → richness over the full 41-gene panel
    //   1 gene → plasma over its raw FISH spot count
    //   2+ genes → driven by settings.geneMultiColor (max/sum/richness)
    const sel = filter.selectedGenes;
    const useRichness =
      filter.txMode !== 'gene' || sel.length === 0;
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
  if (filter.colorMode === 'swim') {
    // Divergent ramp from −swimHi to +swimHi, with the user-configured
    // floor (swimLo) marking the inner dead-band where cells map to
    // the neutral midpoint. Symmetric so positive and negative
    // populations read by sign-of-color rather than magnitude alone.
    const lo = settings.swimLo;
    const hi = settings.swimHi;
    const range = Math.max(0.001, 2 * hi); // -hi → +hi
    const ticks = [-hi, -lo, 0, lo, hi];
    const tickPos = (t: number) => ((t + hi) / range) * 100;
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
      >
        <div className="text-neutral-400 mb-1 whitespace-nowrap">Swim correlation</div>
        <div className="relative w-32">
          <div
            className="h-3 border border-neutral-700"
            style={{
              background: settings.fadeWeakCorrelation
                ? COOLWARM_GRADIENT_FADED
                : COOLWARM_GRADIENT_OPAQUE,
            }}
          />
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
                  {t === 0 ? '0' : t.toFixed(2)}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-[9px] text-neutral-500 mt-3">Pearson r vs swim power</div>
      </div>
    );
  }
  // stim correlation — divergent coolwarm ramp from -stimHi to +stimHi.
  // Sign reads as colour (blue → red), magnitude as intensity. Mirrors
  // the swim legend so the two signed-correlation maps share visual
  // vocabulary. Selection rules: empty/full → max-abs across every
  // stimulus; one toggle → that stim's signed correlation; 2..S-1 →
  // max-abs across the subset.
  const sel = filter.selectedStimuli;
  const S = data.stimulusNames.length;
  const stimTitle =
    sel.length === 1
      ? `Stim: ${data.stimulusNames[sel[0]]}`
      : sel.length === 0 || sel.length === S
        ? 'Stim: max |r| across all'
        : `Stim: max |r| across ${sel.length}`;
  const lo = settings.stimLo;
  const hi = settings.stimHi;
  const range = Math.max(0.001, 2 * hi); // -hi → +hi
  const ticks = [-hi, -lo, 0, lo, hi];
  const tickPos = (t: number) => ((t + hi) / range) * 100;
  return (
    <div
      style={positionStyle}
      className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
    >
      <div className="text-neutral-400 mb-1 whitespace-nowrap">{stimTitle}</div>
      <div className="relative w-32">
        <div
          className="h-3 border border-neutral-700"
          style={{
            background: settings.fadeWeakCorrelation
              ? COOLWARM_GRADIENT_FADED
              : COOLWARM_GRADIENT_OPAQUE,
          }}
        />
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
                {t === 0 ? '0' : t.toFixed(2)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="text-[9px] text-neutral-500 mt-3">Pearson r vs stimulus regressor</div>
    </div>
  );
}
