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
 *  whether to render the bar *before* it exists. Re-measure if the artwork or
 *  the spacing changes; `MIN_VIEWER_WIDTH_FOR_BAR` in BrainViewer is derived
 *  from it. */
export const BAR_NATURAL_WIDTH_PX = 368;

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's:
 *  seven orientations, then a screenshot icon, an export icon, and a gear.
 *  Only rendered in embedded mode, and only when the viewer is wide enough to
 *  hold it — see `MIN_VIEWER_WIDTH_FOR_BAR` at the call site. */
export function ViewOrientationBar({
  distance,
  applyView,
  onCapture,
  onOpenExport,
  onOpenSettings,
}: {
  distance: number;
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
  /** null when the canvas was not created with preserveDrawingBuffer, in
   *  which case a capture would silently produce a blank PNG. */
  onCapture: (() => void) | null;
  /** Opens the CSV export dialog. In embedded mode this icon is the only way
   *  in — the sidebar strip carries just the Links menu. */
  onOpenExport: () => void;
  onOpenSettings: () => void;
}) {
  return (
    // w-max is load-bearing: an absolutely positioned flex row with `left-1/2`
    // is shrink-to-fit against the space from its left edge to the containing
    // block's right edge — i.e. half the viewer column. Below ~690px of viewer
    // that is narrower than the row needs, so without it the flex items shrink
    // and every icon renders squashed. max-content lets the row take its
    // natural width, which -translate-x-1/2 then centres.
    <div
      data-testid="view-orientation-bar"
      className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex w-max items-center gap-2"
    >
      {VIEW_PRESETS.map((preset) => (
        <button
          key={preset.key}
          title={preset.label}
          onClick={(e) => {
            // The viewer's container div treats a bare click as "focus the
            // cell under the cursor" / "clear focus", so stop here.
            e.stopPropagation();
            applyView(presetPosition(preset, distance), preset.up);
          }}
          className={BUTTON_CLASS}
        >
          <img src={PRESET_ICONS[preset.key]} alt={preset.label} className={ICON_CLASS} />
        </button>
      ))}
      {onCapture && (
        <button
          title="Download a PNG of the 3D view"
          aria-label="3D view screenshot"
          onClick={(e) => {
            e.stopPropagation();
            onCapture();
          }}
          className={BUTTON_CLASS}
        >
          <img src={screenshotIcon} alt="" className={TOOL_ICON_CLASS} />
        </button>
      )}
      <button
        title="Export the current cells to CSV"
        aria-label="Export cells"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExport();
        }}
        className={BUTTON_CLASS}
      >
        <img src={exportIcon} alt="" className={TOOL_ICON_CLASS} />
      </button>
      <button
        title="3D view settings"
        aria-label="3D view settings"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className={BUTTON_CLASS}
      >
        <img src={settingsIcon} alt="" className={TOOL_ICON_CLASS} />
      </button>
    </div>
  );
}
