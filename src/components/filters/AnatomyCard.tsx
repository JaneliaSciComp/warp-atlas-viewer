import type { NeuronDataset, FilterState } from '../../data/types';
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
  return (
    <Card title="Anatomy">
      <Select
        label="region"
        value={filter.isolatedRegion}
        onChange={(v) => update({ isolatedRegion: v })}
        options={[
          ALL_OPTION,
          ...data.regionNames
            .map((r, i) => ({ value: i, label: r }))
            .sort((a, b) => a.label.localeCompare(b.label)),
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
