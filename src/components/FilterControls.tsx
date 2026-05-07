import { useState } from 'react';
import type { NeuronDataset, FilterState, ColorMode, SettingsState, Orientation } from '../data/types';
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
    <div className="flex flex-col h-full min-h-0 bg-neutral-800 border-t border-neutral-700">
      <div className="flex-shrink-0 flex border-b border-neutral-700 px-2 pt-1">
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
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
    settings.pointSize !== DEFAULT_SETTINGS.pointSize ||
    settings.orientation !== DEFAULT_SETTINGS.orientation ||
    settings.enablePan !== DEFAULT_SETTINGS.enablePan;
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
          Brain orientation
        </div>
        <p className="text-neutral-400 leading-snug">
          How the brain is rotated in the 3D viewer. Both options are
          dorsal (top-down) views; the arrow indicates where the
          anterior end of the brain points on screen.
        </p>
        <OrientationToggle
          value={settings.orientation}
          onChange={(o) => update({ orientation: o })}
        />
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
    </div>
  );
}

function OrientationToggle({
  value,
  onChange,
}: {
  value: Orientation;
  onChange: (o: Orientation) => void;
}) {
  const opts: Array<{ id: Orientation; label: string; aria: string }> = [
    { id: 'portrait', label: '↑', aria: 'anterior up' },
    { id: 'landscape', label: '←', aria: 'anterior left' },
  ];
  return (
    <div className="flex border border-neutral-700 rounded overflow-hidden self-start font-mono ml-3">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-label={`orientation: ${o.aria}`}
          title={`anterior ${o.aria.replace('anterior ', '')}`}
          className={
            'px-3 py-1 text-base leading-none ' +
            (value === o.id
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

function HelpTab() {
  return (
    <div className="flex flex-col gap-4 pb-3 text-xs font-mono text-neutral-300 max-w-2xl">
      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          What you're looking at
        </div>
        <p className="text-neutral-400 leading-snug">
          ~274,000 neurons from the larval-zebrafish WARP atlas (
          <a
            href="https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-300 hover:underline"
          >
            preprint
          </a>
          ), each one mapped to (1) a 3D position in the brain,
          (2) expression counts for 41 genes, (3) one of 333
          molecularly-defined subtypes, and (4) a calcium response
          to 8 visual stimuli. The 3D viewer and the t-SNE show the
          same cells in two spaces — anything you select in one is
          highlighted in the other.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Panels
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">3D viewer</span> — anatomical view; legend top-right</li>
          <li><span className="text-neutral-200">t-SNE</span> (bottom right) — cells grouped by transcriptomic similarity</li>
          <li><span className="text-neutral-200">Details</span> (right edge, click the ‹ handle to toggle) — populated when you click a cell or lasso a group</li>
          <li><span className="text-neutral-200">Filters / Settings / Help</span> — this strip; the <span className="inline-block -translate-y-[3px]">⌄</span> handle at the bottom edge of the 3D viewer hides it</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Mouse
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">3D</span>: drag to orbit · wheel to zoom · right-drag to pan · hover for ID/region/top genes · click a cell to focus it in the details panel</li>
          <li><span className="text-neutral-200">t-SNE</span>: drag to lasso-select · click a cell to focus · right-drag or shift+drag to pan · wheel to zoom</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Filtering
        </div>
        <p className="text-neutral-400 leading-snug">
          The four cards in the Filters tab combine with logical AND
          (that's what the <span className="text-neutral-200">×</span>{' '}
          between them means): a cell has to pass every active card
          to stay visible. A card set to <span className="text-neutral-200">all</span>{' '}
          (or with nothing selected) doesn't filter anything out.
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">Colors</span> — how the visible cells are coloured (by region, by gene expression, by stimulus correlation, or just highlighted)</li>
          <li><span className="text-neutral-200">Anatomy</span> — isolate one of 16 brain regions</li>
          <li><span className="text-neutral-200">Transcriptomics</span> — keep only cells expressing a single gene, or cells belonging to a single functional subtype (e.g. <span className="text-neutral-200">pou4f2_cckb</span>)</li>
          <li><span className="text-neutral-200">Visual Stimuli</span> — keep only cells whose calcium response correlates with one or more of the 8 stimuli (correlation threshold is in the Settings tab)</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Try this first
        </div>
        <ol className="list-decimal list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li>Set <span className="text-neutral-200">Colors → Region</span> and orbit the 3D viewer to see the anatomy.</li>
          <li>Switch <span className="text-neutral-200">Colors → Gene expression</span> and step through genes with the ‹ › arrows.</li>
          <li>In <span className="text-neutral-200">Transcriptomics</span> flip to <span className="text-neutral-200">Subtype</span> and pick e.g. <span className="text-neutral-200">pou4f2_cckb</span> — most of the cluster lands in the optic tectum.</li>
          <li>Co-expression view: set <span className="text-neutral-200">Colors → Stim correlation</span>, pick a stimulus in <span className="text-neutral-200">Visual Stimuli</span>, and pick a single gene in <span className="text-neutral-200">Transcriptomics</span> — the remaining cells are gene-positive, coloured by how strongly they respond to the stimulus.</li>
          <li>Click any cell to fill in the details panel: per-gene spot counts, mean ΔF/F trace with each stimulus's on-window shaded, and a per-stimulus correlation bar chart.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Notes
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li>The activity-trace x-axis is in seconds; one 134-second cycle contains all 8 stimuli back-to-back.</li>
          <li><span className="text-neutral-200">Gene richness:</span> in the <span className="text-neutral-200">Gene expression</span> colour scheme, if no single gene is pinned in <span className="text-neutral-200">Transcriptomics</span> (gene set to "all", or you're in Subtype mode), each cell is coloured by how many of the 41 panel genes it expresses. Pin a gene to switch to the classic single-gene FISH spot-count map.</li>
          <li><span className="text-neutral-200">Stim correlation, max across selected:</span> with the <span className="text-neutral-200">Stim correlation</span> colour scheme, picking exactly one stimulus paints by that stimulus's Pearson r. With zero stimuli picked (or all of them) the cell is coloured by its <em>max</em> correlation across every stimulus; with a subset picked, max across just those.</li>
        </ul>
      </section>
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
  const logicMeaningful = filter.selectedStimuli.length >= 2;
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
      <div
        className={
          'flex items-center gap-3 ' +
          (logicMeaningful ? 'opacity-100' : 'opacity-50')
        }
        title={
          logicMeaningful
            ? 'OR: cells responsive to any selected stimulus. AND: cells responsive to every selected stimulus.'
            : 'Combine logic for multi-stimulus selections (only matters with 2+ stimuli toggled on).'
        }
      >
        <KindToggle
          value={filter.stimLogic}
          onChange={(v) => update({ stimLogic: v })}
          options={[
            { value: 'or', label: 'OR' },
            { value: 'and', label: 'AND' },
          ]}
        />
        <button
          onClick={() => update({ selectedStimuli: [] })}
          disabled={!hasSel}
          className={
            'ml-2 text-[10px] font-mono ' +
            (hasSel
              ? 'text-neutral-300 hover:text-neutral-100'
              : 'text-neutral-600 cursor-default')
          }
        >
          clear
        </button>
      </div>
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

