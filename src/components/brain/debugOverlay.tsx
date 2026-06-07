import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SettingsState } from '../../data/types';
import type { SharedColoring } from '../../hooks/useColoring';

/** Samples the render frame rate from inside the Canvas and reports a
 *  value about twice a second. Mounted only while the debug overlay is
 *  open, so it adds no per-frame work in normal use. */
export function FpsMeter({ onSample }: { onSample: (fps: number) => void }) {
  const frames = useRef(0);
  const last = useRef(performance.now());
  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed >= 500) {
      onSample((frames.current * 1000) / elapsed);
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

/** Shows a compact diagnostic readout for sizing, filtering, and frame-rate state. */
export function DebugOverlay({
  canvasSize,
  fps,
  settings,
  coloring,
  totalCells,
}: {
  canvasSize: { w: number; h: number };
  fps: number;
  settings: SettingsState;
  coloring: SharedColoring | null;
  totalCells: number;
}) {
  const inSetCount = coloring?.filterSelection?.length ?? totalCells;
  // basePointSize / effGhost come straight from the shared coloring
  // (computed in applyColoring), so the overlay doesn't re-derive the
  // auto-mode formulas — it just reports what the renderer used.
  const AUTO_MIN_INSET = 50;
  const useFilterLerp = settings.autoSizing && settings.scaleByFilterCount;
  const tFilter = useFilterLerp
    ? Math.max(
        0,
        Math.min(
          1,
          (Math.log(Math.max(AUTO_MIN_INSET, inSetCount)) - Math.log(AUTO_MIN_INSET)) /
            (Math.log(Math.max(AUTO_MIN_INSET + 1, totalCells)) - Math.log(AUTO_MIN_INSET)),
        ),
      )
    : 0;
  const inSetBoost = useFilterLerp ? 2 - tFilter : 1;
  const basePointSize = coloring?.basePointSize ?? settings.pointSize;
  const effPointSize = coloring?.effectivePointSize ?? settings.pointSize;
  const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-100 tabular-nums">{value}</span>
    </div>
  );
  const fx = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
  return (
    <div className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-2 py-1.5 rounded min-w-[220px] leading-tight">
      <div className="text-neutral-500 uppercase tracking-wider text-[9px] mb-1">debug</div>
      {row('fps', fps > 0 ? fx(fps, 0) : '—')}
      {row('canvas', `${canvasSize.w}×${canvasSize.h}`)}
      {row('cells (total)', totalCells.toLocaleString())}
      {row('cells (in set)', inSetCount.toLocaleString())}
      {row('auto', settings.autoSizing ? 'on' : 'off')}
      {row('scale by filter', settings.scaleByFilterCount ? 'on' : 'off')}
      {row('settings.pointSize', fx(settings.pointSize, 1))}
      {row('settings.ghost', fx(settings.ghostIntensity, 2))}
      {row('tFilter (boost)', fx(tFilter, 3))}
      {row('inSetBoost', fx(inSetBoost, 3) + '×')}
      {row('base pointSize', fx(basePointSize, 2))}
      {row('eff. pointSize', fx(effPointSize, 2))}
      {row('eff. ghost', fx(effGhost, 3))}
    </div>
  );
}
