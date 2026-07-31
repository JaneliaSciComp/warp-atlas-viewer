# mapZebrain brain models + view-orientation icons ("embedded mode")

**Date:** 2026-07-31
**Status:** approved, ready for implementation planning

## Goal

Bring mapZebrain's three whole-brain reference meshes (outline / fibers / cell
bodies) into the WARP viewer as translucent anatomical context, and add
mapZebrain's seven view-orientation icons above the 3D view. Both are
non-default. This is the first step toward running the WARP viewer inside an
iframe on the mapZebrain site.

Explicitly **not** in this scope:

- The screenshot button from mapZebrain's icon row (deferred; warp already has
  its own `screenshotMode`).
- Per-anatomical-region meshes (the 112-region atlas). Only the three
  whole-brain models.
- Hiding any of warp's own chrome (filter panel, bottom panel, links menu).
  Embedded mode is purely additive this round.
- Any `postMessage` bridge between mapZebrain and the embedded viewer.

## Background: the two coordinate spaces

This was the main risk, and it is resolved: **the two spaces are the same
space.**

mapZebrain's reference volume is `597 × 974 × 359` voxels (LR × AP × DV;
`server/atlas_app/region_mask_decoder.py` declares the TIFF shape as
`(359, 974, 597)`). Region and brain meshes are generated from those TIFF masks
by ImageJ's 3D Viewer (`stl_utils/fiji_script__convert_tif_to_stl.ijm`, with
`setCoordinateSystem false`), which emits vertices in **voxel index units** —
confirmed by the meshes' own bounding boxes:

| mesh | triangles | x range | y range | z range |
|---|---|---|---|---|
| `Outline_new.stl` | 54,874 | 0.3 – 553.4 | 57.6 – 962.7 | −0.1 – 358.3 |
| `Fibers.stl` | 9,758 | 31.4 – 516.6 | 100.3 – 898.9 | 16.5 – 342.7 |
| `Cell bodies.stl` | 9,756 | 24.8 – 526.4 | 67.5 – 942.0 | 0.4 – 352.0 |

WARP's `data/postprocessed/Coords_All.npy` is in those same voxel indices:
column 0 = DV (range 54.3 – 333.1), column 1 = LR (66.8 – 525.1), column 2 = AP
(95.1 – 879.3). `docs/export.md` already describes warp's render coordinates as
"the mapZebrain frame", which this confirms.

### How the axis directions were established

Bounding boxes alone cannot settle the flips — the cell cloud sits nearly
centered in the reference volume, so a flip about the volume center lands almost
on top of itself. Two independent checks were used.

**1. Anatomy, via WARP's own 112-region atlas labels.** Per-region centroids of
the 274,455 valid cells:

- AP (`col2`) grows rostral → caudal: olfactory bulb 134 → telencephalon 180 →
  habenula 237 → pretectum 327 → tectum 410 → superior MO 508 → intermediate MO
  592 → inferior MO 714.
- DV (`col0`) grows ventral → dorsal: pallium 199.5 vs subpallium 155.5; dorsal
  habenula 247.2 vs ventral habenula 239.7; inferior *dorsal* MO 275.9 vs
  inferior *ventral* MO 201.2; hypothalamus/pituitary (most ventral) 74–98 vs
  tectum/cerebellum (most dorsal) 259–270.

**2. Per-AP-slab containment against the outline mesh.** For 40-voxel AP slabs,
compare the cells' [0.5, 99.5] percentile range on an axis against the mesh's
range on that axis; score by how far cells stick out past the mesh, plus the
correlation of the two profiles along AP:

| axis | identity | flipped about volume center |
|---|---|---|
| DV | overshoot **0.00**, corr(hi) **+0.985** | overshoot 23.05, corr(hi) −0.06 |
| AP | overshoot **0.00**, corr(hi) **+0.985** | overshoot 21.30, corr(hi) −0.24 |
| LR | overshoot **0.78** | overshoot 3.67 |

