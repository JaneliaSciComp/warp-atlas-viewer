import { useState } from 'react';
import type { ProjectionMode } from '../../data/types';
import { PROJECTION_MODE_LABELS, PROJECTION_MODE_ORDER } from './projectionModel';

interface Props {
  /** Already run through effectiveProjectionMode by the caller. */
  mode: ProjectionMode;
  /** Screenshot mode drops the ▾ affordance but keeps the readout. */
  screenshotMode: boolean;
  onChange?: (mode: ProjectionMode) => void;
  /** Open the menu upwards. Set when the pill sits in the lower-left
   *  stack (embedded mode), where a downward menu runs off the viewer. */
  menuUp?: boolean;
}

/** Status pill: a per-pixel projection through the point cloud is a
 *  non-default render, so it gets a persistent control on the overlay.
 *  Click to switch projection mode (or turn it off) without leaving the
 *  3D view — mirrors the Settings tab's projection control. Shares the
 *  reset button's neutral grey so the two read as one control group.
 *  Callers gate on supportsScalarProjection. */
export function ProjectionPill({ mode, screenshotMode, onChange, menuUp }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative pointer-events-auto">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
        title="per-pixel projection through the point cloud — click to change"
      >
        projection: {PROJECTION_MODE_LABELS[mode]}{screenshotMode ? '' : ' ▾'}
      </button>
      {open && (
        <>
          {/* Click-away backdrop. Sits under the menu but over the
              canvas so an outside click closes without selecting. */}
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className={
              'absolute left-0 z-20 flex flex-col bg-neutral-900/95 border border-neutral-700 rounded overflow-hidden min-w-[88px] ' +
              (menuUp ? 'bottom-full mb-1' : 'top-full mt-1')
            }
          >
            {PROJECTION_MODE_ORDER.map((m) => (
              <button
                key={m}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange?.(m);
                  setOpen(false);
                }}
                className={
                  'font-mono text-[10px] text-left px-2 py-1 hover:bg-neutral-700 ' +
                  (m === mode ? 'bg-neutral-700 text-white' : 'text-neutral-200')
                }
              >
                {PROJECTION_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
