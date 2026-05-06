import type { NeuronDataset, FilterState, ColorMode } from '../data/types';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  onReset: () => void;
}

const COLOR_SCHEMES: Array<{ value: ColorMode; label: string }> = [
  { value: 'region', label: 'Region' },
  { value: 'gene', label: 'Gene' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'stim', label: 'Stim correlation' },
];

const ALL_OPTION = { value: -1, label: 'all' } as const;

export function FilterControls({ data, filter, setFilter, onReset }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });

  return (
    <div className="flex flex-col gap-2 p-3 bg-neutral-800 border-t border-neutral-700">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-neutral-400 font-mono">
          Filters
        </span>
        <ResetButton onReset={onReset} />
      </div>
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
      className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
    >
      <span aria-hidden className="text-base leading-none">↺</span>
      reset
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
  const onChange = (v: number) => {
    if (v < 0) update({ stimulusAll: true });
    else update({ stimulusAll: false, selectedStimulus: v });
  };
  const value = filter.stimulusAll ? -1 : filter.selectedStimulus;
  return (
    <Card title="Activity">
      <Select
        label="stimulus"
        value={value}
        onChange={onChange}
        options={[
          ALL_OPTION,
          ...data.stimulusNames.map((s, i) => ({ value: i, label: s })),
        ]}
        arrows
      />
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

