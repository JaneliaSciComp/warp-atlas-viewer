import { VIEW_PRESETS, presetPosition, type ViewPresetKey } from './viewPresets';
import dorsalIcon from '../../../images/view_dorsal.webp';
import ventralIcon from '../../../images/view_ventral.webp';
import sagittalVerticalLeftIcon from '../../../images/view_sagittal_vertical_left.webp';
import sagittalVerticalRightIcon from '../../../images/view_sagittal_vertical_right.webp';
import sagittalHorizontalLeftIcon from '../../../images/view_sagittal_horizontal_left.webp';
import sagittalHorizontalRightIcon from '../../../images/view_sagittal_horizontal_right.webp';
import coronalIcon from '../../../images/view_coronal.webp';

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

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's.
 *  Only rendered in embedded mode. */
export function ViewOrientationBar({
  distance,
  applyView,
}: {
  distance: number;
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
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
          className="p-0.5 rounded border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 hover:border-neutral-500"
        >
          <img src={PRESET_ICONS[preset.key]} alt={preset.label} className="h-8 w-8" />
        </button>
      ))}
    </div>
  );
}
