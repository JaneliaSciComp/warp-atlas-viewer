import type { NeuronDataset, FilterState, StimMode } from '../../data/types';
import { STIM_ICONS, STIM_LABELS } from '../../utils/stimAssets';
import { toggleStimulus } from '../../utils/filterModel';
import { Card, KindToggle } from './shared';

const STIM_MODE_OPTIONS: Array<{ value: StimMode; label: string; title: string }> = [
  {
    value: 'off',
    label: 'no filter',
    title: 'selected stimuli scope Stim correlation coloring but do not filter cells',
  },
  {
    value: 'positive',
    label: '+ correlated',
    title: 'keep cells with r >= +stimLo for the selected stimulus regressors',
  },
  {
    value: 'negative',
    label: '- anti-correlated',
    title: 'keep cells with r <= -stimLo for the selected stimulus regressors',
  },
  {
    value: 'both',
    label: '± either',
    title: 'keep cells with |r| >= stimLo for the selected stimulus regressors',
  },
];

export function ActivityCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  // Set for the per-button pressed checks below; the toggle rule itself
  // lives in utils/filterModel.
  const sel = new Set(filter.selectedStimuli);
  const toggle = (idx: number) =>
    update({ selectedStimuli: toggleStimulus(filter.selectedStimuli, idx) });
  const hasSel = filter.selectedStimuli.length > 0;
  const filterArmed = filter.stimMode !== 'off';
  // OR/AND only matters when the stim filter is actually evaluating
  // (mode != 'off') AND 2+ stimuli are selected so the combine logic
  // has something to combine.
  const logicMeaningful = filter.selectedStimuli.length >= 2 && filterArmed;
  const currentMode = STIM_MODE_OPTIONS.find((o) => o.value === filter.stimMode) ?? STIM_MODE_OPTIONS[0];
  const logicTitle = logicMeaningful
    ? 'OR: cells responsive to any selected stimulus. AND: cells responsive to every selected stimulus.'
    : !filterArmed
      ? 'Switch mode from no filter to activate the stim filter; OR / AND combines multiple stimuli once it\'s on.'
      : 'Combine logic for multi-stimulus selections (only matters with 2+ stimuli toggled on).';
  return (
    <Card title="Visual Stimuli">
      <label className="flex items-center gap-1 text-xs" title={currentMode.title}>
        <span className="text-neutral-400">mode</span>
        <select
          value={filter.stimMode}
          onChange={(e) => update({ stimMode: e.target.value as StimMode })}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200 font-mono"
        >
          {STIM_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-4 gap-1">
        {data.stimulusNames.map((name, i) => {
          const pressed = sel.has(i);
          const icon = STIM_ICONS[i];
          const label = STIM_LABELS[i] ?? name;
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              title={label}
              aria-pressed={pressed}
              aria-label={`toggle ${label}`}
              className={
                'w-8 h-8 rounded border flex items-center justify-center transition-[border-color,box-shadow,opacity] ' +
                (pressed
                  ? 'border-accent ring-1 ring-accent/60 opacity-100'
                  : 'border-neutral-700 opacity-50 hover:opacity-90')
              }
            >
              {icon ? (
                <img src={icon} alt="" draggable={false} className="w-6 h-6" />
              ) : (
                <span className="text-[9px] text-neutral-300 font-mono">{i + 1}</span>
              )}
            </button>
          );
        })}
      </div>
      {hasSel && (
        <div className="flex items-center gap-3">
          <div
            className={logicMeaningful ? 'opacity-100' : 'opacity-50'}
            title={logicTitle}
          >
            <KindToggle
              value={filter.stimLogic}
              onChange={(v) => update({ stimLogic: v })}
              options={[
                { value: 'or', label: 'OR' },
                { value: 'and', label: 'AND' },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={() => update({ selectedStimuli: [] })}
            title="clear selected stimuli"
            className="text-[10px] font-mono text-neutral-300 hover:text-neutral-100"
          >
            clear
          </button>
        </div>
      )}
    </Card>
  );
}
