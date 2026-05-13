import { useCallback, useEffect, useRef, useState } from 'react';
import type { NeuronDataset, FilterState, ColorMode } from '../../data/types';
import { Card, Select } from './shared';

const COLOR_SCHEMES: Array<{ value: ColorMode; label: string }> = [
  { value: 'highlight', label: 'Simple' },
  { value: 'region', label: 'Region' },
  { value: 'gene', label: 'Gene expression' },
  { value: 'stim', label: 'Stim correlation' },
  { value: 'swim', label: 'Swim correlation' },
  { value: 'activity', label: 'Activity' },
  { value: 'fish', label: 'Specimen' },
];

export function ColorsCard({
  data,
  filter,
  update,
  onActivityPlayingChange,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
  onActivityPlayingChange: (playing: boolean) => void;
}) {
  const schemeOptions = COLOR_SCHEMES.map((s, i) => ({ value: i, label: s.label }));
  const currentIdx = COLOR_SCHEMES.findIndex((s) => s.value === filter.colorMode);
  return (
    <Card title="Colors">
      <Select
        label="scheme"
        value={currentIdx}
        onChange={(v) => update({ colorMode: COLOR_SCHEMES[v].value })}
        options={schemeOptions}
      />
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
          onPlayingChange={onActivityPlayingChange}
        />
      )}
    </Card>
  );
}

function ActivityTimeRow({
  data,
  filter,
  update,
  onPlayingChange,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
  onPlayingChange: (playing: boolean) => void;
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

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The interval tick reads `sample` via this ref so it always advances
  // from the latest value (including any user scrub mid-playback)
  // without resetting the interval each render.
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  // `update` / `onPlayingChange` get fresh identities on every parent
  // render (parent's `update` closes over `filter`; `onPlayingChange`
  // closes over `scheduleUrlWrite` which closes over `filter`). Reading
  // them through refs keeps the interval-tick and the unmount cleanup
  // independent of those re-renders — otherwise the cleanup effect's
  // dep would change after the first tick and tear the interval down.
  const updateRef = useRef(update);
  updateRef.current = update;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  const setupInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Real-time playback would step one sample every 1/sampleRateHz
    // seconds. At high speed multipliers that interval drops below
    // what setInterval can cleanly deliver, so we cap the tick rate
    // at ~60 fps and advance multiple samples per tick instead.
    const idealMs = 1000 / Math.max(0.1, data.traceSampleRateHz * speed);
    const MIN_TICK_MS = 16;
    let tickMs: number;
    let samplesPerTick: number;
    if (idealMs >= MIN_TICK_MS) {
      tickMs = idealMs;
      samplesPerTick = 1;
    } else {
      tickMs = MIN_TICK_MS;
      samplesPerTick = Math.max(1, Math.round(MIN_TICK_MS / idealMs));
    }
    const wrap = maxSample + 1;
    intervalRef.current = setInterval(() => {
      const next = (sampleRef.current + samplesPerTick) % wrap;
      updateRef.current({ activitySample: next });
    }, tickMs);
  }, [data.traceSampleRateHz, maxSample, speed]);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
    onPlayingChangeRef.current(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (intervalRef.current) return;
    setPlaying(true);
    onPlayingChangeRef.current(true);
    setupInterval();
  }, [setupInterval]);

  // If the speed (or stream geometry) changes while playing, restart
  // the interval with the new cadence. When not playing, do nothing —
  // setupInterval is a no-op until the user hits play.
  useEffect(() => {
    if (intervalRef.current) setupInterval();
  }, [setupInterval]);

  // Stop the interval and re-enable URL writes if the row unmounts
  // mid-playback (e.g. user switches color scheme or resets filters).
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onPlayingChangeRef.current(false);
    };
  }, []);

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
          onClick={playing ? stopPlayback : startPlayback}
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
