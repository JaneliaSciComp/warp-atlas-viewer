# WARP Atlas Viewer

Interactive web-based atlas for the [WARP](https://www.biorxiv.org/) dataset — whole-brain co-mapping of gene expression and neuronal activity in larval zebrafish (Marquez-Legorreta, Fleishman, Hesselink et al., bioRxiv 2026). The viewer renders ~274,000 neurons as a 3D point cloud and lets you cross-reference each cell's spatial position, gene expression (41 markers), functional cluster (333 molecularly-defined subtypes), and per-stimulus calcium response.

The tool runs entirely in the browser — no backend. It loads typed-array binaries served as static assets and renders the point cloud with a custom Three.js shader, with a linked t-SNE panel and per-selection detail charts.

## What you can do with it

- **Region mode** — colour by one of 16 focal anatomical regions.
- **Gene mode** — colour by spot count for any of the 41 genes (viridis ramp).
- **Cluster mode** — pick one of the 333 named gene-combination clusters (e.g. `pou4f2_cckb`); selected cells render in magenta.
- **Co-coding mode** — pick a gene + a stimulus; cells that are both gene-positive and stimulus-correlated highlight in red. This is the view designed to reproduce the manuscript's headline gene-function findings.
- Drag-select on the t-SNE; click a neuron in 3D to populate the detail panel (gene-expression bar chart, mean ΔF/F trace with stimulus on-windows, per-stimulus correlation).
- Toggle viewer orientation (anterior ↑ vs anterior ←) in the bottom-right corner.

## Tech stack

- **Vite** + **TypeScript** + **React 18**
- **Three.js** via `@react-three/fiber` + `@react-three/drei` for the point cloud
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

The raw WARP dataset is hosted on Figshare (private link) and is ~25 GB compressed / ~60 GB extracted. The `download.sh` script handles the AWS WAF cookie dance:

```bash
./download.sh
```

If the cookie has expired you'll need to refresh it from a browser (open the Figshare link in DevTools, copy the new `aws-waf-token` into `download.sh`'s `COOKIE` variable). The script unzips into `./data/`, which after extraction looks like:

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

Output: `preprocessed/neurons.json` (manifest) plus 10 `.bin` files (~210 MB total).

### 3. Run the dev server

```bash
npm run dev
```

The app will be at `http://localhost:5173/`. The dev server is bound to `0.0.0.0`; if you need to access it externally, add your hostname to `server.allowedHosts` in `vite.config.ts`.

If `./preprocessed/neurons.json` is missing (e.g. you skipped step 2 to demo the UI), the app falls back to a 10k-neuron synthetic mock dataset automatically.

### Production build

```bash
npm run build       # outputs to ./dist
npm run preview     # serves the built bundle locally for sanity check
```

The preprocessed binaries need to be served alongside `dist/`; copy `./preprocessed/` next to it on whatever host you deploy to.

## Project layout

```
src/
  App.tsx                           top-level grid layout
  main.tsx                          entry point
  components/
    BrainViewer.tsx                 3D point cloud + custom shader, hover/click pick
    DetailPanel.tsx                 sidebar: gene bar chart, activity trace, stim corr
    FilterControls.tsx              region/gene/cluster/co-coding mode toggles
    UmapPanel.tsx                   2D t-SNE scatter with linked drag-select
    ColorLegend.tsx                 mode-aware legend (top right of viewer)
  shaders/
    neuron.vert.glsl, neuron.frag.glsl
  data/
    types.ts                        NeuronDataset interface
    dataLoader.ts                   real-or-mock fallback
    mockData.ts                     synthetic fallback dataset
  utils/
    coloring.ts                     single-pass per-neuron colour/alpha/size fill
    colorMaps.ts                    viridis, region palette, bivariate ramp
    constants.ts                    static name lists (mock-mode fallback)
  hooks/
    useNeuronData.ts, useSelection.ts

scripts/
  preprocess.py                     numpy → typed-array preprocessor

data/                               raw figshare dump (gitignored)
preprocessed/                       output of preprocess.py (gitignored)
```

## Notes

- The data and preprocessed binaries are **not** committed (see `.gitignore`); the dataset is shared privately by the manuscript authors.
- The activity-trace x-axis is in seconds. The full 134 s representative cycle contains all 8 stimuli back-to-back — pink shaded bands on the trace plot show each stimulus's on-window.
- Select a cluster like `pou4f2_cckb` in Cluster mode to reproduce the manuscript's "cckb-pou4f2 midbrain population" — ~80% of those cells fall in the optic tectum.

## Troubleshooting

- **"Loading WARP atlas…" never finishes** — open DevTools → Network and check whether `/preprocessed/neurons.json` 200s. If 404, you skipped preprocessing; the app should fall back to mock data, but check the JS console for `[dataLoader]` messages.
- **Bundle warning at build time** about chunks > 500 kB — expected. Three.js + recharts aren't small. Code-splitting is out of scope for the prototype.
- **External hostname blocked by Vite** — add it to `server.allowedHosts` in `vite.config.ts`.
- **Figshare download fails** — the WAF token in `download.sh` rotates; refresh from a browser session.
