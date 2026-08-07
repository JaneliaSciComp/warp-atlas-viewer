import type { ReactNode, CSSProperties } from 'react';
import { useMemo } from 'react';
import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma, coolwarm, rgbToHex } from '../utils/colorMaps';
import { REGION_PAPER_ORDER } from '../utils/constants';
import { STIM_LABELS } from '../utils/stimAssets';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  /** Sorted unique fish ids in the dataset; lifted to a shared memo in
   *  App so the header, anatomy dropdown, and this legend agree. */
  uniqueFishIds: Uint8Array;
}

// Additive RGB lift, mirroring the per-cell `activeBrightness` math in
// coloring.ts so the legend swatches stay visually in sync with the
// rendered scatter.
function liftRgb(rgb: readonly [number, number, number], b: number): [number, number, number] {
  return [Math.min(1, rgb[0] + b), Math.min(1, rgb[1] + b), Math.min(1, rgb[2] + b)];
}

const PLASMA_STOP_COUNT = 16;
const COOLWARM_STOP_COUNT = 21;
const FADE_FLOOR = 0.12;

function plasmaGradient(brightness: number): string {
  return `linear-gradient(to right, ${Array.from(
    { length: PLASMA_STOP_COUNT },
    (_, i) => rgbToHex(liftRgb(plasma(i / (PLASMA_STOP_COUNT - 1)), brightness)),
  ).join(', ')})`;
}

