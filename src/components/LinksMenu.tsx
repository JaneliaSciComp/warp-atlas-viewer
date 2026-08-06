import { useEffect, useRef, useState } from 'react';
import { isEmbedRequested } from '../utils/urlState';

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

export function LinksMenu({
  align = 'right',
  variant = 'text',
}: {
  /** Which edge of the button the dropdown is anchored to. The header places
   *  this button near the viewport's right edge, where a left-anchored menu
   *  would run off-screen; the embedded sidebar places it near the LEFT edge
   *  of a ~360px column, where a right-anchored menu extends leftward out of
   *  the sidebar and under the collapse rail. Hence per-call-site. */
  align?: 'left' | 'right';
  /** 'text' is the labelled "Links ⌄" button used in the standalone header.
   *  'icon' is a hamburger, used in the embedded sidebar where the menu sits
   *  left of the title rather than in a row of its own. Same menu either way;
   *  the accessible name stays "Links" so both read the same to a screen
   *  reader (and to the tests). */
  variant?: 'text' | 'icon';
} = {}) {
  const docsUrl = import.meta.env.VITE_WARP_DOCS_URL;
  const links = [
    // Embedded mode runs in an iframe on mapzebrain.org, so the first entry is
    // an escape hatch to the standalone viewer: the live URL minus `?embed`, so
    // the hash carries the current view over to the new tab. Read at render
    // time, which for a menu that only renders while open is the hash as of
    // opening it.
    ...(isEmbedRequested(window.location.search)
      ? [{ text: 'Open full viewer', href: fullViewerHref() }]
      : []),
    ...(docsUrl ? [{ text: 'Documentation', href: docsUrl }] : []),
    ...STATIC_LINKS,
  ];

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
        aria-label={variant === 'icon' ? 'Links' : undefined}
        title={variant === 'icon' ? 'Links' : undefined}
        className={
          variant === 'icon'
            ? 'flex items-center p-1 rounded text-neutral-100 hover:bg-neutral-800'
            : 'flex items-center gap-1 px-2 py-1 text-sm font-medium text-neutral-100'
        }
      >
        {variant === 'icon' ? (
          <HamburgerIcon />
        ) : (
          <>
            Links
            <ChevronDownIcon />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={
            'absolute top-full mt-1 min-w-[180px] bg-neutral-900 border border-neutral-700 rounded shadow-lg z-50 py-1 ' +
            (align === 'left' ? 'left-0' : 'right-0')
          }
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:bg-neutral-800 hover:text-link"
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

// `?embed` present-but-empty also counts as on (see isEmbedRequested), so this
// deletes the param rather than setting embed=0.
function fullViewerHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('embed');
  return url.toString();
}

// Three horizontal lines, same 24×24 / 2px-stroke / round-cap geometry as the
// chevron below so the two triggers read as one family. Sized to the two-line
// title block it sits beside in the embedded sidebar. Exported because the
// collapsed orientation bar uses the same glyph for the same job — "the
// controls that no longer fit are in here" — and two hamburgers that don't
// match would read as two different affordances.
export function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
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