Identity wins on every axis. DV and AP are decisive. LR is directionally
consistent but weak, as expected from near-bilateral symmetry — see
[Open detail: LR handedness](#open-detail-lr-handedness).

Independent corroboration: mapZebrain's own "Dorsal" camera preset sits at
`(0, 0, +800)`, so `+Z` is dorsal in their mesh space — matching WARP's `col0`
direction. And mapZebrain sets `camera.up = (0, −1, 0)` with the comment "the
brain model is flipped", which is exactly the AP negation `preprocess.py`
applies to cells.

### The mesh transform

Identical to what `preprocess.py` already does to cell positions
(`pos -= pos.mean(0)`, then `pos[:, 1] = -pos[:, 1]`):

```
render_x =   stl_x - voxelCenter[0]     # LR
render_y = -(stl_y - voxelCenter[1])    # AP, negated so rostral is +Y
render_z =   stl_z - voxelCenter[2]     # DV
```

`voxelCenter` is the float32 mean of the cell cloud in raw voxel coordinates:
`[283.79010009765625, 463.4828186035156, 219.79554748535156]`. It must **not**
be hardcoded in two places — `preprocess.py` emits it into `neurons.json` and
the mesh script reads it back, so the mesh center can never drift from the cell
center.

Verified: applying this transform reproduces the manifest's cell bounds exactly,
and puts the outline mesh strictly around the cell cloud on all six faces.

| axis | cells | outline mesh |
|---|---|---|
| x | −217.04 … 241.32 | −283.5 … 269.6 |
| y | −415.79 … 368.36 | −499.2 … 405.9 |
| z | −165.54 … 113.32 | −219.9 … 138.5 |

That six-face containment is the script's self-check.

## Architecture

### Unit 1 — `scripts/fetch_meshes.py` (new)

**What it does.** Downloads the three STLs, transforms them into warp render
space, writes one Float32 vertex blob per mesh plus a manifest.

**How you use it.** `python3 scripts/fetch_meshes.py`, after
`scripts/preprocess.py` has run at least once.

**What it depends on.** Network access to `api.mapzebrain.org` (CORS is open,
`Access-Control-Allow-Origin: *`, but this script runs server-side so that only
matters for the discarded runtime-fetch option); `preprocessed/neurons.json` for
`voxelCenter`; NumPy.

Sources:

```
https://api.mapzebrain.org/media/Brains/Outline/Outline_new.stl
https://api.mapzebrain.org/media/Brains/Fibers/Fibers.stl
https://api.mapzebrain.org/media/Brains/Cell_bodies/Cell%20bodies.stl
```

Outputs, alongside the existing blobs:

```
preprocessed/meshOutline.bin.gz      1.98 MB raw float32
preprocessed/meshFibers.bin.gz       0.35 MB
preprocessed/meshCellBodies.bin.gz   0.35 MB
preprocessed/meshes.json             manifest
```

Format: non-indexed `Float32Array` of vertex positions, 9 floats per triangle,
gzipped — the same `.bin.gz` convention as every other blob, so the existing
decompression path is reused verbatim.

Vertices are **not** welded into an indexed geometry. Welding would roughly
halve the payload and allow smooth normals, but flat facet normals are what
mapZebrain itself renders, and 2.7 MB is negligible next to the existing
~125 MB of cell data. Mark with a `ponytail:` comment naming the upgrade path.

`meshes.json` shape:

```json
{
  "version": 1,
  "source": "https://mapzebrain.org — Kunst et al., 2019",
  "voxelCenter": [283.79010009765625, 463.4828186035156, 219.79554748535156],
  "meshes": {
    "outline":    { "file": "meshOutline.bin.gz",    "triangles": 54874, "color": "#dddcdf" },
    "fibers":     { "file": "meshFibers.bin.gz",     "triangles": 9758,  "color": "#dddcdf" },
    "cellBodies": { "file": "meshCellBodies.bin.gz", "triangles": 9756,  "color": "#dddcdf" }
  }
}
```

**Why a separate manifest rather than adding keys to `neurons.json`:** it keeps
`dataLoader.parseManifest` / `validateManifest` / `binaryFileKeys` /
`expectedBytes` completely untouched, so the primary load path carries zero
regression risk; and it keeps the meshes out of the upfront parallel fetch, so
they cost nothing until a user turns one on.

**Self-check.** The script asserts, after transforming, that each mesh's
bounding box is finite, that the triangle count matches the STL header, and that
the outline mesh's bounding box contains `neurons.json`'s cell bounds on all six
faces. It exits non-zero with the offending axis named if not. This is the one
check that would catch a coordinate-transform regression.

### Unit 2 — `src/data/meshLoader.ts` (new)

**What it does.** Lazily fetches `meshes.json` once, then fetches and decodes
individual mesh blobs on demand, returning `Float32Array` position buffers.

**How you use it.** `await loadMeshManifest()`, `await loadMesh('outline')`.
Results are cached in module scope; a second call for the same mesh returns the
cached buffer.

**What it depends on.** `streamBin` from `dataLoader.ts` (currently
module-private — export it; no behavioural change).

Failure handling: a missing or unparseable `meshes.json` resolves to `null`
rather than throwing, so the Settings section can render a disabled state with a
"run `scripts/fetch_meshes.py`" hint. Mock mode (`?mock=1`) has no
`preprocessed/` at all and takes the same path. A blob that 404s or fails
length validation surfaces as an inline error on that one mesh's row, leaving
the other two usable.

### Unit 3 — `src/components/brain/BrainMeshes.tsx` (new)

**What it does.** Renders the enabled meshes inside the R3F `Canvas`, plus the
two lights they need.

**How you use it.** `<BrainMeshes settings={settings} />` as a child of
`<Canvas>` in `BrainViewer`.

**What it depends on.** `meshLoader`, `skipAmbientOcclusionUserData` from
`AmbientOcclusion.tsx`, `BRAIN_MESH_GROUP_NAME` from `sceneObjectNames.ts`.

- Loads a mesh the first time its toggle goes true; keeps the geometry cached
  afterward so re-toggling is instant.
- `BufferGeometry` with a `position` attribute, then `computeVertexNormals()`
  (flat facet normals on non-indexed geometry — matches mapZebrain).
- `MeshPhongMaterial`: `color` from the manifest (`#dddcdf`, mapZebrain's own
  value for all three), `transparent: true`, `opacity` from settings,
  `side: THREE.DoubleSide` (the shell is seen from inside), `depthWrite: false`,
  and `renderOrder` above the point cloud. mapZebrain uses `depthTest: false`;
  `depthWrite: false` plus render order gets the same "tints over everything"
  read while still letting the point cloud depth-sort against itself. This is a
  tuning knob to settle against the real render, not a fixed decision.
- `userData: { ...skipAmbientOcclusionUserData }` so SAO doesn't paint dark rims
  on the shell.
- All three meshes live under a single `<group name={BRAIN_MESH_GROUP_NAME}>`
  so other passes can hide them with one lookup.
- Disposes geometries and materials on unmount.

**Lights.** Warp's scene currently has **no lights at all** — the point cloud
uses raw `ShaderMaterial`, so nothing needed them. A lit material would render
black. `BrainMeshes` therefore renders one `<ambientLight>` and one
`<directionalLight>` (fixed world direction, dorsal-ish, so orbiting gives a
shape cue). Lights cannot affect the point cloud, so this is safe.

### Unit 4 — pass integration (edits to existing files)

Two existing passes render the whole scene and will silently misbehave
otherwise.

1. **`usePointCloudPicking.ts`** does `scene.overrideMaterial = idMaterial;
   gl.render(scene, camera)`. A shell mesh in that scene gets drawn into the ID
   render target and depth-occludes cells behind it, so hovering through the
   shell would report the wrong cell or none. Fix: hide
   `BRAIN_MESH_GROUP_NAME` for the duration of the ID pass, using the same
   save/restore `prevVisible` pattern already there for the context and marker
   objects.
2. **`AmbientOcclusion.tsx`** — no code change needed; the existing
   `skipAmbientOcclusion` userData opt-out is honoured by its
   `renderOverride`, and `BrainMeshes` sets it.

`ProjectionRenderPass` needs **no change**: its step-1 context pass renders the
scene with the projection points and focus marker hidden, so the shells appear
as context underneath the composited projection, which is where they belong.
Verify this rather than assume it.

### Unit 5 — `src/components/brain/viewPresets.ts` (new)

**What it does.** Declares the seven orientation presets as `(position, up)`
pairs derived from the camera distance.

**How you use it.** `VIEW_PRESETS.map(p => ...)` in the icon bar;
`presetPosition(preset, D)` returns the camera position.

**What it depends on.** Nothing but the distance `D`, which the caller passes
(`defaultCamPosition[2]`, i.e. `span × 0.95 ≈ 745`).

mapZebrain's hardcoded quaternions/positions are **not** ported. They live in
mapZebrain's camera frame (`up = (0, −1, 0)`, AP sign opposite to warp's), so
copying them would be both wrong and opaque. Derived in warp space instead —
where `+X`/`−X` are the lateral axes, `+Y` is rostral, `+Z` is dorsal:

