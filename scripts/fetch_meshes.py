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
