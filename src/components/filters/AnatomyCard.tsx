import { useMemo } from 'react';
import type { NeuronDataset, FilterState } from '../../data/types';
import { REGION_FULL_NAMES, REGION_PAPER_ORDER } from '../../utils/constants';
import { ALL_OPTION, Card, KindToggle, Select } from './shared';
import { SearchSelect } from './SearchSelect';

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
  // 112-region mapzebrain atlas (Modified from Kunst et al., 2019).
  // Sorted alphabetically by display label — the names are long and not
  // shared with the paper's 16-region vocabulary, so anatomical order
  // doesn't carry through and alphabetical is easier to scan.
  // Per-region cell counts: a single pass over the packed mask, cached
  // against the (immutable) buffer reference. ~3.4 MB / ~4 ms one-time
  // for the real WARP dataset.
  const atlasCounts = useMemo(() => {
    const R = data.atlasRegionNames.length;
    const bytes = Math.ceil(R / 8);
    const counts = new Int32Array(R);
    const mask = data.atlasRegionMask;
    for (let i = 0; i < data.count; i++) {
      const base = i * bytes;
      for (let r = 0; r < R; r++) {
        if ((mask[base + (r >> 3)] >> (r & 7)) & 1) counts[r]++;
      }
    }
    return counts;
  }, [data.atlasRegionMask, data.atlasRegionNames.length, data.count]);
  const atlasOrder = data.atlasRegionNames
    .map((name, i) => ({ name, i, count: atlasCounts[i] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const useAtlas = filter.anatomyAtlas === 'mapzebrain';
  return (
    <Card title="Anatomy">
      <label className="flex items-center gap-1 text-xs">
        <span className="text-neutral-400">atlas</span>
        <KindToggle
          value={filter.anatomyAtlas}
          onChange={(v) => update({ anatomyAtlas: v })}
          options={[
            { value: 'manuscript', label: 'Manuscript (v1)' },
            { value: 'mapzebrain', label: 'mapZebrain (v1)' },
          ]}
        />
      </label>
      {useAtlas ? (
        <SearchSelect
          label="region"
          value={filter.isolatedAtlasRegion}
          onChange={(v) => update({ isolatedAtlasRegion: v })}
          options={[
            { value: -1, label: 'all' },
            ...atlasOrder.map(({ name, i, count }) => ({
              value: i,
              label: `${name} (${count.toLocaleString()})`,
            })),
          ]}
          arrows
          truncateClass="max-w-[15rem]"
        />
      ) : (
        <SearchSelect
          label="region"
          value={filter.isolatedRegion}
          onChange={(v) => update({ isolatedRegion: v })}
          options={[
            { value: -1, label: 'all' },
            ...regionOrder.map((i) => ({ value: i, label: regionLabel(i) })),
          ]}
          arrows
          truncateClass="max-w-[15rem]"
        />
      )}
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
