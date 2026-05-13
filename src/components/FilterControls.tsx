import { useState } from 'react';
import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import { ActivityCard } from './filters/ActivityCard';
import { AnatomyCard } from './filters/AnatomyCard';
import { ColorsCard } from './filters/ColorsCard';
import { HelpTab } from './filters/HelpTab';
import { SettingsTab } from './filters/SettingsTab';
import { SwimCard } from './filters/SwimCard';
import { TranscriptomicsCard } from './filters/TranscriptomicsCard';
import { CrossSep, ResetButton } from './filters/shared';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  settings: SettingsState;
  setSettings: (s: SettingsState) => void;
  /** Sorted unique fish ids in the dataset; lifted to a shared memo in
   *  App so the header, anatomy dropdown, and the legend agree. */
  uniqueFishIds: Uint8Array;
  onReset: () => void;
  /** Number of cells passing the active filters; shown next to the
   *  reset button so the current state of "how many cells am I looking
   *  at?" is visible without leaving the Filters tab. */
  visibleCount: number;
  /** Apply a preset view (Help-tab "reproduce a finding" buttons).
   *  Caller is expected to base this on INITIAL_FILTER and clear any
   *  user-explicit selections so the preset starts from a clean state. */
  applyView: (preset: Partial<FilterState>) => void;
  /** Notifies parent when activity playback starts/stops so the URL
   *  writer can suppress mid-playback writes — only the sample at
   *  pause time should land in the share URL. */
  onActivityPlayingChange: (playing: boolean) => void;
}

type Tab = 'filters' | 'settings' | 'help';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'filters', label: 'Filters' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

export function FilterControls({ data, filter, setFilter, settings, setSettings, uniqueFishIds, onReset, visibleCount, applyView, onActivityPlayingChange }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });
  const [tab, setTab] = useState<Tab>('filters');

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-800 border-t border-neutral-700">
      <div className="flex-shrink-0 flex border-b border-neutral-700 px-2 pt-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-3 py-1.5 text-xs uppercase tracking-wider font-mono -mb-px border-b-2 ' +
                (active
                  ? 'text-neutral-100 border-yellow-300'
                  : 'text-neutral-500 border-transparent hover:text-neutral-300')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {tab === 'filters' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <ResetButton onReset={onReset} />
              <span className="text-xs font-mono text-neutral-400">
                {visibleCount.toLocaleString()} cells visible
              </span>
            </div>
            <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2">
              <ColorsCard
                data={data}
                filter={filter}
                update={update}
                onActivityPlayingChange={onActivityPlayingChange}
              />
              <CrossSep />
              <TranscriptomicsCard data={data} filter={filter} update={update} />
              <CrossSep />
              <ActivityCard data={data} filter={filter} update={update} />
              <CrossSep />
              <SwimCard filter={filter} update={update} />
              <CrossSep />
              <AnatomyCard
                data={data}
                filter={filter}
                update={update}
                uniqueFishIds={uniqueFishIds}
              />
            </div>
          </div>
        )}
        {tab === 'settings' && (
          <SettingsTab settings={settings} setSettings={setSettings} />
        )}
        {tab === 'help' && <HelpTab data={data} applyView={applyView} />}
      </div>
    </div>
  );
}
