import type { NeuronDataset, FilterState, StimMode } from '../../data/types';
import { STIM_ICONS, STIM_LABELS } from '../../utils/stimAssets';
import { Card, KindToggle } from './shared';

// Two independent toggles ('+ stim-driven' and '− anti-stim') backed by
// a single FilterState.stimMode enum, mirroring the swim card's shape.
// The four legal modes are the four boolean combinations.
function pickStimMode(positive: boolean, negative: boolean): StimMode {
  if (positive && negative) return 'both';
  if (positive) return 'positive';
  if (negative) return 'negative';
  return 'off';
}

export function ActivityCard({
  data,
  filter,
  update,
}: {
  data: NeuronDataset;
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  const sel = new Set(filter.selectedStimuli);
  const toggle = (idx: number) => {
    const next = new Set(sel);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    update({ selectedStimuli: Array.from(next).sort((a, b) => a - b) });
  };
  const hasSel = filter.selectedStimuli.length > 0;
  const logicMeaningful = filter.selectedStimuli.length >= 2;
  const positive = filter.stimMode === 'positive' || filter.stimMode === 'both';
  const negative = filter.stimMode === 'negative' || filter.stimMode === 'both';
  return (
    <Card title="Visual Stimuli">
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
                  ? 'border-yellow-300 ring-1 ring-yellow-300/60 opacity-100'
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
      <div className="flex flex-col gap-1.5">
        <ToggleButton
          pressed={positive}
          onClick={() => update({ stimMode: pickStimMode(!positive, negative) })}
          title="cells whose activity is positively correlated with the selected stimulus regressor (r ≥ +stimLo)"
        >
          + stim-driven
        </ToggleButton>
        <ToggleButton
          pressed={negative}
          onClick={() => update({ stimMode: pickStimMode(positive, !negative) })}
          title="cells whose activity is anti-correlated with the selected stimulus regressor (r ≤ −stimLo)"
        >
          − anti-stim
        </ToggleButton>
      </div>
      <div
        className={
          'flex items-center gap-3 ' +
          (logicMeaningful ? 'opacity-100' : 'opacity-50')
        }
        title={
          logicMeaningful
            ? 'OR: cells responsive to any selected stimulus. AND: cells responsive to every selected stimulus.'
            : 'Combine logic for multi-stimulus selections (only matters with 2+ stimuli toggled on).'
        }
      >
        <KindToggle
          value={filter.stimLogic}
          onChange={(v) => update({ stimLogic: v })}
          options={[
            { value: 'or', label: 'OR' },
            { value: 'and', label: 'AND' },
          ]}
        />
        <button
          onClick={() => update({ selectedStimuli: [] })}
          disabled={!hasSel}
          className={
            'ml-2 text-[10px] font-mono ' +
            (hasSel
              ? 'text-neutral-300 hover:text-neutral-100'
              : 'text-neutral-600 cursor-default')
          }
        >
          clear
        </button>
      </div>
    </Card>
  );
}

function ToggleButton({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={
        'px-2 py-1 text-xs font-mono rounded border transition-[border-color,box-shadow,opacity,background-color] ' +
        (pressed
          ? 'border-yellow-300 ring-1 ring-yellow-300/60 bg-neutral-900 text-neutral-100'
          : 'border-neutral-700 bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500')
      }
    >
      {children}
    </button>
  );
}
