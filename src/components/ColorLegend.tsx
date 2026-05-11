import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import { regionColor, plasma, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
}

export function ColorLegend({ data, filter, settings }: Props) {
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
    const maxSpots = Math.max(1, settings.geneMaxSpots);
    const maxVal = useRichness ? G : maxSpots;
    // Pick reasonable ticks for either mode. For richness G is small
    // (~41) so we snap at fractions of G; for spot count we use
    // powers of 10 in log mode (clipped at the configured ceiling)
    // and quartiles in linear.
    //
    // Keep at most 4 ticks total so labels never overlap on the
    // narrow legend bar. Build the full set (0, every power of 10
    // ≤ ceiling, ceiling), then trim: first drop any intermediate
    // tick whose log-space position is within 12% of the ceiling
    // (e.g. when ceiling=1100 the 1000 tick crowds the 1100 tick),
    // then if still > 4, keep 0, the ceiling, and the two largest
    // intermediate powers of 10.
    const maxLogLocal = Math.log(1 + maxSpots);
    const logPos = (t: number) => (Math.log(1 + t) / maxLogLocal) * 100;
    let logSpotTicks: number[] = [0];
    for (let p = 1; p < maxSpots; p *= 10) logSpotTicks.push(p);
    logSpotTicks.push(maxSpots);
    while (
      logSpotTicks.length > 2 &&
      logPos(logSpotTicks[logSpotTicks.length - 1]) -
        logPos(logSpotTicks[logSpotTicks.length - 2]) <
        12
    ) {
      logSpotTicks.splice(logSpotTicks.length - 2, 1);
    }
    if (logSpotTicks.length > 4) {
      const interior = logSpotTicks.slice(1, -1);
      logSpotTicks = [0, ...interior.slice(-2), maxSpots];
    }
    // Cap every tick row at 4 so labels never collide on the narrow
    // bar. For the 5-tick patterns we drop the second-to-last entry
    // (the one that crowds the ceiling label).
    const richnessLogTicks = [0, 1, Math.round(G / 4), G];
    const richnessLinearTicks = [0, Math.round(G / 4), Math.round(G / 2), G];
    const linearSpotTicks = [0, Math.round(maxSpots / 4), Math.round(maxSpots / 2), maxSpots];
    const ticks = useRichness
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
      : `Gene: ${data.geneNames[filter.selectedGene]}`;
    const axisLabel = useRichness ? '# genes expressed' : 'mRNA spot count';
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
  if (filter.colorMode === 'activity') {
    // Plasma gradient over fixed [0, 1.5] ΔF/F anchors (mirrored from
    // utils/coloring.ts; see plan note on deferred SettingsState
    // tunables). Time readout reflects the current scrub sample so
    // the user knows what moment the brain is colored for without
    // looking back at the slider.
    const ACTIVITY_LO = 0.0;
    const ACTIVITY_HI = 1.5;
    const maxSample = Math.max(0, data.traceLength - 1);
    const sample = Math.max(0, Math.min(maxSample, filter.activitySample | 0));
    const seconds = sample / Math.max(0.0001, data.traceSampleRateHz);
    const N = 16;
    const stops = Array.from({ length: N }, (_, i) => rgbToHex(plasma(i / (N - 1))));
    const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
    const ticks = [ACTIVITY_LO, (ACTIVITY_LO + ACTIVITY_HI) / 2, ACTIVITY_HI];
    const tickPos = (t: number) =>
      ((t - ACTIVITY_LO) / (ACTIVITY_HI - ACTIVITY_LO)) * 100;
    return (
      <div
        style={positionStyle}
        className="absolute bg-neutral-900/85 border border-neutral-700 rounded p-2 text-[10px] font-mono text-neutral-200"
      >
        <div className="text-neutral-400 mb-1 whitespace-nowrap">
          Activity · t = {Math.round(seconds)} s
        </div>
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
                  {t.toFixed(1)}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-[9px] text-neutral-500 mt-3">mean ΔF/F</div>
      </div>
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
  const N = 16;
  const stops = Array.from({ length: N }, (_, i) => rgbToHex(plasma(i / (N - 1))));
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
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
