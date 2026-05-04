import { useState, useCallback } from 'react';
import type { SelectionState } from '../data/types';

export function useSelection() {
  const [selection, setSelection] = useState<SelectionState>({
    indices: new Uint32Array(0),
    source: null,
  });

  const setIndices = useCallback((idx: Uint32Array, source: SelectionState['source']) => {
    setSelection({ indices: idx, source });
  }, []);

  const clear = useCallback(() => {
    setSelection({ indices: new Uint32Array(0), source: null });
  }, []);

  return { selection, setIndices, clear };
}
