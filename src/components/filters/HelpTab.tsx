import type { NeuronDataset, FilterState, ColorMode, SwimMode } from '../../data/types';

/** A "reproduce this finding" preset for the Help tab. References the
 *  dataset by name (cluster/gene name strings, stimulus indices) so
 *  presets stay valid if cluster IDs shift between dataset versions. */
interface FindingPreset {
  title: string;
  /** Figure / abstract reference shown next to the button. */
  figure: string;
  /** One-line description of what the user should look for. */
  description: string;
  colorMode?: ColorMode;
  /** Cluster name (e.g. 'pou4f2_cckb'). Resolved against data.clusterNames. */
  cluster?: string;
  /** Gene name (e.g. 'otpa'). Resolved against data.geneNames. */
  gene?: string;
  /** Stimulus indices (0..7) — these are stable across dataset versions. */
  stimuli?: number[];
  /** Optional swim filter, e.g. 'positive' to keep only swim-driven cells.
   *  Used when the paper's claim links a gene or cluster to swimming. */
  swimMode?: SwimMode;
}

// Ordered to follow the manuscript figures so a reader can walk through
// the paper alongside the viewer.
const FINDINGS: FindingPreset[] = [
  {
    title: 'calb2a_nefma — forward visual motion',
    figure: 'Figure 3C',
    description:
      'Hindbrain calb2a_nefma cells respond strongest to forward visual motion (the swim-eliciting stimulus).',
    colorMode: 'stim',
    cluster: 'calb2a_nefma',
    stimuli: [0],
  },
  {
    title: 'calb2a_gfra1a — luminance & looming',
    figure: 'Figure 3C',
    description:
      'Tectal calb2a_gfra1a cells respond preferentially to the last four stimuli (light flash, dark flash, right loom, left loom).',
    colorMode: 'stim',
    cluster: 'calb2a_gfra1a',
    stimuli: [4, 5, 6, 7],
  },
  {
    title: 'pou4f2_cckb_chata — dark and bright flashes',
    figure: 'Figure 3D',
    description:
      'Tectal pou4f2_cckb_chata cells respond to both bright and dark flashes — combined via OR logic so cells that pass either count.',
    colorMode: 'stim',
    cluster: 'pou4f2_cckb_chata',
    stimuli: [4, 5],
  },
  {
    title: 'otpa+ swim-related neurons',
    figure: 'Figure 3G',
    description:
      'otpa-expressing neurons whose calcium activity correlates with swim power. The visible set is gene-positive AND swim-driven, painted by otpa spot count.',
    colorMode: 'gene',
    gene: 'otpa',
    swimMode: 'positive',
  },
  {
    title: 'pvalb7_eomesa task-related neurons',
    figure: 'Figure 4D-E · abstract',
    description:
      'Hippocampal-like pvalb7+/eomesa+ population in the dorsal pallium with task-structured calcium activity.',
    colorMode: 'highlight',
    cluster: 'pvalb7_eomesa',
  },
  {
    title: 'gad1b_tph2_gfra1a — anti-forward-motion raphe',
    figure: 'Figure 5D',
    description:
      'One of the 15 largest multi-gene subtypes negatively correlated with forward visual motion (Fig 5D). The Detail-panel per-stimulus chart shows the cluster\'s negative forward-motion bar; the new Swim correlation histogram exposes the per-cell distribution. The stim color ramp is positive-only, so no visual stimulus filter is applied — switch the Colors card to inspect the cluster.',
    colorMode: 'highlight',
    cluster: 'gad1b_tph2_gfra1a',
  },
  {
    title: 'pou4f2_cckb dimming-light response',
    figure: 'Figure 5F · abstract',
    description:
      'Tectal pou4f2_cckb subtype is positively correlated with the dark-flash stimulus — the cckb-pou4f2 luminance-coding population highlighted in the abstract.',
    colorMode: 'stim',
    cluster: 'pou4f2_cckb',
    stimuli: [4],
  },
];

function buildPresetFilter(p: FindingPreset, data: NeuronDataset): Partial<FilterState> | null {
  const out: Partial<FilterState> = {};
  if (p.colorMode) out.colorMode = p.colorMode;
  if (p.cluster) {
    const idx = data.clusterNames.indexOf(p.cluster);
    if (idx < 0) return null;
    out.txMode = 'subtype';
    out.selectedCluster = idx;
    out.clusterAll = false;
  }
  if (p.gene) {
    const idx = data.geneNames.indexOf(p.gene);
    if (idx < 0) return null;
    out.txMode = 'gene';
    out.selectedGenes = [idx];
  }
  if (p.stimuli && p.stimuli.length > 0) {
    out.selectedStimuli = [...p.stimuli].sort((a, b) => a - b);
  }
  if (p.swimMode) {
    out.swimMode = p.swimMode;
  }
  return out;
}

