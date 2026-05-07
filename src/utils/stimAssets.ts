// Stimulus icons + cleaned-up display labels, shared between the
// Visual Stimuli filter buttons and any chart that wants to show
// per-stimulus data with an icon. Order matches the dataset's
// stimulus index 0..7.
import stim1Url from '../../images/stim1_motion_fwd.svg';
import stim2Url from '../../images/stim2_motion_back.svg';
import stim3Url from '../../images/stim3_motion_right.svg';
import stim4Url from '../../images/stim4_motion_left.svg';
import stim5Url from '../../images/stim5_dark.svg';
import stim6Url from '../../images/stim6_bright.svg';
import stim7Url from '../../images/stim7_loom_right.svg';
import stim8Url from '../../images/stim8_loom_left.svg';

export const STIM_ICONS = [
  stim1Url, stim2Url, stim3Url, stim4Url,
  stim5Url, stim6Url, stim7Url, stim8Url,
];

export const STIM_LABELS = [
  'motion forward',
  'motion backward',
  'motion right',
  'motion left',
  'dark',
  'bright',
  'loom right',
  'loom left',
];

/** Parse the dataset's generic "stim_N" name back to a 0-based index.
 *  Returns -1 if the name isn't in that format. */
export function stimIndexFromName(name: string): number {
  const m = name.match(/^stim_(\d+)$/);
  return m ? parseInt(m[1], 10) - 1 : -1;
}
