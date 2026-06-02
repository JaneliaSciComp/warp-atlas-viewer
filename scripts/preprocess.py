#!/usr/bin/env python3
"""
Convert the WARP postprocessed numpy data into a small set of typed-array
binary blobs + a JSON manifest that the web app loads.

Reads from   ./data/postprocessed and ./data/Fish1/assign_spots_em (gene name
                                  ordering)
Writes to    ./preprocessed/{neurons.json, *.bin}
Never modifies anything in ./data/.
"""

import json
import os
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / 'data'
PP = DATA / 'postprocessed'
FISH1_SPOTS = DATA / 'Fish1' / 'assign_spots_em'
OUT = REPO / 'preprocessed'
OUT.mkdir(exist_ok=True)

# Empirically determined column-order of genes_df_All by matching each column
# against the per-fish *_counts.npy arrays. See the inspection notebook in
# the chat history. This is the canonical gene name list for the 41-gene panel.
GENE_ORDER = [
    'cart2', 'glyt2', 'tac1', 'pvalb7', 'npb', 'grm1b', 'irx1b', 'dat',
    'net', 'calb1', 'penka', 'penkb', 'eomesa', 'emx3', 'cfos', 'gad1b',
    'cx43', 'vglut2a', 'sst', 'uts1', 'pou4f2', 'cort', 'nr4a2a', 'cckb',
    'tph2', 'chata', 'calb2a', 'npy', 'gfra1a', 'dmbx1a', 'gbx2', 'crhb',
    'nefma', 'chodl', 'pyya', 'zic2a', 'th', 'pdyn', 'tbr1b', 'otpa',
    'esrrb',
]
assert len(GENE_ORDER) == 41

# Brain_reg values 1..16 index 16 anatomical groupings the paper focuses
# on, with 0 meaning "outside any focal region". Names are the paper's
# (Marquez-Legorreta et al., Figure 5 / S6 captions) abbreviations. Full
# names corresponding to each abbreviation:
#   InfMO     Inferior Medulla Oblongata
#   IntMO     Intermediate Medulla Oblongata
#   SupMO     Superior Medulla Oblongata
#   SupRaphe  Superior dorsal raphe
#   Cb        Cerebellum
#   Tg        Tegmentum
#   NI        Nucleus Isthmi
#   OTpv      Optic tectum periventricular layer
#   OTnp      Optic tectum neuropil
#   Pt        Pretectum
#   preTh     Prethalamus
#   Th        Dorsal Thalamus
#   Hab       Habenula
#   HypTh     Hypothalamus
#   SubP      Subpallium
#   Pal       Dorsal Pallium
BRAIN_REG_NAMES = [
    'Unassigned',   # 0 (76,511 cells, mixed — not a focal region)
    'InfMO',        # 1
    'IntMO',        # 2
    'SupMO',        # 3
    'SupRaphe',     # 4
    'Cb',           # 5
    'Tg',           # 6
    'NI',           # 7
    'OTpv',         # 8
    'OTnp',         # 9
    'Pt',           # 10
    'preTh',        # 11
    'Th',           # 12
    'Hab',          # 13
    'HypTh',        # 14
    'SubP',         # 15
    'Pal',          # 16
]
assert len(BRAIN_REG_NAMES) == 17  # 0 + 16

# Eight visual stimuli used in the VisRap protocol. Generic labels —
# replace with canonical names if/when available.
STIMULUS_NAMES = [
    'stim_1', 'stim_2', 'stim_3', 'stim_4',
    'stim_5', 'stim_6', 'stim_7', 'stim_8',
]


