import type { SelectionState } from '../../data/types';
import { Card } from './shared';

interface Props {
  selection: SelectionState;
  onClear: () => void;
}

export function SelectionCard({ selection, onClear }: Props) {
  return (
    <Card title="t-SNE selection">
      <span className="text-xs font-mono text-neutral-300">
        {selection.indices.length.toLocaleString()} cells
      </span>
      <button
        onClick={onClear}
        title="clear t-SNE lasso selection"
        className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
      >
        <span aria-hidden className="text-base leading-none">×</span>
        clear selection
      </button>
    </Card>
  );
}
