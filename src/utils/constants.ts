// Mock-data fallback labels. The real data ships with its own gene /
// region / stimulus / cluster names via the JSON manifest, so these
// values are only used when ./preprocessed/neurons.json is missing.

export const GENE_NAMES: string[] = [
  'cart2', 'glyt2', 'tac1', 'pvalb7', 'npb', 'grm1b', 'irx1b', 'dat',
  'net', 'calb1', 'penka', 'penkb', 'eomesa', 'emx3', 'cfos', 'gad1b',
  'cx43', 'vglut2a', 'sst', 'uts1', 'pou4f2', 'cort', 'nr4a2a', 'cckb',
  'tph2', 'chata', 'calb2a', 'npy', 'gfra1a', 'dmbx1a', 'gbx2', 'crhb',
  'nefma', 'chodl', 'pyya', 'zic2a', 'th', 'pdyn', 'tbr1b', 'otpa',
  'esrrb',
];

// 16 focal anatomical regions + "Unassigned" at index 0. Order matches
// the Brain_reg labels in the WARP postprocessed data — see
// scripts/preprocess.py for how the mapping was recovered.
export const REGION_NAMES: string[] = [
  'Unassigned',
  'Inferior medulla',
  'Intermediate medulla',
  'Superior medulla',
  'Superior raphe',
  'Cerebellum',
  'Tegmentum',
  'Superior ventral medulla',
  'Optic tectum',
  'Tectal neuropil',
  'Pretectum',
  'Prethalamus',
  'Dorsal thalamus',
  'Habenula',
  'Hypothalamus',
  'Ventral telencephalon',
  'Dorsal telencephalon',
];

// Eight visual stimuli in the VisRap protocol.
export const STIMULUS_NAMES: string[] = [
  'stim_1', 'stim_2', 'stim_3', 'stim_4',
  'stim_5', 'stim_6', 'stim_7', 'stim_8',
];

export const N_GENES = GENE_NAMES.length;
export const N_REGIONS = REGION_NAMES.length;
export const N_STIMULI = STIMULUS_NAMES.length;

// 30 clusters in mock data — real data has 333.
export const MOCK_N_CLUSTERS = 30;
