import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';

export interface SearchOption {
  value: number;
  label: string;
  /** Optional right-aligned secondary text (e.g. a cell count). Rendered
   *  in a dimmer color, not included in the searchable value. */
  aside?: string;
  /** Shown on the closed trigger in place of `label`, which the dropdown
   *  keeps in full. For labels of the form "Abbr — Full name" this lets the
   *  trigger show just "Abbr": the full text is both too wide for a narrow
   *  panel and mostly redundant once you have chosen it. Also shrinks the
   *  width sizer below, since that budgets for the longest *displayed* label.
   *  Falls back to `label` when unset. */
  shortLabel?: string;
}

/** Searchable combobox built on cmdk. Used for dropdowns where the
 *  native `<select>`'s first-letter type-ahead isn't enough: the
 *  112-region mapZebrain atlas, the 333 transcriptomic subtypes, and
 *  gene-filter rows. Closed state visually mirrors the Select in
 *  shared.tsx so mixed cards read as one consistent control set; the
 *  open state replaces the native picker with a search input + filtered
 *  list.
 *
 *  The control is intentionally minimal — no virtualization, no fuzzy
 *  weighting beyond cmdk's defaults — because the longest list we feed
 *  it is only a few hundred entries. */
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  truncateClass,
  placeholder = 'search…',
  arrows = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: SearchOption[];
  truncateClass?: string;
  placeholder?: string;
  /** When true, render prev/next chevrons around the trigger that cycle
   *  through the option list (wrapping at the edges). Mirrors the
   *  `arrows` prop on the native Select so swapping in a SearchSelect
   *  doesn't lose the cycle-by-one ergonomic on long-but-ordered lists. */
  arrows?: boolean;
}) {
  const step = (delta: number) => {
    if (options.length === 0) return;
    let i = options.findIndex((o) => o.value === value);
    if (i < 0) i = 0;
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
  };
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  // What the trigger shows vs. what the tooltip and dropdown show.
  const selectedLabel = selected?.shortLabel ?? selected?.label ?? '';
  const selectedFullLabel = selected?.label ?? '';
  const selectedAside = selected?.aside;
  // Reserve enough width for the longest option's label so the trigger
  // (and the arrow buttons next to it) don't reflow as the user cycles
  // through values. The widget uses a monospace font, so character
  // count is a faithful proxy for rendered width without measuring DOM.
  // Budgets for the longest *displayed* label, so a list with shortLabels
  // sizes to those rather than to the full names.
  const longestLabel = options.reduce((a, o) => {
    const shown = o.shortLabel ?? o.label;
    return shown.length > a.length ? shown : a;
  }, '');
  const widestAside = options.reduce(
    (a, o) => ((o.aside?.length ?? 0) > a.length ? (o.aside ?? '') : a),
    '',
  );
  const hasAside = widestAside.length > 0;
  // Concatenate longest name + widest aside in the sizer so the trigger
  // budgets for the worst-case row, even if no single option actually
  // pairs the two extremes. The two-space spacer roughly matches the
  // visible flex `gap-2` in the foreground layer.
  const sizerText = hasAside ? `${longestLabel}  ${widestAside}` : longestLabel;

  // Close on outside-click and on Escape. Both the trigger button and
  // the (portaled) popover count as inside.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Position the portaled popover *above* the trigger, in viewport
  // coordinates. The popover is short-lived (close on outside-click /
  // selection), so we recompute on open + on window resize but skip
  // tracking ancestor scrolls — opening + dismissing covers the
  // realistic interaction window.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 4,
        width: Math.max(rect.width, 240),
      });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);

  // When the popover opens, focus the search input and reset the query
  // so the user always starts from the full list.
  useEffect(() => {
    if (open) {
      setSearch('');
      // requestAnimationFrame: cmdk needs one frame to mount the input
      // before we can focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const popover = open && pos
    ? createPortal(
        <Command
          ref={popoverRef}
          id={listboxId}
          label={label}
          style={{
            position: 'fixed',
            left: pos.left,
            bottom: pos.bottom,
            // Let the popover size to its widest item (so atlas region
            // names don't wrap to two lines), but never narrower than
            // the trigger nor wider than the viewport.
            minWidth: pos.width,
            maxWidth: 'calc(100vw - 16px)',
          }}
          className="z-50 w-fit bg-neutral-900 border border-neutral-700 rounded shadow-lg overflow-hidden"
        >
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={placeholder}
            className="w-full bg-neutral-900 border-b border-neutral-700 px-2 py-1.5 text-xs font-mono text-neutral-200 placeholder-neutral-500 outline-none"
          />
          <Command.List className="max-h-72 overflow-y-auto py-1">
            <Command.Empty className="px-2 py-2 text-xs font-mono text-neutral-500">
              no matches
            </Command.Empty>
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={
                  'flex items-center gap-3 px-2 py-1 text-xs font-mono cursor-pointer text-neutral-300 whitespace-nowrap ' +
                  'data-[selected=true]:bg-neutral-700 data-[selected=true]:text-neutral-100 ' +
                  (o.value === value ? 'text-neutral-100' : '')
                }
              >
                <span className="truncate min-w-0">{o.label}</span>
                {o.aside && (
                  <span className="ml-auto shrink-0 text-neutral-500">{o.aside}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>,
        document.body,
      )
    : null;

  return (
    // max-w-full + the min-w-0 chain below let the trigger shrink to whatever
    // the panel actually has, instead of relying on truncateClass being tuned
    // for one particular width. In the wide bottom panel nothing pushes on it
    // and the sizer's intrinsic width still wins; in a 280px sidebar it gives
    // way rather than overflowing the card.
    <label className="flex items-center gap-1 text-xs max-w-full min-w-0">
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
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        title={selectedFullLabel}
        className="flex items-center justify-between gap-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200 font-mono text-left"
      >
        {/* Sizer + selected label overlay. The invisible sizer reserves
         *  width for the longest option (capped by truncateClass), and
         *  the visible label is absolutely positioned on top. Keeps the
         *  trigger width fixed so the arrow buttons stay put while
         *  cycling. */}
        <span className="relative inline-block min-w-0 overflow-hidden">
          <span
            aria-hidden
            className={
              'invisible block whitespace-nowrap overflow-hidden' +
              (truncateClass ? ` ${truncateClass}` : '')
            }
          >
            {sizerText || ' '}
          </span>
          <span className="absolute inset-0 flex items-center gap-3 overflow-hidden">
            <span className="truncate min-w-0">{selectedLabel}</span>
            {selectedAside && (
              <span className="ml-auto shrink-0 text-neutral-500">{selectedAside}</span>
            )}
          </span>
        </span>
        <span aria-hidden className="text-neutral-500">▾</span>
      </button>
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
      {popover}
    </label>
  );
}
