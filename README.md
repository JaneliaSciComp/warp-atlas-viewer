# WARP Atlas Viewer

[![CI](https://github.com/JaneliaSciComp/warp-atlas-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/JaneliaSciComp/warp-atlas-viewer/actions/workflows/ci.yml)

Interactive web-based atlas for the [WARP](https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1) dataset, a whole-brain co-mapping of gene expression and neuronal activity in larval zebrafish (Marquez-Legorreta, Fleishman, Hesselink et al., bioRxiv 2026). The viewer renders ~274,000 neurons pooled from 3 fish as a 3D point cloud and lets you cross-reference each cell's spatial position, gene expression (41 markers), functional cluster (333 molecularly-defined subtypes), and per-stimulus calcium response.

The tool runs entirely in the browser, with no backend. It loads typed-array binaries served as static assets and renders the point cloud with a custom Three.js shader, with a linked t-SNE panel and per-selection detail charts.

## What you can do with it

Four filter cards (**Transcriptomics × Visual Stimuli × Swim × Anatomy**) combine with logical AND to keep a subset of cells visible. A fifth card (**Colors**) decides how the visible cells are painted.

- **Colors**: pick how cells are painted.
  - *Simple*: single-color highlight (everything visible is colored yellow).
  - *Region*: categorical palette over 16 focal anatomical regions.
  - *Gene expression*: plasma ramp over FISH spot counts. With no gene pinned the ramp shows **gene richness** (how many of the 41 panel genes each cell expresses). Pin a single gene to see its spot-count map; pin multiple to drive *max / sum / richness* (chosen in Settings). Toggle log ↔ linear scale.
  - *Stim correlation*: divergent coolwarm ramp (blue → neutral → red) over the **signed** Pearson r against the selected visual stimulus regressor, anchored at ±stimLo / stimHi with optional split +/− saturation. With no stim picked, max-|r| across all 8 stimuli (signed); with one picked, that stim's r; with several, the representative r depends on the Visual Stimuli mode (`+ correlated` → max-positive, `- anti-correlated` → min-negative, `± either` / `no filter` → max-|r|).
  - *Swim correlation*: divergent ramp (blue → white → red) over signed Pearson r vs estimated swim power, anchored symmetrically at ±swimLo / ±swimHi.
  - *Activity*: plasma ramp over the mean ΔF/F trace at a scrubbable time point; an inline play button steps through the 134 s representative cycle.
  - *Specimen*: categorical palette over the 3 source fish.
- **Transcriptomics**: keep cells expressing one or more genes (combined with OR / AND), or cells in a single named subtype (e.g. `pou4f2_cckb`).
- **Visual Stimuli**: scope Stim-correlation coloring or keep cells responsive to one or more of 8 stimuli; a mode dropdown picks the direction (`no filter` / `+ correlated` / `- anti-correlated` / `± either`) and multi-stim selections combine with OR / AND. Icons render the stimulus identity. Responsiveness threshold is tunable in Settings.
- **Swim**: keep cells correlated (+ swim-driven) or anti-correlated (− anti-swim) with estimated swim power; magnitude threshold tunable in Settings.
- **Anatomy**: an atlas toggle picks between the 16 paper-focal regions and the 112-region [mapZebrain](https://mapzebrain.org) atlas (the two are alternatives, not stacked) feeding a single region dropdown, plus an independent control to restrict to one of 3 fish specimens.
- **Brain models**: optional translucent mapZebrain reference meshes (brain outline, fibers, cell bodies) drawn as anatomical context around the cells, each with its own visibility toggle and opacity. Off by default; requires the one-time `scripts/fetch_meshes.py` step.
- **Embedded mode** (`?embed=1`): for running the viewer in an iframe on [mapzebrain.org](https://mapzebrain.org). Moves the filter panel to a resizable left sidebar with the t-SNE plot as a tab, drops the page header into that sidebar, adds mapZebrain's nine-icon 3D toolbar (seven orientations plus screenshot and settings), its edge collapse rails, and its accent palette, and opens on mapZebrain's own default orientation (dorsal, brain vertical, rostral up). The standalone layout is unaffected.

Selections are independent of filters:

- Click a neuron in the 3D viewer to focus it; the Detail panel shows that one cell (gene bar chart, mean ΔF/F trace with stimulus on-windows shaded, per-stimulus correlation).
- Drag in the t-SNE to lasso-select a group; the lasso highlights the same cells in 3D.
- Lasso / focus survive every filter change; the Detail panel falls back to the filter intersection when nothing's user-selected.

URL hash mirrors the full app state so any view you arrive at is shareable by copying the URL.

The **Settings** tab includes scalar projection modes for Gene, Activity, Stim, and Swim views, plus point-density, rendering, threshold, and camera controls.

An **About** tab in the bottom panel includes one-click presets that reproduce specific findings from the paper.

## Credits

The whole-brain reference meshes and the view-orientation icons are from
[mapZebrain](https://mapzebrain.org) (*Kunst et al., 2019*), the shared
reference brain this dataset is registered into. The 112-region atlas is
likewise *modified from Kunst et al., 2019*.

## Tech stack

- **Vite** + **TypeScript** + **React 18**
- **Three.js** via `@react-three/fiber` + `@react-three/drei` for the 3D point cloud
- **recharts** for the detail-panel charts
- **cmdk** for searchable long-list controls
- **Tailwind CSS** for layout
- Data is preprocessed Python → typed-array `.bin` blobs + a JSON manifest

No backend, no database, no auth. Everything is static files plus client-side rendering.

## Prerequisites

- Node.js ^20.19.0 or >=22.12.0 (developed against 22.20.0) — install with
  [NVM](https://github.com/nvm-sh/nvm), then run `nvm install && nvm use`
- Python ≥ 3.10 with NumPy (only needed for the one-time preprocessing step)
- ~30 GB free disk for the source dataset; ~125 MB for the preprocessed binaries

## Setup

```bash
git clone git@github.com:JaneliaSciComp/warp-atlas-viewer.git
cd warp-atlas-viewer
npm install
```

### 1. Download the source data

The raw WARP dataset is [hosted on Figshare](https://figshare.com/s/d1d19b105c4f74865c32). Open the link and click the "Download all" button.

Extract the archive into `./data/` so the layout looks like:

```
data/
  Fish1/, Fish2/, Fish3/    raw per-fish folders (gene spot counts, ephys, masks, ...)
  postprocessed/            cell-level analysis arrays from the manuscript pipeline
```

### 2. Preprocess

The viewer doesn't load the `.npy` files directly. Instead, `scripts/preprocess.py` converts them to typed-array `.bin` blobs (positions, gene matrices, traces) plus a JSON manifest, and writes everything to `./preprocessed/`:

```bash
python3 scripts/preprocess.py
```

What it does:

- Filters to the 274,455 cells with valid coordinates and zero-fills any remaining NaN in the activity-trace and stim-correlation arrays.
- Reorders coords (z, x, y) → (x, y, z), centers on origin, and flips the AP axis so rostral is +y in preprocessed space. (Not "top of screen": the viewer then rotates the volume 90° to lay the rostro-caudal axis across the wide 3D panel, so rostral renders at screen-right — see `src/components/brain/volumeTransform.ts`.) Also emits that centering offset as `voxelCenter` in the manifest, so `scripts/fetch_meshes.py` can put the mapZebrain brain meshes through the identical transform.
- Affine-quantizes the activity trace to uint16 over an auto-fit range, halving the trace file size and pushing it below browser per-resource HTTP-cache caps so it persists across reloads. The quantization step (~1e-4) is ~1000× below per-sample measurement noise, so it is effectively lossless. Traces ship at the published 2 Hz sampling rate (268 timepoints per cell over the 134 s mean stimulus cycle).
- Remaps source fish IDs (59 / 63 / 71) to a dense 0 / 1 / 2; fails loudly on any unknown ID rather than silently aliasing it to 0.
- Centers and scales the t-SNE embedding to roughly the [-50, 50] box so the panel's pixel projection doesn't depend on the upstream scale.
- Aligns cluster labels to names: index 0 is "Unassigned", indices 1..332 align one-to-one with the 332 named subtypes (uses `cluster_labelsAll2`, not the permuted `cluster_labelsAll3`).
- Embeds a hand-built Brain_reg → anatomy mapping (16 focal regions plus "Unassigned" at index 0). The mapping was recovered offline by intersecting `Brain_reg` with the 112-region atlas overlap and is hard-coded in the script.
- Packs the 112-region mapZebrain atlas membership matrix into a compact per-cell bitfield (`atlasRegionMask.bin`) and emits the cleaned atlas labels for the searchable region filter.
- Computes stimulus on-windows in seconds from the regressor traces, for the Detail-panel trace overlay bars.
- Gzips every `.bin` to `.bin.gz` so static hosts (GitHub Pages, S3) ship a smaller payload without any server-side compression config. The viewer decompresses each blob in the browser via `DecompressionStream('gzip')`.

Output: `preprocessed/neurons.json` (manifest) plus 12 `.bin.gz` files (~125 MB total).

### 2b. Brain meshes (optional)

```bash
python3 scripts/fetch_meshes.py
```

Downloads mapZebrain's three whole-brain reference meshes (outline, fibers,
cell bodies), converts them into viewer coordinates, and writes
`preprocessed/mesh*.bin.gz` plus `preprocessed/meshes.json` (~0.8 MB total).
Needs network access, and must run after `preprocess.py` — it reads the
`voxelCenter` from `neurons.json` so the meshes land in exactly the same space
as the cells.

Entirely optional: the viewer works without it, and the **Settings → Brain
models** controls simply stay disabled. See
[docs/preprocess.md](docs/preprocess.md) for the coordinate details and the
containment self-check.

### 3. Run the dev server

```bash
npm run dev
```

The app will be at `http://localhost:5173/`. The dev server is bound to `0.0.0.0`; if you need to access it from another host, add the hostname to your local `.env.local` file (see [Local dev-server config](#local-dev-server-config) below).

If `./preprocessed/neurons.json` is missing the app surfaces an error. To demo the UI without preprocessing, append `?mock=1` to the URL (e.g. `http://localhost:5173/?mock=1`) and the app will load a 10k-neuron synthetic atlas.

### Production build

There are two flavours of build:

**`npm run build`**: JS/CSS bundle only. Outputs to `./dist/`. The
preprocessed binaries are *not* copied; the bundle expects them to be
served at `./preprocessed/` relative to `index.html`. Use this if you're
managing the data files separately.

**`npm run bundle`**: fully self-contained static bundle. Runs `npm
run build`, copies `./preprocessed/` into `./dist/preprocessed/`, and
builds the docs site into `./dist/docs/`. The result (~125 MB plus the
app/docs assets) is a
single directory you can `tar`/`zip`/`rsync` to any static host.

The viewer itself uses relative paths everywhere. The embedded docs
site, however, has root-absolute asset URLs baked in at build time
(a VitePress constraint), so for a non-root deployment pass the
deploy subpath as `BASE`:

```bash
bash scripts/bundle.sh                       # deploy at /
BASE=/warp/ bash scripts/bundle.sh           # deploy at /warp/
```

`BASE` is normalized to ensure a leading and trailing slash. If your
docs subpath needs to diverge from the viewer's, set `DOCS_BASE`
explicitly to override the derived default.

> Note: opening `dist/index.html` directly via `file://` will not work,
> because the browser blocks `fetch()` of local files. Always serve over HTTP.

You can sanity-check the distribution locally like this:

```bash
npx serve dist      # or any static-file server, then open the URL it prints
```

`npm run preview` also works for the JS-only build (`npm run build`),
but you'd need to put `preprocessed/` next to `dist/` for it to find
the data.

### Documentation site

End-user documentation for the viewer is in `docs/` and is built
with [VitePress](https://vitepress.dev/). It's a separate static site
from the viewer itself — explainer pages for the UI, the filter cards,
the visualizations, and the data flow, with built-in full-text search.

```bash
npm run docs:dev        # live dev server, defaults to http://localhost:5173/
npm run docs:build      # static site → docs/.vitepress/dist/
npm run docs:preview    # preview the production build locally
```

The dev server uses the same `WARP_ALLOWED_HOSTS` config as the main
app (see [Local dev-server config](#local-dev-server-config)).

For deployment to GitHub Pages at a project subpath (e.g.
`https://JaneliaSciComp.github.io/warp-atlas-viewer/`), set `DOCS_BASE`
at build time so internal links resolve correctly:

```bash
DOCS_BASE=/warp-atlas-viewer/ npm run docs:build
```

Default is `/`, which is correct for root-deployed sites or local
preview. The build output is a self-contained static directory you can
ship to any static host.

### Local dev-server config

Both `npm run dev` (the viewer) and `npm run docs:dev` (the docs site)
read a `.env.local` file at the repo root for per-developer settings
that shouldn't be checked in. Currently the only setting is the list
of hostnames the Vite dev server will accept — useful when running on
a shared workstation or a remote dev VM.

To set up:

```bash
cp .env.local.example .env.local
# edit .env.local — add your dev hostname(s) to WARP_ALLOWED_HOSTS
```

`.env.local` is gitignored. The example file is committed as a
template.

| Variable | Default | Purpose |
|---|---|---|
| `WARP_ALLOWED_HOSTS` | `localhost` | Comma-separated list of hostnames the dev server accepts. Supports Vite's `.example.com` wildcard syntax. |

The shared loader is at `scripts/devEnv.mjs`; both
`vite.config.ts` and `docs/.vitepress/config.ts` import its
`allowedHosts` export.

### Tests, lint, and the check pipeline

```bash
npm test           # one-shot run (vitest), CI-friendly
npm run test:watch # watch mode for development
npm run test:smoke # Playwright browser smoke test against ?mock=1
npm run lint       # ESLint
npm run check      # tsc --noEmit && eslint . && vitest run && vite build
```

`npm test` runs the vitest unit suite against the pure-function
surface: `cellPasses` / `cellInSet` / `anyFilterActive` across the
filter matrix, the URL-hash encode/decode roundtrip plus its schema
rejection, `pointInPolygon` / `cellsInPolygon`, and the
`validateManifest` / `expectedBytes` / `validateBuffer`
data-load invariants. Test files live next to their source as
`*.test.ts`.

`npm run test:smoke` starts a Vite dev server on port 4173 and loads
the mock atlas in Chromium. Install the browser once with
`npx playwright install chromium` if Playwright reports that Chromium is
missing.

`npm run lint` is `eslint-plugin-react-hooks` (classic
`rules-of-hooks` + `exhaustive-deps`) — hook-correctness only, not
stylistic.

`npm run check` is the aggregate gate suitable for CI; everything
needs to pass.

## Project layout

```
src/
  App.tsx                           top-level grid layout, URL-hash state, selection wiring
  main.tsx                          entry point
  components/
    BrainViewer.tsx                 3D point cloud + custom shader, hover/click pick
    DetailPanel.tsx                 right sidebar: gene bar chart, activity trace, stim corr
    FilterControls.tsx              tab shell (Filters / Settings / About)
    UmapPanel.tsx                   2D t-SNE scatter with linked lasso + pan/zoom
    ColorLegend.tsx                 mode-aware legend (top-right of viewer)
    filters/
      ColorsCard.tsx                Colors card + activity-time playback row
      TranscriptomicsCard.tsx       gene multi-select + subtype dropdown
      ActivityCard.tsx              stimulus icons + OR/AND logic
      SwimCard.tsx                  swim-correlation toggles
      AnatomyCard.tsx               region + specimen dropdowns
      SettingsTab.tsx               tunable cutoffs, ramps, projection, point size, etc.
      AboutTab.tsx                  intro + docs link + paper-finding presets
      shared.tsx                    Card / Select / KindToggle / ResetButton
  shaders/
    neuron.vert.glsl, neuron.frag.glsl
  data/
    types.ts                        FilterState / SettingsState / NeuronDataset
    dataLoader.ts                   manifest load + binary fetch; ?mock=1 demo opt-in
    mockData.ts                     synthetic demo dataset (?mock=1 only)
  utils/
    coloring.ts                     single-pass per-neuron colour/alpha/size fill
    colorMaps.ts                    plasma, region palettes, fish palette
    stimAssets.ts                   stimulus icons and labels
    urlState.ts                     hash codec for shareable URLs
    polygon.ts                      point-in-polygon for t-SNE lasso
    constants.ts                    static name lists (used by mock mode)
  hooks/
    useNeuronData.ts                fetches + decodes the .bin blobs
    useColoring.ts                  shared per-cell color/alpha/size buffer
    useSelection.ts                 user-explicit selection state
    useUniqueFishIds.ts             memo for fish-id dropdown

scripts/
  preprocess.py                     numpy → typed-array preprocessor
  bundle.sh                         self-contained `npm run bundle` build
  devEnv.mjs                        loads .env.local for the dev servers

docs/                               VitePress documentation site
  .vitepress/
    config.ts                       nav, sidebar, search, theme wiring
    theme/                          dark-mode CSS overrides
  *.md, ui/*.md, filters/*.md       end-user docs pages

.env.local.example                  template for per-developer config
.env.local                          actual local config (gitignored)
data/                               raw figshare dump (gitignored)
preprocessed/                       output of preprocess.py (gitignored)
```

## Troubleshooting

- **"Loading WARP atlas…" never finishes / Error loading data**: open DevTools → Network and check whether `/preprocessed/neurons.json` 200s. If 404, you skipped preprocessing (append `?mock=1` to demo without it). For other failures, check the JS console for `[dataLoader]` messages.
- **Bundle warning at build time** about chunks > 500 kB: expected. Three.js and recharts each weigh in well over the threshold. Code-splitting is out of scope for the prototype.
- **External hostname blocked by Vite**: add it to `WARP_ALLOWED_HOSTS` in your `.env.local` (see [Local dev-server config](#local-dev-server-config)).
- **Detail / bottom panels disappeared**: they have collapse handles (the `›` on the right edge and the `⌄` at the bottom of the 3D viewer). Click to toggle.
- **A URL someone shared shows blank state**: share URLs can exceed browser hash caps if the lasso polygon is huge; the app drops the lasso first, then the whole hash, and warns in the console. Re-lasso and re-share.
