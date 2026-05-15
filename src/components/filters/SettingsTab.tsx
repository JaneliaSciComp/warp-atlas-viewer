import type { SettingsState } from '../../data/types';
import { DEFAULT_SETTINGS } from '../../data/types';
import { KindToggle } from './shared';

export function SettingsTab({
  settings,
  setSettings,
}: {
  settings: SettingsState;
  setSettings: (s: SettingsState) => void;
}) {
  const update = (patch: Partial<SettingsState>) =>
    setSettings({ ...settings, ...patch });
  const reset = () => setSettings(DEFAULT_SETTINGS);
  const dirty = (Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>).some(
    (k) => settings[k] !== DEFAULT_SETTINGS[k],
  );
  return (
    <div className="flex flex-col gap-6 pb-3 text-xs font-mono text-neutral-300 max-w-2xl">
      <button
        onClick={reset}
        disabled={!dirty}
        title="reset all settings to defaults"
        className={
          'self-start flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border ' +
          (dirty
            ? 'text-neutral-300 bg-neutral-900/60 border-neutral-700 hover:bg-neutral-700 hover:text-neutral-100'
            : 'text-neutral-600 border-neutral-800 cursor-default')
        }
      >
        <span aria-hidden className="text-base leading-none">↺</span>
        reset settings
      </button>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Cell point size
        </div>
        <p className="text-neutral-400 leading-snug">
          Base point size in pixels for the 3D viewer and t-SNE
          scatter. Bump up on high-DPI screens or when cells look
          undersized; user-selected cells still get an extra ×1.5
          boost on top.
        </p>
        <NumberRow
          label="point size (px)"
          value={settings.pointSize}
          min={2}
          max={20}
          step={0.5}
          onChange={(v) => update({ pointSize: v })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Ghost cells outside filter
        </div>
        <p className="text-neutral-400 leading-snug">
          When on, cells that don't pass the active filters render
          close to invisible and clicks pass through them to whatever's
          underneath. Foreground cells in the brain's interior aren't
          occluded by the dim haze, but you lose some anatomical
          context. When off, dimmed cells stay visible and pickable.
        </p>
        <label
          className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
          title="hide out-of-filter cells: drops their alpha and skips them in the click picker"
        >
          <input
            type="checkbox"
            checked={settings.ghostUnselected}
            onChange={(e) => update({ ghostUnselected: e.target.checked })}
            className="accent-neutral-300"
          />
          ghost cells outside filter
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Camera panning
        </div>
        <p className="text-neutral-400 leading-snug">
          When off, the orbit pivot is locked to the volume center so
          rotation always pivots around the volume's own axes. Turn on
          to allow right-drag to translate the camera; rotation will
          then pivot around the panned point.
        </p>
        <label
          className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
          title="enable right-drag panning of the 3D camera"
        >
          <input
            type="checkbox"
            checked={settings.enablePan}
            onChange={(e) => update({ enablePan: e.target.checked })}
            className="accent-neutral-300"
          />
          enable pan
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Gene plasma ceiling
        </div>
        <p className="text-neutral-400 leading-snug">
          Upper anchor for the Gene scheme's plasma palette (raw FISH
          spot count). Cells above this value saturate. Tune to match
          the practical ceiling of the dataset's probe panel.
        </p>
        <NumberRow
          label="max spot count"
          value={settings.geneMaxSpots}
          min={50}
          max={5000}
          step={50}
          onChange={(v) => update({ geneMaxSpots: v })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Multi-gene coloring
        </div>
        <p className="text-neutral-400 leading-snug">
          What the Gene color scheme paints when 2+ genes are selected.
          <span className="text-neutral-200"> Max</span> — the strongest-expressing of the selected genes per cell.
          <span className="text-neutral-200"> Sum</span> — total spot count across the selected genes; emphasises co-expression strength.
          <span className="text-neutral-200"> Richness</span> — how many of the selected genes the cell expresses (using the same predicate as the gene filter).
        </p>
        <div className="flex items-center gap-2">
          <KindToggle
            value={settings.geneMultiColor}
            onChange={(v) => update({ geneMultiColor: v })}
            options={[
              { value: 'max', label: 'Max' },
              { value: 'sum', label: 'Sum' },
              { value: 'richness', label: 'Richness' },
            ]}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Stim correlation cutoffs
        </div>
        <p className="text-neutral-400 leading-snug">
          Pearson r thresholds for stimulus correlation. Cells below the
          floor are treated as non-responsive (dim in the Stim color
          scheme; rejected by the Activity filter). Cells above the
          saturation point map to plasma's bright end.
        </p>
        <NumberRow
          label="responsive floor (r ≥)"
          value={settings.stimLo}
          min={-1}
          max={settings.stimHi - 0.01}
          step={0.05}
          onChange={(v) => update({ stimLo: v })}
        />
        <NumberRow
          label="saturation (r ≥)"
          value={settings.stimHi}
          min={settings.stimLo + 0.01}
          max={1}
          step={0.05}
          onChange={(v) => update({ stimHi: v })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Swim correlation cutoffs
        </div>
        <p className="text-neutral-400 leading-snug">
          Magnitude thresholds for the signed swim-power correlation.
          The <span className="text-neutral-200">floor</span> sets the
          dead-band around zero — cells with |r| below it are treated as
          unresponsive (neutral midpoint of the swim color ramp; rejected
          by the swim filter). The <span className="text-neutral-200">saturation</span> sets
          the |r| at which the divergent ramp reaches its endpoints.
          Defaults are tuned to WARP's tighter swim distribution.
        </p>
        <NumberRow
          label="responsive floor (|r| ≥)"
          value={settings.swimLo}
          min={0}
          max={settings.swimHi - 0.01}
          step={0.05}
          onChange={(v) => update({ swimLo: v })}
        />
        <NumberRow
          label="saturation (|r| ≥)"
          value={settings.swimHi}
          min={settings.swimLo + 0.01}
          max={1}
          step={0.05}
          onChange={(v) => update({ swimHi: v })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Activity ΔF/F anchors
        </div>
        <p className="text-neutral-400 leading-snug">
          Lower / upper anchors of the Activity color scheme's plasma
          ramp. Cells with trace values at or below the floor map to the
          dark end; values at or above the ceiling saturate at the
          bright end. Tune to match the practical dynamic range of the
          dataset's calcium traces.
        </p>
        <NumberRow
          label="floor (ΔF/F)"
          value={settings.activityLo}
          min={-2}
          max={settings.activityHi - 0.1}
          step={0.1}
          onChange={(v) => update({ activityLo: v })}
        />
        <NumberRow
          label="ceiling (ΔF/F)"
          value={settings.activityHi}
          min={settings.activityLo + 0.1}
          max={5}
          step={0.1}
          onChange={(v) => update({ activityHi: v })}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Gene expression predicate
        </div>
        <p className="text-neutral-400 leading-snug">
          How "expresses a gene" is decided for the gene filter and the
          richness multi-gene coloring.
          <span className="text-neutral-200"> Binary call</span> uses
          the dataset's curated, conservative classification
          (geneBinary === 1).
          <span className="text-neutral-200"> Any detected</span> is
          more permissive — any raw FISH spot count above zero.
        </p>
        <label
          className="flex items-center gap-1 text-xs text-neutral-300 cursor-pointer select-none"
          title="checked: curated binary call (geneBinary === 1). unchecked: any detected expression (raw spot count > 0)."
        >
          <input
            type="checkbox"
            checked={settings.geneStrict}
            onChange={(e) => update({ geneStrict: e.target.checked })}
            className="accent-neutral-300"
          />
          binary call
        </label>
      </section>

    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 pl-3">
      <span className="text-neutral-300">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-32 accent-yellow-300"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-neutral-200 w-20 font-mono text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </span>
    </label>
  );
}
