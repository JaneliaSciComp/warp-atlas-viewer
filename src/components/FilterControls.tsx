import { useState } from 'react';
import type { NeuronDataset, FilterState, ColorMode, SettingsState } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/types';

import { STIM_ICONS, STIM_LABELS } from '../utils/stimAssets';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  settings: SettingsState;
  setSettings: (s: SettingsState) => void;
  onReset: () => void;
}

const COLOR_SCHEMES: Array<{ value: ColorMode; label: string }> = [
  { value: 'highlight', label: 'Simple' },
  { value: 'region', label: 'Region' },
  { value: 'gene', label: 'Gene expression' },
  { value: 'stim', label: 'Stim correlation' },
];

const ALL_OPTION = { value: -1, label: 'all' } as const;

type Tab = 'filters' | 'settings' | 'help';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'filters', label: 'Filters' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

export function FilterControls({ data, filter, setFilter, settings, setSettings, onReset }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });
  const [tab, setTab] = useState<Tab>('filters');

  return (
    <div className="flex flex-col bg-neutral-800 border-t border-neutral-700">
      <div className="flex border-b border-neutral-700 px-2 pt-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-3 py-1.5 text-xs uppercase tracking-wider font-mono -mb-px border-b-2 ' +
                (active
                  ? 'text-neutral-100 border-yellow-300'
                  : 'text-neutral-500 border-transparent hover:text-neutral-300')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-3">
        {tab === 'filters' && (
          <div className="flex flex-col gap-2">
            <ResetButton onReset={onReset} />
            <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2">
              <ColorsCard filter={filter} update={update} />
              <CrossSep />
              <AnatomyCard data={data} filter={filter} update={update} />
              <CrossSep />
              <TranscriptomicsCard data={data} filter={filter} update={update} />
              <CrossSep />
              <ActivityCard data={data} filter={filter} update={update} />
            </div>
          </div>
        )}
        {tab === 'settings' && (
          <SettingsTab settings={settings} setSettings={setSettings} />
        )}
        {tab === 'help' && <HelpTab />}
      </div>
    </div>
  );
}