function coolwarmGradientFaded(brightness: number): string {
  return `linear-gradient(to right, ${Array.from(
    { length: COOLWARM_STOP_COUNT },
    (_, i) => {
      const t = -1 + (2 * i) / (COOLWARM_STOP_COUNT - 1);
      const [r, g, b] = liftRgb(coolwarm(t), brightness);
      const a = FADE_FLOOR + (1 - FADE_FLOOR) * Math.abs(t);
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`;
    },
  ).join(', ')})`;
}

function coolwarmGradientOpaque(brightness: number): string {
  return `linear-gradient(to right, ${Array.from(
    { length: COOLWARM_STOP_COUNT },
    (_, i) => rgbToHex(liftRgb(coolwarm(-1 + (2 * i) / (COOLWARM_STOP_COUNT - 1)), brightness)),
  ).join(', ')})`;
}

interface GradientLegendProps {
  title: ReactNode;
  axisLabel: string;
  ticks: GradientTickSpec[];
  gradient: string;
  /** Position of a tick along the bar in 0..100 percent. */
  tickPos: (t: number) => number;
  /** Formatter for tick labels (default: `String`). Gene legend uses
   *  integers, activity uses one decimal, stim uses two. */
  formatTick?: (t: number) => string;
  positionStyle: CSSProperties;
}

interface GradientTick {
  value: number;
  /** Higher priority ticks claim label space first. */
  priority?: number;
}

type GradientTickSpec = number | GradientTick;

interface VisibleTick {
  value: number;
  label: string;
  leftPct: number;
  transform: string;
  bounds: { left: number; right: number };
}

const LEGEND_BAR_WIDTH_PX = 128; // Tailwind w-32.
const TICK_LABEL_GAP_PX = 1;
const TICK_MONO_CHAR_WIDTH_PX = 5.4; // text-[9px] monospace, conservative.

function normalizeTick(tick: GradientTickSpec, idx: number, len: number) {
  const value = typeof tick === 'number' ? tick : tick.value;
  const isEndpoint = idx === 0 || idx === len - 1;
  return {
    value: Object.is(value, -0) ? 0 : value,
    idx,
    priority: typeof tick === 'number'
      ? isEndpoint
        ? 100
        : 0
      : tick.priority ?? (isEndpoint ? 100 : 0),
  };
}

function labelBounds(leftPct: number, label: string): VisibleTick['bounds'] & { transform: string } {
  const x = (leftPct / 100) * LEGEND_BAR_WIDTH_PX;
  const width = label.length * TICK_MONO_CHAR_WIDTH_PX;

  if (x - width / 2 < 0) {
    return { left: x, right: x + width, transform: 'translateX(0)' };
  }
  if (x + width / 2 > LEGEND_BAR_WIDTH_PX) {
    return { left: x - width, right: x, transform: 'translateX(-100%)' };
  }
  return { left: x - width / 2, right: x + width / 2, transform: 'translateX(-50%)' };
}

function overlaps(a: VisibleTick['bounds'], b: VisibleTick['bounds']) {
  return a.left < b.right + TICK_LABEL_GAP_PX && b.left < a.right + TICK_LABEL_GAP_PX;
}

function clampPct(pct: number) {
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

export function chooseVisibleTicks(
  ticks: GradientTickSpec[],
  tickPos: (t: number) => number,
  formatTick: (t: number) => string,
): VisibleTick[] {
  const byValue = new Map<number, ReturnType<typeof normalizeTick>>();
  ticks.forEach((tick, idx) => {
    const candidate = normalizeTick(tick, idx, ticks.length);
    const previous = byValue.get(candidate.value);
    if (!previous || candidate.priority > previous.priority) {
      byValue.set(candidate.value, candidate);
    }
  });

  const candidates = Array.from(byValue.values()).sort(
    (a, b) => b.priority - a.priority || a.idx - b.idx,
  );
  const visible: VisibleTick[] = [];

  for (const candidate of candidates) {
    const leftPct = clampPct(tickPos(candidate.value));
    const label = formatTick(candidate.value);
    const { left, right, transform } = labelBounds(leftPct, label);
    const next = {
      value: candidate.value,
      label,
      leftPct,
      transform,
      bounds: { left, right },
    };
    if (!visible.some((tick) => overlaps(tick.bounds, next.bounds))) {
      visible.push(next);
    }
  }

  return visible.sort((a, b) => a.leftPct - b.leftPct);
}

export function signedCorrelationTicks(
  lo: number,
  hi: number,
  hiNeg: number = hi,
): GradientTickSpec[] {
  const ticks: GradientTickSpec[] = [
    { value: -hiNeg, priority: 100 },
    { value: hi, priority: 100 },
    { value: 0, priority: 90 },
  ];
  if (lo > 0) {
    ticks.push({ value: -lo, priority: 50 }, { value: lo, priority: 50 });
  }
  return ticks;
}

export function formatCorrelationTick(t: number) {
  return Math.abs(t) < 0.0005 ? '0' : t.toFixed(2);
}

/** Shared gradient-bar legend used by the continuous color modes. The
 *  branches differ only in title, gradient, ticks, tick format, and axis
 *  label, so tick layout lives here instead of being copied per mode. */
function GradientLegend({
  title,
  axisLabel,
  ticks,
  gradient,
  tickPos,
  formatTick = String,
  positionStyle,
}: GradientLegendProps) {
  const visibleTicks = chooseVisibleTicks(ticks, tickPos, formatTick);

  return (
    <div
      style={positionStyle}
      className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
    >
      <div className="text-neutral-400 mb-1 whitespace-nowrap">{title}</div>
      <div className="relative w-32">
        <div className="h-3 border border-neutral-700" style={{ background: gradient }} />
        <div className="relative h-3 mt-0.5 text-[9px] text-neutral-400">
          {visibleTicks.map((tick) => (
            <span
              key={`${tick.value}:${tick.label}:${tick.leftPct}`}
              className="absolute"
              style={{
                left: `${tick.leftPct}%`,
                transform: tick.transform,
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[9px] text-neutral-500 mt-3">{axisLabel}</div>
    </div>
  );
}

export function ColorLegend({ data, filter, settings, uniqueFishIds }: Props) {
  // Embedded mode drops out of absolute positioning (the inline `position`
  // beats the `absolute` class on every branch below) and lets App's
  // lower-left stack place it, so the projection pill can sit directly on
  // top of it. The lower left because mapZebrain's own
  // orientation bar sits top-centre and its right end (screenshot / export /
  // gear) ran under a top-right legend. The lower left is the only free corner
  // there — BrainViewer's projection pill and `reset view` own the top left, and
  // the Janelia logo the bottom right. Live `settings.embeddedMode`, not App's
  // module-load EMBEDDED: this is a pure overlay with no persisted geometry, so
  // it can reflow safely, and it matches how BrainViewer gates the bar itself.
  const positionStyle = settings.embeddedMode
    ? ({ position: 'static' } as const)
    : ({ top: 8, right: 8 } as const);
  // Active-brightness lift mirrors the per-cell math in coloring.ts so
  // the legend stays visually in sync with the rendered scatter.
  const brightness = Math.max(0, Math.min(1, settings.activeBrightness));
  const plasmaGrad = useMemo(() => plasmaGradient(brightness), [brightness]);
  const coolwarmFaded = useMemo(() => coolwarmGradientFaded(brightness), [brightness]);
  const coolwarmOpaque = useMemo(() => coolwarmGradientOpaque(brightness), [brightness]);

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
              style={{ background: rgbToHex(liftRgb(regionColor(i, filter.regionPalette), brightness)) }}
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
              style={{ background: rgbToHex(liftRgb(fishColor(id), brightness)) }}
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
        gradient={plasmaGrad}
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
        title={`Activity · t = ${seconds.toFixed(1)} s`}
        axisLabel="mean ΔF/F"
        ticks={ticks}
        gradient={plasmaGrad}
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
    const lo = Math.max(0, settings.swimLo);
    const hi = Math.max(lo + 0.001, settings.swimHi);
    const range = Math.max(0.001, 2 * hi); // -hi → +hi
    const ticks = signedCorrelationTicks(lo, hi);
    const tickPos = (t: number) => ((t + hi) / range) * 100;
    return (
      <GradientLegend
        title="Swim correlation"
        axisLabel="Pearson r vs swim power"
        ticks={ticks}
        gradient={settings.fadeWeakCorrelation ? coolwarmFaded : coolwarmOpaque}
        tickPos={tickPos}
        formatTick={formatCorrelationTick}
        positionStyle={positionStyle}
      />
    );
  }
  // stim correlation — divergent coolwarm ramp from -stimHiNeg to +stimHi
  // (the two saturation anchors are equal unless split saturation is on).
  // Sign reads as colour (blue → red), magnitude as intensity. Mirrors
  // the swim legend so the two signed-correlation maps share visual
  // vocabulary. The title describes the *representative r* the
  // coloring is actually picking, which depends on the active direction
  // (mirrors applyColoring's colorBias):
  //   • 1 stim selected → signed r of that stim, title is its name.
  //   • Multi-stim + filter inactive (no stims, or mode 'off') → max-|r|.
  //   • Multi-stim + 'positive' → max r+; + 'negative' → min r-.
  //   • Multi-stim + 'both' → max-|r|.
  const sel = filter.selectedStimuli;
  const S = data.stimulusNames.length;
  const stimFilterActive = sel.length > 0 && filter.stimMode !== 'off';
  const stimColorBias = stimFilterActive ? filter.stimMode : 'both';
  // Phrasing for the multi-stim "rep" the coloring picks. Matches the
  // applyColoring branches: max-positive / min-negative / max-|r|.
  const stimRepPhrase =
    stimColorBias === 'positive'
      ? 'max r+'
      : stimColorBias === 'negative'
        ? 'min r−'
        : 'max |r|';
  // Prefer the cleaned-up human label ('motion forward' etc.) over the
  // dataset's generic 'stim_N' for the single-stim title; fall back to
  // the manifest name if a label isn't defined for that index.
  const stimTitle =
    sel.length === 1
      ? `Stim: ${STIM_LABELS[sel[0]] ?? data.stimulusNames[sel[0]]}`
      : sel.length === 0 || sel.length === S
        ? `Stim: ${stimRepPhrase} across all`
        : `Stim: ${stimRepPhrase} across ${sel.length}`;
  const lo = stimFilterActive ? Math.max(0, settings.stimLo) : 0;
  const hi = Math.max(
    lo + 0.001,
    settings.stimSplitSaturation ? settings.stimHiPos : settings.stimHi,
  );
  // Negative-side anchor; equals hi unless split saturation is on. The
  // coolwarm gradient bar stays visually symmetric (white at 50%), so r=0
  // sits at the center and each half is scaled to its own anchor — a
  // negative r maps within [−hiNeg, 0] → [0%, 50%], a positive r within
  // [0, +hi] → [50%, 100%]. This matches the per-sign rendering ramp.
  const hiNeg = settings.stimSplitSaturation
    ? Math.max(lo + 0.001, settings.stimHiNeg)
    : hi;
  const ticks = signedCorrelationTicks(lo, hi, hiNeg);
  const tickPos = (t: number) =>
    t < 0 ? 50 + (t / hiNeg) * 50 : 50 + (t / hi) * 50;
  return (
    <GradientLegend
      title={stimTitle}
      axisLabel="Pearson r vs stimulus regressor"
      ticks={ticks}
      gradient={settings.fadeWeakCorrelation ? coolwarmFaded : coolwarmOpaque}
      tickPos={tickPos}
      formatTick={formatCorrelationTick}
      positionStyle={positionStyle}
    />
  );
}
