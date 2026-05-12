# WARP Atlas Viewer

Interactive web-based atlas for the [WARP](https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1) dataset — whole-brain co-mapping of gene expression and neuronal activity in larval zebrafish (Marquez-Legorreta, Fleishman, Hesselink et al., bioRxiv 2026). The viewer renders ~274,000 neurons pooled from 3 fish as a 3D point cloud and lets you cross-reference each cell's spatial position, gene expression (41 markers), functional cluster (333 molecularly-defined subtypes), and per-stimulus calcium response.

The tool runs entirely in the browser — no backend. It loads typed-array binaries served as static assets and renders the point cloud with a custom Three.js shader, with a linked t-SNE panel and per-selection detail charts.

## What you can do with it

Three filter cards (**Transcriptomics × Visual Stimuli × Anatomy**) combine with logical AND to keep a subset of cells visible. A fourth card (**Colors**) decides how the visible cells are painted. Anything left at "all" stops filtering.

- **Colors** — pick how cells are painted:
  - *Simple* — single-color highlight (everything visible cell-shaded the same).
  - *Region* — categorical palette over 16 focal anatomical regions.
  - *Gene expression* — plasma ramp over FISH spot counts. With no gene pinned the ramp shows **gene richness** (how many of the 41 panel genes each cell expresses). Pin a single gene to get its classic spot-count map; pin multiple to drive *max / sum / richness* (chosen in Settings). Toggle log ↔ linear scale.
  - *Stim correlation* — plasma ramp over Pearson r against the selected stimulus regressor. With no stim picked, max r across all 8 stimuli; with one picked, that stim's r; with several, max across the picks.
  - *Activity* — plasma ramp over the mean ΔF/F trace at a scrubbable time point; an inline play button steps through the 134 s representative cycle (1×–100× speed).
  - *Specimen* — categorical palette over the 3 source fish.
- **Transcriptomics** — keep cells expressing one or more genes (combined with OR / AND), or cells in a single named subtype (e.g. `pou4f2_cckb`).
- **Visual Stimuli** — keep cells responsive to one or more of 8 stimuli (OR / AND); icons render the stimulus identity. Responsiveness threshold is tunable in Settings.
- **Anatomy** — isolate one of 16 regions and/or one of 3 fish specimens.

Selections are independent of filters:

- Click a neuron in the 3D viewer to focus it — the Detail panel shows that one cell (gene bar chart, mean ΔF/F trace with stimulus on-windows shaded, per-stimulus correlation).
- Drag in the t-SNE to lasso-select a group; the lasso highlights the same cells in 3D.
- Lasso / focus survive every filter change; the Detail panel falls back to the filter intersection when nothing's user-selected.

URL hash mirrors the full app state (filters, settings, camera, t-SNE viewport, lasso polygon, focused neuron) so any view you arrive at is shareable by copying the URL.

A **Help** tab in the bottom panel includes one-click presets that reproduce specific findings from the paper.

## Tech stack

- **Vite** + **TypeScript** + **React 18**
- **Three.js** via `@react-three/fiber` + `@react-three/drei` for the 3D point cloud
- **recharts** for the detail-panel charts
- **Tailwind CSS** for layout
- Data is preprocessed Python → typed-array `.bin` blobs + a JSON manifest

No backend, no database, no auth. Everything is static files plus client-side rendering.

## Prerequisites

- Node.js ≥ 18 (developed against 22)
- Python ≥ 3.10 with NumPy (only needed for the one-time preprocessing step)
- ~30 GB free disk for the source dataset; ~210 MB for the preprocessed binaries

## Setup

```bash
git clone <this repo>
cd warp-website-prototype
npm install
```

### 1. Download the source data

The raw WARP dataset is hosted on Figshare. Open the share link from the paper's data-availability statement in a browser and download the archive manually:

> Figshare: <link from the WARP paper's data-availability section>

Extract the archive into `./data/` so the layout looks like:

```
data/
  Fish1/, Fish2/, Fish3/    raw per-fish folders (gene spot counts, ephys, masks, ...)
  postprocessed/            cell-level analysis arrays from the manuscript pipeline
```

### 2. Preprocess

The viewer doesn't load the `.npy` files directly — `scripts/preprocess.py` converts them to typed-array `.bin` blobs (positions, gene matrices, traces) plus a JSON manifest, and writes everything to `./preprocessed/`:

```bash
python3 scripts/preprocess.py
```

What it does:

- Filters to the 274,455 cells with valid coordinates.
- Reorders coords (z, x, y) → (x, y, z), centers on origin, flips the AP axis so anterior renders at the top.
- Aligns cluster labels to names (`cluster_labelsAll2`, not the permuted `cluster_labelsAll3`).
- Recovers the Brain_reg → anatomy mapping from the 112-region atlas overlap.
- Boxcar-downsamples activity traces 2× (268 → 134 timepoints, 2 Hz → 1 Hz) to halve the wire size.
- Computes stimulus on-windows in seconds from the regressor traces.

