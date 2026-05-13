import type { FilterState, SwimMode } from '../../data/types';
import { Card } from './shared';

// Two independent toggles ('+ swim-driven' and '− anti-swim') backed by
// a single FilterState.swimMode enum. The four legal modes correspond to
// the four boolean combinations.
function pickMode(positive: boolean, negative: boolean): SwimMode {
  if (positive && negative) return 'both';
  if (positive) return 'positive';
  if (negative) return 'negative';
  return 'off';
}

export function SwimCard({
  filter,
  update,
}: {
  filter: FilterState;
  update: (p: Partial<FilterState>) => void;
}) {
  const positive = filter.swimMode === 'positive' || filter.swimMode === 'both';
  const negative = filter.swimMode === 'negative' || filter.swimMode === 'both';

  return (
    <Card title="Swim">
      <div className="flex flex-col gap-1.5">
        <ToggleButton
          pressed={positive}
          onClick={() => update({ swimMode: pickMode(!positive, negative) })}
          title="cells whose activity is positively correlated with swim power (r ≥ +swimLo)"
        >
          + swim-driven
        </ToggleButton>
        <ToggleButton
          pressed={negative}
          onClick={() => update({ swimMode: pickMode(positive, !negative) })}
          title="cells whose activity is anti-correlated with swim power (r ≤ −swimLo)"
        >
          − anti-swim
        </ToggleButton>
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
