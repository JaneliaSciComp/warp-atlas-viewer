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

const BUTTON_CLASS =
  'p-0.5 rounded border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 hover:border-neutral-500';
// The screenshot and gear icons carry their own artwork frame, so a border
// around them reads as a double outline. mapZebrain renders these two as bare
// <img> too (three-dview.component.html:34-43), unlike the seven orientation
// tiles. Background and hover state stay, so they remain identifiable as
// buttons.
const PLAIN_BUTTON_CLASS = 'p-0.5 rounded bg-neutral-900/85 hover:bg-neutral-800';

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's.
 *  Only rendered in embedded mode. The trailing screenshot + gear pair
 *  matches mapZebrain's own bar, at their smaller 25px size. */
export function ViewOrientationBar({
  distance,
  applyView,
  onCapture,
  onOpenSettings,
}: {
  distance: number;
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
  /** null when the canvas was not created with preserveDrawingBuffer, in
   *  which case a capture would silently produce a blank PNG. */
  onCapture: (() => void) | null;
  onOpenSettings: () => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
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
          <img src={PRESET_ICONS[preset.key]} alt={preset.label} className="h-8 w-8" />
        </button>
      ))}
      <span className="w-1" aria-hidden />
      {onCapture && (
        <button
          title="Download a PNG of the 3D view"
          aria-label="3D view screenshot"
          onClick={(e) => {
            e.stopPropagation();
            onCapture();
          }}
          className={PLAIN_BUTTON_CLASS}
        >
          <img src={screenshotIcon} alt="" className="h-[25px] w-[25px]" />
        </button>
      )}
      <button
        title="3D view settings"
        aria-label="3D view settings"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className={PLAIN_BUTTON_CLASS}
      >
        <img src={settingsIcon} alt="" className="h-[25px] w-[25px]" />
      </button>
    </div>
  );
}