export function HelpTab({
  data,
  applyView,
}: {
  data: NeuronDataset;
  applyView: (preset: Partial<FilterState>) => void;
}) {
  return (
    <div className="flex flex-col gap-4 pb-3 text-xs font-mono text-neutral-300 max-w-2xl">
      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          What you're looking at
        </div>
        <p className="text-neutral-400 leading-snug">
          ~274,000 neurons from the larval-zebrafish WARP atlas (
          <a
            href="https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-300 hover:underline"
          >
            paper
          </a>
          ), each one mapped to (1) a 3D position in the brain,
          (2) expression counts for 41 genes, (3) one of 333
          molecularly-defined subtypes, and (4) a calcium response
          to 8 visual stimuli. The 3D viewer and the t-SNE show the
          same cells in two spaces — anything you select in one is
          highlighted in the other.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Panels
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">3D viewer</span> — anatomical view; legend top-right</li>
          <li><span className="text-neutral-200">t-SNE</span> (bottom right) — cells grouped by transcriptomic similarity</li>
          <li><span className="text-neutral-200">Details</span> (right edge, click the ‹ handle to toggle) — populated when you click a cell or lasso a group</li>
          <li><span className="text-neutral-200">Filters / Settings / Help</span> — this strip; the <span className="inline-block -translate-y-[3px]">⌄</span> handle at the bottom edge of the 3D viewer hides it</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Mouse
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">3D</span>: drag to orbit · wheel to zoom · hover for ID/region/top genes · click a cell to focus it in the details panel (right-drag to pan can be enabled in Settings)</li>
          <li><span className="text-neutral-200">t-SNE</span>: drag to lasso-select · click a cell to focus · right-drag or shift+drag to pan · wheel to zoom</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Selections
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li>Click a cell in the 3D viewer to focus it; the <span className="text-neutral-200">Details</span> panel switches to that one cell.</li>
          <li>Drag in the t-SNE to lasso a group; the same cells light up in the 3D viewer.</li>
          <li>Selections survive every filter change — you can change filters without losing what you picked. When nothing's selected, the Details panel falls back to whatever the filter intersection produces.</li>
          <li>Use the <span className="text-neutral-200">clear selection</span> button (top of the t-SNE panel) or click empty space in the 3D viewer to drop them.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Filtering
        </div>
        <p className="text-neutral-400 leading-snug">
          The four cards in the Filters tab combine with logical AND
          (that's what the <span className="text-neutral-200">×</span>{' '}
          between them means): a cell has to pass every active card
          to stay visible. A card set to <span className="text-neutral-200">all</span>{' '}
          (or with nothing selected) doesn't filter anything out.
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">Colors</span> — how the visible cells are coloured. Six schemes: <span className="text-neutral-200">Simple</span> (uniform yellow highlight), <span className="text-neutral-200">Region</span> (categorical), <span className="text-neutral-200">Gene expression</span> (plasma over FISH spot counts; log/linear toggle), <span className="text-neutral-200">Stim correlation</span> (plasma over Pearson r), <span className="text-neutral-200">Activity</span> (plasma over the ΔF/F trace at a scrubbable time point, with a play button stepping through the 134-second cycle), <span className="text-neutral-200">Specimen</span> (categorical by source fish).</li>
          <li><span className="text-neutral-200">Transcriptomics</span> — keep cells expressing one or more selected genes (combined with <span className="text-neutral-200">OR / AND</span>), or cells belonging to a single functional subtype (e.g. <span className="text-neutral-200">pou4f2_cckb</span>)</li>
          <li><span className="text-neutral-200">Visual Stimuli</span> — keep only cells whose calcium response correlates with the selected stimuli; the <span className="text-neutral-200">OR / AND</span> toggle picks whether <em>any one</em> match is enough (default) or <em>every</em> selected stimulus must clear the threshold (correlation threshold is in the Settings tab)</li>
          <li><span className="text-neutral-200">Anatomy</span> — isolate one of 16 brain regions, or one of the 3 fish specimens</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Specimens
        </div>
        <p className="text-neutral-400 leading-snug">
          The atlas pools cells from 3 individual fish (originally
          imaged as Fish 1 / 2 / 3) into a shared mapzebrain
          coordinate frame. Every dot is one real cell from one real
          fish; the per-specimen breakdown surfaces in three places:
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li><span className="text-neutral-200">Colors → Specimen</span> — paint each cell by its source fish (categorical) so per-fish coverage and registration consistency become visible.</li>
          <li><span className="text-neutral-200">Anatomy → specimen</span> — keep only cells from one fish; useful for sanity-checking whether a finding holds in every individual.</li>
          <li>The <span className="text-neutral-200">Details</span> panel shows a per-fish breakdown of any selection so you can spot a population that's driven by a single specimen.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Try this first
        </div>
        <ol className="list-decimal list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li>Set <span className="text-neutral-200">Colors → Region</span> and orbit the 3D viewer to see the anatomy.</li>
          <li>Switch <span className="text-neutral-200">Colors → Gene expression</span> and step through genes with the ‹ › arrows.</li>
          <li>In <span className="text-neutral-200">Transcriptomics</span> flip to <span className="text-neutral-200">Subtype</span> and pick e.g. <span className="text-neutral-200">pou4f2_cckb</span> — most of the cluster lands in the optic tectum.</li>
          <li>Co-expression view: set <span className="text-neutral-200">Colors → Stim correlation</span>, pick a stimulus in <span className="text-neutral-200">Visual Stimuli</span>, and pick a single gene in <span className="text-neutral-200">Transcriptomics</span> — the remaining cells are gene-positive, coloured by how strongly they respond to the stimulus.</li>
          <li>Click any cell to fill in the details panel: per-gene spot counts, mean ΔF/F trace with each stimulus's on-window shaded, and a per-stimulus correlation bar chart.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Reproduce a finding from the paper
        </div>
        <p className="text-neutral-400 leading-snug">
          Each button sets the filters/colour scheme to reproduce a
          specific finding from the{' '}
          <a
            href="https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-300 hover:underline"
          >
            WARP paper
          </a>
          . Selections (lasso / focused cell) are cleared.
        </p>
        <ul className="flex flex-col gap-1.5 mt-1">
          {FINDINGS.map((f) => {
            const preset = buildPresetFilter(f, data);
            const enabled = preset != null;
            return (
              <li key={f.title} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <button
                    onClick={() => preset && applyView(preset)}
                    disabled={!enabled}
                    className={
                      'text-left px-2 py-0.5 rounded border font-mono text-xs ' +
                      (enabled
                        ? 'border-neutral-700 bg-neutral-900/60 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500'
                        : 'border-neutral-800 text-neutral-600 cursor-default')
                    }
                  >
                    {f.title}
                  </button>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {f.figure}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug ml-1">
                  {f.description}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Sharing a view
        </div>
        <p className="text-neutral-400 leading-snug">
          The URL hash mirrors the full app state — filters, settings,
          camera, t-SNE viewport, lasso polygon, focused neuron. Copy the
          URL to share whatever you're currently looking at; opening it
          elsewhere restores the same view.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Notes
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-neutral-400 leading-snug">
          <li>The activity-trace x-axis is in seconds; one 134-second cycle contains all 8 stimuli back-to-back.</li>
          <li><span className="text-neutral-200">Gene richness:</span> in the <span className="text-neutral-200">Gene expression</span> colour scheme, if no single gene is pinned in <span className="text-neutral-200">Transcriptomics</span> (gene set to "all", or you're in Subtype mode), each cell is coloured by how many of the 41 panel genes it expresses. Pin a gene to switch to the classic single-gene FISH spot-count map.</li>
          <li><span className="text-neutral-200">Multi-gene coloring:</span> with 2+ genes pinned, the <span className="text-neutral-200">Gene expression</span> scheme honours the <span className="text-neutral-200">Max / Sum / Richness</span> pick in the <span className="text-neutral-200">Settings</span> tab — strongest single gene, total spot count, or count of "on" genes per the binary-call predicate.</li>
          <li><span className="text-neutral-200">Stim correlation, max across selected:</span> with the <span className="text-neutral-200">Stim correlation</span> colour scheme, picking exactly one stimulus paints by that stimulus's Pearson r. With nothing picked the cell is coloured by its <em>max</em> correlation across every stimulus; with two or more picked, by max across just the selected set (independent of the OR/AND filter logic).</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
          Code
        </div>
        <p className="text-neutral-400 leading-snug">
          The source for this viewer lives at{' '}
          <a
            href="https://github.com/JaneliaSciComp/warp-website"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-300 hover:underline"
          >
            github.com/JaneliaSciComp/warp-website
          </a>
          . File an issue or open a PR there.
        </p>
      </section>

      <p className="text-[10px] text-neutral-500 mt-2">
        © {(() => {
          const y = new Date().getFullYear();
          return y > 2026 ? `2026-${y}` : '2026';
        })()} HHMI
      </p>
    </div>
  );
}
