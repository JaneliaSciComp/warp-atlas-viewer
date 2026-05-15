import type { NeuronDataset, FilterState } from '../../data/types';
import { REGION_FULL_NAMES, REGION_PAPER_ORDER } from '../../utils/constants';
import { ALL_OPTION, Card, Select } from './shared';

export function AnatomyCard({
  data,
  filter,
  update,
  uniqueFishIds,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
  uniqueFishIds: Uint8Array;
}) {
  // Paper-canonical order: Pal → … → InfMO → Unassigned. The static
  // REGION_PAPER_ORDER list assumes the 17-entry WARP layout; for
  // smaller datasets (mock-mode subsets, future datasets with a
  // different region count) fall back to data-index order so we don't
  // skip or duplicate any entries the manifest carries.
  const matchesPaperLayout =
    data.regionNames.length === REGION_PAPER_ORDER.length;
  const regionOrder = matchesPaperLayout
    ? REGION_PAPER_ORDER
    : data.regionNames.map((_, i) => i);
  // Dropdown shows "Abbr — Full name" when a full name is available and
  // distinct from the abbreviation (e.g. "Unassigned" has no separate
  // full form, so it shows just once).
  const regionLabel = (i: number) => {
    const abbr = data.regionNames[i];
    const full = matchesPaperLayout ? REGION_FULL_NAMES[i] : undefined;
    return !full || full === abbr ? abbr : `${abbr} — ${full}`;
  };
  return (
    <Card title="Anatomy">
      <Select
        label="region"
        value={filter.isolatedRegion}
        onChange={(v) => update({ isolatedRegion: v })}
        options={[
          ALL_OPTION,
          ...regionOrder.map((i) => ({ value: i, label: regionLabel(i) })),
        ]}
        arrows
      />
      {uniqueFishIds.length > 1 && (
        <Select
          label="specimen"
          value={filter.isolatedFish}
          onChange={(v) => update({ isolatedFish: v })}
          options={[
            ALL_OPTION,
            ...Array.from(uniqueFishIds, (id) => ({ value: id, label: `fish ${id + 1}` })),
          ]}
          arrows
        />
      )}
    </Card>
  );
}
