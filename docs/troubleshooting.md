---
title: Troubleshooting
description: Common failures and how to fix them.
---

# Troubleshooting

## "Loading WARP atlas…" never finishes / "Error loading data"

The viewer tried to fetch the preprocessed dataset and failed.

1. Open DevTools → **Network** tab.
2. Look for `preprocessed/neurons.json`. If it `404`s, the preprocessed bundle is missing — for self-hosted setups, [run preprocessing](/preprocess) first.
3. To demo the UI without preprocessing, append `?mock=1` to the URL (e.g. `http://localhost:5173/?mock=1`).
4. If `neurons.json` returns 200 but `.bin` files fail, check the JS console for `[dataLoader]` messages — they include the path that failed.

## Bundle warning at build time about chunks > 500 kB

Expected. Three.js and recharts aren't small. Code-splitting is out of scope for the prototype.

## External hostname blocked by Vite

If you're running the dev server and accessing it from a hostname other than `localhost`, Vite blocks the request by default. Add your hostname to `server.allowedHosts` in `vite.config.ts`.

## Detail / bottom panels disappeared

They have collapse handles:

- The **‹** on the right edge of the 3D viewer toggles the Detail panel.
- The **⌄** at the bottom of the 3D viewer toggles the filter strip.

Click either handle to toggle.

## A URL someone shared shows blank state

Share URLs can exceed browser hash caps (~2 KB) if the lasso polygon is huge.

The app handles this in two steps:

1. Drops the lasso polygon, keeps everything else. A warning logs to the console.
2. If still too long, drops the whole hash. Another warning logs.

If you sent the link and the recipient saw blank, re-lasso with simpler vertices and re-copy. See [Sharing views → Caveats](/sharing#caveats).

## Cells look too small / too big

Use **Settings → point size** to bump the base point size in pixels. High-DPI screens often want a value higher than the default. User-selected cells get an extra ×1.5 boost on top.

## Camera orbit feels wrong after a rotation

When **Camera panning** is *on* (Settings), the orbit pivot follows your panned point — which makes orientation easy to lose after a few right-drags.

Fix:

- Turn pan off (**Settings → Camera panning** unchecked) so orbit always pivots around the volume center.
- Or refresh the page (camera resets to default).

## Activity playback looks choppy at 100×

The viewer caps the playback tick rate at ~60 fps and advances multiple samples per tick at high speed multipliers. The motion *looks* less smooth at 100× because the trace is being skipped over at multiple samples per frame — that's intentional, not a bug. Drop to 10× or 50× for the smoothest visual.

## "Gene expression" view is dim everywhere

If **Colors → Gene expression** is selected and the brain looks uniformly dark:

- **No gene is pinned**, and you're in Subtype mode — the scheme falls back to [gene richness](/filters/colors#gene-richness-when-nothing-is-pinned). Try **log scale** in the same card.
- The **Gene plasma ceiling** in Settings may be set too high relative to the dataset's spot counts — values that look small relative to the ceiling map to the dim end. Lower the ceiling.
- The currently pinned gene is genuinely sparse — try `‹ ›` to step through other genes.

## "Stim correlation" view shows nothing

If **Colors → Stim correlation** is selected and (almost) every cell is dim:

- The **responsive floor (r ≥)** is too high. Default is `0.1`; values like `0.3+` will hide most cells.
- You're showing a stimulus with very few responsive cells (some are scarcer than others).
- You're looking at a region of the brain that doesn't carry the modality you're asking about.

## I selected a cluster in Subtype mode but nothing's visible

Some clusters are very small (< 100 cells) and can be hidden by a coincident Anatomy filter. Reset the Anatomy card (or set it to "all") and the cluster should reappear.

## URL didn't share what I expected

Browser address-bar caches can lag. After a state change, **click into the address bar** (or refresh) before copying to make sure the URL reflects the current state. Most of the time this isn't necessary, but during fast Activity playback the URL hash is briefly stale by design.

## Help / Filters / Settings tab is empty after dataset error

If `dataLoader` fails, some cards short-circuit to an empty state to avoid rendering against missing data. Fix the data error first (see top of this page) and the tabs will repopulate on reload.