| label | position | up |
|---|---|---|
| Dorsal | `(0, 0, +D)` | `(0, 1, 0)` |
| Ventral | `(0, 0, −D)` | `(0, 1, 0)` |
| Sagittal (vertical-left) | `(−D, 0, 0)` | `(0, 1, 0)` |
| Sagittal (vertical-right) | `(+D, 0, 0)` | `(0, 1, 0)` |
| Sagittal (horizontal-left) | `(−D, 0, 0)` | `(0, 0, 1)` |
| Sagittal (horizontal-right) | `(+D, 0, 0)` | `(0, 0, 1)` |
| Coronal | `(0, +D, 0)` | `(0, 0, 1)` |

"Dorsal" is identical to warp's existing default camera, so that icon and the
existing "reset view" button do the same thing — as in mapZebrain, where the
dorsal icon calls `resetCameraControls()`.

"Vertical" means rostral-up (up along the AP axis); "horizontal" means dorsal-up
(up along the DV axis), matching mapZebrain's icon naming. Coronal views from
the rostral side, matching mapZebrain's coronal preset.

No preset has `up` parallel to its view direction, so none is degenerate.

### Unit 6 — `cameraControls.tsx` change: `resetRef` → `applyViewRef`

`CameraSync` currently exposes `resetRef.current()`, which snaps to
`defaultCamPosition` with `up = (0, 1, 0)`, clears the screen pan, and clears
the projection view offset. Generalise it to
`applyViewRef.current(position, up)` doing exactly the same work with the
position and up passed in. The existing "reset view" button becomes its first
caller with `(defaultCamPosition, [0, 1, 0])`; the icon bar is the second.

