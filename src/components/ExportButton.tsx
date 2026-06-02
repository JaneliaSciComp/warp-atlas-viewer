import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NeuronDataset, SelectionState } from '../data/types';
import {
  buildCsv,
  buildFilename,
  downloadCsv,
  estimateCsvBytes,
} from '../utils/exportCsv';

/** Header button + modal dialog for exporting the current effective set
 *  of cells to CSV. The "effective set" is the same population the
 *  Detail panel describes: user selection (lasso / click) if any, else
 *  the filter intersection, else every cell. The 134-sample ΔF/F trace
 *  is not exported — see docs/export.md for rationale and the column
 *  list. */
export function ExportButton({
  data,
  effectiveSelection,
}: {
  data: NeuronDataset;
  effectiveSelection: SelectionState;
}) {
  const [open, setOpen] = useState(false);
  const [includeTrace, setIncludeTrace] = useState(false);

  // Materialise the index list the dialog is about to operate on.
  // `source === 'all'` means "every cell"; we encode that as a null
  // indices argument to buildCsv to avoid allocating a 0..N-1 buffer.
  const { indices, rowCount, scopeLabel } = useMemo(() => {
    const src = effectiveSelection.source;
    if (src === 'all') {
      return {
        indices: null as Uint32Array | null,
        rowCount: data.count,
        scopeLabel: 'every cell in the dataset (no filter or selection narrows the population)',
      };
    }
    if (src === '3d' || src === 'umap') {
      return {
        indices: effectiveSelection.indices,
        rowCount: effectiveSelection.indices.length,
        scopeLabel:
          src === 'umap'
            ? 'the cells you lassoed in the t-SNE panel, intersected with the active filters'
            : 'the cells matching your 3D viewer selection, intersected with the active filters',
      };
    }
    // 'filter' or null (no selection, no filter)
    return {
      indices: effectiveSelection.indices,
      rowCount: effectiveSelection.indices.length,
      scopeLabel: 'every cell passing the currently active filter cards',
    };
  }, [data, effectiveSelection]);

  const sizeBytes = useMemo(
    () => (open ? estimateCsvBytes(data, rowCount, { includeActivityTrace: includeTrace }) : 0),
    [open, data, rowCount, includeTrace],
  );

  // Close on Escape so the dialog has keyboard parity with the Links
  // menu and the SearchSelect popovers.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const onDownload = () => {
    if (rowCount === 0) return;
    const content = buildCsv(data, indices, { includeActivityTrace: includeTrace });
    downloadCsv(buildFilename(rowCount), content);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-yellow-300 hover:text-yellow-200"
      >
        Export
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={(e) => {
              // Click on the backdrop (not on the inner dialog) closes.
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-5 text-neutral-200">
              <h2
                id="export-dialog-title"
                className="text-base font-semibold text-neutral-100 mb-3"
              >
                Export cells to CSV
              </h2>
              <p className="text-sm text-neutral-300 mb-2">
                Exporting <strong>{rowCount.toLocaleString()}</strong> cell
                {rowCount === 1 ? '' : 's'}
                {' '}({formatBytes(sizeBytes)} approx.) — {scopeLabel}.
              </p>
              <p className="text-xs text-neutral-400 mb-3">
                Each row is one cell. Columns (in order):
              </p>
              <ul className="text-xs font-mono text-neutral-300 mb-3 space-y-0.5 pl-3 list-disc marker:text-neutral-600">
                <li>
                  <code>cell_id</code>, <code>x</code>, <code>y</code>,{' '}
                  <code>z</code> (viewer coordinates in mapZebrain frame,
                  centered + AP-flipped)
                </li>
                <li>
                  <code>tsne_x</code>, <code>tsne_y</code>
                </li>
                <li>
                  <code>fish</code> (1, 2, or 3)
                </li>
                <li>
                  <code>manuscript_region</code> (paper&apos;s 16-region name)
                </li>
                <li>
                  <code>mapzebrain_regions</code> (semicolon-separated list,
                  may be empty)
                </li>
                <li>
                  <code>cluster</code> (transcriptomic subtype name)
                </li>
                <li>
                  <code>gene_*</code> &times; {data.geneNames.length} (raw FISH
                  spot counts)
                </li>
                <li>
                  <code>corr_*</code> &times; {data.stimulusNames.length}{' '}
                  (signed Pearson r vs stimulus regressors)
                </li>
                <li>
                  <code>swim_corr</code> (signed Pearson r vs swim power)
                </li>
              </ul>
              <label className="flex items-start gap-2 text-xs text-neutral-300 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTrace}
                  onChange={(e) => setIncludeTrace(e.target.checked)}
                  className="mt-0.5 accent-yellow-400"
                />
                <span>
                  Include the {data.traceLength}-sample mean ΔF/F activity
                  trace (<code className="font-mono">dff_t0</code> …
                  {' '}<code className="font-mono">dff_t{data.traceLength - 1}</code>).
                  <span className="text-neutral-500">
                    {' '}Roughly doubles file size and adds {data.traceLength}{' '}
                    columns.
                  </span>
                </span>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm rounded bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={rowCount === 0}
                  className={
                    'px-3 py-1.5 text-sm rounded font-medium ' +
                    (rowCount === 0
                      ? 'bg-neutral-800 border border-neutral-700 text-neutral-600 cursor-not-allowed'
                      : 'bg-yellow-400 text-neutral-900 hover:bg-yellow-300')
                  }
                >
                  {rowCount === 0 ? 'No cells to export' : 'Download CSV'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
