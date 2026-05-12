import { useEffect, useMemo, useState } from 'react';
import type { FilterState, NeuronDataset, SelectionState, SettingsState } from '../data/types';
import { allocColoring, applyColoring, type ColoringResult } from '../utils/coloring';

export interface SharedColoring {
  /** Per-cell color/alpha/size buffers — the "base" coloring shared
   *  by every renderer. Buffers are reused across filter changes (no
   *  realloc per update). Consumers that need per-render tweaks
   *  (e.g. BrainViewer's focus-stamp on top) should copy into their
   *  own buffers; do NOT mutate `result` in place. */
  result: ColoringResult;
  /** Monotonically bumped each time `applyColoring` writes new values
   *  into `result`. Use as a useEffect dep — `result`'s identity is
   *  stable across updates, so depending on it directly wouldn't
   *  re-fire effects. */
  revision: number;
}

/** Lift `applyColoring` out of the individual renderers. Before this
 *  hook, BrainViewer and UmapPanel each allocated their own buffers
 *  and ran a full 274k-cell `applyColoring` pass on every filter /
 *  settings / selection change — two passes per change for the same
 *  inputs. Now App computes once and both renderers consume the same
 *  base. */
export function useColoring(
  data: NeuronDataset | null,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
): SharedColoring | null {
  // One buffer reused across all updates; reallocated only when the
  // dataset changes (different `count`).
  const result = useMemo(() => (data ? allocColoring(data.count) : null), [data]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!data || !result) return;
    applyColoring(data, filter, settings, selection, result);
    setRevision((r) => r + 1);
  }, [data, filter, settings, selection, result]);
  if (!result) return null;
  return { result, revision };
}