function SettingsTab({
  settings,
  setSettings,
}: {
  settings: SettingsState;
  setSettings: (s: SettingsState) => void;
}) {
  const update = (patch: Partial<SettingsState>) =>
    setSettings({ ...settings, ...patch });
  const reset = () => setSettings(DEFAULT_SETTINGS);
  const dirty =
    settings.stimLo !== DEFAULT_SETTINGS.stimLo ||
    settings.stimHi !== DEFAULT_SETTINGS.stimHi ||
    settings.geneMaxSpots !== DEFAULT_SETTINGS.geneMaxSpots ||
    settings.pointSize !== DEFAULT_SETTINGS.pointSize;
  return (
    <div className="flex flex-col gap-4 text-[11px] font-mono text-neutral-300 max-w-md">
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
          Stim correlation cutoffs
        </div>
        <p className="text-neutral-500 text-[10px] leading-tight">
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
          Gene plasma ceiling
        </div>
        <p className="text-neutral-500 text-[10px] leading-tight">
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
          Cell point size
        </div>
        <p className="text-neutral-500 text-[10px] leading-tight">
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
    <label className="flex items-center justify-between gap-3">
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

function HelpTab() {
  return (
    <div className="text-[11px] font-mono text-neutral-400">
      <div className="mb-1 text-neutral-500">Tips</div>
      <ul className="list-disc list-inside space-y-0.5">
        <li>3D: drag to orbit, wheel to zoom, right-drag to pan</li>
        <li>3D: hover for ID, region, top genes; click to focus</li>
        <li>t-SNE: drag to box-select, links to 3D view</li>
        <li>t-SNE: right-drag or shift+drag to pan, wheel to zoom</li>
        <li>Subtype filter: pull a functional cluster as a group</li>
        <li>Co-coding: Color=Stim correlation × single-gene filter</li>
      </ul>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2 bg-neutral-900/60 border border-neutral-700 rounded">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
        {title}
      </div>
      <div className="flex flex-col items-start gap-1.5">{children}</div>
    </div>
  );
}

function CrossSep() {
  // self-stretch + flex centers the × vertically against whatever card
  // height the row settles on. aria-hidden because the × is decorative —
  // the card titles already convey "and these compose".
  return (
    <span
      aria-hidden
      className="self-stretch flex items-center text-neutral-500 text-lg font-mono select-none"
    >
      ×
    </span>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      title="reset all filters to defaults"
      className="self-start flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
    >
      <span aria-hidden className="text-base leading-none">↺</span>
      reset filters
    </button>
  );
}

function ColorsCard({
  filter,
  update,
}: {
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
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
    </Card>
  );
}

function AnatomyCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  return (
    <Card title="Anatomy">
      <Select
        label="region"
        value={filter.isolatedRegion}
        onChange={(v) => update({ isolatedRegion: v })}
        options={[
          ALL_OPTION,
          ...data.regionNames
            .map((r, i) => ({ value: i, label: r }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ]}
        arrows
      />
    </Card>
  );
}

function TranscriptomicsCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  // The "all" sentinel maps to the matching *All flag, leaving the
  // persistent index alone so flipping txMode (or coming back from
  // "all") doesn't lose the previously picked gene/cluster.
  const onGeneChange = (v: number) => {
    if (v < 0) update({ geneAll: true });
    else update({ geneAll: false, selectedGene: v });
  };
  const onClusterChange = (v: number) => {
    if (v < 0) update({ clusterAll: true });
    else update({ clusterAll: false, selectedCluster: v });
  };
  const geneValue = filter.geneAll ? -1 : filter.selectedGene;
  const clusterValue = filter.clusterAll ? -1 : filter.selectedCluster;

  return (
    <Card title="Transcriptomics">
      <KindToggle
        value={filter.txMode}
        onChange={(m) => update({ txMode: m })}
        options={[
          { value: 'gene', label: 'Single gene' },
          { value: 'subtype', label: 'Subtype' },
        ]}
      />
      {filter.txMode === 'gene' ? (
        <>
          <Select
            label="gene"
            value={geneValue}
            onChange={onGeneChange}
            options={[
              ALL_OPTION,
              ...data.geneNames
                .map((g, i) => ({ value: i, label: g }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            ]}
            arrows
          />
          {!filter.geneAll && (
            <label
              className="flex items-center gap-1 text-xs text-neutral-300 cursor-pointer select-none"
              title="checked: curated binary call (geneBinary === 1). unchecked: any detected expression (raw spot count > 0)."
            >
              <input
                type="checkbox"
                checked={filter.geneStrict}
                onChange={(e) => update({ geneStrict: e.target.checked })}
                className="accent-neutral-300"
              />
              binary call
            </label>
          )}
        </>
      ) : (
        <Select
          label="cluster"
          value={clusterValue}
          onChange={onClusterChange}
          options={[
            ALL_OPTION,
            ...data.clusterNames
              .map((c, i) => ({ value: i, label: c }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          ]}
          arrows
        />
      )}
    </Card>
  );
}

function ActivityCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  const sel = new Set(filter.selectedStimuli);
  const toggle = (idx: number) => {
    const next = new Set(sel);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    update({ selectedStimuli: Array.from(next).sort((a, b) => a - b) });
  };
  const hasSel = filter.selectedStimuli.length > 0;
  return (
    <Card title="Visual Stimuli">
      <div className="grid grid-cols-4 gap-1">
        {data.stimulusNames.map((name, i) => {
          const pressed = sel.has(i);
          const icon = STIM_ICONS[i];
          const label = STIM_LABELS[i] ?? name;
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              title={label}
              aria-pressed={pressed}
              aria-label={`toggle ${label}`}
              className={
                'w-8 h-8 rounded border flex items-center justify-center transition-[border-color,box-shadow,opacity] ' +
                (pressed
                  ? 'border-yellow-300 ring-1 ring-yellow-300/60 opacity-100'
                  : 'border-neutral-700 opacity-50 hover:opacity-90')
              }
            >
              {icon ? (
                <img src={icon} alt="" draggable={false} className="w-6 h-6" />
              ) : (
                <span className="text-[9px] text-neutral-300 font-mono">{i + 1}</span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => update({ selectedStimuli: [] })}
        disabled={!hasSel}
        className={
          'text-[10px] font-mono ' +
          (hasSel
            ? 'text-neutral-300 hover:text-neutral-100'
            : 'text-neutral-600 cursor-default')
        }
      >
        clear
      </button>
    </Card>
  );
}

// ── Reusable controls ────────────────────────────────────────────────

function KindToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex border border-neutral-700 rounded overflow-hidden text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            'px-2 py-1 font-mono ' +
            (value === o.value
              ? 'bg-neutral-100 text-neutral-900'
              : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-700')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  arrows = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: Array<{ value: number; label: string }>;
  arrows?: boolean;
}) {
  // Step relative to the (display-sorted) option order. Wraps at boundaries
  // so cycling never dead-ends. The "all" sentinel is just another option
  // in the list as far as cycling is concerned.
  const step = (delta: number) => {
    if (options.length === 0) return;
    let i = options.findIndex((o) => o.value === value);
    if (i < 0) i = 0;
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-neutral-400">{label}</span>
      {arrows && (
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`previous ${label}`}
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none"
        >
          ‹
        </button>
      )}
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200 font-mono"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {arrows && (
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`next ${label}`}
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none"
        >
          ›
        </button>
      )}
    </label>
  );
}

