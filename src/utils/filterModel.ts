// Pure filter-model helpers — the selection rules that used to live
// inline in the filter cards. Keeping them here (a) lets the cards focus
// on rendering and event wiring, and (b) makes the rules unit-testable
// without mounting React. Every helper is pure: it takes the current
// selection (and any dataset metadata it needs) and returns a new array,
// never mutating the input.

/**
 * Dedupe integer indices while preserving insertion order — so gene-filter
 * rows render in the order the user added them (newest last) rather than
 * re-sorting on every change.
 */
export function dedupePreserveOrder(xs: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/**
 * Toggle a stimulus index in or out of the selection. The stimulus list
 * is kept sorted and unique to match the URL-state diff convention.
 */
export function toggleStimulus(selected: number[], idx: number): number[] {
  const next = new Set(selected);
  if (next.has(idx)) next.delete(idx);
  else next.add(idx);
  return Array.from(next).sort((a, b) => a - b);
}

/**
 * Replace the gene at `rowIdx` with `newGene`, keeping the list deduped in
 * insertion order (picking a gene already on another row collapses the
 * duplicate rather than adding a second row for it).
 */
export function replaceGeneAtRow(selected: number[], rowIdx: number, newGene: number): number[] {
  const next = selected.slice();
  next[rowIdx] = newGene;
  return dedupePreserveOrder(next);
}

/** Remove the gene at `rowIdx`. */
export function removeGeneAtRow(selected: number[], rowIdx: number): number[] {
  const next = selected.slice();
  next.splice(rowIdx, 1);
  return next;
}

/**
 * Append the first not-yet-selected gene (alphabetical by name) to the
 * selection. Returns the list unchanged when every gene is already
 * selected.
 */
export function addFirstAvailableGene(selected: number[], geneNames: string[]): number[] {
  if (selected.length >= geneNames.length) return selected;
  const used = new Set(selected);
  const firstAvail = geneNames
    .map((name, i) => ({ name, i }))
    .filter((o) => !used.has(o.i))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!firstAvail) return selected;
  return dedupePreserveOrder([...selected, firstAvail.i]);
}

/**
 * Dropdown options for the gene row at `rowIdx`: every gene except those
 * already selected on OTHER rows (so the same gene can't be added twice),
 * sorted alphabetically by name.
 */
export function geneRowOptions(
  selected: number[],
  geneNames: string[],
  rowIdx: number,
): Array<{ value: number; label: string }> {
  const otherUsed = new Set(selected.filter((_, k) => k !== rowIdx));
  return geneNames
    .map((name, i) => ({ value: i, label: name }))
    .filter((o) => !otherUsed.has(o.value))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Cluster index to select when entering Subtype mode. Cluster 0 is
 * reserved for "Unassigned" (cells the upstream pipeline couldn't
 * classify); filtering to it on first entry produces an almost-empty
 * brain, so promote off it to the first real cluster. Returns the current
 * cluster when it's already a real one, or when no real cluster exists.
 */
export function clusterForSubtypeMode(selectedCluster: number, clusterNames: string[]): number {
  if (clusterNames[selectedCluster] !== 'Unassigned') return selectedCluster;
  const firstReal = clusterNames.findIndex((c) => c !== 'Unassigned');
  return firstReal >= 0 ? firstReal : selectedCluster;
}
