import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { ActivityCard } from './filters/ActivityCard';
import { AnatomyCard } from './filters/AnatomyCard';
import { ColorsCard } from './filters/ColorsCard';
import { AboutTab } from './filters/AboutTab';
import { SelectionCard } from './filters/SelectionCard';
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
  /** Apply a preset view (About-tab "reproduce a finding" buttons).
   *  Caller is expected to base this on INITIAL_FILTER and clear any
   *  user-explicit selections so the preset starts from a clean state. */
  applyView: (preset: Partial<FilterState>) => void;
  /** Activity-playback state lives in App so a tab switch (which
   *  unmounts the row owning these controls) doesn't reset playback or
   *  the speed selection. */
  activityPlaying: boolean;
  setActivityPlaying: (playing: boolean) => void;
  activitySpeed: number;
  setActivitySpeed: (speed: number) => void;
  /** Active user selection (t-SNE lasso). When non-empty and sourced
   *  from the t-SNE panel, a Selection card is rendered alongside the
   *  filter cards with a button to clear it. */
  selection: SelectionState;
  onClearSelection: () => void;
  /** Active tab. Lifted to App so the 3D view's gear icon can select the
   *  Settings tab. */
  tab: Tab;
  onTabChange: (t: Tab) => void;
  /** When provided, a t-SNE tab is rendered second (right of Filters) with
   *  this node as its body, and the filter cards stack in a single column
   *  for a narrow sidebar.
   *
   *  ponytail: the presence of this prop *is* the sidebar-layout flag. A
   *  separate `layout` prop would be a second source of truth for the same
   *  fact. Split them if a narrow layout ever needs to exist without the
   *  t-SNE tab. */
  tsneTab?: ReactNode;
}

export type Tab = 'filters' | 'tsne' | 'settings' | 'about';

/** Tab table for the panel. The t-SNE tab exists only when the caller
 *  supplies a node for it (embedded mode), and sits immediately right of
 *  Filters — the two are used together, so they belong adjacent. */
export function tabsFor(hasTsne: boolean): Array<{ id: Tab; label: string }> {
  return [
    { id: 'filters' as Tab, label: 'Filters' },
    ...(hasTsne ? [{ id: 'tsne' as Tab, label: 't-SNE' }] : []),
    { id: 'settings' as Tab, label: 'Settings' },
    { id: 'about' as Tab, label: 'About' },
  ];
}

export function FilterControls({ data, filter, setFilter, settings, setSettings, uniqueFishIds, onReset, visibleCount, applyView, activityPlaying, setActivityPlaying, activitySpeed, setActivitySpeed, selection, onClearSelection, tab, onTabChange, tsneTab }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });
  const sidebar = tsneTab != null;
  const tabs = tabsFor(sidebar);

  // Per-tab scroll memory — see the original comment; unchanged except that
  // the map is now keyed by every Tab, including 'tsne' (which never
  // scrolls, but a partial Record would not type-check).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByTab = useRef<Record<Tab, number>>({
    filters: 0,
    tsne: 0,
    settings: 0,
    about: 0,
  });
  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (scrollRef.current) {
      scrollByTab.current[tab] = scrollRef.current.scrollTop;
    }
    onTabChange(next);
  };
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollByTab.current[tab];
    }
  }, [tab]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-panel border-t border-neutral-700">
      <div className="flex-shrink-0 flex border-b border-neutral-700 px-2 pt-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={
                'px-3 py-1.5 text-xs uppercase tracking-wider font-mono -mb-px border-b-2 ' +
                (active
                  ? 'text-neutral-100 border-accent'
                  : 'text-neutral-500 border-transparent hover:text-neutral-300')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'tsne' ? (
        <div className="flex-1 min-h-0 min-w-0">{tsneTab}</div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3">
          {tab === 'filters' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <ResetButton onReset={onReset} />
                <span className="text-xs font-mono text-neutral-400">
                  {visibleCount.toLocaleString()} cells visible
                </span>
              </div>
              <div
                className={
                  sidebar
                    ? 'flex flex-col gap-2'
                    : 'flex flex-wrap items-stretch gap-x-2 gap-y-2'
                }
              >
                <ColorsCard
                  data={data}
                  filter={filter}
                  update={update}
                  activityPlaying={activityPlaying}
                  setActivityPlaying={setActivityPlaying}
                  activitySpeed={activitySpeed}
                  setActivitySpeed={setActivitySpeed}
                />
                {!sidebar && <CrossSep />}
                <TranscriptomicsCard data={data} filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <ActivityCard data={data} filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <SwimCard filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <AnatomyCard
                  data={data}
                  filter={filter}
                  update={update}
                  uniqueFishIds={uniqueFishIds}
                />
                {selection.source === 'umap' && selection.indices.length > 0 && (
                  <>
                    {!sidebar && <CrossSep />}
                    <SelectionCard selection={selection} onClear={onClearSelection} />
                  </>
                )}
              </div>
            </div>
          )}
          {tab === 'settings' && (
            <SettingsTab filter={filter} settings={settings} setSettings={setSettings} />
          )}
          {tab === 'about' && <AboutTab data={data} applyView={applyView} />}
        </div>
      )}
    </div>
  );
}