One function, two callers — no new abstraction, and the duplication that a
separate "apply preset" path would have introduced never exists.

Downstream behaviour comes for free: `onAtDefaultChange` starts reporting false
after a non-dorsal preset, so the "reset view" button appears; and `CameraSync`'s
per-frame emit pushes the new camera into the URL hash through the existing
debounce.

### Unit 7 — settings + activation

New fields on `SettingsState`:

| field | default | in URL hash? |
|---|---|---|
| `embeddedMode` | `false` | **no** |
| `brainOutline` | `false` | yes |
| `brainFibers` | `false` | yes |
| `brainCellBodies` | `false` | yes |
| `brainOutlineOpacity` | `0.2` | yes |
| `brainFibersOpacity` | `0.2` | yes |
| `brainCellBodiesOpacity` | `0.2` | yes |

Per-mesh opacity (rather than one shared slider) matches mapZebrain's Brain
Models tab, which is what was asked for. Defaults of 0.2 are mapZebrain's
`defaultOpacity`.

`embeddedMode` follows the `screenshotMode` precedent exactly: it is an
ephemeral presentation/deployment mode, so `useUrlSync` deletes it from the
settings diff and `urlState.ts` does not restore it. The mesh toggles and
opacities are ordinary shareable view state and go through the normal
`validateSettings` clamping (booleans, and `clamp(opacity, 0, 1)`).

Activation: `?embed=1` seeds `embeddedMode` at startup — same query-param
convention as the existing `?mock=1` (`isMockRequested` in `dataLoader.ts`), and
what an iframe `src` needs. A Settings checkbox toggles it by hand for
development.

### Unit 8 — UI

**`src/components/brain/ViewOrientationBar.tsx` (new).** An absolutely
positioned row at the top-centre of the `BrainViewer` container div (outside
the `Canvas`), `pointer-events-auto`, seven icon buttons with `title`
tooltips, each calling `applyViewRef.current(...)`. Rendered only when
`settings.embeddedMode && !settings.screenshotMode`. Positioned
`top-2 left-1/2 -translate-x-1/2` so it does not collide with the existing
`top-2 left-2` overlay stack (projection pill, reset-view button).

**Icons.** mapZebrain's seven `.webp` files from
`client/src/assets/imgs/3d_view_icons/` (~13 KB total: `dorsal`, `ventral`,
`vertical_left_sagittal`, `vertical_right_sagittal`, `left_sagittal`,
`right_sagittal`, `coronal`) are copied into `images/` and imported as URLs —
the pattern `src/utils/stimAssets.ts` already uses for the stimulus SVGs. Using
mapZebrain's own artwork is deliberate: the point is visual continuity when the
viewer is embedded in their page. `screenshot.webp` and `settings.webp` are not
copied.

**Settings section.** A new "Brain models" `<section>` in `SettingsTab.tsx`,
always present, following the existing section idiom (uppercase tracking-wider
header, description `<p>` that the show-descriptions toggle hides, control
rows). Three rows, each a checkbox plus an opacity slider, rendered from one
shared row component over a table of the three mesh keys. When the mesh
manifest is unavailable the rows render disabled with the "run
`scripts/fetch_meshes.py`" hint. The `embeddedMode` checkbox goes in the same
section (it gates the icon bar, which is the other half of this feature).

**About tab attribution.** A new `<section>` in `AboutTab.tsx` before the
"Code" section, crediting mapZebrain for the brain meshes and the orientation
icons, linking `https://mapzebrain.org` and citing *Kunst et al., 2019* — the
same citation form `docs/glossary.md` and `docs/preprocess.md` already use for
the 112-region atlas.

## Interaction with existing features

