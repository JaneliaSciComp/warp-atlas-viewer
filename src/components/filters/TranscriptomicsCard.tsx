import type { NeuronDataset, FilterState } from '../../data/types';
import { Card, KindToggle, Select } from './shared';

/** Dedupe an array of integer indices while preserving insertion
 *  order — used so the gene-filter rows render in the order the user
 *  added them (newest at the bottom) rather than re-sorting on every
 *  change. */
function dedupePreserveOrder(xs: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of xs) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

export function TranscriptomicsCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  const onClusterChange = (v: number) => update({ selectedCluster: v });

  // Cluster 0 is reserved for "Unassigned" — cells the upstream
  // pipeline couldn't classify. Filtering to it on first entry into
  // Subtype mode produces an almost-empty brain, so when the toggle
  // flips to Subtype while selectedCluster still points at Unassigned,
  // promote to the first real cluster.
  const onTxModeChange = (m: FilterState['txMode']) => {
    if (m === 'subtype' && data.clusterNames[filter.selectedCluster] === 'Unassigned') {
      const firstReal = data.clusterNames.findIndex((c) => c !== 'Unassigned');
      if (firstReal >= 0) {
        update({ txMode: m, selectedCluster: firstReal });
        return;
      }
    }
    update({ txMode: m });
  };

  // ── Multi-gene helpers ─────────────────────────────────────────────
  const sel = filter.selectedGenes;
  const G = data.geneNames.length;
  const replaceGene = (rowIdx: number, newGene: number) => {
    // Splice in-place, then dedupe + sort (selectedGenes is kept
    // sorted + unique to match the URL-state diff convention and the
    // stim-filter pattern).
    const next = sel.slice();
    next[rowIdx] = newGene;
    update({ selectedGenes: dedupePreserveOrder(next) });
  };
  const removeGene = (rowIdx: number) => {
    const next = sel.slice();
    next.splice(rowIdx, 1);
    update({ selectedGenes: next });
  };
  const addGene = () => {
    if (sel.length >= G) return;
    // First not-yet-selected gene (alphabetical). User can change the
    // dropdown immediately to pick something specific.
    const used = new Set(sel);
    const firstAvail = data.geneNames
      .map((name, i) => ({ name, i }))
      .filter((o) => !used.has(o.i))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!firstAvail) return;
    update({ selectedGenes: dedupePreserveOrder([...sel, firstAvail.i]) });
  };
  // For each row, the dropdown lists all genes except those already
  // selected on OTHER rows — so the user can't add the same gene twice.
  const rowOptions = (rowIdx: number) => {
    const otherUsed = new Set(sel.filter((_, k) => k !== rowIdx));
    return data.geneNames
      .map((name, i) => ({ value: i, label: name }))
      .filter((o) => !otherUsed.has(o.value))
      .sort((a, b) => a.label.localeCompare(b.label));
  };
  const logicMeaningful = sel.length >= 2;
  const addDisabled = sel.length >= G;

  return (
    <Card title="Transcriptomics">
      <KindToggle
        value={filter.txMode}
        onChange={onTxModeChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'gene', label: 'Gene' },
          { value: 'subtype', label: 'Subtype' },
        ]}
      />
      {filter.txMode === 'all' ? null : filter.txMode === 'gene' ? (
        <>
          {sel.map((g, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-1">
              <Select
                label=""
                value={g}
                onChange={(v) => replaceGene(rowIdx, v)}
                options={rowOptions(rowIdx)}
              />
              <button
                type="button"
                onClick={() => removeGene(rowIdx)}
                aria-label="remove gene"
                title="remove"
                className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addGene}
            disabled={addDisabled}
            title={addDisabled ? 'all genes already selected' : 'add a gene to the filter'}
            className={
              'self-start flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border ' +
              (addDisabled
                ? 'text-neutral-600 border-neutral-800 cursor-default'
                : 'text-neutral-300 bg-neutral-900/60 border-neutral-700 hover:bg-neutral-700 hover:text-neutral-100')
            }
          >
            + add gene
          </button>
          {sel.length >= 1 && (
            <div
              className={
                'flex items-center gap-2 ' + (logicMeaningful ? 'opacity-100' : 'opacity-50')
              }
              title={
                logicMeaningful
                  ? 'OR: cells expressing any selected gene. AND: cells expressing every selected gene.'
                  : 'Combine logic for multi-gene selections (only matters with 2+ genes added).'
              }
            >
              <KindToggle
                value={filter.geneLogic}
                onChange={(v) => update({ geneLogic: v })}
                options={[
                  { value: 'or', label: 'OR' },
                  { value: 'and', label: 'AND' },
                ]}
              />
            </div>
          )}
        </>
      ) : (
        <Select
          label="cluster"
          value={filter.selectedCluster}
          onChange={onClusterChange}
          options={data.clusterNames
            .map((c, i) => ({ value: i, label: c }))
            .sort((a, b) => a.label.localeCompare(b.label))}
          arrows
        />
      )}
    </Card>
  );
}
