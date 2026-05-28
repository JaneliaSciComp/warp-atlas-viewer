import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** Cells passing the active filter intersection (= every cell when
   *  no filter is active). Counted inside the same hot loop that
   *  paints, so consumers don't have to re-walk the cell array. */
  visibleCount: number;
  /** Indices of cells in the filter intersection, or null when no
   *  filter is active. Drives the filter-derived fallback for the
   *  DetailPanel selection. */
  filterSelection: Uint32Array | null;
  /** Permutation of [0..count-1] with out-of-filter indices first and
   *  in-filter indices last. Renderers consume this to guarantee in-set
   *  cells composite over the dim ghost haze. Null when no filter is
   *  active (every cell is in-set; renderers fall back to natural
   *  index order). */
  drawOrder: Uint32Array | null;
  /** Un-boosted base 3D point size for this paint pass — auto-derived
   *  from canvas height in auto mode, settings.pointSize in manual mode.
   *  Use this for ghost-size math (it never includes the in-set boost). */
  basePointSize: number;
  /** Point size for active (in-set) cells in this paint pass —
   *  basePointSize × inSetBoost. Pickers and marker geometry consume
   *  this so they stay in step with what's actually drawn. */
  effectivePointSize: number;
  /** Ghost intensity used by the last paint pass. */
  effectiveGhostIntensity: number;
}

/** Shared per-cell coloring keyed on (data, filter, settings,
 *  selection, canvas height). Both BrainViewer and UmapPanel consume
 *  the same base buffers, so the 274k-cell `applyColoring` pass runs
 *  at most once per interaction regardless of how many renderers
 *  display the data. Canvas height feeds the auto-mode formulas (the
 *  brain fills the viewport vertically, so width is irrelevant); the
 *  t-SNE panel ignores its effect on point size (it has its own
 *  umapPointSize) but reads the derived ghost intensity to scale
 *  its own ghost alpha override. */
export function useColoring(
  data: NeuronDataset | null,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
  canvasHeight: number,
): SharedColoring | null {
  // One buffer reused across all updates; reallocated only when the
  // dataset changes (different `count`).
  const result = useMemo(() => (data ? allocColoring(data.count) : null), [data]);
  const [revision, setRevision] = useState(0);
  // Stats produced by applyColoring (visibleCount, filterSelection,
  // drawOrder, effective sizing) come out of the same pass that paints.
  // Stash them in a ref keyed to the published revision so consumers
  // reading them stay in sync.
  const statsRef = useRef<{
    visibleCount: number;
    filterSelection: Uint32Array | null;
    drawOrder: Uint32Array | null;
    basePointSize: number;
    effectivePointSize: number;
    effectiveGhostIntensity: number;
  }>({
    visibleCount: 0,
    filterSelection: null,
    drawOrder: null,
    basePointSize: 10,
    effectivePointSize: 10,
    effectiveGhostIntensity: 0.6,
  });
  useEffect(() => {
    if (!data || !result) return;
    statsRef.current = applyColoring(
      data,
      filter,
      settings,
      selection,
      canvasHeight,
      result,
    );
    setRevision((r) => r + 1);
  }, [data, filter, settings, selection, canvasHeight, result]);
  // Memoize the wrapper so its identity tracks (result, revision) — not
  // App's render cadence. Without this, consumers that put `coloring`
  // in an effect dep list see a new object every parent render and
  // re-fire the (expensive) effect even when the buffers haven't moved.
  return useMemo(
    () =>
      result
        ? {
            result,
            revision,
            visibleCount: statsRef.current.visibleCount,
            filterSelection: statsRef.current.filterSelection,
            drawOrder: statsRef.current.drawOrder,
            basePointSize: statsRef.current.basePointSize,
            effectivePointSize: statsRef.current.effectivePointSize,
            effectiveGhostIntensity: statsRef.current.effectiveGhostIntensity,
          }
        : null,
    [result, revision],
  );
}
