import { useEffect, useState } from 'react';
import { HamburgerIcon } from '../LinksMenu';
import { VIEW_PRESETS, presetPosition, type ViewPresetKey } from './viewPresets';
import dorsalIcon from '../../../images/view_dorsal.webp';
import ventralIcon from '../../../images/view_ventral.webp';
import sagittalVerticalLeftIcon from '../../../images/view_sagittal_vertical_left.webp';
import sagittalVerticalRightIcon from '../../../images/view_sagittal_vertical_right.webp';
import sagittalHorizontalLeftIcon from '../../../images/view_sagittal_horizontal_left.webp';
import sagittalHorizontalRightIcon from '../../../images/view_sagittal_horizontal_right.webp';
import coronalIcon from '../../../images/view_coronal.webp';
import screenshotIcon from '../../../images/view_screenshot.webp';
import settingsIcon from '../../../images/view_settings.webp';
import exportIcon from '../../../images/view_export.svg';

/** mapZebrain's own icon artwork, so the bar reads as continuous with the
 *  host page when the viewer is embedded there. Kept out of viewPresets.ts
 *  so that module stays a pure, trivially testable table. */
const PRESET_ICONS: Record<ViewPresetKey, string> = {
  dorsal: dorsalIcon,
  ventral: ventralIcon,
  sagittalVerticalLeft: sagittalVerticalLeftIcon,
  sagittalVerticalRight: sagittalVerticalRightIcon,
  sagittalHorizontalLeft: sagittalHorizontalLeftIcon,
  sagittalHorizontalRight: sagittalHorizontalRightIcon,
  coronal: coronalIcon,
};

// One class for all ten buttons: no border, since each icon's artwork carries
// its own frame and a border around it reads as a double outline. No resting
// background either — every tile is opaque black already, so neutral-900 behind
// it only showed as a thin grey ring in the 2px of padding. Hover keeps a
// background so they still read as buttons.
const BUTTON_CLASS = 'p-0.5 rounded bg-transparent hover:bg-neutral-800';
// Height only — width comes from each icon's own aspect ratio, which is what
// mapZebrain's `height="32"` markup does. The artwork is not square (the
// dorsal tile is 51x64, the vertical-sagittal pair narrower still), so forcing
// `w-8` stretched every orientation icon horizontally.
const ICON_CLASS = 'h-8 w-auto';
// mapZebrain draws the screenshot/gear pair at height=25 rather than the
// orientation icons' 32 (three-dview.component.html:12-43), so they are sized
// separately. Both tiles are square 64x64, so this is also their width — and
// our export tile is drawn 64x64 to match.
const TOOL_ICON_CLASS = 'h-[25px] w-auto';

/** Width the row occupies, in px — measured in Chromium, not derived, because
 *  it depends on ten pieces of artwork with different aspect ratios (icon
 *  widths: 25.5, 25.5, 16.5, 17, 32, 32, 32 at 32px tall, then the 25px
 *  screenshot/export/gear trio) plus 4px padding per side and 8px gaps. A
 *  constant rather than a runtime measurement because the caller decides
 *  whether the row fits *before* it exists. Re-measure if the artwork or the
 *  spacing changes; `MIN_VIEWER_WIDTH_FOR_BAR` in BrainViewer is derived from
 *  it. */
export const BAR_NATURAL_WIDTH_PX = 368;

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's:
 *  seven orientations, then a screenshot icon, an export icon, and a gear.
 *  Embedded mode only.
 *
 *  Below the width its row needs (`MIN_VIEWER_WIDTH_FOR_BAR` at the call site)
 *  it collapses to a single hamburger that opens the same ten icons as a
 *  vertical menu, rather than disappearing. */
