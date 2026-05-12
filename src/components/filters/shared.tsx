import type { ReactNode } from 'react';

export const ALL_OPTION = { value: -1, label: 'all' } as const;

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2 bg-neutral-900/60 border border-neutral-700 rounded">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
        {title}
      </div>
      <div className="flex flex-col items-start gap-1.5">{children}</div>
    </div>
  );
}

export function CrossSep() {
  // self-stretch + flex centers the × vertically against whatever card
  // height the row settles on. aria-hidden because the × is decorative —
  // the card titles already convey "and these compose".
  return (
    <span
      aria-hidden
      className="self-stretch flex items-center text-neutral-500 text-lg font-mono select-none"
    >
      ×
    </span>
  );
}

export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      title="reset all filters to defaults"
      className="self-start flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
    >
      <span aria-hidden className="text-base leading-none">↺</span>
      reset filters
    </button>
  );
}

export function KindToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex border border-neutral-700 rounded overflow-hidden text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            'px-2 py-1 font-mono ' +
            (value === o.value
              ? 'bg-neutral-100 text-neutral-900'
              : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-700')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  arrows = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: Array<{ value: number; label: string }>;
  arrows?: boolean;
}) {
  // Step relative to the (display-sorted) option order. Wraps at boundaries
  // so cycling never dead-ends. The "all" sentinel is just another option
  // in the list as far as cycling is concerned.
  const step = (delta: number) => {
    if (options.length === 0) return;
    let i = options.findIndex((o) => o.value === value);
    if (i < 0) i = 0;
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <label className="flex items-center gap-1 text-xs">
      {label && <span className="text-neutral-400">{label}</span>}
      {arrows && (
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`previous ${label}`}
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none"
        >
          ‹
        </button>
      )}
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200 font-mono"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {arrows && (
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`next ${label}`}
          className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 hover:bg-neutral-700 leading-none"
        >
          ›
        </button>
      )}
    </label>
  );
}
