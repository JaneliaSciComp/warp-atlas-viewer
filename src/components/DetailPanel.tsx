import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceArea, Customized,
} from 'recharts';
import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { STIM_ICONS, STIM_LABELS, stimIndexFromName } from '../utils/stimAssets';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  selection: SelectionState;
  /** Single-neuron focus, takes precedence over the group selection. */
  focusedNeuron: number | null;
}

export function DetailPanel({ data, filter, selection, focusedNeuron }: Props) {
  // When a neuron is focused, the detail view shows just that cell;
  // otherwise it falls back to the group selection (t-SNE, cluster,
  // region). Empty-handed = the prompt below.
  const indicesToShow = useMemo(() => {
    if (focusedNeuron != null) return new Uint32Array([focusedNeuron]);
    return selection.indices;
  }, [focusedNeuron, selection.indices]);
  const stats = useMemo(() => computeStats(data, indicesToShow), [data, indicesToShow]);
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
            Selection ({selection.indices.length.toLocaleString()} neuron
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
  // Mock data uses 0..2; real data also uses 0..2 (mapped from 59/63/71).
  const realIds = [59, 63, 71];
  return realIds[f] !== undefined ? `f${realIds[f]}` : `f${f}`;
}

function topItems(counts: Map<number, number>, names: string[], k: number): string {
  if (counts.size === 0) return '-';
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, n]) => `${names[id] ?? id}(${n})`)
    .join(', ');
}

function computeStats(data: NeuronDataset, indices: Uint32Array) {
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

  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    for (let g = 0; g < G; g++) geneMeans[g] += data.geneCounts[i * G + g];
    for (let s = 0; s < S; s++) stimulusMeans[s] += data.stimulusCorr[i * S + s];
    const traceBase = i * T;
    for (let t = 0; t < T; t++) meanTrace[t] += data.activityTrace[traceBase + t];
    inc(regionCounts, data.regionIds[i]);
    inc(clusterCounts, data.clusterIds[i]);
    inc(fishCounts, data.fishIds[i]);
  }
  const inv = 1 / indices.length;
  for (let g = 0; g < G; g++) geneMeans[g] *= inv;
  for (let s = 0; s < S; s++) stimulusMeans[s] *= inv;
  for (let t = 0; t < T; t++) meanTrace[t] *= inv;

  return { geneMeans, stimulusMeans, meanTrace, regionCounts, clusterCounts, fishCounts };
}

function inc<K>(m: Map<K, number>, k: K) {
  m.set(k, (m.get(k) ?? 0) + 1);
}
