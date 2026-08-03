import type {
    NeuronDataset,
    FilterState,
    ColorMode,
    StimMode,
    SwimMode,
} from "../../data/types";
import { version as appVersion } from "../../../package.json";

/** A "reproduce this finding" preset for the About tab. References the
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
    /** Optional stim correlation band; only meaningful when `stimuli` is
     *  also set. Mirrors the swim card: 'positive' (r ≥ +stimLo),
     *  'negative' (r ≤ −stimLo), or 'both' (|r| ≥ stimLo). */
    stimMode?: StimMode;
}

// Ordered to follow the manuscript figures so a reader can walk through
// the paper alongside the viewer.
const FINDINGS: FindingPreset[] = [
    {
        title: "calb2a_nefma — forward visual motion",
        figure: "Figure 3C",
        description:
            "Hindbrain calb2a_nefma cells respond most strongly to forward visual motion (the swim-eliciting stimulus).",
        colorMode: "stim",
        cluster: "calb2a_nefma",
        stimuli: [0],
        stimMode: "positive",
    },
    {
        title: "calb2a_gfra1a — luminance & looming",
        figure: "Figure 3C",
        description:
            "Tectal calb2a_gfra1a cells respond preferentially to the last four stimuli (dark flash, light flash, right loom, left loom).",
        colorMode: "stim",
        cluster: "calb2a_gfra1a",
        stimuli: [4, 5, 6, 7],
        stimMode: "positive",
    },
    {
        title: "pou4f2_cckb_chata — dark and bright flashes",
        figure: "Figure 3D",
        description:
            "Tectal pou4f2_cckb_chata cells respond to both bright and dark flashes. The two stimuli are combined via OR logic so cells that pass either count.",
        colorMode: "stim",
        cluster: "pou4f2_cckb_chata",
        stimuli: [4, 5],
        stimMode: "positive",
    },
    {
        title: "otpa+ swim-related neurons",
        figure: "Figure 3G",
        description:
            "otpa-expressing neurons whose calcium activity correlates with swim power. The visible set is gene-positive AND swim-driven, painted by otpa spot count.",
        colorMode: "gene",
        gene: "otpa",
        swimMode: "positive",
    },
    {
        title: "pvalb7_eomesa task-related neurons",
        figure: "Figure 4D-E · abstract",
        description:
            "Hippocampal-like pvalb7+/eomesa+ population in the dorsal pallium with task-structured calcium activity.",
        colorMode: "highlight",
        cluster: "pvalb7_eomesa",
    },
    {
        title: "gad1b_tph2_gfra1a — anti-forward-motion raphe",
        figure: "Figure 5D",
        description:
            "One of the 15 largest multi-gene subtypes negatively correlated with forward visual motion (Fig 5D). The cluster filter plus the negative stim-correlation band keeps only the anti-correlated forward-motion responders; the divergent stim color ramp paints them on the blue (anti) end.",
        colorMode: "stim",
        cluster: "gad1b_tph2_gfra1a",
        stimuli: [0],
        stimMode: "negative",
    },
    {
        title: "pou4f2_cckb dimming-light response",
        figure: "Figure 5F · abstract",
        description:
            "Tectal pou4f2_cckb subtype is positively correlated with the dark-flash stimulus. This is the cckb-pou4f2 luminance-coding population described in the abstract.",
        colorMode: "stim",
        cluster: "pou4f2_cckb",
        stimuli: [4],
        stimMode: "positive",
    },
];

function buildPresetFilter(
    p: FindingPreset,
    data: NeuronDataset,
): Partial<FilterState> | null {
    const out: Partial<FilterState> = {};
    if (p.colorMode) out.colorMode = p.colorMode;
    if (p.cluster) {
        const idx = data.clusterNames.indexOf(p.cluster);
        if (idx < 0) return null;
        out.txMode = "subtype";
        out.selectedCluster = idx;
    }
    if (p.gene) {
        const idx = data.geneNames.indexOf(p.gene);
        if (idx < 0) return null;
        out.txMode = "gene";
        out.selectedGenes = [idx];
    }
    if (p.stimuli && p.stimuli.length > 0) {
        out.selectedStimuli = [...p.stimuli].sort((a, b) => a - b);
    }
    if (p.swimMode) {
        out.swimMode = p.swimMode;
    }
    if (p.stimMode) {
        out.stimMode = p.stimMode;
    }
    return out;
}

export function AboutTab({
    data,
    applyView,
}: {
    data: NeuronDataset;
    applyView: (preset: Partial<FilterState>) => void;
}) {
    // Set at build time by scripts/bundle.sh (./docs/ in the combined
    // bundle); omitted in dev builds with no separate docs deployment.
    const docsUrl = import.meta.env.VITE_WARP_DOCS_URL;

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
                        className="text-link hover:underline"
                    >
                        paper
                    </a>
                    ), pooled from 3 fish into a shared mapZebrain reference
                    frame. Each cell carries (1) a 3D position, (2) expression
                    counts for 41 genes, (3) one of 333 molecularly-defined
                    subtypes, (4) a calcium response to 8 visual stimuli, and
                    (5) a correlation between its activity and swim power. The
                    3D viewer and the t-SNE show the same cells in two spaces,
                    and anything you select in one is also selected in the
                    other. The Detail panel summarizes the current selection: a
                    single cell's profile, or aggregate stats across a group.
                </p>
            </section>

            <section className="flex flex-col gap-1">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Documentation
                </div>
                <p className="text-neutral-400 leading-snug">
                    A full user guide covers the interface panels, each filter
                    card and colour scheme, selections, settings, and how to
                    share a view via URL.
                    {docsUrl ? (
                        <>
                            {" "}
                            <a
                                href={docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link hover:underline"
                            >
                                Open the docs →
                            </a>
                        </>
                    ) : null}
                </p>
            </section>

            <section className="flex flex-col gap-1">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Explore findings from the paper
                </div>
                <p className="text-neutral-400 leading-snug">
                    Each button applies the filters and colour scheme that
                    surface a specific finding from the{" "}
                    <a
                        href="https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
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
                                        onClick={() =>
                                            preset && applyView(preset)
                                        }
                                        disabled={!enabled}
                                        className={
                                            "text-left px-2 py-0.5 rounded border font-mono text-xs " +
                                            (enabled
                                                ? "border-neutral-700 bg-neutral-900/60 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500"
                                                : "border-neutral-800 text-neutral-600 cursor-default")
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
                    Brain models
                </div>
                <p className="text-neutral-400 leading-snug">
                    The whole-brain reference meshes (outline, fibers, cell
                    bodies) and the view-orientation icons come from{" "}
                    <a
                        href="https://mapzebrain.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                    >
                        mapZebrain
                    </a>{" "}
                    (<em>Kunst et al., 2019</em>), the shared reference brain
                    this dataset is registered into. Enable them under Settings
                    → Brain models.
                </p>
            </section>

            <section className="flex flex-col gap-1">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Code
                </div>
                <p className="text-neutral-400 leading-snug">
                    The source code for this viewer is available at{" "}
                    <a
                        href="https://github.com/JaneliaSciComp/warp-atlas-viewer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                    >
                        github.com/JaneliaSciComp/warp-atlas-viewer
                    </a>
                    . We welcome bug reports and pull requests.
                </p>
            </section>

            <p className="text-[10px] text-neutral-500 mt-2">
                ©{" "}
                {(() => {
                    const y = new Date().getFullYear();
                    return y > 2026 ? `2026-${y}` : "2026";
                })()}{" "}
                HHMI · v{appVersion}
            </p>
        </div>
    );
}
