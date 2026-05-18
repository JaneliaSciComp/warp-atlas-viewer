import { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceArea, Customized,
} from 'recharts';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { STIM_ICONS, STIM_LABELS, stimIndexFromName } from '../utils/stimAssets';
import { coolwarm, rgbToHex } from '../utils/colorMaps';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  selection: SelectionState;
  /** Single-neuron focus, takes precedence over the group selection. */
  focusedNeuron: number | null;
}

export function DetailPanel({ data, filter, settings, selection, focusedNeuron }: Props) {
  // When a neuron is focused, the detail view shows just that cell;
  // otherwise it falls back to the group selection (t-SNE, cluster,
  // region). Empty-handed = the prompt below.
  const indicesToShow = useMemo(() => {
    if (focusedNeuron != null) return new Uint32Array([focusedNeuron]);
    return selection.indices;
  }, [focusedNeuron, selection.indices]);
  const stats = useMemo(
    () => computeStats(data, indicesToShow, settings.swimLo),
    [data, indicesToShow, settings.swimLo],
  );
  const isFocused = focusedNeuron != null;

  if (!stats) {
    return (
      <div className="h-full p-4 bg-neutral-900 text-neutral-300 overflow-y-auto">
        <h2 className="text-sm font-semibold mb-2 text-neutral-100 pr-7">Detail</h2>
        <p className="text-xs text-neutral-500">
          Click a neuron or select a cluster/region to see details.
        </p>
      </div>
    );
  }

  const allExpressedRows: Array<{ gene: string; v: number }> = [];
  for (let g = 0; g < stats.geneMeans.length; g++) {
    // Only include genes with non-zero mean expression in the selection;
    // bars at zero are visual noise.
    if (stats.geneMeans[g] > 0) {
      allExpressedRows.push({ gene: data.geneNames[g], v: stats.geneMeans[g] });
    }
  }
  allExpressedRows.sort((a, b) => b.v - a.v);
  const GENE_BAR_LIMIT = 20;
  const geneRows = allExpressedRows.slice(0, GENE_BAR_LIMIT);
  const truncatedGenes = allExpressedRows.length - geneRows.length;
  // Give each bar enough vertical room that its label is never collapsed.
  const geneChartHeight = Math.max(80, geneRows.length * 16 + 40);

  const stimRows: Array<{ stim: string; v: number }> = [];
  for (let s = 0; s < stats.stimulusMeans.length; s++) {
    stimRows.push({ stim: data.stimulusNames[s], v: stats.stimulusMeans[s] });
  }

  // 40-bin histogram of per-cell swim correlation across the selection.
  // Bin centers span [-1+w/2, +1-w/2] with w = swimBinWidth. The center
  // value doubles as a coolwarm-map lookup so each bar gets the same
  // color it would have in the 3D viewer under Colors → Swim.
  const swimBinRows: Array<{ x: number; count: number; fill: string }> = [];
  const halfBin = stats.swimBinWidth / 2;
  for (let b = 0; b < stats.swimBins.length; b++) {
    const center = -1 + halfBin + b * stats.swimBinWidth;
    swimBinRows.push({
      x: center,
      count: stats.swimBins[b],
      fill: rgbToHex(coolwarm(center)),
    });
  }

  // Convert sample index → seconds for the activity trace plot, so the
  // x-axis matches the manuscript's convention (real time, not sample
  // index). For the WARP data this is 1 sample/sec (originally 2 Hz,
  // boxcar-downsampled 2x in preprocess.py).
  const sampleRate = data.traceSampleRateHz;
  const traceData: Array<{ t: number; y: number }> = [];
  for (let t = 0; t < stats.meanTrace.length; t++) {
    traceData.push({ t: t / sampleRate, y: stats.meanTrace[t] });
  }
  const stimWindows = data.stimulusWindowsSec ?? [];

  // Explicit 10 s tick grid so the user can read off the time at
  // which each stimulus icon sits, instead of leaving recharts to
  // pick a coarse default like 0/30/60/90/120.
  const maxT = stats.meanTrace.length > 0 ? (stats.meanTrace.length - 1) / sampleRate : 0;
  const xTicks: number[] = [];
  for (let t = 0; t <= maxT + 0.0001; t += 10) xTicks.push(t);

  // When the Activity color scheme is driving the 3D brain, mirror its
  // current scrub time onto the trace chart so the two views are
  // visually locked together.
  const activityCursorSec =
    filter.colorMode === 'activity'
      ? Math.max(0, Math.min(maxT, filter.activitySample / sampleRate))
      : null;

  // Recharts theming: ticks/labels in light gray for legibility on
  // dark; reference lines a notch darker so they don't compete with
  // data; tooltip styled as a dark popover.
  const TICK_FILL = '#e5e5e5';
  const LABEL_FILL = '#e5e5e5';
  const REF_STROKE = '#525252';
  const TOOLTIP_STYLE = {
    fontSize: 11,
    fontFamily: 'ui-monospace',
    backgroundColor: '#171717',
    border: '1px solid #404040',
    color: '#e5e5e5',
  } as const;
  const TOOLTIP_CURSOR_LINE = { stroke: '#404040', strokeWidth: 1 };
  const TOOLTIP_CURSOR_FILL = { fill: '#404040', fillOpacity: 0.4 };

  return (
    <div className="h-full p-3 bg-neutral-900 text-neutral-200 overflow-y-auto">
      <h2 className="text-sm font-semibold mb-2 text-neutral-100 pr-7">
        {isFocused ? (
          <>Focused neuron <span className="font-mono">#{focusedNeuron}</span></>
        ) : (
          <>
            {selection.source === 'all' ? 'All neurons' : 'Selection'} (
            {selection.indices.length.toLocaleString()} neuron
            {selection.indices.length === 1 ? '' : 's'})
          </>
        )}
      </h2>

      <section className="mb-3 text-xs font-mono text-neutral-300 space-y-0.5">
        <div>
          <span className="text-neutral-500">regions:</span>{' '}
          {topItems(stats.regionCounts, data.regionNames, 3)}
        </div>
        <div>
          <span className="text-neutral-500">clusters:</span>{' '}
          {topItems(stats.clusterCounts, data.clusterNames, 3)}
        </div>
        <div>
          <span className="text-neutral-500">fish:</span>{' '}
          {Array.from(stats.fishCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([f, n]) => `${labelFish(f)}:${n}`)
            .join(' ')}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="text-xs font-semibold text-neutral-300 mb-1">Gene expression</h3>
        {geneRows.length === 0 ? (
          <div className="text-xs text-neutral-500 italic">No gene expression in selection.</div>
        ) : (
        <div style={{ width: '100%', height: geneChartHeight }}>
          <ResponsiveContainer>
            <BarChart layout="vertical" data={geneRows} margin={{ top: 4, right: 8, left: 4, bottom: 18 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: TICK_FILL }}
                stroke={REF_STROKE}
                label={{ value: 'mean spot count', position: 'insideBottom', offset: -2, fontSize: 10, fill: LABEL_FILL }}
              />
              <YAxis
                type="category"
                dataKey="gene"
                tick={{ fontSize: 10, fill: TICK_FILL, fontFamily: 'ui-monospace' }}
                stroke={REF_STROKE}
                width={70}
                interval={0}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR_FILL}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Bar dataKey="v" fill="#60a5fa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
        {truncatedGenes > 0 && (
          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
            top {GENE_BAR_LIMIT} shown · +{truncatedGenes} more expressed
          </div>
        )}
      </section>

      <section className="mb-4">
        <h3 className="text-xs font-semibold text-neutral-300 mb-1">
          Activity (mean ΔF/F across stimulus presentations)
        </h3>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer>
            <LineChart data={traceData} margin={{ top: 22, right: 8, left: 4, bottom: 14 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={xTicks}
                interval={0}
                tick={{ fontSize: 9, fill: TICK_FILL }}
                stroke={REF_STROKE}
                label={{ value: 'time (s)', position: 'insideBottom', offset: -2, fontSize: 10, fill: LABEL_FILL }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: TICK_FILL }}
                stroke={REF_STROKE}
                width={32}
              />
              <ReferenceLine y={0} stroke={REF_STROKE} strokeDasharray="2 2" />
              {stimWindows.map(([on, off], s) => (
                <ReferenceArea
                  key={s}
                  x1={on}
                  x2={off}
                  fill="#f87171"
                  fillOpacity={0.18}
                  ifOverflow="visible"
                />
              ))}
              <Customized component={(props: unknown) => (
                <StimIconRow windows={stimWindows} chart={props as ChartCtx} />
              )} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR_LINE}
                formatter={(v: number) => v.toFixed(3)}
                labelFormatter={(t: number) => `t=${t.toFixed(1)} s`}
              />
              <Line type="monotone" dataKey="y" stroke="#fca5a5" strokeWidth={1.4} dot={false} isAnimationActive={false} />
              {activityCursorSec !== null && (
                <ReferenceLine
                  x={activityCursorSec}
                  stroke="#fde047"
                  strokeWidth={1.5}
                  ifOverflow="visible"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
          Icons mark each stimulus's on-window ({stimWindows.length} stimuli per cycle).
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-neutral-300 mb-1">
          Stimulus correlation (mean Pearson r)
        </h3>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={stimRows} margin={{ top: 4, right: 8, left: 4, bottom: 24 }}>
              <XAxis
                dataKey="stim"
                tick={<StimIconTick />}
                interval={0}
                tickLine={false}
                stroke={REF_STROKE}
              />
              <YAxis
                tick={{ fontSize: 9, fill: TICK_FILL }}
                stroke={REF_STROKE}
                width={36}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={0} stroke={REF_STROKE} strokeDasharray="2 2" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR_FILL}
                formatter={(v: number) => v.toFixed(3)}
                labelFormatter={(name: string) => {
                  const idx = stimIndexFromName(name);
                  return idx >= 0 && STIM_LABELS[idx] ? STIM_LABELS[idx] : name;
                }}
              />
              <Bar dataKey="v" fill="#22d3ee" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-semibold text-neutral-300 mb-1">
          Swim correlation {isFocused ? '' : '(distribution)'}
        </h3>
        <div style={{ width: '100%', height: 110 }}>
          <ResponsiveContainer>
            <BarChart data={swimBinRows} margin={{ top: 4, right: 8, left: 4, bottom: 18 }}>
              <XAxis
                dataKey="x"
                type="number"
                domain={[-1, 1]}
                ticks={[-1, -0.5, 0, 0.5, 1]}
                tick={{ fontSize: 9, fill: TICK_FILL }}
                stroke={REF_STROKE}
                label={{ value: 'r vs swim power', position: 'insideBottom', offset: -2, fontSize: 10, fill: LABEL_FILL }}
              />
              <YAxis hide />
              {/* Deadband around zero — cells inside it count as "off"
                  for the pro/anti/off summary and map to the neutral
                  midpoint of the swim color ramp. */}
              <ReferenceArea
                x1={-settings.swimLo}
                x2={settings.swimLo}
                fill="#737373"
                fillOpacity={0.18}
                ifOverflow="visible"
              />
              <ReferenceLine x={0} stroke={REF_STROKE} strokeDasharray="2 2" />
              <ReferenceLine
                x={stats.swimMean}
                stroke="#fde047"
                strokeWidth={1.4}
                ifOverflow="visible"
                label={{ value: 'mean', position: 'top', fontSize: 9, fill: '#fde047' }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR_FILL}
                formatter={(v: number) => [`${v} cell${v === 1 ? '' : 's'}`, 'count']}
                labelFormatter={(t: number) =>
                  `r ∈ [${(t - halfBin).toFixed(2)}, ${(t + halfBin).toFixed(2)}]`
                }
              />
              <Bar dataKey="count" barSize={7} isAnimationActive={false}>
                {swimBinRows.map((row, idx) => (
                  <Cell key={idx} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[10px] text-neutral-500 font-mono mt-0.5 space-y-0.5">
          {isFocused ? (
            <div>r = {formatSigned(stats.swimMean)}</div>
          ) : (
            <>
              <div>
                mean {formatSigned(stats.swimMean)} · range {formatSigned(stats.swimMin)} .. {formatSigned(stats.swimMax)}
              </div>
              <div>
                pro {stats.swimPos} ({pct(stats.swimPos, indicesToShow.length)}) · anti {stats.swimNeg} ({pct(stats.swimNeg, indicesToShow.length)}) · off {stats.swimOff} ({pct(stats.swimOff, indicesToShow.length)})
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Recharts hands `<Customized>` an internal context that includes the
 *  resolved axis maps and the plot area's pixel offset. The fields
 *  aren't in the public types, so we narrow to just what we read. */
interface ChartCtx {
  xAxisMap?: Record<string, { scale?: (v: number) => number }>;
  offset?: { top?: number; left?: number; width?: number; height?: number };
}

/** Renders the stimulus icons across the top of the activity-trace
 *  chart, one centered above each stimulus on-window. Mirrors the
 *  manuscript's panel labeling so a viewer can read off "this peak
 *  fires during the right-loom" without consulting the legend. */
function StimIconRow({
  windows,
  chart,
}: {
  windows: Array<[number, number]>;
  chart: ChartCtx;
}) {
  const xAxis = chart.xAxisMap ? Object.values(chart.xAxisMap)[0] : undefined;
  const scale = xAxis?.scale;
  if (!scale || !chart.offset) return null;
  const ICON_SIZE = 16;
  // Place icons in the chart's top margin, just above the plot area.
  const y = Math.max(0, (chart.offset.top ?? 0) - ICON_SIZE - 2);
  return (
    <g>
      {windows.map(([on, off], s) => {
        const icon = STIM_ICONS[s];
        if (!icon) return null;
        const cx = scale((on + off) / 2);
        if (!Number.isFinite(cx)) return null;
        return (
          <image
            key={s}
            href={icon}
            x={cx - ICON_SIZE / 2}
            y={y}
            width={ICON_SIZE}
            height={ICON_SIZE}
          >
            <title>{STIM_LABELS[s] ?? `stim ${s + 1}`}</title>
          </image>
        );
      })}
    </g>
  );
}

/** Custom XAxis tick that renders the stimulus icon instead of the
 *  generic "stim_N" label. Receives recharts tick props (x, y, payload)
 *  and maps payload.value back to the icon array via stimIndexFromName.
 *  The text fallback (a tspan) covers any stim that doesn't fit the
 *  expected naming convention. */
function StimIconTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const { x, y, payload } = props;
  if (x == null || y == null || !payload) return null;
  const value = String(payload.value ?? '');
  const idx = stimIndexFromName(value);
  const icon = idx >= 0 ? STIM_ICONS[idx] : null;
  const SIZE = 18;
  if (!icon) {
    return (
      <text x={x} y={y + 12} textAnchor="middle" fill="#e5e5e5" fontSize={9}>
        {value}
      </text>
    );
  }
  return (
    <g transform={`translate(${x - SIZE / 2}, ${y + 2})`}>
      <image href={icon} width={SIZE} height={SIZE}>
        <title>{STIM_LABELS[idx] ?? value}</title>
      </image>
    </g>
  );
}

function labelFish(f: number): string {
  // Display 1-indexed to match the WARP manuscript's "Fish 1/2/3"
  // labels; the stored fishIds are 0-indexed (remapped from the
  // 59/63/71 acquisition IDs by preprocess.py).
  return `f${f + 1}`;
}

function topItems(counts: Map<number, number>, names: string[], k: number): string {
  if (counts.size === 0) return '-';
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, n]) => `${names[id] ?? id}(${n})`)
    .join(', ');
}

function computeStats(data: NeuronDataset, indices: Uint32Array, swimLo: number) {
  if (indices.length === 0) return null;
  const G = data.geneNames.length;
  const S = data.stimulusNames.length;
  const T = data.traceLength;

  const geneMeans = new Float32Array(G);
  const stimulusMeans = new Float32Array(S);
  const meanTrace = new Float32Array(T);
  const regionCounts = new Map<number, number>();
  const clusterCounts = new Map<number, number>();
  const fishCounts = new Map<number, number>();
  // Swim correlation summary. swimMean matches the per-stimulus chart's
  // arithmetic-mean convention. swimPos/Neg/Off partition the selection
  // by the user's responsive-floor magnitude so a mixed group doesn't
  // average to a misleading near-zero. swimBins is a 40-bin histogram
  // over [-1, +1] used by the Detail-panel swim chart.
  const SWIM_BINS = 40;
  const SWIM_BIN_WIDTH = 2 / SWIM_BINS; // 0.05
  const swimBins = new Uint32Array(SWIM_BINS);
  let swimSum = 0;
  let swimPos = 0;
  let swimNeg = 0;
  let swimMin = Infinity;
  let swimMax = -Infinity;

  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    for (let g = 0; g < G; g++) geneMeans[g] += data.geneCounts[i * G + g];
    for (let s = 0; s < S; s++) stimulusMeans[s] += data.stimulusCorr[i * S + s];
    const traceBase = i * T;
    for (let t = 0; t < T; t++) meanTrace[t] += data.activityTrace[traceBase + t];
    const sr = data.swimCorr[i];
    swimSum += sr;
    if (sr >=  swimLo) swimPos++;
    else if (sr <= -swimLo) swimNeg++;
    if (sr < swimMin) swimMin = sr;
    if (sr > swimMax) swimMax = sr;
    // Map [-1, +1] to bin index [0, SWIM_BINS-1]; values outside the
    // range clamp to the edge bins so e.g. r=−1.05 doesn't underflow.
    let bin = Math.floor((sr + 1) / SWIM_BIN_WIDTH);
    if (bin < 0) bin = 0;
    if (bin >= SWIM_BINS) bin = SWIM_BINS - 1;
    swimBins[bin]++;
    inc(regionCounts, data.regionIds[i]);
    inc(clusterCounts, data.clusterIds[i]);
    inc(fishCounts, data.fishIds[i]);
  }
  const inv = 1 / indices.length;
  for (let g = 0; g < G; g++) geneMeans[g] *= inv;
  for (let s = 0; s < S; s++) stimulusMeans[s] *= inv;
  for (let t = 0; t < T; t++) meanTrace[t] *= inv;
  const swimMean = swimSum * inv;
  const swimOff = indices.length - swimPos - swimNeg;

  return {
    geneMeans, stimulusMeans, meanTrace,
    regionCounts, clusterCounts, fishCounts,
    swimMean, swimPos, swimNeg, swimOff,
    swimMin, swimMax, swimBins, swimBinWidth: SWIM_BIN_WIDTH,
  };
}

function inc<K>(m: Map<K, number>, k: K) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function formatSigned(v: number): string {
  const s = Math.abs(v).toFixed(2);
  return v < 0 ? `-${s}` : `+${s}`;
}

function pct(n: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}