export function ViewOrientationBar({
  collapsed,
  distance,
  center,
  applyView,
  onCapture,
  onOpenExport,
  onOpenSettings,
}: {
  /** True when the viewer column is too narrow for the full row. */
  collapsed: boolean;
  distance: number;
  /** The camera's orbit target — presets are placed `distance` out from it. */
  center: [number, number, number];
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
  /** null when the canvas was not created with preserveDrawingBuffer, in
   *  which case a capture would silently produce a blank PNG. */
  onCapture: (() => void) | null;
  /** Opens the CSV export dialog. In embedded mode this icon is the only way
   *  in — the sidebar strip carries just the Links menu. */
  onOpenExport: () => void;
  onOpenSettings: () => void;
}) {
  // Only ever true while collapsed, but the state lives out here because the
  // buttons are what close it — see `pick`.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  /** Every button's click: stop propagation, because the viewer's container div
   *  treats a bare click as "focus the cell under the cursor" / "clear focus";
   *  dismiss the collapsed menu, since a pick is done with it; then act.
   *
   *  The dismissal has to happen HERE rather than in a handler on the menu
   *  wrapper. Wrapping it works for neither phase: bubble never arrives (the
   *  stopPropagation above is the whole point), and capture arrives first and
   *  unmounts the button before React dispatches its onClick — so every icon in
   *  the menu silently did nothing at all. */
  const pick = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const buttons = [
    ...VIEW_PRESETS.map((preset) => (
      <button
        key={preset.key}
        title={preset.label}
        onClick={pick(() => applyView(presetPosition(preset, distance, center), preset.up))}
        className={BUTTON_CLASS}
      >
        <img src={PRESET_ICONS[preset.key]} alt={preset.label} className={ICON_CLASS} />
      </button>
    )),
    ...(onCapture
      ? [
          <button
            key="capture"
            title="Download a PNG of the 3D view"
            aria-label="3D view screenshot"
            onClick={pick(onCapture)}
            className={BUTTON_CLASS}
          >
            <img src={screenshotIcon} alt="" className={TOOL_ICON_CLASS} />
          </button>,
        ]
      : []),
    <button
      key="export"
      title="Export the current cells to CSV"
      aria-label="Export cells"
      onClick={pick(onOpenExport)}
      className={BUTTON_CLASS}
    >
      <img src={exportIcon} alt="" className={TOOL_ICON_CLASS} />
    </button>,
    <button
      key="settings"
      title="3D view settings"
      aria-label="3D view settings"
      onClick={pick(onOpenSettings)}
      className={BUTTON_CLASS}
    >
      <img src={settingsIcon} alt="" className={TOOL_ICON_CLASS} />
    </button>,
  ];

  if (collapsed) {
    return (
      // The too-narrow fallback: one hamburger, and the same buttons stacked
      // under it on hover. Hover opens it and a click toggles it, so a tap works
      // too — this collapses exactly when the iframe is narrow, which is where
      // touch is most likely.
      //
      // z-20, unlike the expanded row below: this one must stay clickable above
      // the legend, since at these widths it is the only route to the gear and
      // the legend can cover the middle of the viewer.
      <div
        data-testid="view-orientation-menu"
        className="absolute top-2 left-1/2 -translate-x-1/2 z-20"
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          title="3D view controls"
          aria-label="3D view controls"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="flex items-center p-1 rounded text-neutral-100 bg-black/85 hover:bg-neutral-800"
        >
          <HamburgerIcon />
        </button>
        {menuOpen && (
          <div
            data-testid="view-orientation-popup"
            role="menu"
            // w-max for the same reason the expanded row needs it: shrink-to-fit
            // against a 28px-wide trigger is 14px, which squashes every icon to
            // nothing and leaves -translate-x-1/2 centring the wrong width.
            //
            // The gap to the trigger is padding, not margin, so the panel is
            // flush against it: with no dead band between them the cursor never
            // leaves the container on its way in, which is why this needs no
            // close-delay timer like LinksMenu's.
            className="absolute top-full left-1/2 w-max -translate-x-1/2 pt-1"
          >
            {/* Black, not neutral-900: every icon tile is opaque black, so a
                lighter panel showed as a grey ring around each one. */}
            <div className="flex flex-col items-center gap-1 rounded border border-neutral-700 bg-black p-1 shadow-lg">
              {buttons}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    // w-max is load-bearing: an absolutely positioned flex row with `left-1/2`
    // is shrink-to-fit against the space from its left edge to the containing
    // block's right edge — i.e. half the viewer column. Below ~690px of viewer
    // that is narrower than the row needs, so without it the flex items shrink
    // and every icon renders squashed. max-content lets the row take its
    // natural width, which -translate-x-1/2 then centres.
    //
    // No z-index, deliberately: the colour legend is a later sibling of the
    // whole viewer, so at equal z it paints on top and the row's right end
    // tucks under it. That is what lets the row survive down to the width it
    // actually needs instead of being hidden as soon as it could collide.
    <div
      data-testid="view-orientation-bar"
      className="absolute top-2 left-1/2 -translate-x-1/2 flex w-max items-center gap-2"
    >
      {buttons}
    </div>
  );
}