def main():
    print('[preprocess] loading postprocessed arrays...')
    coords = np.load(PP / 'Coords_All.npy')          # (N, 3)  z, x, y
    genes_df = np.load(PP / 'genes_df_All.npy')      # (N, 41)
    genes_bin = np.load(PP / 'BinaryGenes_All.npy')  # (N, 41)
    brain_reg = np.load(PP / 'Brain_reg.npy')        # (N,)    1..16, 0=unassigned
    # 112-region mapZebrain atlas membership (Modified from Kunst et al.,
    # 2019). Overlapping/hierarchical — each cell can sit in 0..9 regions
    # (e.g. cerebellum ⊂ rhombencephalon). Region names live in the
    # per-fish region_names.npy files; all three fish ship identical lists.
    atlas_mask = np.load(PP / 'BrainRegions_All.npy')  # (N, 112) bool
    atlas_names = np.load(DATA / 'Fish1' / 'region_names.npy', allow_pickle=True)
    for fish in ('Fish2', 'Fish3'):
        other = np.load(DATA / fish / 'region_names.npy', allow_pickle=True)
        assert (other == atlas_names).all(), f'{fish}/region_names.npy diverges from Fish1'
    # Convert source identifiers like `pretectum__alar_part` to display
    # labels without leaving double spaces from doubled underscores.
    atlas_names = [
        ' '.join(str(s).replace('_', ' ').split())
        for s in atlas_names.tolist()
    ]
    assert len(atlas_names) == 112
    assert atlas_mask.shape[1] == 112
    # cluster_labelsAll2 is the canonical 1-indexed labeling: label 0 means
    # "not assigned to any of the 332 named subtypes", and label k (1..332)
    # corresponds exactly to good_cls_names[k-1] (verified by exact-profile
    # match against unique_types_full). cluster_labelsAll3 is a re-permuted
    # version — using it without the inverse permutation scrambles the
    # label↔name mapping (the cells in cl3==80 are actually pou4f2_cckb,
    # not vglut2a_zic2a as the row index would suggest).
    cluster_lbl = np.load(PP / 'cluster_labelsAll2.npy')  # (N,) 0..332
    fish_id = np.load(PP / 'fish_id.npy')            # (N,)    59 / 63 / 71
    tsne = np.load(PP / 'tsne_results_20240527.npy') # (N, 2)
    trace = np.load(PP / 'dff_traceAllavg.npy')      # (N, 268)
    # big_corr_regsAllMix is the cycle-wide Pearson r between each cell's
    # activity trace and the stimulus regressor (max of regular + delayed).
    # This is the array the paper uses for Fig 5C/D and for naming
    # stimulus-responsive subtypes — the windowed/median variant
    # (high_corr_perSimMix) skews positive and doesn't reproduce the
    # paper's anti-correlated cluster listings.
    stim_corr = np.load(PP / 'big_corr_regsAllMix.npy')  # (N, 8)
    swim_corr = np.load(PP / 'swim_corr_All.npy')        # (N,)  Pearson r vs swim power
    cluster_names_raw = np.load(PP / 'good_cls_names.npy')  # (332,)
    regressors_avg = np.load(PP / 'regressors_avg.npy')     # (8, 268)

    n_total = coords.shape[0]
    print(f'[preprocess] {n_total} total cells')

    # Filter: drop cells with NaN coords. (Trace NaN are a near-superset of
    # coord NaN; we additionally zero-fill any remaining NaN traces.)
    valid = ~np.isnan(coords).any(axis=1)
    keep_idx = np.where(valid)[0]
    n = keep_idx.size
    print(f'[preprocess] keeping {n} cells with valid coords')

    coords = coords[keep_idx]                          # (n, 3) zxy
    genes_df = genes_df[keep_idx].astype(np.float32)
    genes_bin = genes_bin[keep_idx].astype(np.uint8)
    brain_reg_int = brain_reg[keep_idx].astype(np.int16)
    # Pack the 112-bit membership row to 14 bytes little-endian so the JS
    # side decodes with `(mask[i*14 + (r>>3)] >> (r&7)) & 1`.
    atlas_mask_packed = np.packbits(
        atlas_mask[keep_idx].astype(np.uint8), axis=1, bitorder='little'
    )
    assert atlas_mask_packed.shape == (keep_idx.size, 14)
    cluster_lbl = cluster_lbl[keep_idx].astype(np.int16)
    fish_id = fish_id[keep_idx].astype(np.int32)
    tsne = tsne[keep_idx].astype(np.float32)
    trace = np.nan_to_num(trace[keep_idx], copy=False).astype(np.float32)
    stim_corr = np.nan_to_num(stim_corr[keep_idx], copy=False).astype(np.float32)
    swim_corr = np.nan_to_num(swim_corr[keep_idx], copy=False).astype(np.float32)

    # Downsample the activity trace temporally by 2x using simple boxcar
    # averaging. Keeps stimulus-onset dynamics visible while halving the
    # download size. 268 timepoints @ 2 Hz → 134 timepoints @ 1 Hz.
    SAMPLING_RATE_HZ = 2.0
    DOWNSAMPLE = 2
    T_orig = trace.shape[1]
    T_ds = T_orig // DOWNSAMPLE
    trace = trace[:, :T_ds * DOWNSAMPLE].reshape(-1, T_ds, DOWNSAMPLE).mean(axis=2).astype(np.float32)
    regressors_avg = (
        regressors_avg[:, :T_ds * DOWNSAMPLE]
        .reshape(regressors_avg.shape[0], T_ds, DOWNSAMPLE)
        .mean(axis=2)
    )
    effective_rate = SAMPLING_RATE_HZ / DOWNSAMPLE
    duration_s = T_ds / effective_rate
    print(f'[preprocess] trace timepoints: {T_orig} @ {SAMPLING_RATE_HZ} Hz → {T_ds} @ {effective_rate} Hz '
          f'({duration_s:.1f} s)')

    # Compute stimulus on-windows from the regressor traces, in seconds —
    # the manuscript shows stim-locked plots in seconds, so the app needs
    # this to draw overlay bars on the activity-trace plot.
    stim_windows = []
    for s in range(regressors_avg.shape[0]):
        on = np.where(regressors_avg[s] > 0)[0]
        if len(on) == 0:
            stim_windows.append([0.0, 0.0])
        else:
            stim_windows.append([float(on[0]) / effective_rate,
                                 float(on[-1] + 1) / effective_rate])
    print(f'[preprocess] stimulus windows (seconds): {stim_windows}')

    # Convert (z, x, y) → (x, y, z) and center on origin.
    # Then negate the AP axis so the rendered orientation matches the paper:
    # anterior (telencephalon) at +y → top of screen, posterior (medulla)
    # at -y → bottom. Without this flip, Three.js's default Y-up shows the
    # brain upside-down on AP.
    z = coords[:, 0].astype(np.float32)
    x = coords[:, 1].astype(np.float32)
    y = coords[:, 2].astype(np.float32)
    pos = np.stack([x, y, z], axis=1)
    pos -= pos.mean(axis=0, keepdims=True)
    pos[:, 1] = -pos[:, 1]

    bounds_min = pos.min(axis=0).tolist()
    bounds_max = pos.max(axis=0).tolist()
    print(f'[preprocess] position bounds: {bounds_min} → {bounds_max}')

    # fish 59/63/71 → 0/1/2 (uint8). Track which cells matched a known
    # source id so a stray 4th fish (or a typo) doesn't get silently
    # aliased to 0 by np.zeros's default — the bug would merge it with
    # Fish 1.
    fish_remap = np.zeros(n, dtype=np.uint8)
    matched = np.zeros(n, dtype=bool)
    FISH_SOURCES = [59, 63, 71]
    for k, src in enumerate(FISH_SOURCES):
        mask = fish_id == src
        fish_remap[mask] = k
        matched |= mask
    if not matched.all():
        unknown = np.unique(fish_id[~matched]).tolist()
        raise SystemExit(
            f'[preprocess] unrecognized fish id(s) in input: {unknown}. '
            f'Expected only {FISH_SOURCES}. Update FISH_SOURCES if a new '
            f'fish was added upstream, or fix the source data.'
        )

    # Center UMAP and scale to roughly [-1,1] range so the panel projection
    # works the same as it did for mock data.
    tsne_centered = tsne - tsne.mean(axis=0, keepdims=True)
    span = max(np.abs(tsne_centered).max(), 1e-6)
    umap = (tsne_centered / span * 50.0).astype(np.float32)

    # cluster_labelsAll2 ranges 0..332. Index 0 = "Unassigned" (cells that
    # didn't match any of the 332 unique gene combinations), 1..332 align
    # one-to-one with good_cls_names[0..331].
    cluster_names = ['Unassigned'] + [str(s) for s in cluster_names_raw.tolist()]
    n_clusters = len(cluster_names)
    print(f'[preprocess] {n_clusters} cluster names (index 0 = Unassigned)')

    assert cluster_lbl.min() >= 0 and cluster_lbl.max() < n_clusters, (
        f'cluster_lbl out of range: [{cluster_lbl.min()}, {cluster_lbl.max()}]'
    )

    # Affine-quantize the activity trace to uint16 to halve wire size
    # and (critically) drop it below browser per-resource HTTP-cache caps
    # so it gets cached across reloads. Range is auto-fit to the data
    # with a 1-unit margin so we never clip; per analysis on the current
    # dataset the quantization step (~1e-4) is ~1000× below the per-sample
    # measurement noise (~0.1), so this is effectively lossless.
    trace_lo = float(np.floor(trace.min()) - 1)
    trace_hi = float(np.ceil(trace.max()) + 1)
    trace_q = np.round(
        (trace - trace_lo) / (trace_hi - trace_lo) * 65535.0
    ).clip(0, 65535).astype(np.uint16)
    print(
        f'[preprocess] activityTrace quantized to uint16 over '
        f'[{trace_lo}, {trace_hi}], step={ (trace_hi - trace_lo) / 65535:.2e}'
    )

    files = {
        'positions': ('positions.bin', pos.astype(np.float32)),
        'regionIds': ('regionIds.bin', brain_reg_int),
        'clusterIds': ('clusterIds.bin', cluster_lbl),
        'fishIds': ('fishIds.bin', fish_remap),
        'geneCounts': ('geneCounts.bin', genes_df),
        'geneBinary': ('geneBinary.bin', genes_bin),
        'umap': ('umap.bin', umap),
        'stimulusCorr': ('stimulusCorr.bin', stim_corr),
        'swimCorr': ('swimCorr.bin', swim_corr),
        'activityTrace': ('activityTrace.bin', trace_q),
        'regressors': ('regressors.bin', regressors_avg.astype(np.float32)),
        'atlasRegionMask': ('atlasRegionMask.bin', atlas_mask_packed),
    }

    for key, (name, arr) in files.items():
        path = OUT / name
        with open(path, 'wb') as f:
            f.write(arr.tobytes())
        size_mb = arr.nbytes / 1e6
        print(f'[preprocess] {name:24s} {arr.dtype} {arr.shape}  {size_mb:7.2f} MB')

    manifest = {
        'version': 3,
        'count': int(n),
        'traceLength': int(trace.shape[1]),
        'traceSampleRateHz': float(effective_rate),
        'activityTraceQuant': {'lo': trace_lo, 'hi': trace_hi},
        'stimulusWindowsSec': stim_windows,
        'nStimuli': int(stim_corr.shape[1]),
        'geneNames': GENE_ORDER,
        'regionNames': BRAIN_REG_NAMES,
        'atlasRegionNames': atlas_names,
        'stimulusNames': STIMULUS_NAMES,
        'clusterNames': cluster_names,
        'bounds': {'min': bounds_min, 'max': bounds_max},
        'files': {k: name for k, (name, _) in files.items()},
        'note': (
            'Real WARP dataset (manuscript revision). Cells filtered to drop '
            'NaN coordinates. Coordinate axes reordered (z,x,y → x,y,z) and '
            'centered on origin. brain region 0 = unassigned to a focal '
            'region; clusterIds index into 332 unique gene-expression '
            'subtypes (good_cls_names).'
        ),
    }
    with open(OUT / 'neurons.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'[preprocess] wrote manifest to {OUT}/neurons.json')


if __name__ == '__main__':
    main()
