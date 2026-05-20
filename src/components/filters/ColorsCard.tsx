import type { NeuronDataset, FilterState, ColorMode, RegionPalette } from '../../data/types';
import { Card, Select } from './shared';

// Order mirrors the filter cards along the bottom strip
// (Transcriptomics → Visual Stimuli → Swim → Anatomy), with Simple
// first as the no-concept default.
const COLOR_SCHEMES: Array<{ value: ColorMode; label: string }> = [
  { value: 'highlight', label: 'Simple' },
  { value: 'gene', label: 'Gene expression' },
  { value: 'stim', label: 'Stim correlation' },
  { value: 'activity', label: 'Activity' },
  { value: 'swim', label: 'Swim correlation' },
  { value: 'region', label: 'Region' },
  { value: 'fish', label: 'Specimen' },
];

const REGION_PALETTES: Array<{ value: RegionPalette; label: string }> = [
  { value: 'nipy_spectral', label: 'nipy' },
  { value: 'turbo', label: 'turbo' },
  { value: 'distinct', label: 'distinct' },
];

export function ColorsCard({
  data,
  filter,
  update,
  activityPlaying,
  setActivityPlaying,
  activitySpeed,
  setActivitySpeed,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
  activityPlaying: boolean;
  setActivityPlaying: (playing: boolean) => void;
  activitySpeed: number;
  setActivitySpeed: (speed: number) => void;
}) {
  const schemeOptions = COLOR_SCHEMES.map((s, i) => ({ value: i, label: s.label }));
  const currentIdx = COLOR_SCHEMES.findIndex((s) => s.value === filter.colorMode);
  const paletteOptions = REGION_PALETTES.map((p, i) => ({ value: i, label: p.label }));
  const currentPaletteIdx = Math.max(
    0,
    REGION_PALETTES.findIndex((p) => p.value === filter.regionPalette),
  );
  return (
    <Card title="Colors">
      <Select
        label="scheme"
        value={currentIdx}
        onChange={(v) => update({ colorMode: COLOR_SCHEMES[v].value })}
        options={schemeOptions}
      />
      {filter.colorMode === 'region' && (
        <>
          <span title="nipy_spectral preserves the paper legend; Turbo is a smoother rainbow alternative; distinct maximizes categorical separation">
            <Select
              label="palette"
              value={currentPaletteIdx}
              onChange={(v) => update({ regionPalette: REGION_PALETTES[v].value })}
              options={paletteOptions}
            />
          </span>
          <label
            className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
            title="show cells in the Unassigned bucket (regions outside the 16 paper focal regions)"
          >
            <input
              type="checkbox"
              checked={filter.showUnassignedRegion}
              onChange={(e) => update({ showUnassignedRegion: e.target.checked })}
              className="accent-neutral-300"
            />
            show unassigned
          </label>
        </>
      )}
      {filter.colorMode === 'gene' && (
        <label className="flex items-center gap-1 text-xs">
          <span className="text-neutral-400">scale</span>
          <div className="flex border border-neutral-700 rounded overflow-hidden">
            {(['log', 'linear'] as const).map((s) => (
              <button
                key={s}
                onClick={() => update({ geneScale: s })}
                className={
                  'px-2 py-1 font-mono text-xs ' +
                  (filter.geneScale === s
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-700')
                }
              >
                {s}
              </button>
            ))}
          </div>
        </label>
      )}
      {filter.colorMode === 'activity' && (
        <ActivityTimeRow
          data={data}
          filter={filter}
          update={update}
          playing={activityPlaying}
          setPlaying={setActivityPlaying}
          speed={activitySpeed}
          setSpeed={setActivitySpeed}
        />
      )}
    </Card>
  );
}

function ActivityTimeRow({
  data,
  filter,
  update,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
}) {
  // Clamp the displayed value defensively. Stale URL state from a
  // dataset with a different traceLength could otherwise put the
  // slider past its max.
  const maxSample = Math.max(0, data.traceLength - 1);
  const sample = Math.max(0, Math.min(maxSample, filter.activitySample | 0));
  const seconds = sample / Math.max(0.0001, data.traceSampleRateHz);
  const atStart = sample <= 0;
  const atEnd = sample >= maxSample;
  const step = (delta: number) => {
    const next = Math.max(0, Math.min(maxSample, sample + delta));
    if (next !== sample) update({ activitySample: next });
  };

  return (
    <div className="flex flex-col gap-1 text-xs">
      <label className="flex items-center gap-1">
        <span className="text-neutral-400">time</span>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label="previous sample"
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none disabled:opacity-40 disabled:hover:bg-neutral-900"
        >
          ‹
        </button>
        <input
          type="range"
          min={0}
          max={maxSample}
          step={1}
          value={sample}
          onChange={(e) => update({ activitySample: parseInt(e.target.value, 10) })}
          className="w-32 accent-yellow-300"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label="next sample"
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none disabled:opacity-40 disabled:hover:bg-neutral-900"
        >
          ›
        </button>
        <span className="font-mono text-neutral-200 tabular-nums w-12 text-right whitespace-nowrap">
          {Math.round(seconds)} s
        </span>
      </label>
      <div className="flex justify-center items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'pause activity playback' : 'play activity'}
          title={playing ? 'pause' : 'play'}
          className="bg-neutral-900 border border-neutral-700 rounded px-3 py-0.5 text-neutral-200 hover:bg-neutral-700 leading-none font-mono"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
          aria-label="playback speed"
          title="playback speed"
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-200 font-mono text-xs"
        >
          {[1, 2, 10, 50, 100].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