Output: `preprocessed/neurons.json` (manifest) plus ~10 `.bin` files (~210 MB total).

### 3. Run the dev server

```bash
npm run dev
```

The app will be at `http://localhost:5173/`. The dev server is bound to `0.0.0.0`; if you need to access it externally, add your hostname to `server.allowedHosts` in `vite.config.ts`.

If `./preprocessed/neurons.json` is missing the app surfaces an error rather than silently substituting fake data. To demo the UI without preprocessing, append `?mock=1` to the URL (e.g. `http://localhost:5173/?mock=1`) and the app will load a 10k-neuron synthetic atlas.

### Production build

There are two flavours of build, depending on what you want.

**`npm run build`** — JS/CSS bundle only. Outputs to `./dist/`. The
preprocessed binaries are *not* copied; the bundle expects them to be
served at `./preprocessed/` relative to `index.html`. Use this if you're
managing the data files separately.

**`npm run bundle`** — fully self-contained static bundle. Runs `npm
run build`, then copies `./preprocessed/` into `./dist/preprocessed/`.
The result (~211 MB) is a single directory you can `tar`/`zip`/`rsync`
to any static host. `index.html` uses relative paths everywhere, so it
works at any deploy URL — `https://example.com/`,
`https://example.com/warp/`, etc. — without reconfiguration.

```bash
npm run bundle      # full self-contained bundle in ./dist
```

Sanity-check it locally:

```bash
npx serve dist      # or any static-file server, then open the URL it prints
```

> Note: opening `dist/index.html` directly via `file://` will not work — the
> browser blocks `fetch()` of local files. Always serve over HTTP.

`npm run preview` also works for the JS-only build (`npm run build`),
but you'd need to put `preprocessed/` next to `dist/` for it to find
the data.

## Project layout

```
src/
  App.tsx                           top-level grid layout, URL-hash state, selection wiring
  main.tsx                          entry point
  components/
    BrainViewer.tsx                 3D point cloud + custom shader, hover/click pick
    DetailPanel.tsx                 right sidebar: gene bar chart, activity trace, stim corr
    FilterControls.tsx              Filters / Settings / Help tabs and the four filter cards
    UmapPanel.tsx                   2D t-SNE scatter with linked lasso + pan/zoom
    ColorLegend.tsx                 mode-aware legend (top-right of viewer)
  shaders/
    neuron.vert.glsl, neuron.frag.glsl
  data/
    types.ts                        FilterState / SettingsState / NeuronDataset
    dataLoader.ts                   real-or-mock fallback
    mockData.ts                     synthetic fallback dataset
  utils/
    coloring.ts                     single-pass per-neuron colour/alpha/size fill
    colorMaps.ts                    plasma, region palette, fish palette
    stimAssets.ts                   stimulus icons and labels
    urlState.ts                     hash codec for shareable URLs
    polygon.ts                      point-in-polygon for t-SNE lasso
    constants.ts                    static name lists (mock-mode fallback)
  hooks/
    useNeuronData.ts                fetches + decodes the .bin blobs
    useColoring.ts                  shared per-cell color/alpha/size buffer
    useSelection.ts                 user-explicit selection state
    useUniqueFishIds.ts             memo for fish-id dropdown

scripts/
  preprocess.py                     numpy → typed-array preprocessor
  bundle.sh                         self-contained `npm run bundle` build

data/                               raw figshare dump (gitignored)
preprocessed/                       output of preprocess.py (gitignored)
```

## Notes

- The data and preprocessed binaries are **not** committed (see `.gitignore`); the dataset is shared by the manuscript authors via Figshare.
- The activity-trace x-axis is in seconds. The full 134 s representative cycle contains all 8 stimuli back-to-back — pink shaded bands on the trace plot show each stimulus's on-window.
- Select a cluster like `pou4f2_cckb` in Transcriptomics → Subtype to reproduce the manuscript's "cckb-pou4f2 midbrain population" — most of those cells fall in the optic tectum. The Help tab has one-click presets for several findings.
- The full app state (filters, settings, camera, t-SNE viewport, lasso polygon, focused neuron) lives in the URL hash, so any view is shareable by copying the URL.

## Troubleshooting

- **"Loading WARP atlas…" never finishes / Error loading data** — open DevTools → Network and check whether `/preprocessed/neurons.json` 200s. If 404, you skipped preprocessing (append `?mock=1` to demo without it). For other failures, check the JS console for `[dataLoader]` messages.
- **Bundle warning at build time** about chunks > 500 kB — expected. Three.js + recharts aren't small. Code-splitting is out of scope for the prototype.
- **External hostname blocked by Vite** — add it to `server.allowedHosts` in `vite.config.ts`.
- **Detail / bottom panels disappeared** — they have collapse handles (the `›` on the right edge and the `⌄` at the bottom of the 3D viewer). Click to toggle.
- **A URL someone shared shows blank state** — share URLs can exceed browser hash caps if the lasso polygon is huge; the app drops the lasso first, then the whole hash, and warns in the console. Re-lasso and re-share.
