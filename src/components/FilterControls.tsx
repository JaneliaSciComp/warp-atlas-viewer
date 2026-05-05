import type { NeuronDataset, FilterState, ColorMode } from '../data/types';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}

const MODES: Array<{ id: ColorMode; label: string }> = [
  { id: 'region', label: 'Region' },
  { id: 'gene', label: 'Gene' },
  { id: 'cluster', label: 'Cluster' },
  { id: 'bivariate', label: 'Co-coding' },
];

export function FilterControls({ data, filter, setFilter }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });

  const showGene = filter.colorMode === 'gene' || filter.colorMode === 'bivariate';
  const showStimulus = filter.colorMode === 'bivariate';
  const showCluster = filter.colorMode === 'cluster';

  const modeSelects = (
    <>
      {showGene && (
        <Select
          label="Gene"
          value={filter.selectedGene}
          onChange={(v) => update({ selectedGene: v })}
          options={data.geneNames
            .map((g, i) => ({ value: i, label: g }))
            .sort((a, b) => a.label.localeCompare(b.label))}
          arrows
        />
      )}
      {filter.colorMode === 'gene' && (
        <label className="flex items-center gap-1 text-xs">
          <span className="text-neutral-400">Scale</span>
          <div className="flex border border-neutral-700 rounded overflow-hidden">
            {(['log', 'linear'] as const).map((s) => (
              <button
                key={s}
                onClick={() => update({ geneScale: s })}
                className={
                  'px-2 py-1 font-mono ' +
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
      {showStimulus && (
        <Select
          label="Stimulus"
          value={filter.selectedStimulus}
          onChange={(v) => update({ selectedStimulus: v })}
          options={data.stimulusNames.map((s, i) => ({ value: i, label: s }))}
          arrows
        />
      )}
      {showCluster && (
        <Select
          label="Cluster"
          value={filter.selectedCluster}
          onChange={(v) => update({ selectedCluster: v })}
          options={[
            { value: -1, label: '— none —' },
            ...data.clusterNames
              .map((c, i) => ({ value: i, label: c }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          ]}
          arrows
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-2 p-3 bg-neutral-800 border-t border-neutral-700">
      {/* Row 1: always-available region isolation */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          label="Isolate region"
          value={filter.isolatedRegion}
          onChange={(v) => update({ isolatedRegion: v })}
          options={[
            { value: -1, label: '— all —' },
            ...data.regionNames
              .map((r, i) => ({ value: i, label: r }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          ]}
          arrows
        />
      </div>

      {/* Row 2: color mode toggle */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-400 mr-1">Color</span>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => update({ colorMode: m.id })}
            className={
              'px-2.5 py-1 text-xs font-mono border rounded ' +
              (filter.colorMode === m.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-700')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Row 3: mode-specific selects (only shown when relevant) */}
      {(showGene || showStimulus || showCluster) && (
        <div className="flex flex-wrap items-center gap-3">{modeSelects}</div>
      )}
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
  // so cycling never dead-ends.
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
