# mapZebrain Brain Models + Embedded Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mapZebrain's three whole-brain reference meshes (outline / fibers / cell bodies) to the WARP viewer as toggleable translucent context, plus mapZebrain's seven view-orientation icons and its portrait default camera behind an `?embed=1` "embedded mode" flag.

**Architecture:** A new `scripts/fetch_meshes.py` downloads the meshes from mapZebrain, transforms them into the viewer's preprocessed coordinate space (the identical transform `preprocess.py` applies to cells), and writes gzipped Float32 vertex blobs plus their own `preprocessed/meshes.json` — separate from `neurons.json` so the primary load path is untouched and the meshes stay lazy. A new `BrainMeshes` component renders them inside a group carrying the same rotation/scale as the point cloud. Three existing scene-wide render passes are taught to exclude the meshes. Camera orientation presets are derived analytically in world space rather than ported from mapZebrain's hardcoded quaternions.

**Tech Stack:** Python 3 + NumPy (preprocessing), TypeScript, React 18, Three.js via `@react-three/fiber` / `@react-three/drei`, Vitest, Tailwind. No new dependencies.

**Spec:** `specs/2026-07-31-mapzebrain-brain-models-design.md` — read it before starting. It carries the coordinate-space derivation and the evidence behind it.

## Global Constraints

- **No new npm or Python dependencies.** Everything needed is already installed.
- **The non-embedded default view must not change.** No mesh visible by default, and with `?embed=1` absent the opening camera must be identical to before: `position = [0, 0, span * 0.95]`, `up = (0, 1, 0)`. Keep that literal expression.
- **Three coordinate spaces.** mapZebrain voxel = WARP raw (LR, AP-caudal+, DV-dorsal+) → preprocessed (`positions.bin`: lateral, rostral+, dorsal+) → world (rostral+, lateral, dorsal+). The world hop is the `<group rotation={[0,0,π/2]} scale={[1,-1,1]}>` in `PointCloud.tsx`, which maps `(x,y,z) → (y,x,z)` and is a **mirror** (determinant −1).
- **`voxelCenter` is never hardcoded twice.** `preprocess.py` emits it; `fetch_meshes.py` reads it. Value for reference only: `[283.79010009765625, 463.4828186035156, 219.79554748535156]`.
- **`embeddedMode` is never persisted to the URL hash** — same treatment as the existing `screenshotMode`.
- **Mesh source URLs:**
  - `https://api.mapzebrain.org/media/Brains/Outline/Outline_new.stl`
  - `https://api.mapzebrain.org/media/Brains/Fibers/Fibers.stl`
  - `https://api.mapzebrain.org/media/Brains/Cell_bodies/Cell%20bodies.stl`
- **Attribution is required** in the About tab, README, and docs: mapZebrain, <https://mapzebrain.org>, *Kunst et al., 2019* — the citation form already used in `docs/glossary.md`.
- **Run `npm run check`** (`tsc --noEmit && eslint . && vitest run && vite build`) before every commit that touches TypeScript.
- Commit after every task.

---

### Task 1: Emit `voxelCenter` in the neurons manifest

The mesh script needs the exact float32 mean `preprocess.py` subtracts from cell positions. Emitting it removes any chance of the mesh center drifting from the cell center.

**Files:**
- Modify: `scripts/preprocess.py:197-202` (the coordinate block) and `:296-320` (the manifest dict)

**Interfaces:**
- Consumes: nothing.
- Produces: `preprocessed/neurons.json` gains `voxelCenter: [number, number, number]` — the float32 mean of cell positions in raw mapZebrain voxel units, ordered `(LR, AP, DV)`. Task 2 reads it.

- [ ] **Step 1: Record the current manifest bounds so the re-run can be proved a no-op**

```bash
python3 -c "
import json; m=json.load(open('preprocessed/neurons.json'))
json.dump({'bounds': m['bounds'], 'count': m['count']}, open('/tmp/warp-bounds-before.json','w'))
print(m['bounds'], m['count'])
"
```

Expected output:
```
{'min': [-217.04345703125, -415.7928161621094, -165.5406494140625], 'max': [241.31707763671875, 368.35650634765625, 113.31809997558594]} 274455
```

- [ ] **Step 2: Capture the mean without changing the arithmetic**

In `scripts/preprocess.py`, replace this:

```python
    pos = np.stack([x, y, z], axis=1)
    pos -= pos.mean(axis=0, keepdims=True)
    pos[:, 1] = -pos[:, 1]
```

with this:

```python
    pos = np.stack([x, y, z], axis=1)
    # Mean in raw mapZebrain voxel units, ordered (LR, AP, DV). Emitted in
    # the manifest as voxelCenter so scripts/fetch_meshes.py can put the
    # mapZebrain brain meshes through this identical transform instead of
    # keeping a second copy of the number. pos.mean(axis=0) is the same
    # float32 value the previous keepdims=True form subtracted.
    voxel_center = pos.mean(axis=0)
    pos -= voxel_center[None, :]
    pos[:, 1] = -pos[:, 1]
```

- [ ] **Step 3: Add it to the manifest**

In the same file, in the `manifest = { ... }` dict, immediately after the `'bounds'` line:

```python
        'bounds': {'min': bounds_min, 'max': bounds_max},
        # Raw mapZebrain voxel-space mean subtracted from cell positions
        # above, ordered (LR, AP, DV). scripts/fetch_meshes.py reads this to
        # place the mapZebrain brain meshes in the same space.
        'voxelCenter': [float(v) for v in voxel_center],
```

- [ ] **Step 4: Re-run preprocessing**

Takes several minutes and rewrites ~125 MB into `preprocessed/`.

```bash
python3 scripts/preprocess.py
```

Expected: ends with `[preprocess] wrote manifest to preprocessed/neurons.json`.

- [ ] **Step 5: Verify `voxelCenter` is present and nothing else moved**

```bash
python3 -c "
import json
m = json.load(open('preprocessed/neurons.json'))
before = json.load(open('/tmp/warp-bounds-before.json'))
vc = m['voxelCenter']
assert len(vc) == 3, vc
expected = [283.79010009765625, 463.4828186035156, 219.79554748535156]
for got, want in zip(vc, expected):
    assert abs(got - want) < 1e-6, (vc, expected)
assert m['bounds'] == before['bounds'], (m['bounds'], before['bounds'])
assert m['count'] == before['count']
print('voxelCenter', vc)
print('bounds unchanged, count unchanged - re-run was a no-op')
"
```

Expected: `bounds unchanged, count unchanged - re-run was a no-op`

- [ ] **Step 6: Commit**

```bash
git add scripts/preprocess.py
git commit -m "Emit voxelCenter in the neurons manifest

The raw mapZebrain voxel-space mean subtracted from cell positions,
ordered (LR, AP, DV). scripts/fetch_meshes.py needs it to put the
mapZebrain brain meshes through the same transform as the cells;
emitting it keeps a single source of truth rather than a hardcoded
copy. Arithmetic is unchanged - pos.mean(axis=0) is the same float32
value the previous keepdims=True form subtracted, verified by the
manifest bounds and count being byte-identical after a full re-run."
```

---

### Task 2: `scripts/fetch_meshes.py`

**Files:**
- Create: `scripts/fetch_meshes.py`

**Interfaces:**
- Consumes: `preprocessed/neurons.json` → `voxelCenter`, `bounds` (Task 1).
- Produces: `preprocessed/meshOutline.bin.gz`, `preprocessed/meshFibers.bin.gz`, `preprocessed/meshCellBodies.bin.gz` (gzipped `Float32Array` vertex positions, non-indexed, 9 floats per triangle, little-endian) and `preprocessed/meshes.json` with the shape shown in Step 1. Task 3 reads these.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Download mapZebrain's three whole-brain meshes into viewer coordinates.

