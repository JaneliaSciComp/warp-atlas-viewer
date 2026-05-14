import { useEffect, useRef, useState } from 'react';

// External resources surfaced from the viewer header. Mirrors the docs
// site's nav "Links" dropdown so the two share the same out-of-app
// destinations. The Documentation entry is prepended at runtime when
// `VITE_WARP_DOCS_URL` is set; without it, the entry is omitted so a
// build with no docs site doesn't ship a broken link.
const STATIC_LINKS: Array<{ text: string; href: string }> = [
  { text: 'Paper (bioRxiv)', href: 'https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1' },
  { text: 'Source code',     href: 'https://github.com/JaneliaSciComp/warp-atlas-viewer' },
  { text: 'Dataset (Figshare)', href: 'https://figshare.com/s/d1d19b105c4f74865c32' },
];

// Small delay before closing on mouseLeave so the user can slide the
// cursor from the button into the menu without it disappearing.
const CLOSE_DELAY_MS = 100;

export function LinksMenu() {
  const docsUrl = import.meta.env.VITE_WARP_DOCS_URL;
  const links = docsUrl
    ? [{ text: 'Documentation', href: docsUrl }, ...STATIC_LINKS]
    : STATIC_LINKS;

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  // Close on Escape (keyboard accessibility) and on outside click (for
  // touch users who tapped the button to open and want to dismiss).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Clear any pending close timer on unmount.
  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className="relative"
      ref={containerRef}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-yellow-300 hover:text-yellow-200"
      >
        Links
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] bg-neutral-900 border border-neutral-700 rounded shadow-lg z-50 py-1"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:bg-neutral-800 hover:text-yellow-300"
            >
              <span>{l.text}</span>
              <ExternalLinkIcon />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Mirrors VitePress's .vpi-chevron-down icon (24×24, round caps, 2px
// stroke). Pure CSS rotation is avoided in favor of the down-pointing
// path so the markup stays self-explanatory.
function ChevronDownIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Matches the docs-site convention of marking external links with a
// small NE-pointing arrow. Inherits color from the surrounding text so
// it picks up hover state without extra styling.
function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M7 17 L17 7" />
      <path d="M8 7 H17 V16" />
    </svg>
  );
}