**Region selection does not collide.** Warp's Anatomy card filters *cells* by
mapZebrain region membership (`atlasRegionMask`); mapZebrain's 3D view selects
*region meshes*. This feature adds only the three whole-brain models, which are
not regions and are not selectable — they are inert context geometry. Nothing
in the Anatomy card, `useEffectiveSelection`, or the focus/lasso paths changes.

**Picking through the shell** keeps working because the shells are hidden during
the ID pass (Unit 4). A translucent shell in front of a cell tints it but does
not block the click, which matches mapZebrain's behaviour.

**Default view is unchanged.** All three mesh toggles default off, so a user who
never opens Settings sees byte-identical rendering. `embeddedMode` defaults off,
so the icon bar does not exist. No layout, panel, or chrome change.

## Testing

1. **`scripts/fetch_meshes.py` self-check** (in-script asserts, exits non-zero
   on failure) — triangle counts match the STL headers; transformed bounding
   boxes are finite; the outline mesh contains `neurons.json`'s cell bounds on
   all six faces. This is the check that matters: it is the only thing standing
   between a silent coordinate regression and a brain drawn in the wrong place.
2. **`src/components/brain/viewPresets.test.ts`** (vitest, pure math, no DOM) —
   for each preset, assert `|position| == D`, assert `up` is a unit vector not
   parallel to the view direction, and assert the resulting camera basis is
   right-handed and orthonormal. Plus one anatomical assertion per axis: the
   dorsal preset looks along `−Z` with screen-up `+Y` (dorsal view, rostral up);
   the coronal preset looks along `−Y` with screen-up `+Z` (coronal, dorsal up).
3. **`npm run check`** (`tsc --noEmit && eslint . && vitest run && vite build`)
   must pass.
4. **Manual, in the browser** — see the verification list below.

## Manual verification checklist

- With no settings touched, the 3D view is unchanged.
- Enabling the outline draws a translucent shell that visibly encloses the cell
  cloud with no cells poking through.
- Opacity sliders move each mesh independently.
- Hovering and clicking a cell *through* the shell still focuses the right cell.
- Ambient occlusion on + outline on: no dark rims on the shell.
- Each projection mode + outline on: the shell renders as context under the
  projection, not over it.
- `?embed=1` shows the icon bar; without it, no bar.
- Each of the seven icons produces the anatomically correct view.
- Screenshot mode hides the icon bar.
- Reload with a shared URL: mesh toggles and opacities restore; `embeddedMode`
  does not.

## Open detail: LR handedness

Which of `±X` is the animal's left is not derivable from the data available.
The brain is near-bilaterally symmetric, so the containment test only weakly
favours identity on LR (overshoot 0.78 vs 3.67 — consistent, not conclusive),
and neither the atlas region names nor the mesh geometry distinguish sides.

Resolution: compare the two sagittal presets against mapZebrain's icon glyphs
in the browser once the bar is wired up. If they are swapped, the fix is
exchanging two labels in `viewPresets.ts`. This is called out as an explicit
verification step rather than left as an unexamined assumption, because a
silently mirrored left/right is exactly the kind of error nobody notices until
it is in a figure.

## Attribution

The brain meshes and the orientation icons are mapZebrain's work
(<https://mapzebrain.org>, *Kunst et al., 2019*). Credit goes in the About tab,
the README, and the docs site. Since the purpose of this feature is embedding
the viewer into mapZebrain's own site, reuse is presumably welcome — but confirm
with the mapZebrain team before this ships publicly.

## Documentation

- `README.md` — `scripts/fetch_meshes.py` in the setup/preprocess sequence;
  brain models and embedded mode in the feature list.
- `docs/preprocess.md` — a "Brain meshes" section: sources, the transform, the
  self-check.
- `docs/ui/viewer.md` — the orientation icon bar and embedded mode.
- `docs/settings.md` — the Brain models section.
- `docs/sharing.md` — which of the new settings ride in the URL hash.

## Future work (not this change)

- Screenshot icon in the bar, if warp's own `screenshotMode` proves
  insufficient for the embedded context.
- Hiding warp's panels in embedded mode — decide after seeing the viewer in a
  real mapZebrain iframe.
- A `postMessage` bridge: mapZebrain's selected region driving warp's Anatomy
  filter, and warp's focused cell reported back. This is the natural seam for
  the two region-selection models to meet, and it wants its own spec.
- Per-region meshes for the 112-region atlas, if region-shaped context is
  wanted beyond the whole-brain models.
- Vertex welding + smooth normals in `fetch_meshes.py`, if the ~2.7 MB payload
  or the faceted look ever matters.
