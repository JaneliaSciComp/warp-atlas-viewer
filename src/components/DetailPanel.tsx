import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceArea,
} from 'recharts';
import type { NeuronDataset, SelectionState } from '../data/types';

interface Props {
  data: NeuronDataset;
  selection: SelectionState;
}

export function DetailPanel({ data, selection }: Props) {
  const stats = useMemo(() => computeStats(data, selection.indices), [data, selection]);

  if (!stats) {
    return (
      <div className="h-full p-4 bg-neutral-100 text-neutral-700 overflow-y-auto border-l border-neutral-300">
        <h2 className="text-sm font-semibold mb-2 text-neutral-900">Detail</h2>
        <p className="text-xs text-neutral-500">
          Click a neuron or select a cluster/region to see details.
        </p>
      </div>
    );
  }

  const geneRows: Array<{ gene: string; v: number }> = [];
  for (let g = 0; g < stats.geneMeans.length; g++) {
    // Only include genes with non-zero mean expression in the selection;
    // bars at zero are visual noise.
    if (stats.geneMeans[g] > 0) {
      geneRows.push({ gene: data.geneNames[g], v: stats.geneMeans[g] });
    }
  }
  geneRows.sort((a, b) => b.v - a.v);
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

  return (
    <div className="h-full p-3 bg-neutral-100 text-neutral-800 overflow-y-auto border-l border-neutral-300">
      <h2 className="text-sm font-semibold mb-2 text-neutral-900">
        Selection ({selection.indices.length.toLocaleString()} neuron
        {selection.indices.length === 1 ? '' : 's'})
      </h2>

      <section className="mb-3 text-xs font-mono text-neutral-700 space-y-0.5">
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
        <h3 className="text-xs font-semibold text-neutral-700 mb-1">Gene expression</h3>
        {geneRows.length === 0 ? (
          <div className="text-xs text-neutral-500 italic">No gene expression in selection.</div>
        ) : (
        <div style={{ width: '100%', height: geneChartHeight }}>
          <ResponsiveContainer>
            <BarChart layout="vertical" data={geneRows} margin={{ top: 4, right: 8, left: 4, bottom: 18 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#262626' }}
                label={{ value: 'mean spot count', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#525252' }}
              />
              <YAxis
                type="category"
                dataKey="gene"
                tick={{ fontSize: 10, fill: '#262626', fontFamily: 'ui-monospace' }}
                width={70}
                interval={0}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, fontFamily: 'ui-monospace' }}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Bar dataKey="v" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </section>

      <section className="mb-4">
        <h3 className="text-xs font-semibold text-neutral-700 mb-1">
          Activity (mean ΔF/F across stimulus presentations)
        </h3>
        <div style={{ width: '100%', height: 130 }}>
          <ResponsiveContainer>
            <LineChart data={traceData} margin={{ top: 4, right: 8, left: 4, bottom: 14 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 9, fill: '#262626' }}
                label={{ value: 'time (s)', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#525252' }}
              />
              <YAxis tick={{ fontSize: 9, fill: '#262626' }} width={32} />
              <ReferenceLine y={0} stroke="#a3a3a3" strokeDasharray="2 2" />
              {stimWindows.map(([on, off], s) => (
                <ReferenceArea
                  key={s}
                  x1={on}
                  x2={off}
                  fill="#fca5a5"
                  fillOpacity={0.35}
                  ifOverflow="visible"
                />
              ))}
              <Tooltip
                contentStyle={{ fontSize: 11, fontFamily: 'ui-monospace' }}
                formatter={(v: number) => v.toFixed(3)}
                labelFormatter={(t: number) => `t=${t.toFixed(1)} s`}
              />
              <Line type="monotone" dataKey="y" stroke="#dc2626" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
          Pink bands = stimulus on-windows ({stimWindows.length} stimuli per cycle).
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-neutral-700 mb-1">
          Stimulus correlation (mean Pearson r)
        </h3>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={stimRows} margin={{ top: 4, right: 8, left: 4, bottom: 18 }}>
              <XAxis
                dataKey="stim"
                tick={{ fontSize: 10, fill: '#262626', fontFamily: 'ui-monospace' }}
                label={{ value: 'stimulus', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#525252' }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#262626' }}
                width={36}
                domain={['auto', 'auto']}
                label={{ value: 'r', position: 'insideLeft', angle: -90, fontSize: 10, fill: '#525252' }}
              />
              <ReferenceLine y={0} stroke="#a3a3a3" strokeDasharray="2 2" />
              <Tooltip
                contentStyle={{ fontSize: 11, fontFamily: 'ui-monospace' }}
                formatter={(v: number) => v.toFixed(3)}
              />
              <Bar dataKey="v" fill="#0891b2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
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
