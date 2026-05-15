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
// the integer Brain_reg labels in the WARP postprocessed data. Names
// are the paper's (Marquez-Legorreta et al., Figure 5 / S6 captions)
// abbreviations. Full names:
//   InfMO     Inferior Medulla Oblongata
//   IntMO     Intermediate Medulla Oblongata
//   SupMO     Superior Medulla Oblongata
//   SupRaphe  Superior dorsal raphe
//   Cb        Cerebellum
//   Tg        Tegmentum
//   NI        Nucleus Isthmi
//   OTpv      Optic tectum periventricular layer
//   OTnp      Optic tectum neuropil
//   Pt        Pretectum
//   preTh     Prethalamus
//   Th        Dorsal Thalamus
//   Hab       Habenula
//   HypTh     Hypothalamus
//   SubP      Subpallium
//   Pal       Dorsal Pallium
export const REGION_NAMES: string[] = [
  'Unassigned', // 0
  'InfMO',      // 1
  'IntMO',      // 2
  'SupMO',      // 3
  'SupRaphe',   // 4
  'Cb',         // 5
  'Tg',         // 6
  'NI',         // 7
  'OTpv',       // 8
  'OTnp',       // 9
  'Pt',         // 10
  'preTh',      // 11
  'Th',         // 12
  'Hab',        // 13
  'HypTh',      // 14
  'SubP',       // 15
  'Pal',        // 16
];

// Full names parallel to REGION_NAMES, in sentence case. Used by the
// Anatomy dropdown so the user sees "Abbr — Full name"; the legend and
// tooltips stick to the short abbreviation in REGION_NAMES.
export const REGION_FULL_NAMES: string[] = [
  'Unassigned',                          // 0
  'Inferior medulla oblongata',          // 1
  'Intermediate medulla oblongata',      // 2
  'Superior medulla oblongata',          // 3
  'Superior dorsal raphe',               // 4
  'Cerebellum',                          // 5
  'Tegmentum',                           // 6
  'Nucleus isthmi',                      // 7
  'Optic tectum periventricular layer',  // 8
  'Optic tectum neuropil',               // 9
  'Pretectum',                           // 10
  'Prethalamus',                         // 11
  'Dorsal thalamus',                     // 12
  'Habenula',                            // 13
  'Hypothalamus',                        // 14
  'Subpallium',                          // 15
  'Dorsal pallium',                      // 16
];

// Paper-canonical display order (anterior → posterior rainbow, then
// "Unassigned" last). Entries are data-indices into REGION_NAMES /
// the manifest's regionNames. Used by the Anatomy dropdown and the
// region legend so the on-screen order matches the paper's figures
// rather than alphabetical-on-display-string.
export const REGION_PAPER_ORDER: number[] = [
  16, // Pal
  15, // SubP
  14, // HypTh
  13, // Hab
  12, // Th
  11, // preTh
  10, // Pt
   9, // OTnp
   8, // OTpv
   7, // NI
   6, // Tg
   5, // Cb
   4, // SupRaphe
   3, // SupMO
   2, // IntMO
   1, // InfMO
   0, // Unassigned
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
