import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';

export interface SearchOption {
  value: number;
  label: string;
}

/** Searchable combobox built on cmdk. Used for long dropdowns (the
 *  112-region atlas) where the native `<select>`'s first-letter
 *  type-ahead isn't enough. Closed state visually mirrors the Select
 *  in shared.tsx so the Anatomy card reads as one consistent control
 *  set; the open state replaces the native picker with a search input
 *  + filtered list.
 *
 *  The control is intentionally minimal — no virtualization, no fuzzy
 *  weighting beyond cmdk's defaults — because the longest list we feed
 *  it is 112 entries. */
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
  const selectedLabel = selected?.label ?? '';

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
                  'px-2 py-1 text-xs font-mono cursor-pointer text-neutral-300 whitespace-nowrap ' +
                  'data-[selected=true]:bg-neutral-700 data-[selected=true]:text-neutral-100 ' +
                  (o.value === value ? 'text-neutral-100' : '')
                }
              >
                {o.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>,
        document.body,
      )
    : null;

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
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        title={selectedLabel}
        className={
          'flex items-center justify-between gap-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200 font-mono text-left' +
          (truncateClass
            ? ` ${truncateClass} overflow-hidden text-ellipsis whitespace-nowrap`
            : '')
        }
      >
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {selectedLabel}
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