The brain outline, fibers, and cell-bodies meshes come from mapZebrain
(https://mapzebrain.org, Kunst et al., 2019) as ASCII STL. Their vertices
are in mapZebrain reference-volume voxel indices (597 x 974 x 359 =
LR x AP x DV) -- the same space as WARP's Coords_All.npy -- so converting
them to the viewer's preprocessed space is exactly the transform
scripts/preprocess.py applies to cell positions:

    out_x =   stl_x - voxelCenter[0]     # LR
    out_y = -(stl_y - voxelCenter[1])    # AP, negated so rostral is +Y
    out_z =   stl_z - voxelCenter[2]     # DV

voxelCenter is read from preprocessed/neurons.json rather than hardcoded,
so the mesh center can never drift from the cell center.

Output is one gzipped Float32 vertex blob per mesh (non-indexed, 9 floats
per triangle) plus preprocessed/meshes.json. Note this is a SEPARATE
manifest from neurons.json: it keeps the primary load path untouched and
lets the viewer fetch meshes lazily, only when a user turns one on.

ponytail: vertices are not welded into an indexed geometry. Welding would
roughly halve the 2.7 MB payload and allow smooth normals, but flat facet
normals are what mapZebrain itself renders and 2.7 MB is noise next to the
~125 MB of cell data. Weld here if either ever matters.

Run after scripts/preprocess.py:

    python3 scripts/fetch_meshes.py
"""

import gzip
import json
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'preprocessed'
MANIFEST = OUT / 'neurons.json'

BASE = 'https://api.mapzebrain.org/media/Brains/'
SOURCE_CREDIT = 'https://mapzebrain.org - Kunst et al., 2019'

# key -> (url, output blob name, display color)
MESHES = {
    'outline': (BASE + 'Outline/Outline_new.stl', 'meshOutline.bin', '#dddcdf'),
    'fibers': (BASE + 'Fibers/Fibers.stl', 'meshFibers.bin', '#dddcdf'),
    'cellBodies': (BASE + 'Cell_bodies/Cell%20bodies.stl', 'meshCellBodies.bin', '#dddcdf'),
}

VERTEX_RE = re.compile(rb'vertex\s+(\S+)\s+(\S+)\s+(\S+)')
# ImageJ 3D Viewer writes e.g. "solid <path> (54874 triangles, 27502 nodes)".
HEADER_TRIS_RE = re.compile(rb'\((\d+)\s+triangles')


def load_voxel_center():
    if not MANIFEST.exists():
        sys.exit(
            f'[fetch_meshes] {MANIFEST} not found. Run scripts/preprocess.py first.'
        )
    manifest = json.loads(MANIFEST.read_text())
    center = manifest.get('voxelCenter')
    if center is None or len(center) != 3:
        sys.exit(
            '[fetch_meshes] neurons.json has no usable voxelCenter. Re-run '
            'scripts/preprocess.py (voxelCenter was added for this script).'
        )
    return np.asarray(center, dtype=np.float32), manifest['bounds']


def fetch_stl(url):
    print(f'[fetch_meshes] GET {url}')
    with urllib.request.urlopen(url, timeout=300) as response:
        if response.status != 200:
            sys.exit(f'[fetch_meshes] {url} returned HTTP {response.status}')
        return response.read()


def parse_stl(raw, key):
    """ASCII STL -> (n_verts, 3) float32 in mapZebrain voxel units."""
    verts = np.array(VERTEX_RE.findall(raw), dtype=np.float32)
    if verts.size == 0:
        sys.exit(f'[fetch_meshes] {key}: no vertices parsed - not ASCII STL?')
    if verts.shape[0] % 3 != 0:
        sys.exit(
            f'[fetch_meshes] {key}: {verts.shape[0]} vertices is not a multiple '
            f'of 3, so the triangle list is malformed'
        )
    header_match = HEADER_TRIS_RE.search(raw[:400])
    if header_match:
        declared = int(header_match.group(1))
        actual = verts.shape[0] // 3
        if declared != actual:
            sys.exit(
                f'[fetch_meshes] {key}: header declares {declared} triangles '
                f'but {actual} were parsed'
            )
    return verts


def to_viewer_space(verts, center):
    """The transform scripts/preprocess.py applies to cell positions."""
    out = np.empty_like(verts)
    out[:, 0] = verts[:, 0] - center[0]
    out[:, 1] = -(verts[:, 1] - center[1])
    out[:, 2] = verts[:, 2] - center[2]
    return out


def check_contains_cells(outline, cell_bounds):
    """The outline mesh must enclose the cell cloud on all six faces.

    This is the check that stands between a silent coordinate-transform
    regression and a brain drawn in the wrong place.
    """
    lo, hi = outline.min(axis=0), outline.max(axis=0)
    cell_lo = np.asarray(cell_bounds['min'], dtype=np.float32)
    cell_hi = np.asarray(cell_bounds['max'], dtype=np.float32)
    if not np.isfinite(lo).all() or not np.isfinite(hi).all():
        sys.exit('[fetch_meshes] outline bounding box is not finite')
    for axis, name in enumerate('xyz'):
        if lo[axis] > cell_lo[axis]:
            sys.exit(
                f'[fetch_meshes] outline mesh does not reach the cells on -{name}: '
                f'mesh min {lo[axis]:.1f} > cell min {cell_lo[axis]:.1f}. '
                f'The coordinate transform is wrong.'
            )
        if hi[axis] < cell_hi[axis]:
            sys.exit(
                f'[fetch_meshes] outline mesh does not reach the cells on +{name}: '
                f'mesh max {hi[axis]:.1f} < cell max {cell_hi[axis]:.1f}. '
                f'The coordinate transform is wrong.'
            )
    print(
        f'[fetch_meshes] containment OK: outline '
        f'{np.round(lo, 1).tolist()} -> {np.round(hi, 1).tolist()} encloses cells '
        f'{np.round(cell_lo, 1).tolist()} -> {np.round(cell_hi, 1).tolist()}'
    )


def main():
    center, cell_bounds = load_voxel_center()
    print(f'[fetch_meshes] voxelCenter (LR, AP, DV) = {center.tolist()}')
    OUT.mkdir(parents=True, exist_ok=True)

    entries = {}
    for key, (url, name, color) in MESHES.items():
        verts = to_viewer_space(parse_stl(fetch_stl(url), key), center)
        if key == 'outline':
            check_contains_cells(verts, cell_bounds)

        # Non-indexed float32 positions, C-contiguous, little-endian to match
        # the Float32Array the browser will wrap it in.
        blob = np.ascontiguousarray(verts, dtype='<f4')
        stale = OUT / name
        if stale.exists():
            stale.unlink()
        path = OUT / (name + '.gz')
        with gzip.open(path, 'wb', compresslevel=6) as f:
            f.write(blob.tobytes())

        triangles = blob.shape[0] // 3
        entries[key] = {'file': name + '.gz', 'triangles': triangles, 'color': color}
        print(
            f'[fetch_meshes] {name + ".gz":22s} {triangles:6d} tris  '
            f'{path.stat().st_size / 1e6:6.2f} MB gz  '
            f'({blob.nbytes / 1e6:6.2f} MB raw)'
        )

    manifest = {
        'version': 1,
        'source': SOURCE_CREDIT,
        'voxelCenter': [float(v) for v in center],
        'meshes': entries,
        'note': (
            'mapZebrain whole-brain meshes in WARP viewer preprocessed '
            'coordinates. Non-indexed float32 vertex positions, 9 floats per '
            'triangle. Render inside a group carrying VOLUME_GROUP_ROTATION '
            'and VOLUME_GROUP_SCALE, same as the point cloud.'
        ),
    }
    (OUT / 'meshes.json').write_text(json.dumps(manifest, indent=2))
    print(f'[fetch_meshes] wrote manifest to {OUT}/meshes.json')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run it**

```bash
python3 scripts/fetch_meshes.py
```

Expected output includes:
```
[fetch_meshes] voxelCenter (LR, AP, DV) = [283.79010009765625, 463.4828186035156, 219.79554748535156]
[fetch_meshes] containment OK: outline [-283.5, -499.2, -219.9] -> [269.6, 405.9, 138.5] encloses cells [-217.0, -415.8, -165.5] -> [241.3, 368.4, 113.3]
[fetch_meshes] meshOutline.bin.gz      54874 tris  ...
[fetch_meshes] meshFibers.bin.gz        9758 tris  ...
[fetch_meshes] meshCellBodies.bin.gz    9756 tris  ...
[fetch_meshes] wrote manifest to preprocessed/meshes.json
```

- [ ] **Step 3: Prove the self-check actually fails on a wrong transform**

A guard that cannot fail is not a guard. Temporarily break the AP negation — change `out[:, 1] = -(verts[:, 1] - center[1])` to `out[:, 1] = verts[:, 1] - center[1]` — then run:

```bash
python3 scripts/fetch_meshes.py; echo "exit=$?"
```

Expected: exits non-zero with a message naming an axis, e.g.
`[fetch_meshes] outline mesh does not reach the cells on -y: ... The coordinate transform is wrong.`

Then **revert the deliberate break** and re-run to confirm it passes again.

- [ ] **Step 4: Verify the blobs decode to the declared sizes**

```bash
python3 -c "
import gzip, json, numpy as np
m = json.load(open('preprocessed/meshes.json'))
for key, e in m['meshes'].items():
    raw = gzip.open('preprocessed/' + e['file'], 'rb').read()
    a = np.frombuffer(raw, dtype='<f4')
    assert a.size == e['triangles'] * 9, (key, a.size, e['triangles'] * 9)
    assert np.isfinite(a).all(), key
    print(f'{key:11s} {e[\"triangles\"]:6d} tris  {a.size:8d} floats  ok')
"
```

Expected: three `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch_meshes.py
git commit -m "Add scripts/fetch_meshes.py for the mapZebrain brain meshes

Downloads mapZebrain's outline, fibers, and cell-bodies STL meshes and
converts them into the viewer's preprocessed coordinate space. Their
vertices are in mapZebrain reference voxel indices, the same space as
WARP's Coords_All.npy, so the conversion is exactly the transform
preprocess.py applies to cells - centered on voxelCenter read from
neurons.json, with the AP axis negated.

Writes gzipped non-indexed float32 vertex blobs plus a separate
meshes.json. Separate from neurons.json on purpose: the primary load
path stays untouched and the meshes can be fetched lazily.

The self-check asserts the outline mesh encloses the cell bounds on all
six faces, which is what would catch a coordinate regression; verified
it does fail when the AP negation is removed."
```

---

### Task 3: `src/data/meshLoader.ts`

**Files:**
- Create: `src/data/meshLoader.ts`
- Create: `src/data/meshLoader.test.ts`
- Modify: `src/data/dataLoader.ts` — change `async function streamBin(` to `export async function streamBin(`

**Interfaces:**
- Consumes: `preprocessed/meshes.json` and the blobs from Task 2; `streamBin` from `dataLoader.ts`.
- Produces:
  - `type BrainMeshKey = 'outline' | 'fibers' | 'cellBodies'`
  - `interface BrainMeshEntry { file: string; triangles: number; color: string }`
  - `interface MeshManifest { version: number; source: string; voxelCenter: [number, number, number]; meshes: Record<BrainMeshKey, BrainMeshEntry> }`
  - `BRAIN_MESH_CONTROLS: BrainMeshControl[]` — the key → label → settings-field table, consumed by Task 8 (both the renderer and the Settings UI). Note `enabledKey` / `opacityKey` are plain string-literal types, so this module compiles before Task 7 adds those fields to `SettingsState`; the names are checked when Task 8 indexes `settings` with them.
  - `parseMeshManifest(raw: unknown): MeshManifest` (throws on invalid)
  - `decodeMeshBuffer(entry: BrainMeshEntry, buf: ArrayBuffer): Float32Array` (throws on size mismatch)
  - `loadMeshManifest(): Promise<MeshManifest | null>` (null on any failure)
  - `loadBrainMesh(key: BrainMeshKey): Promise<Float32Array>`

Testing strategy mirrors `dataLoader.test.ts`: the pure parse/validate functions are unit-tested, the fetch-and-cache wrappers are thin glue verified manually in Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/data/meshLoader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BRAIN_MESH_CONTROLS,
  decodeMeshBuffer,
  parseMeshManifest,
  type BrainMeshEntry,
} from './meshLoader';

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    source: 'https://mapzebrain.org - Kunst et al., 2019',
    voxelCenter: [283.79, 463.48, 219.8],
    meshes: {
      outline: { file: 'meshOutline.bin.gz', triangles: 2, color: '#dddcdf' },
      fibers: { file: 'meshFibers.bin.gz', triangles: 1, color: '#dddcdf' },
      cellBodies: { file: 'meshCellBodies.bin.gz', triangles: 1, color: '#dddcdf' },
    },
    ...overrides,
  };
}

describe('parseMeshManifest', () => {
  it('accepts a well-formed manifest', () => {
    const m = parseMeshManifest(validRaw());
    expect(m.meshes.outline.triangles).toBe(2);
    expect(m.voxelCenter).toEqual([283.79, 463.48, 219.8]);
  });

  it('rejects a manifest missing a mesh key', () => {
    const raw = validRaw();
    delete (raw.meshes as Record<string, unknown>).fibers;
    expect(() => parseMeshManifest(raw)).toThrow(/fibers/);
  });

  it('rejects a non-positive triangle count', () => {
    const raw = validRaw();
    (raw.meshes as Record<string, BrainMeshEntry>).outline.triangles = 0;
    expect(() => parseMeshManifest(raw)).toThrow(/triangles/);
  });

  it('rejects a wrong-length voxelCenter', () => {
    expect(() => parseMeshManifest(validRaw({ voxelCenter: [1, 2] }))).toThrow(
      /voxelCenter/,
    );
  });

  it('rejects a non-object', () => {
    expect(() => parseMeshManifest(null)).toThrow();
    expect(() => parseMeshManifest([])).toThrow();
  });
});

describe('decodeMeshBuffer', () => {
  const entry: BrainMeshEntry = {
    file: 'meshOutline.bin.gz',
    triangles: 2,
    color: '#dddcdf',
  };

  it('wraps a correctly sized buffer', () => {
    // 2 triangles x 3 vertices x 3 floats = 18 floats
    const src = new Float32Array(18).map((_, i) => i);
    const out = decodeMeshBuffer(entry, src.buffer);
    expect(out.length).toBe(18);
    expect(out[17]).toBe(17);
  });

  it('rejects a short buffer and names the file', () => {
    const src = new Float32Array(17);
    expect(() => decodeMeshBuffer(entry, src.buffer)).toThrow(/meshOutline\.bin\.gz/);
  });

  it('rejects a long buffer', () => {
    const src = new Float32Array(19);
    expect(() => decodeMeshBuffer(entry, src.buffer)).toThrow(/18/);
  });
});

describe('BRAIN_MESH_CONTROLS', () => {
  it('covers all three meshes with distinct settings fields', () => {
    expect(BRAIN_MESH_CONTROLS.map((c) => c.key)).toEqual([
      'outline',
      'fibers',
      'cellBodies',
    ]);
    const enabled = BRAIN_MESH_CONTROLS.map((c) => c.enabledKey);
    const opacity = BRAIN_MESH_CONTROLS.map((c) => c.opacityKey);
    expect(new Set(enabled).size).toBe(3);
    expect(new Set(opacity).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/meshLoader.test.ts`
Expected: FAIL — cannot resolve `./meshLoader`.

- [ ] **Step 3: Export `streamBin` from `dataLoader.ts`**

In `src/data/dataLoader.ts`, change the declaration on line 243 from:

```ts
async function streamBin(
```

to:

```ts
export async function streamBin(
```

No other change — the leading doc comment already explains the gzip sniffing.

- [ ] **Step 4: Write `src/data/meshLoader.ts`**

```ts
/** Lazy loader for the mapZebrain whole-brain meshes.
 *
 *  These live in their own manifest (preprocessed/meshes.json), separate
 *  from neurons.json, for two reasons: the primary dataset load path stays
 *  completely untouched, and the meshes are only fetched when a user
 *  actually turns one on rather than upfront with the cell data.
 *
 *  Blobs are non-indexed float32 vertex positions in the viewer's
 *  preprocessed coordinate space, produced by scripts/fetch_meshes.py.
 *  Render them inside a group carrying VOLUME_GROUP_ROTATION and
 *  VOLUME_GROUP_SCALE so they line up with the point cloud.
 */
import { streamBin } from './dataLoader';

const PREPROCESSED_BASE = './preprocessed/';

export type BrainMeshKey = 'outline' | 'fibers' | 'cellBodies';

export interface BrainMeshEntry {
  file: string;
  triangles: number;
  color: string;
}

export interface MeshManifest {
  version: number;
  source: string;
  voxelCenter: [number, number, number];
  meshes: Record<BrainMeshKey, BrainMeshEntry>;
}

export interface BrainMeshControl {
  key: BrainMeshKey;
  label: string;
  enabledKey: 'brainOutline' | 'brainFibers' | 'brainCellBodies';
  opacityKey: 'brainOutlineOpacity' | 'brainFibersOpacity' | 'brainCellBodiesOpacity';
}

/** Single source of truth for the mesh key ↔ settings field mapping, shared
 *  by the renderer (BrainMeshes) and the Settings UI so the two can't drift. */
export const BRAIN_MESH_CONTROLS: BrainMeshControl[] = [
  {
    key: 'outline',
    label: 'Brain outline',
    enabledKey: 'brainOutline',
    opacityKey: 'brainOutlineOpacity',
  },
  {
    key: 'fibers',
    label: 'Brain fibers',
    enabledKey: 'brainFibers',
    opacityKey: 'brainFibersOpacity',
  },
  {
    key: 'cellBodies',
    label: 'Brain cell bodies',
    enabledKey: 'brainCellBodies',
    opacityKey: 'brainCellBodiesOpacity',
  },
];

export const BRAIN_MESH_KEYS: BrainMeshKey[] = BRAIN_MESH_CONTROLS.map((c) => c.key);

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseMeshManifest(raw: unknown): MeshManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('meshes.json is not an object');
  }
  const m = raw as Record<string, unknown>;
  const center = m.voxelCenter;
  if (!Array.isArray(center) || center.length !== 3 || !center.every(isFiniteNum)) {
    throw new Error('meshes.json voxelCenter must be 3 finite numbers');
  }
  const meshesRaw = m.meshes;
  if (!meshesRaw || typeof meshesRaw !== 'object') {
    throw new Error('meshes.json has no meshes object');
  }
  const src = meshesRaw as Record<string, unknown>;
  const meshes = {} as Record<BrainMeshKey, BrainMeshEntry>;
  for (const key of BRAIN_MESH_KEYS) {
    const e = src[key];
    if (!e || typeof e !== 'object') {
      throw new Error(`meshes.json is missing mesh "${key}"`);
    }
    const entry = e as Record<string, unknown>;
    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      throw new Error(`meshes.json mesh "${key}" has no file`);
    }
    if (!isFiniteNum(entry.triangles) || entry.triangles <= 0) {
      throw new Error(`meshes.json mesh "${key}" has invalid triangles`);
    }
    meshes[key] = {
      file: entry.file,
      triangles: entry.triangles,
      color: typeof entry.color === 'string' ? entry.color : '#dddcdf',
    };
  }
  return {
    version: isFiniteNum(m.version) ? m.version : 1,
    source: typeof m.source === 'string' ? m.source : '',
    voxelCenter: [center[0], center[1], center[2]],
    meshes,
  };
}

/** Non-indexed geometry: 3 vertices per triangle, 3 floats per vertex. */
export function decodeMeshBuffer(entry: BrainMeshEntry, buf: ArrayBuffer): Float32Array {
  const expected = entry.triangles * 9;
  const actual = buf.byteLength / 4;
  if (actual !== expected) {
    throw new Error(
      `${entry.file}: expected ${expected} floats (${entry.triangles} triangles) ` +
        `but got ${actual}. Re-run scripts/fetch_meshes.py.`,
    );
  }
  return new Float32Array(buf);
}

let manifestPromise: Promise<MeshManifest | null> | null = null;

/** Resolves to null (never rejects) when the meshes have not been generated,
 *  so the UI can show a "run scripts/fetch_meshes.py" hint instead of
 *  breaking. Also covers mock mode, which has no preprocessed/ at all. */
export function loadMeshManifest(): Promise<MeshManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${PREPROCESSED_BASE}meshes.json`, { cache: 'no-cache' });
        if (!res.ok) return null;
        return parseMeshManifest(await res.json());
      } catch {
        return null;
      }
    })();
  }
  return manifestPromise;
}

const meshCache = new Map<BrainMeshKey, Promise<Float32Array>>();

/** Rejects with a specific message if this one mesh is unavailable, leaving
 *  the other two usable. */
export function loadBrainMesh(key: BrainMeshKey): Promise<Float32Array> {
  const cached = meshCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const manifest = await loadMeshManifest();
    if (!manifest) {
      throw new Error('preprocessed/meshes.json not found - run scripts/fetch_meshes.py');
    }
    const entry = manifest.meshes[key];
    const res = await fetch(`${PREPROCESSED_BASE}${entry.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
    return decodeMeshBuffer(entry, await streamBin(res, () => {}));
  })();
  meshCache.set(key, p);
  // A failed fetch shouldn't poison the cache forever - drop it so a later
  // retry (e.g. after the user regenerates the files) can succeed.
  p.catch(() => meshCache.delete(key));
  return p;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/meshLoader.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Full check and commit**

```bash
npm run check
git add src/data/meshLoader.ts src/data/meshLoader.test.ts src/data/dataLoader.ts
git commit -m "Add a lazy loader for the mapZebrain brain meshes

Reads preprocessed/meshes.json and the gzipped float32 vertex blobs
from scripts/fetch_meshes.py, reusing dataLoader's streamBin (now
exported) for the gzip sniffing and decode.

Kept out of the neurons.json load path so the primary dataset fetch is
unaffected and meshes are only pulled when a toggle turns one on. A
missing manifest resolves to null rather than throwing, so the UI can
degrade to a hint; a single bad blob fails only its own mesh.

BRAIN_MESH_CONTROLS is the one place the mesh key to settings field
mapping lives, shared by the renderer and the Settings UI."
```

---

### Task 4: Share the volume group transform

The point cloud lives inside `<group rotation={[0,0,π/2]} scale={[1,-1,1]}>`. The meshes must inherit the same transform, so it has to stop being a magic literal in one component.

**Files:**
- Create: `src/components/brain/volumeTransform.ts`
- Create: `src/components/brain/volumeTransform.test.ts`
- Modify: `src/components/brain/PointCloud.tsx:156`

**Interfaces:**
- Consumes: nothing.
- Produces: `VOLUME_GROUP_ROTATION: [number, number, number]` and `VOLUME_GROUP_SCALE: [number, number, number]`. Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/volumeTransform.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VOLUME_GROUP_ROTATION, VOLUME_GROUP_SCALE } from './volumeTransform';

/** Compose the group transform exactly as three does (M = T * R * S) and
 *  push a preprocessed-space point through it. */
function toWorld(v: [number, number, number]): THREE.Vector3 {
  const g = new THREE.Object3D();
  g.rotation.set(...VOLUME_GROUP_ROTATION);
  g.scale.set(...VOLUME_GROUP_SCALE);
  g.updateMatrix();
  return new THREE.Vector3(...v).applyMatrix4(g.matrix);
}

function groupMatrix(): THREE.Matrix4 {
  const g = new THREE.Object3D();
  g.rotation.set(...VOLUME_GROUP_ROTATION);
  g.scale.set(...VOLUME_GROUP_SCALE);
  g.updateMatrix();
  return g.matrix;
}

describe('volume group transform', () => {
  it('maps preprocessed (x, y, z) to world (y, x, z)', () => {
    const w = toWorld([3, 5, 7]);
    expect(w.x).toBeCloseTo(5, 5);
    expect(w.y).toBeCloseTo(3, 5);
    expect(w.z).toBeCloseTo(7, 5);
  });

  it('puts rostral (preprocessed +Y) on world +X', () => {
    const w = toWorld([0, 100, 0]);
    expect(w.x).toBeCloseTo(100, 5);
    expect(w.y).toBeCloseTo(0, 5);
    expect(w.z).toBeCloseTo(0, 5);
  });

  it('puts the lateral axis (preprocessed +X) on world +Y', () => {
    const w = toWorld([100, 0, 0]);
    expect(w.x).toBeCloseTo(0, 5);
    expect(w.y).toBeCloseTo(100, 5);
    expect(w.z).toBeCloseTo(0, 5);
  });

  it('leaves dorsal (preprocessed +Z) on world +Z', () => {
    const w = toWorld([0, 0, 100]);
    expect(w.z).toBeCloseTo(100, 5);
  });

  it('is orientation-reversing, so world handedness is mirrored', () => {
    // Documents why anatomical left/right cannot be derived from the axes
    // and has to be confirmed visually.
    expect(groupMatrix().determinant()).toBeLessThan(0);
  });

  it('preserves lengths, so camera distances are orientation-independent', () => {
    expect(toWorld([3, 4, 12]).length()).toBeCloseTo(13, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/brain/volumeTransform.test.ts`
Expected: FAIL — cannot resolve `./volumeTransform`.

- [ ] **Step 3: Write `src/components/brain/volumeTransform.ts`**

```ts
/** The transform between the viewer's preprocessed coordinates and world
 *  coordinates.
 *
 *  Everything in the 3D scene that comes from preprocessed data — the cell
 *  point cloud, and the mapZebrain brain meshes — is rendered inside a group
 *  carrying this rotation and scale. Three composes it as M = T * R * S, so a
 *  preprocessed vertex (x, y, z) lands at world (y, x, z):
 *
 *    preprocessed:  x = lateral,    y = rostral +,  z = dorsal +
 *    world:         x = rostral +,  y = lateral,    z = dorsal +
 *
 *  It exists to lay the brain's long rostro-caudal axis across the wide 3D
 *  panel, which is why the default dorsal view shows the fish pointing
 *  screen-right rather than up.
 *
 *  Two things to know before using it:
 *
 *  1. Composed with the rotation, the scale has determinant −1 — this is a
 *     MIRROR. World handedness is reversed relative to the mapZebrain voxel
 *     axes, so anything that cares about anatomical left vs right has to be
 *     confirmed visually, not derived. It also inverts triangle winding, so
 *     meshes rendered here want THREE.DoubleSide.
 *  2. There is no translation, so the origin maps to the origin and lengths
 *     are preserved: camera distances don't depend on the transform.
 *
 *  Anything you add to the scene in preprocessed coordinates must be a child
 *  of a group with these two values, or it will not line up with the cells.
 */
export const VOLUME_GROUP_ROTATION: [number, number, number] = [0, 0, Math.PI / 2];
export const VOLUME_GROUP_SCALE: [number, number, number] = [1, -1, 1];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/brain/volumeTransform.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Use the constants in `PointCloud.tsx`**

Add to the imports:

```ts
import { VOLUME_GROUP_ROTATION, VOLUME_GROUP_SCALE } from './volumeTransform';
```

Replace line 156:

```tsx
    <group rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
```

with:

```tsx
    <group rotation={VOLUME_GROUP_ROTATION} scale={VOLUME_GROUP_SCALE}>
```

- [ ] **Step 6: Verify no visual change, then commit**

```bash
npm run check
npm run dev
```

Open `http://localhost:5173/` and confirm the point cloud renders exactly as before — same orientation, brain pointing screen-right. This step is a pure refactor; anything that moved is a bug.

```bash
git add src/components/brain/volumeTransform.ts src/components/brain/volumeTransform.test.ts src/components/brain/PointCloud.tsx
git commit -m "Hoist the volume group transform into a shared module

PointCloud wrapped its point passes in a group with a literal rotation
and scale that maps preprocessed (x,y,z) to world (y,x,z). The
mapZebrain brain meshes have to inherit exactly the same transform to
line up with the cells, so the two values now live in one place with
the derivation documented.

The test asserts the mapping, that lengths are preserved, and that the
composed matrix has a negative determinant - it is a mirror, which is
why anatomical left/right can't be derived from the axes and needs a
visual check. Pure refactor, no behaviour change."
```

---

### Task 5: Camera framing and orientation presets

**Files:**
- Create: `src/components/brain/viewPresets.ts`
- Create: `src/components/brain/viewPresets.test.ts`

**Interfaces:**
- Consumes: `volumeTransform.ts`'s documented world-axis convention (rostral `+X`, lateral `±Y`, dorsal `+Z`).
- Produces:
  - `VIEWER_FOV_DEG = 45`
  - `fitDistance(extent: number, fovDeg?: number, margin?: number): number`
  - `type ViewPresetKey`
  - `interface ViewPreset { key: ViewPresetKey; label: string; dir: [number,number,number]; up: [number,number,number] }`
  - `VIEW_PRESETS: ViewPreset[]` — 7 entries in mapZebrain's bar order
  - `presetPosition(preset: ViewPreset, distance: number): [number,number,number]`
  - `EMBEDDED_DEFAULT_PRESET: ViewPreset` — the Dorsal entry
  - `isAtDefaultCamera(args): boolean`

  All consumed by Tasks 6, 8, and 9. This module holds no asset imports so it stays trivially testable; the icon URLs live in Task 9's component.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/viewPresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  EMBEDDED_DEFAULT_PRESET,
  VIEWER_FOV_DEG,
  VIEW_PRESETS,
  fitDistance,
  isAtDefaultCamera,
  presetPosition,
} from './viewPresets';

/** The camera basis a preset produces: what the viewer will actually show. */
function basis(dir: [number, number, number], up: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(VIEWER_FOV_DEG, 1.6, 0.1, 10000);
  cam.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
  cam.up.set(...up);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const m = cam.matrixWorld;
  return {
    right: new THREE.Vector3().setFromMatrixColumn(m, 0).normalize(),
    screenUp: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
    // Camera looks along its local -Z.
    view: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize().negate(),
  };
}

describe('VIEW_PRESETS', () => {
  it('has the seven mapZebrain orientations in bar order', () => {
    expect(VIEW_PRESETS.map((p) => p.key)).toEqual([
      'dorsal',
      'ventral',
      'sagittalVerticalLeft',
      'sagittalVerticalRight',
      'sagittalHorizontalLeft',
      'sagittalHorizontalRight',
      'coronal',
    ]);
  });

  it('uses unit directions and unit up vectors', () => {
    for (const p of VIEW_PRESETS) {
      expect(new THREE.Vector3(...p.dir).length()).toBeCloseTo(1, 6);
      expect(new THREE.Vector3(...p.up).length()).toBeCloseTo(1, 6);
    }
  });

  it('never puts up parallel to the view direction', () => {
    for (const p of VIEW_PRESETS) {
      const dot = new THREE.Vector3(...p.dir).dot(new THREE.Vector3(...p.up));
      expect(Math.abs(dot)).toBeLessThan(0.999);
    }
  });

  it('yields an orthonormal right-handed camera basis for every preset', () => {
    for (const p of VIEW_PRESETS) {
      const { right, screenUp, view } = basis(p.dir, p.up);
      expect(right.dot(screenUp)).toBeCloseTo(0, 5);
      expect(right.dot(view)).toBeCloseTo(0, 5);
      expect(screenUp.dot(view)).toBeCloseTo(0, 5);
      // right x up = -view for a right-handed camera looking along -Z.
      const cross = new THREE.Vector3().crossVectors(right, screenUp);
      expect(cross.dot(view)).toBeCloseTo(-1, 5);
    }
  });

  it('shows dorsal from above with rostral up (mapZebrain portrait)', () => {
    const dorsal = VIEW_PRESETS[0];
    expect(dorsal.key).toBe('dorsal');
    const { view, screenUp } = basis(dorsal.dir, dorsal.up);
    // Looking down the dorsal axis: view direction is world -Z.
    expect(view.z).toBeCloseTo(-1, 5);
    // Screen-up is world +X, which volumeTransform documents as rostral.
    expect(screenUp.x).toBeCloseTo(1, 5);
  });

  it('shows ventral from below, also rostral up', () => {
    const ventral = VIEW_PRESETS[1];
    const { view, screenUp } = basis(ventral.dir, ventral.up);
    expect(view.z).toBeCloseTo(1, 5);
    expect(screenUp.x).toBeCloseTo(1, 5);
  });

  it('shows coronal along the rostral axis with dorsal up', () => {
    const coronal = VIEW_PRESETS[6];
    expect(coronal.key).toBe('coronal');
    const { view, screenUp } = basis(coronal.dir, coronal.up);
    expect(view.x).toBeCloseTo(-1, 5);
    expect(screenUp.z).toBeCloseTo(1, 5);
  });

  it('gives the two sagittal pairs opposite sides and different rolls', () => {
    const [, , vLeft, vRight, hLeft, hRight] = VIEW_PRESETS;
    expect(vLeft.dir[1]).toBe(-vRight.dir[1]);
    expect(hLeft.dir[1]).toBe(-hRight.dir[1]);
    // "vertical" is rostral-up, "horizontal" is dorsal-up.
    expect(vLeft.up).toEqual([1, 0, 0]);
    expect(hLeft.up).toEqual([0, 0, 1]);
  });

  it('embedded default is the dorsal preset', () => {
    expect(EMBEDDED_DEFAULT_PRESET.key).toBe('dorsal');
  });
});

describe('presetPosition', () => {
  it('scales the unit direction to the requested distance', () => {
    expect(presetPosition(VIEW_PRESETS[0], 900)).toEqual([0, 0, 900]);
    expect(presetPosition(VIEW_PRESETS[6], 900)).toEqual([900, 0, 0]);
    expect(new THREE.Vector3(...presetPosition(VIEW_PRESETS[2], 900)).length())
      .toBeCloseTo(900, 6);
  });
});

describe('fitDistance', () => {
  it('fits the extent in the vertical field of view', () => {
    // This is the check that catches the portrait clipping bug: warp's old
    // landscape distance of span*0.95 is too close once the 784-unit AP
    // extent is rolled from horizontal to vertical.
    const span = 784.15;
    const exact = span / 2 / Math.tan(((VIEWER_FOV_DEG / 2) * Math.PI) / 180);
    expect(exact).toBeGreaterThan(span * 0.95);
    expect(fitDistance(span)).toBeGreaterThanOrEqual(exact);
    expect(fitDistance(span)).toBeCloseTo(993.88, 1);
  });

  it('scales linearly with the extent', () => {
    expect(fitDistance(200)).toBeCloseTo(fitDistance(100) * 2, 6);
  });

  it('honours an explicit margin', () => {
    expect(fitDistance(500, VIEWER_FOV_DEG, 1)).toBeLessThan(fitDistance(500));
  });
});

describe('isAtDefaultCamera', () => {
  const base = {
    position: [0, 0, 900] as [number, number, number],
    up: [1, 0, 0] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    defaultPosition: [0, 0, 900] as [number, number, number],
    defaultUp: [1, 0, 0] as [number, number, number],
    volumeCenter: [0, 0, 0] as [number, number, number],
    pan: { x: 0, y: 0 },
    posEps: 0.1,
  };

  it('is true when everything matches', () => {
    expect(isAtDefaultCamera(base)).toBe(true);
  });

  it('is false after the camera moves', () => {
    expect(isAtDefaultCamera({ ...base, position: [10, 0, 900] })).toBe(false);
  });

  it('is false when rolled away from the default up', () => {
    expect(isAtDefaultCamera({ ...base, up: [0, 1, 0] })).toBe(false);
  });

  it('compares against defaultUp, not a hardcoded (0,1,0)', () => {
    // The embedded default up is (1,0,0); (0,1,0) must not count as default.
    const landscape = { ...base, defaultUp: [0, 1, 0] as [number, number, number] };
    expect(isAtDefaultCamera({ ...landscape, up: [0, 1, 0] })).toBe(true);
    expect(isAtDefaultCamera({ ...landscape, up: [1, 0, 0] })).toBe(false);
  });

  it('is false when panned or when the orbit target moved', () => {
    expect(isAtDefaultCamera({ ...base, pan: { x: 5, y: 0 } })).toBe(false);
    expect(isAtDefaultCamera({ ...base, target: [0, 50, 0] })).toBe(false);
  });

  it('tolerates sub-epsilon damping residue', () => {
    expect(isAtDefaultCamera({ ...base, position: [0.05, 0, 900] })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/brain/viewPresets.test.ts`
Expected: FAIL — cannot resolve `./viewPresets`.

- [ ] **Step 3: Write `src/components/brain/viewPresets.ts`**

```ts
/** Camera framing and the mapZebrain view-orientation presets.
 *
 *  All vectors are in WORLD space, whose axes volumeTransform.ts derives:
 *  +X is rostral, ±Y are the lateral axes, +Z is dorsal.
 *
 *  mapZebrain's own presets are hardcoded quaternions in its camera frame
 *  (up = (0,-1,0), AP sign opposite to ours, and no equivalent of our volume
 *  group transform). Porting those numbers would be both wrong and opaque, so
 *  these are derived from the axis convention instead.
 */

/** Vertical field of view of the 3D viewer's camera, in degrees. Also the
 *  Canvas `fov` prop — keep them from drifting by importing this. */
export const VIEWER_FOV_DEG = 45;

/** Camera distance at which `extent` exactly fills the vertical field of
 *  view, times a margin.
 *
 *  Needed because three's fov is the VERTICAL fov. Warp's normal default
 *  distance (span * 0.95) framed the brain's 784-unit rostro-caudal extent
 *  horizontally across a wide panel. Embedded mode rolls that extent
 *  vertical, where span * 0.95 clips the rostral and caudal tips.
 */
export function fitDistance(extent: number, fovDeg = VIEWER_FOV_DEG, margin = 1.05): number {
  return (extent / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)) * margin;
}

export type ViewPresetKey =
  | 'dorsal'
  | 'ventral'
  | 'sagittalVerticalLeft'
  | 'sagittalVerticalRight'
  | 'sagittalHorizontalLeft'
  | 'sagittalHorizontalRight'
  | 'coronal';

export interface ViewPreset {
  key: ViewPresetKey;
  /** Tooltip / alt text. */
  label: string;
  /** Unit direction from the volume center to the camera, world space. */
  dir: [number, number, number];
  /** Camera up vector, world space. */
  up: [number, number, number];
}

/** In mapZebrain's icon-bar order.
 *
 *  "Vertical" means rostral-up (up along world +X); "horizontal" means
 *  dorsal-up (up along world +Z) — mapZebrain's naming. Coronal views from
 *  the rostral side, as mapZebrain's does.
 *
 *  Which of ±Y is the animal's left is NOT derivable: the brain is near
 *  bilaterally symmetric and the volume group transform is a mirror. The
 *  left/right labels here are provisional and must be confirmed against the
 *  icon artwork in the browser; if they are swapped, swap the two `dir`
 *  signs in each sagittal pair.
 */
export const VIEW_PRESETS: ViewPreset[] = [
  { key: 'dorsal', label: 'Dorsal', dir: [0, 0, 1], up: [1, 0, 0] },
  { key: 'ventral', label: 'Ventral', dir: [0, 0, -1], up: [1, 0, 0] },
  {
    key: 'sagittalVerticalLeft',
    label: 'Sagittal (vertical-left)',
    dir: [0, -1, 0],
    up: [1, 0, 0],
  },
  {
    key: 'sagittalVerticalRight',
    label: 'Sagittal (vertical-right)',
    dir: [0, 1, 0],
    up: [1, 0, 0],
  },
  {
    key: 'sagittalHorizontalLeft',
    label: 'Sagittal (horizontal-left)',
    dir: [0, -1, 0],
    up: [0, 0, 1],
  },
  {
    key: 'sagittalHorizontalRight',
    label: 'Sagittal (horizontal-right)',
    dir: [0, 1, 0],
    up: [0, 0, 1],
  },
  { key: 'coronal', label: 'Coronal', dir: [1, 0, 0], up: [0, 0, 1] },
];

/** Embedded mode opens on mapZebrain's default: dorsal, brain vertical,
 *  rostral up. */
export const EMBEDDED_DEFAULT_PRESET: ViewPreset = VIEW_PRESETS[0];

export function presetPosition(
  preset: ViewPreset,
  distance: number,
): [number, number, number] {
  return [preset.dir[0] * distance, preset.dir[1] * distance, preset.dir[2] * distance];
}

/** Whether the camera is sitting exactly on its default view.
 *
 *  Extracted as a pure function because the default up vector is now
 *  mode-dependent (landscape (0,1,0) normally, portrait (1,0,0) embedded), and
 *  a hardcoded comparison was the bug this replaces.
 *
 *  posEps absorbs trackball damping residue, which can leave sub-unit error
 *  after a snap — exact equality would keep reporting "moved" for ~130 frames.
 */
export function isAtDefaultCamera({
  position,
  up,
  target,
  defaultPosition,
  defaultUp,
  volumeCenter,
  pan,
  posEps,
}: {
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  defaultPosition: [number, number, number];
  defaultUp: [number, number, number];
  volumeCenter: [number, number, number];
  pan: { x: number; y: number };
  posEps: number;
}): boolean {
  const UP_EPS = 1e-3;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(position[i] - defaultPosition[i]) >= posEps) return false;
    if (Math.abs(up[i] - defaultUp[i]) >= UP_EPS) return false;
    if (Math.abs(target[i] - volumeCenter[i]) >= posEps) return false;
  }
  return pan.x === 0 && pan.y === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/brain/viewPresets.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/components/brain/viewPresets.ts src/components/brain/viewPresets.test.ts
git commit -m "Add camera framing helpers and the seven orientation presets

Derived in world space from the axis convention volumeTransform
documents (rostral +X, lateral +-Y, dorsal +Z) rather than ported from
mapZebrain's hardcoded quaternions, which live in a different camera
frame and know nothing about our volume group transform.

fitDistance exists because three's fov is the VERTICAL fov: embedded
mode rolls the 784-unit rostro-caudal extent from horizontal to
vertical, where warp's landscape span*0.95 clips the rostral and caudal
tips. The test asserts fitDistance exceeds it, which is the check that
catches that clipping.

isAtDefaultCamera is extracted as a pure function because the default up
vector is now mode-dependent, and a hardcoded (0,1,0) comparison is the
bug it replaces. The left/right labels on the sagittal presets are
provisional - the volume transform is a mirror and the brain is near
symmetric, so they need a visual check."
```

---

### Task 6: Mode-dependent default camera in `CameraSync`

**Files:**
- Modify: `src/components/brain/cameraControls.tsx` — `CameraSync` props, the `resetRef` effect (`:164-183`), the restore effect (`:185-214`), and the `isAtDefault` block in `useFrame` (`:227-244`)
- Modify: `src/components/BrainViewer.tsx` — pass the new props (full rewrite of the camera memo comes in Task 9; here just keep it compiling with the existing values)

**Interfaces:**
- Consumes: `isAtDefaultCamera` from `viewPresets.ts` (Task 5).
- Produces: `CameraSync` gains a `defaultCamUp: [number, number, number]` prop and renames `resetRef` to `applyViewRef: MutableRefObject<((position: [number,number,number], up: [number,number,number]) => void) | null>`. Tasks 8 and 9 call `applyViewRef.current?.(pos, up)`.

- [ ] **Step 1: Generalise `resetRef` into `applyViewRef`**

In `src/components/brain/cameraControls.tsx`, add to the imports:

```ts
import { isAtDefaultCamera } from './viewPresets';
```

In the `CameraSync` props type, replace:

```ts
  resetRef: React.MutableRefObject<(() => void) | null>;
```

with:

```ts
  /** Imperative "snap the camera to this view" handle. Called by the
   *  reset-view button with the defaults, and by the orientation icon bar
   *  with a preset. Also clears the screen pan and projection view offset,
   *  since a canonical view should not stay panned. */
  applyViewRef: React.MutableRefObject<
    ((position: [number, number, number], up: [number, number, number]) => void) | null
  >;
  /** Camera up vector for the default view. Landscape (0,1,0) normally,
   *  portrait (1,0,0) in embedded mode, where the viewer opens on
   *  mapZebrain's orientation. */
  defaultCamUp: [number, number, number];
```

and update the destructured parameter list accordingly (`resetRef` → `applyViewRef`, add `defaultCamUp`).

Replace the whole `resetRef` effect (lines 164-183) with:

```ts
  useEffect(() => {
    applyViewRef.current = (position, up) => {
      camera.position.set(...position);
      // TrackballControls rotates camera.up during orbit, so position +
      // target alone leaves the view rolled. Set up explicitly so the
      // volume lands in the intended orientation.
      camera.up.set(...up);
      controls?.target.set(...volumeCenter);
      controls?.update();
      panRef.current.x = 0;
      panRef.current.y = 0;
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
      }
      invalidate();
    };
    return () => {
      applyViewRef.current = null;
    };
  }, [camera, controls, invalidate, panRef, applyViewRef, size.height, size.width, volumeCenter]);
```

- [ ] **Step 2: Apply the default view on mount when there is no URL camera**

In the restore effect, replace:

```ts
      controls.target.set(...target);
      controls.update();
    }
    restoredRef.current = true;
```

with:

```ts
      controls.target.set(...target);
      controls.update();
    } else {
      // No camera in the URL. Previously this relied on three's default
      // camera.up already being (0, 1, 0); with a mode-dependent default up
      // (embedded mode opens portrait) it has to be set explicitly.
      camera.position.set(...defaultCamPosition);
      camera.up.set(...defaultCamUp);
      controls.target.set(...volumeCenter);
      controls.update();
    }
    restoredRef.current = true;
```

and add `defaultCamPosition`, `defaultCamUp` to that effect's dependency array.

Leave the existing `camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion)` line untouched — the `(0, 1, 0)` there is the camera's *local* up axis being rotated into world space, which is correct in every mode.

- [ ] **Step 3: Use `isAtDefaultCamera` in the frame loop**

In `useFrame`, replace the inline `targetAtCenter` / `isAtDefault` computation (lines 227-240) with:

```ts
    const isAtDefault = isAtDefaultCamera({
      position: [camera.position.x, camera.position.y, camera.position.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      defaultPosition: defaultCamPosition,
      defaultUp: defaultCamUp,
      volumeCenter,
      pan: panRef.current,
      posEps: POS_EPS,
    });
```

- [ ] **Step 4: Update the call site in `BrainViewer.tsx`**

Rename the ref and add the up vector. Replace:

```tsx
  const resetRef = useRef<(() => void) | null>(null);
```

with:

```tsx
  const applyViewRef = useRef<
    ((position: [number, number, number], up: [number, number, number]) => void) | null
  >(null);
```

Add next to the `defaultCamPosition` memo, temporarily (Task 9 makes it mode-dependent):

```tsx
  const defaultCamUp: [number, number, number] = [0, 1, 0];
```

In the `<CameraSync ... />` element, replace `resetRef={resetRef}` with:

```tsx
          applyViewRef={applyViewRef}
          defaultCamUp={defaultCamUp}
```

And in the reset-view button's `onClick`, replace `resetRef.current?.();` with:

```tsx
              applyViewRef.current?.(defaultCamPosition, defaultCamUp);
```

- [ ] **Step 5: Verify the reset button still works**

```bash
npm run check
npm run dev
```

In the browser: rotate/zoom/pan the 3D view, confirm the "reset view" button appears, click it, confirm the view snaps back to the original orientation and the button disappears. Then reload with no hash and confirm the opening view is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/brain/cameraControls.tsx src/components/BrainViewer.tsx
git commit -m "Make CameraSync's default camera orientation a parameter

Generalises resetRef into applyViewRef(position, up), so the reset-view
button and the orientation icon bar share one snap-to-view path instead
of growing a second copy.

Also fixes a latent bug: with no camera in the URL, CameraSync never set
camera.up at all, relying on three's default already being (0,1,0). That
breaks as soon as the default up is mode-dependent, so the restore
effect now applies position and up explicitly. The isAtDefault check
moves to the extracted isAtDefaultCamera and compares against
defaultCamUp rather than a hardcoded (0,1,0).

No behaviour change yet - defaultCamUp is still (0,1,0) everywhere."
```

---

### Task 7: Settings state and `?embed=1`

**Files:**
- Modify: `src/data/types.ts` — `SettingsState` and `DEFAULT_SETTINGS`
- Modify: `src/utils/urlState.ts` — `validateSettings`, plus a new `isEmbedRequested`
- Modify: `src/utils/urlState.test.ts` — add cases
- Modify: `src/hooks/useUrlSync.ts:150` — drop `embeddedMode` from the diff
- Modify: `src/App.tsx:87-90` — seed `embeddedMode` from the query string

**Interfaces:**
- Consumes: nothing.
- Produces: `SettingsState` gains `embeddedMode`, `brainOutline`, `brainFibers`, `brainCellBodies`, `brainOutlineOpacity`, `brainFibersOpacity`, `brainCellBodiesOpacity`; and `isEmbedRequested(search: string): boolean` from `urlState.ts`. Consumed by Tasks 8, 9, 10.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/urlState.test.ts`:

```ts
describe('isEmbedRequested', () => {
  it('detects ?embed=1', () => {
    expect(isEmbedRequested('?embed=1')).toBe(true);
    expect(isEmbedRequested('?mock=1&embed=1')).toBe(true);
  });

  it('accepts a bare ?embed', () => {
    expect(isEmbedRequested('?embed')).toBe(true);
  });

  it('is false when absent or explicitly disabled', () => {
    expect(isEmbedRequested('')).toBe(false);
    expect(isEmbedRequested('?mock=1')).toBe(false);
    expect(isEmbedRequested('?embed=0')).toBe(false);
  });
});

describe('validateSettings brain-mesh fields', () => {
  it('round-trips the mesh toggles', () => {
    const hash = encodeHash({
      settings: { brainOutline: true, brainFibers: false, brainCellBodies: true },
    });
    const out = decodeHash(hash);
    expect(out?.settings?.brainOutline).toBe(true);
    expect(out?.settings?.brainCellBodies).toBe(true);
  });

  it('clamps mesh opacities into 0..1', () => {
    const out = decodeHash(
      encodeHash({
        settings: {
          brainOutlineOpacity: 5,
          brainFibersOpacity: -2,
          brainCellBodiesOpacity: 0.35,
        },
      }),
    );
    expect(out?.settings?.brainOutlineOpacity).toBe(1);
    expect(out?.settings?.brainFibersOpacity).toBe(0);
    expect(out?.settings?.brainCellBodiesOpacity).toBeCloseTo(0.35, 6);
  });

  it('never restores embeddedMode from the hash', () => {
    const out = decodeHash(encodeHash({ settings: { embeddedMode: true } }));
    expect(out?.settings?.embeddedMode).toBeUndefined();
  });
});
```

Add `isEmbedRequested` to the existing import list from `./urlState` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/urlState.test.ts`
Expected: FAIL — `isEmbedRequested` is not exported.

- [ ] **Step 3: Add the settings fields**

In `src/data/types.ts`, at the end of the `SettingsState` interface (after `screenshotMode`):

```ts
    /** Deployment/presentation mode for running the viewer inside an iframe
     *  on mapzebrain.org. Adds the view-orientation icon bar above the 3D
     *  view and opens on mapZebrain's default orientation (dorsal, brain
     *  vertical, rostral up) instead of warp's landscape default. Purely
     *  additive — no panel or layout change. Set by `?embed=1`; like
     *  screenshotMode it is never written to the URL hash. */
    embeddedMode: boolean;
    /** mapZebrain whole-brain reference meshes drawn as translucent
     *  anatomical context, independent of embeddedMode. All default off so
     *  the standard view is unchanged. Require
     *  `python3 scripts/fetch_meshes.py` to have been run. */
    brainOutline: boolean;
    brainFibers: boolean;
    brainCellBodies: boolean;
    /** Per-mesh opacity, 0..1. 0.2 matches mapZebrain's own default. */
    brainOutlineOpacity: number;
    brainFibersOpacity: number;
    brainCellBodiesOpacity: number;
```

And in `DEFAULT_SETTINGS`, after `screenshotMode: false,`:

```ts
    embeddedMode: false,
    brainOutline: false,
    brainFibers: false,
    brainCellBodies: false,
    brainOutlineOpacity: 0.2,
    brainFibersOpacity: 0.2,
    brainCellBodiesOpacity: 0.2,
```

- [ ] **Step 4: Validate them in `urlState.ts`**

In `validateSettings`, just before the closing `return out;`:

```ts
  // embeddedMode is deliberately absent: like screenshotMode it is a
  // deployment/presentation mode, set by ?embed=1, not shareable view state.
  if (typeof s.brainOutline === 'boolean') out.brainOutline = s.brainOutline;
  if (typeof s.brainFibers === 'boolean') out.brainFibers = s.brainFibers;
  if (typeof s.brainCellBodies === 'boolean') out.brainCellBodies = s.brainCellBodies;
  if (isFiniteNum(s.brainOutlineOpacity)) {
    out.brainOutlineOpacity = clamp(s.brainOutlineOpacity, 0, 1);
  }
  if (isFiniteNum(s.brainFibersOpacity)) {
    out.brainFibersOpacity = clamp(s.brainFibersOpacity, 0, 1);
  }
  if (isFiniteNum(s.brainCellBodiesOpacity)) {
    out.brainCellBodiesOpacity = clamp(s.brainCellBodiesOpacity, 0, 1);
  }
```

And add the query-param reader as a new top-level export in the same file:

```ts
/** True when the viewer was loaded with `?embed=1` — the iframe entry point
 *  for embedding in mapzebrain.org. A query param rather than hash state,
 *  matching the existing `?mock=1` convention, because it is how the
 *  embedding page's `src` attribute selects the mode. */
export function isEmbedRequested(locationSearch: string): boolean {
  const value = new URLSearchParams(locationSearch).get('embed');
  // Present-but-empty (`?embed`) counts as on; `?embed=0` is an explicit off.
  return value !== null && value !== '0';
}
```

- [ ] **Step 5: Keep `embeddedMode` out of the URL**

In `src/hooks/useUrlSync.ts`, extend the existing deletion right after `delete settingsDiff.screenshotMode;`:

```ts
    delete settingsDiff.screenshotMode;
    // embeddedMode is set by ?embed=1, not by the hash — persisting it would
    // let a shared link drop the recipient into iframe chrome.
    delete settingsDiff.embeddedMode;
```

- [ ] **Step 6: Seed it in `App.tsx`**

Add `isEmbedRequested` to the existing import from `./utils/urlState`, then replace:

```ts
const INITIAL_SETTINGS_STATE: SettingsState = {
  ...DEFAULT_SETTINGS,
  ...(INITIAL_URL_STATE?.settings ?? {}),
};
```

with:

```ts
const INITIAL_SETTINGS_STATE: SettingsState = {
  ...DEFAULT_SETTINGS,
  ...(INITIAL_URL_STATE?.settings ?? {}),
  // ?embed=1 wins: the hash never carries embeddedMode.
  ...(isEmbedRequested(window.location.search) ? { embeddedMode: true } : {}),
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/utils/urlState.test.ts`
Expected: PASS, including the 6 new cases.

- [ ] **Step 8: Full check and commit**

```bash
npm run check
git add src/data/types.ts src/utils/urlState.ts src/utils/urlState.test.ts src/hooks/useUrlSync.ts src/App.tsx
git commit -m "Add brain-mesh and embedded-mode settings

Three mesh toggles plus per-mesh opacity (0.2, matching mapZebrain's
own default), all off so the standard view is unchanged. These are
ordinary shareable view state and go through the usual hash validation
with opacity clamped to 0..1.

embeddedMode is different: it is a deployment mode set by ?embed=1, so
it follows screenshotMode's precedent and is stripped from the hash
diff. A shared link should never drop someone into iframe chrome."
```

---

### Task 8: Render the meshes and exclude them from the scene-wide passes

This is the task that makes the feature visible end-to-end: toggle a mesh in Settings and see it.

**Files:**
- Create: `src/components/brain/BrainMeshes.tsx`
- Modify: `src/components/brain/sceneObjectNames.ts`
- Modify: `src/components/brain/usePointCloudPicking.ts:85-115` (the ID pass)
- Modify: `src/components/brain/ProjectionRenderPass.tsx:161-236` (the `useFrame` visibility juggling)
- Modify: `src/components/BrainViewer.tsx` — render `<BrainMeshes />`
- Modify: `src/components/filters/SettingsTab.tsx` — new "Brain models" section

**Interfaces:**
- Consumes: `loadMeshManifest`, `loadBrainMesh`, `BRAIN_MESH_CONTROLS` (Task 3); `VOLUME_GROUP_ROTATION` / `VOLUME_GROUP_SCALE` (Task 4); the settings fields (Task 7); `skipAmbientOcclusionUserData` from `AmbientOcclusion.tsx`.
- Produces: `BRAIN_MESH_GROUP_NAME` in `sceneObjectNames.ts`; `<BrainMeshes settings={settings} />`.

- [ ] **Step 1: Name the group**

Append to `src/components/brain/sceneObjectNames.ts`:

```ts
/** The mapZebrain brain-mesh group. Every pass that renders the whole scene
 *  has to decide whether the translucent shells belong in it — the ID-buffer
 *  pick pass must exclude them, and the projection pass must include them in
 *  its context underlay but exclude them from its reduction targets. */
export const BRAIN_MESH_GROUP_NAME = 'brainMeshGroup';
```

- [ ] **Step 2: Write `src/components/brain/BrainMeshes.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SettingsState } from '../../data/types';
import {
  BRAIN_MESH_CONTROLS,
  loadBrainMesh,
  loadMeshManifest,
  type BrainMeshKey,
  type MeshManifest,
} from '../../data/meshLoader';
import { skipAmbientOcclusionUserData } from '../AmbientOcclusion';
import { BRAIN_MESH_GROUP_NAME } from './sceneObjectNames';
import { VOLUME_GROUP_ROTATION, VOLUME_GROUP_SCALE } from './volumeTransform';

/** mapZebrain's whole-brain reference meshes (outline / fibers / cell bodies)
 *  as translucent anatomical context.
 *
 *  Blobs are in preprocessed coordinates, so this renders inside a group
 *  carrying the same rotation and scale as the point cloud — see
 *  volumeTransform.ts. Each mesh is fetched the first time its toggle goes
 *  true and cached in meshLoader thereafter, so nothing is downloaded for a
 *  user who never turns one on.
 */
export function BrainMeshes({ settings }: { settings: SettingsState }) {
  const invalidate = useThree((s) => s.invalidate);
  const [manifest, setManifest] = useState<MeshManifest | null>(null);
  const [geometries, setGeometries] = useState<
    Partial<Record<BrainMeshKey, THREE.BufferGeometry>>
  >({});

  const anyEnabled = BRAIN_MESH_CONTROLS.some((c) => settings[c.enabledKey]);

  useEffect(() => {
    if (!anyEnabled || manifest) return;
    let live = true;
    loadMeshManifest().then((m) => {
      if (live && m) setManifest(m);
    });
    return () => {
      live = false;
    };
  }, [anyEnabled, manifest]);

  // One effect per mesh key would be cleaner in isolation but the enabled
  // flags live on one settings object, so a single effect keyed on all three
  // is both simpler and enough: loadBrainMesh caches, so re-entry is cheap.
  useEffect(() => {
    let live = true;
    for (const control of BRAIN_MESH_CONTROLS) {
      if (!settings[control.enabledKey]) continue;
      if (geometries[control.key]) continue;
      loadBrainMesh(control.key)
        .then((positions) => {
          if (!live) return;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          // Non-indexed geometry, so this yields flat facet normals — the
          // same shading mapZebrain's own STL meshes produce.
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          setGeometries((prev) => {
            if (prev[control.key]) return prev;
            const next = { ...prev };
            next[control.key] = geometry;
            return next;
          });
          invalidate();
        })
        .catch((err) => {
          console.warn(`[BrainMeshes] ${control.key} unavailable:`, err);
        });
    }
    return () => {
      live = false;
    };
  }, [settings, geometries, invalidate]);

  // Dispose once on unmount. This reads through a ref rather than closing over
  // `geometries`: a mount-scoped cleanup would capture the initial empty object
  // and free nothing.
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  useEffect(
    () => () => {
      for (const geometry of Object.values(geometriesRef.current)) geometry?.dispose();
    },
    [],
  );

  if (!anyEnabled) return null;

  return (
    <>
      {/* The point cloud uses raw ShaderMaterials and is unaffected by lights,
          so before this there were none in the scene at all and a lit material
          would have rendered black. Fixed world direction rather than a
          headlight, so orbiting gives a shape cue. */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[0.4, 0.3, 1]} intensity={0.75} />
      <group
        name={BRAIN_MESH_GROUP_NAME}
        rotation={VOLUME_GROUP_ROTATION}
        scale={VOLUME_GROUP_SCALE}
      >
        {BRAIN_MESH_CONTROLS.map((control) => {
          const geometry = geometries[control.key];
          if (!geometry || !settings[control.enabledKey]) return null;
          return (
            <mesh
              key={control.key}
              geometry={geometry}
              // Above every point pass (-1 context, 0 opaque/projection,
              // 1 transparent, 2 focus marker) so the shell tints over the
              // cells, which is how mapZebrain reads.
              renderOrder={3}
              userData={skipAmbientOcclusionUserData}
            >
              <meshPhongMaterial
                color={manifest?.meshes[control.key].color ?? '#dddcdf'}
                transparent
                opacity={settings[control.opacityKey]}
                // The volume group is a mirror, so winding is inverted; and
                // the shell is seen from the inside as the camera orbits.
                side={THREE.DoubleSide}
                // Tint over the cells without hiding the ones behind it.
                depthWrite={false}
              />
            </mesh>
          );
        })}
      </group>
    </>
  );
}
```

- [ ] **Step 3: Exclude the meshes from the ID pick pass**

In `src/components/brain/usePointCloudPicking.ts`, add to the `sceneObjectNames` import (or add the import if absent):

```ts
import { BRAIN_MESH_GROUP_NAME } from './sceneObjectNames';
```

In the `max` / `min` / `maxabs` branch, next to the existing `ctx` / `marker` capture:

```ts
      const marker = markerPointsRef.current;
      const prevMarkerVisible = marker ? marker.visible : true;
      // The ID pass renders the whole scene with an override material, so the
      // translucent brain shells would be drawn into the ID target and
      // depth-occlude the cells behind them — hovering through the shell would
      // report the wrong cell. (Normal-mode picking is CPU-geometric and never
      // sees them; this is the only ID-buffer pass.)
      const brainMeshes = scene.getObjectByName(BRAIN_MESH_GROUP_NAME);
      const prevBrainVisible = brainMeshes ? brainMeshes.visible : true;
```

In the `try` block, alongside `if (marker) marker.visible = false;`:

```ts
        if (brainMeshes) brainMeshes.visible = false;
```

In the `finally` block, alongside the marker restore:

```ts
        if (brainMeshes) brainMeshes.visible = prevBrainVisible;
```

- [ ] **Step 4: Exclude the meshes from the projection reduction passes**

This is the correctness-critical one. In `src/components/brain/ProjectionRenderPass.tsx`, add `BRAIN_MESH_GROUP_NAME` to the `sceneObjectNames` import.

In `useFrame`, alongside the other lookups:

```ts
    const marker = scene.getObjectByName(FOCUS_MARKER_NAME);
    // The brain shells belong in the step-1 context underlay and NOWHERE else.
    // Step 2b renders into an off-screen float target with additive blending,
    // where the composite shader reconstructs the reduced scalar from
    // accumulated (positiveSum, negativeSum, denominator) channels — a shell
    // rendered into that buffer adds its colour into those channels across the
    // whole brain silhouette and biases every mean/sum projection. Steps 2a
    // and 4 would merely composite the shell two or three times over.
    const brain = scene.getObjectByName(BRAIN_MESH_GROUP_NAME);
```

and next to the other `prev*Visible` captures:

```ts
    const prevBrainVisible = brain ? brain.visible : true;
```

Then, in each of the three visibility blocks that currently hide `ctx` for a
non-context pass, add the matching line:

- step 2a (depth-MIP, after `if (marker) marker.visible = false;` at line ~193): `if (brain) brain.visible = false;`
- step 2b (accumulation, after `if (marker) marker.visible = false;` at line ~204): `if (brain) brain.visible = false;`
- step 4 (focus marker, after `marker.visible = true;` at line ~222): `if (brain) brain.visible = false;`

Step 1 needs no line — the shells should be visible there, which is the
restored-state default.

In `finally`, alongside the other restores:

```ts
      if (brain) brain.visible = prevBrainVisible;
```

- [ ] **Step 5: Render `<BrainMeshes />` in `BrainViewer.tsx`**

Add the import:

```ts
import { BrainMeshes } from './brain/BrainMeshes';
```

Inside `<Canvas>`, immediately after the `<PointCloud ... />` element:

```tsx
        <BrainMeshes settings={settings} />
```

- [ ] **Step 6: Add the "Brain models" Settings section**

In `src/components/filters/SettingsTab.tsx`, add the imports:

```ts
import { BRAIN_MESH_CONTROLS, loadMeshManifest } from "../../data/meshLoader";
```

(`SettingsState`, `useState`, and `useEffect` are already imported in this file.)

Inside the component, before the `return`:

```ts
    // null = still checking, false = meshes not generated, true = available.
    const [meshesAvailable, setMeshesAvailable] = useState<boolean | null>(null);
    useEffect(() => {
        let live = true;
        loadMeshManifest().then((m) => {
            if (live) setMeshesAvailable(m !== null);
        });
        return () => {
            live = false;
        };
    }, []);
```

Then add this `<section>` immediately before the existing `Debug` section:

```tsx
            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Brain models
                </div>
                <p className="text-neutral-400 leading-snug">
                    Translucent whole-brain reference meshes from{" "}
                    <a
                        href="https://mapzebrain.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-yellow-300 hover:underline"
                    >
                        mapZebrain
                    </a>{" "}
                    drawn as anatomical context around the cells.{" "}
                    <Ctl>Brain outline</Ctl> is the whole-brain surface;{" "}
                    <Ctl>fibers</Ctl> and <Ctl>cell bodies</Ctl> are the
                    neuropil and soma-rich compartments. All off by default.
                </p>
                {meshesAvailable === false && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Meshes not found — run{" "}
                        <code className="text-neutral-400">
                            python3 scripts/fetch_meshes.py
                        </code>{" "}
                        to download and convert them.
                    </p>
                )}
                {BRAIN_MESH_CONTROLS.map((control) => (
                    <div key={control.key} className="flex flex-col gap-1">
                        <label
                            className={
                                "flex items-center gap-2 text-xs cursor-pointer select-none ml-3 " +
                                (meshesAvailable === false
                                    ? "text-neutral-500 cursor-not-allowed"
                                    : "text-neutral-300")
                            }
                        >
                            <input
                                type="checkbox"
                                checked={settings[control.enabledKey]}
                                disabled={meshesAvailable === false}
                                onChange={(e) =>
                                    // Cast: a computed key from a union of
                                    // string literals widens to string, which
                                    // isn't assignable to Partial<SettingsState>.
                                    update({
                                        [control.enabledKey]: e.target.checked,
                                    } as Partial<SettingsState>)
                                }
                                className="accent-yellow-300"
                            />
                            {control.label}
                        </label>
                        <NumberRow
                            label="opacity"
                            value={settings[control.opacityKey]}
                            min={0}
                            max={1}
                            step={0.05}
                            disabled={
                                meshesAvailable === false ||
                                !settings[control.enabledKey]
                            }
                            onChange={(v) =>
                                update({
                                    [control.opacityKey]: v,
                                } as Partial<SettingsState>)
                            }
                        />
                    </div>
                ))}
                <label
                    className="flex items-center gap-2 text-xs cursor-pointer select-none ml-3 mt-2 text-neutral-300"
                    title="adds the view-orientation icon bar and opens on mapZebrain's default orientation; used when the viewer is embedded in an iframe on mapzebrain.org"
                >
                    <input
                        type="checkbox"
                        checked={settings.embeddedMode}
                        onChange={(e) =>
                            update({ embeddedMode: e.target.checked })
                        }
                        className="accent-yellow-300"
                    />
                    Embedded mode (orientation icons)
                </label>
            </section>
```

- [ ] **Step 7: Verify end to end**

```bash
npm run check
npm run dev
```

In the browser, work through these:

1. Fresh load, no hash: view is unchanged, no meshes.
2. Settings → Brain models → check **Brain outline**: a translucent grey shell appears, enclosing the cell cloud with no cells outside it.
3. Drag the opacity slider: only that mesh's opacity changes.
4. Enable all three, set distinct opacities: all render, independently.
5. Hover and click a cell *through* the shell: the tooltip names a cell and clicking focuses it.
6. Settings → Rendering → **Ambient occlusion** on: no dark rims on the shell.
7. Colors → Gene expression, then Settings → Projection → **mean**: note the colours, then toggle the outline off and on. **The coloured scalar must be identical** — this is the check for the step-2b accumulation corruption. Repeat for **sum**.
8. Projection → **max**: hover through the shell still picks cells correctly.
9. Copy the URL to a new tab: mesh toggles and opacities restore.
10. Load `http://localhost:5173/?mock=1`: mock mode has no `preprocessed/`, so
    the Brain models rows are disabled and show the `scripts/fetch_meshes.py`
    hint rather than erroring.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/BrainMeshes.tsx src/components/brain/sceneObjectNames.ts src/components/brain/usePointCloudPicking.ts src/components/brain/ProjectionRenderPass.tsx src/components/BrainViewer.tsx src/components/filters/SettingsTab.tsx
git commit -m "Render the mapZebrain brain meshes as anatomical context

Three translucent shells, off by default, toggled with per-mesh opacity
from a new Brain models section in Settings. Each is fetched the first
time its toggle goes true, so a user who never enables one downloads
nothing. They render inside a group carrying the shared volume
transform, so they line up with the cells by construction. This also
adds the scene's first lights - the point cloud uses raw ShaderMaterials
and never needed any, so a lit material would have rendered black.

Two passes that render the whole scene had to be taught about them:

- ProjectionRenderPass renders the scene up to four times per frame. The
  shells belong in step 1, the ghost/context underlay, and nowhere else.
  Step 2b renders into an off-screen float target with additive
  blending, and the composite shader reconstructs the reduced scalar
  from those channels - a shell in that buffer would add its colour
  across the whole brain silhouette and silently bias every mean/sum
  projection. Steps 2a and 4 would composite it two or three times over.
- usePointCloudPicking's ID pass renders the scene with an override
  material, where the shells would depth-occlude cells and break
  hovering through them. Scoped to that one block: it is the only
  ID-buffer pass, and normal-mode picking is CPU-geometric.

Ambient occlusion needed no change - the meshes carry the existing
skipAmbientOcclusion userData opt-out."
```

---

### Task 9: Orientation icon bar and the embedded default camera

**Files:**
- Copy in: 7 `.webp` files to `images/`
- Create: `src/components/brain/ViewOrientationBar.tsx`
- Modify: `src/components/BrainViewer.tsx` — mode-dependent camera memo, `VIEWER_FOV_DEG`, render the bar

**Interfaces:**
- Consumes: `VIEW_PRESETS`, `presetPosition`, `fitDistance`, `VIEWER_FOV_DEG`, `EMBEDDED_DEFAULT_PRESET` (Task 5); `applyViewRef` (Task 6); `settings.embeddedMode` (Task 7).
- Produces: `<ViewOrientationBar />`.

- [ ] **Step 1: Copy mapZebrain's icons**

```bash
MZB=../mapzebrain-master/client/src/assets/imgs/3d_view_icons
cp "$MZB/dorsal.webp"                  images/view_dorsal.webp
cp "$MZB/ventral.webp"                 images/view_ventral.webp
cp "$MZB/vertical_left_sagittal.webp"  images/view_sagittal_vertical_left.webp
cp "$MZB/vertical_right_sagittal.webp" images/view_sagittal_vertical_right.webp
cp "$MZB/left_sagittal.webp"           images/view_sagittal_horizontal_left.webp
cp "$MZB/right_sagittal.webp"          images/view_sagittal_horizontal_right.webp
cp "$MZB/coronal.webp"                 images/view_coronal.webp
ls -la images/view_*.webp
```

Expected: 7 files, ~1.3–1.8 KB each. (`screenshot.webp` and `settings.webp` are deliberately not copied.)

- [ ] **Step 2: Write `src/components/brain/ViewOrientationBar.tsx`**

```tsx
import { VIEW_PRESETS, presetPosition, type ViewPresetKey } from './viewPresets';
import dorsalIcon from '../../../images/view_dorsal.webp';
import ventralIcon from '../../../images/view_ventral.webp';
import sagittalVerticalLeftIcon from '../../../images/view_sagittal_vertical_left.webp';
import sagittalVerticalRightIcon from '../../../images/view_sagittal_vertical_right.webp';
import sagittalHorizontalLeftIcon from '../../../images/view_sagittal_horizontal_left.webp';
import sagittalHorizontalRightIcon from '../../../images/view_sagittal_horizontal_right.webp';
import coronalIcon from '../../../images/view_coronal.webp';

/** mapZebrain's own icon artwork, so the bar reads as continuous with the
 *  host page when the viewer is embedded there. Kept out of viewPresets.ts
 *  so that module stays a pure, trivially testable table. */
const PRESET_ICONS: Record<ViewPresetKey, string> = {
  dorsal: dorsalIcon,
  ventral: ventralIcon,
  sagittalVerticalLeft: sagittalVerticalLeftIcon,
  sagittalVerticalRight: sagittalVerticalRightIcon,
  sagittalHorizontalLeft: sagittalHorizontalLeftIcon,
  sagittalHorizontalRight: sagittalHorizontalRightIcon,
  coronal: coronalIcon,
};

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's.
 *  Only rendered in embedded mode. */
export function ViewOrientationBar({
  distance,
  applyView,
}: {
  distance: number;
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
      {VIEW_PRESETS.map((preset) => (
        <button
          key={preset.key}
          title={preset.label}
          onClick={(e) => {
            // The viewer's container div treats a bare click as "focus the
            // cell under the cursor" / "clear focus", so stop here.
            e.stopPropagation();
            applyView(presetPosition(preset, distance), preset.up);
          }}
          className="p-0.5 rounded border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 hover:border-neutral-500"
        >
          <img src={PRESET_ICONS[preset.key]} alt={preset.label} className="h-8 w-8" />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Make the default camera mode-dependent in `BrainViewer.tsx`**

Add the imports:

```ts
import { EMBEDDED_DEFAULT_PRESET, VIEWER_FOV_DEG, fitDistance } from './brain/viewPresets';
import { ViewOrientationBar } from './brain/ViewOrientationBar';
```

Replace the whole `defaultCamPosition` / `minDistance` / `maxDistance` memo with:

```tsx
  // Default camera derived from the data bounds. Normal mode keeps the
  // original landscape framing verbatim — the brain's long rostro-caudal axis
  // runs horizontally across the wide panel, with the volume group transform
  // putting rostral at screen-right.
  //
  // Embedded mode instead opens on mapZebrain's own default: dorsal, brain
  // vertical, rostral up. That rolls the 784-unit rostro-caudal extent from
  // horizontal to vertical, and three's fov is the VERTICAL fov, so the
  // landscape distance would clip the rostral and caudal tips — hence
  // fitDistance. presetDistance is also the orbit distance the icon bar uses,
  // so no preset can clip either.
  const { defaultCamPosition, defaultCamUp, presetDistance, minDistance, maxDistance } =
    useMemo(() => {
      const { min, max } = data.bounds;
      const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      const presetDistance = fitDistance(span);
      const embedded = settings.embeddedMode;
      return {
        defaultCamPosition: (embedded
          ? [0, 0, presetDistance]
          : [0, 0, span * 0.95]) as [number, number, number],
        defaultCamUp: (embedded ? EMBEDDED_DEFAULT_PRESET.up : [0, 1, 0]) as [
          number,
          number,
          number,
        ],
        presetDistance,
        // Hard zoom-in floor. Without it, TrackballControls' default
        // minDistance=0 lets the wheel keep shrinking the camera-to-target
        // offset asymptotically: the view stops changing once the eye is
        // sub-pixel close, but further wheel ticks keep updating it, and
        // zooming back out is a slow exponential climb back through all that
        // compounded zoom. With minDistance set,
        // TrackballControls._checkDistances clamps the eye and resets the zoom
        // accumulator (_zoomStart.copy(_zoomEnd)) the instant we hit the
        // floor, turning it into a hard wall.
        minDistance: span * 0.15,
        maxDistance: span * 5,
      };
    }, [data, settings.embeddedMode]);
```

Delete the temporary `const defaultCamUp: [number, number, number] = [0, 1, 0];` line added in Task 6.

Use the shared fov constant in the Canvas:

```tsx
        camera={{ position: camPosition, fov: VIEWER_FOV_DEG, near: 0.1, far: 10000 }}
```

- [ ] **Step 4: Render the bar**

As a sibling of the existing `absolute top-2 left-2` overlay div (not inside it — that one is `pointer-events-none`), right after it:

```tsx
      {settings.embeddedMode && !settings.screenshotMode && (
        <ViewOrientationBar
          distance={presetDistance}
          applyView={(position, up) => applyViewRef.current?.(position, up)}
        />
      )}
```

- [ ] **Step 5: Verify**

```bash
npm run check
npm run dev
```

Then:

1. `http://localhost:5173/` — opening view **identical to before**: no icon bar, brain pointing screen-right.
2. `http://localhost:5173/?embed=1` — icon bar at top-centre; brain **vertical, rostral up**; neither the rostral nor the caudal tip clipped. Resize the window narrow and wide and confirm it stays fully visible.
3. Click each of the 7 icons in turn and confirm each produces the view its glyph shows. **Check the two sagittal pairs against the glyphs** — if left/right are mirrored, swap the `dir` signs within each sagittal pair in `viewPresets.ts` (and note it in the commit).
4. In `?embed=1`, rotate away, confirm "reset view" appears, click **Dorsal**, confirm the view matches the opening view and "reset view" disappears.
5. Toggle the Settings embedded-mode checkbox off and on: the bar appears/disappears and the camera does **not** jump.
6. Turn on `screenshotMode`: the bar hides.

- [ ] **Step 6: Commit**

```bash
git add images/view_*.webp src/components/brain/ViewOrientationBar.tsx src/components/BrainViewer.tsx
git commit -m "Add the view-orientation icon bar and embedded default camera

Seven buttons above the 3D view using mapZebrain's own icon artwork, so
the bar reads as continuous with the host page once the viewer is in an
iframe there. Only rendered in embedded mode, and hidden in screenshot
mode.

Embedded mode also opens on mapZebrain's default orientation - dorsal,
brain vertical, rostral up - which needs its own camera distance. Rolling
the 784-unit rostro-caudal extent from horizontal to vertical means it is
now measured against three's vertical fov, where warp's landscape
span*0.95 clips the rostral and caudal tips; fitDistance solves for it
instead. The same distance is the icon bar's orbit distance, so no preset
can clip either. Normal mode keeps span*0.95 and up (0,1,0) verbatim, so
the non-embedded view is unchanged."
```

---

### Task 10: Attribution and documentation

**Files:**
- Modify: `src/components/filters/AboutTab.tsx` — new section before "Code"
- Modify: `README.md`, `scripts/preprocess.py` (stale orientation comment)
- Modify: `docs/preprocess.md`, `docs/ui/viewer.md`, `docs/settings.md`, `docs/sharing.md`, `docs/export.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code interfaces.

- [ ] **Step 1: Add the About-tab attribution**

In `src/components/filters/AboutTab.tsx`, immediately before the existing `Code` section:

```tsx
            <section className="flex flex-col gap-1">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Brain models
                </div>
                <p className="text-neutral-400 leading-snug">
                    The whole-brain reference meshes (outline, fibers, cell
                    bodies) and the view-orientation icons come from{" "}
                    <a
                        href="https://mapzebrain.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-yellow-300 hover:underline"
                    >
                        mapZebrain
                    </a>{" "}
                    (<em>Kunst et al., 2019</em>), the shared reference brain
                    this dataset is registered into. Enable them under Settings
                    → Brain models.
                </p>
            </section>
```

- [ ] **Step 2: Fix the stale orientation comment**

The volume group transform rotates the brain 90°, so "anterior at the top of the screen" has been wrong since it was added. In `scripts/preprocess.py`, change the coordinate-block comment:

```python
    # Convert (z, x, y) → (x, y, z) and center on origin.
    # Then negate the AP axis so rostral is +y in preprocessed space.
    # NOTE: this is not yet what you see on screen — the viewer renders the
    # point cloud inside a group that maps preprocessed (x, y, z) to world
    # (y, x, z), which lays the rostro-caudal axis horizontally across the
    # wide 3D panel. See src/components/brain/volumeTransform.ts.
```

And in `README.md`, change "flips the AP axis so anterior renders at the top of the screen" to "flips the AP axis so rostral is +y in preprocessed space (the viewer then rotates the volume 90° for landscape framing — see `src/components/brain/volumeTransform.ts`)".

- [ ] **Step 3: Document the meshes in `docs/preprocess.md`**

Append this section:

````markdown
### Brain meshes (mapZebrain) {#brain-meshes}

`scripts/fetch_meshes.py` downloads mapZebrain's three whole-brain reference
meshes and converts them into the viewer's coordinate space. It is optional —
the viewer runs without it, and the **Brain models** controls in Settings stay
disabled until it has been run. It needs network access and must run *after*
`scripts/preprocess.py`.

| mesh | source | triangles |
|---|---|---|
| outline | `api.mapzebrain.org/media/Brains/Outline/Outline_new.stl` | 54,874 |
| fibers | `api.mapzebrain.org/media/Brains/Fibers/Fibers.stl` | 9,758 |
| cell bodies | `api.mapzebrain.org/media/Brains/Cell_bodies/Cell bodies.stl` | 9,756 |

The meshes are generated on mapZebrain's side from the reference-brain TIFF
masks by ImageJ's 3D Viewer, so their vertices are in **reference-volume voxel
indices** (597 × 974 × 359 = LR × AP × DV) — the same space as the WARP
dataset's `Coords_All.npy`. Converting them is therefore exactly the transform
this script already applies to cell positions:

```
out_x =   stl_x - voxelCenter[0]     # LR
out_y = -(stl_y - voxelCenter[1])    # AP, negated so rostral is +y
out_z =   stl_z - voxelCenter[2]     # DV
```

`voxelCenter` is read from `neurons.json` rather than hardcoded, so the mesh
center cannot drift from the cell center.

There are three coordinate spaces in play, and it is worth keeping them
straight:

| space | x | y | z |
|---|---|---|---|
| mapZebrain voxel / WARP raw | LR column | AP row (caudal +) | DV slice (dorsal +) |
| preprocessed (`positions.bin`) | lateral, centered | rostral + | dorsal + |
| world (what the camera sees) | rostral + | lateral | dorsal + |

The last hop is a group transform in the viewer, not in preprocessing — see
`src/components/brain/volumeTransform.ts`. It rotates the volume 90° so the
brain's long axis lies across the wide 3D panel, which is why the default view
shows the fish pointing screen-right.

**Output** (alongside the cell blobs), plus its own `meshes.json` manifest so
the primary dataset load path is untouched and meshes are fetched lazily:

```
preprocessed/meshOutline.bin.gz      non-indexed float32 vertex positions
preprocessed/meshFibers.bin.gz       9 floats per triangle
preprocessed/meshCellBodies.bin.gz
preprocessed/meshes.json
```

**Self-check.** The script asserts each mesh's triangle count matches its STL
header and that the transformed outline mesh encloses the cell bounds from
`neurons.json` on all six faces, exiting non-zero and naming the offending axis
otherwise. That containment is what catches a coordinate-transform regression;
without it a wrong flip would produce a brain drawn confidently in the wrong
place.
````

- [ ] **Step 4: Document the UI**

- `docs/ui/viewer.md` — the orientation icon bar, embedded mode and `?embed=1`, and the world-axis convention (default view has rostral at screen-right; embedded mode opens portrait, rostral up).
- `docs/settings.md` — the Brain models section, the three toggles, per-mesh opacity, and the `scripts/fetch_meshes.py` prerequisite.
- `docs/sharing.md` — add the mesh toggles and opacities to the settings row; note `embeddedMode` is **not** shared, like `screenshotMode`.
- `docs/export.md` — clarify that the exported `x`, `y`, `z` are preprocessed coordinates, which the viewer rotates 90° for display, so they do not literally match screen axes.

- [ ] **Step 5: Update the README feature list and setup**

- Add `python3 scripts/fetch_meshes.py` to the setup sequence after `preprocess.py`, noting it needs network access and is optional (the viewer works without it; the Brain models controls just stay disabled).
- Mention brain models and embedded mode in "What you can do with it".
- Add the mapZebrain attribution for the meshes and icons.

- [ ] **Step 6: Verify the docs build**

```bash
npm run check
npm run docs:build
```

Expected: both succeed. `npm run docs:build` must not pick up `specs/` or `plans/` — they live at the repo root precisely because VitePress globs every `.md` under `docs/`.

- [ ] **Step 7: Commit**

```bash
git add src/components/filters/AboutTab.tsx README.md scripts/preprocess.py docs/
git commit -m "Document and credit the mapZebrain brain models

Attribution in the About tab, README, and docs: the meshes and the
orientation icons are mapZebrain's work (Kunst et al., 2019), the same
citation form the docs already use for the 112-region atlas.

Also corrects a comment that has been wrong since the volume group
transform was added: preprocess.py and the README both claimed anterior
renders at the top of the screen, but the viewer rotates the volume 90
degrees for landscape framing, so rostral is at screen-right. Same
looseness in docs/export.md, where the exported coordinates are
preprocessed rather than world ones."
```

---

## Verification summary

Automated (`npm run check` plus the mesh script):

| check | covers |
|---|---|
| `fetch_meshes.py` containment self-check | the coordinate transform — the highest-risk piece |
| `meshLoader.test.ts` | manifest validation, blob size validation, key↔settings mapping |
| `volumeTransform.test.ts` | preprocessed→world mapping, mirror, length preservation |
| `viewPresets.test.ts` | all 7 preset bases, portrait framing distance, `isAtDefaultCamera` |
| `urlState.test.ts` | mesh settings round-trip and clamping, `embeddedMode` never persisted |

Manual, and not skippable — three of these cannot be caught by any test here:

- **LR handedness** of the two sagittal pairs against the icon glyphs (Task 9 step 5.3). The volume transform is a mirror and the brain is near-symmetric, so this is not derivable.
- **Mean/sum projection identical with the outline on and off** (Task 8 step 7.7). This is the check for the accumulation-buffer corruption.
- **Non-embedded opening view unchanged** (Task 9 step 5.1).

## Post-implementation

Confirm with the mapZebrain team that reusing their meshes and icon artwork is fine before this ships publicly. The feature exists to embed into their site, so this is presumably a formality, but it should be asked rather than assumed.
