import type { NeuronDataset, FilterState } from '../../data/types';
import { Card, KindToggle } from './shared';
import { SearchSelect } from './SearchSelect';
import {
  addFirstAvailableGene,
  clusterForSubtypeMode,
  geneRowOptions,
  removeGeneAtRow,
  replaceGeneAtRow,
} from '../../utils/filterModel';

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

  // Promote off the reserved "Unassigned" cluster when entering Subtype
  // mode so the first view isn't near-empty (see clusterForSubtypeMode).
  const onTxModeChange = (m: FilterState['txMode']) => {
    if (m === 'subtype') {
      update({
        txMode: m,
        selectedCluster: clusterForSubtypeMode(filter.selectedCluster, data.clusterNames),
      });
    } else {
      update({ txMode: m });
    }
  };

  // ── Multi-gene helpers — pure rules live in utils/filterModel ───────
  const sel = filter.selectedGenes;
  const G = data.geneNames.length;
  const replaceGene = (rowIdx: number, newGene: number) =>
    update({ selectedGenes: replaceGeneAtRow(sel, rowIdx, newGene) });
  const removeGene = (rowIdx: number) =>
    update({ selectedGenes: removeGeneAtRow(sel, rowIdx) });
  const addGene = () => {
    const next = addFirstAvailableGene(sel, data.geneNames);
    if (next !== sel) update({ selectedGenes: next });
  };
  const rowOptions = (rowIdx: number) => geneRowOptions(sel, data.geneNames, rowIdx);
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
              <SearchSelect
                label=""
                value={g}
                onChange={(v) => replaceGene(rowIdx, v)}
                options={rowOptions(rowIdx)}
                truncateClass="max-w-[10rem]"
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
        <SearchSelect
          label="cluster"
          value={filter.selectedCluster}
          onChange={onClusterChange}
          options={data.clusterNames
            .map((c, i) => ({ value: i, label: c }))
            .sort((a, b) => a.label.localeCompare(b.label))}
          arrows
          truncateClass="max-w-[10rem]"
        />
      )}
    </Card>
  );
}
