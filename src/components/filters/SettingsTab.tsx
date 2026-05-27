import { useEffect, useState } from "react";
import type { SettingsState } from "../../data/types";
import { DEFAULT_SETTINGS } from "../../data/types";
import { KindToggle } from "./shared";

// Per-user UI preference: hides the verbose explainer paragraphs in
// every section so the tab is compact once you know what each control
// does. Lives in localStorage rather than SettingsState because it's
// a viewer chrome preference, not part of the shareable view state.
const SHOW_DESC_KEY = "warp.settings.showDescriptions";

export function SettingsTab({
    settings,
    setSettings,
}: {
    settings: SettingsState;
    setSettings: (s: SettingsState) => void;
}) {
    const update = (patch: Partial<SettingsState>) =>
        setSettings({ ...settings, ...patch });
    const reset = () => setSettings(DEFAULT_SETTINGS);
    const dirty = (
        Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>
    ).some((k) => settings[k] !== DEFAULT_SETTINGS[k]);
    const [showDescriptions, setShowDescriptions] = useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        const v = window.localStorage.getItem(SHOW_DESC_KEY);
        return v === null ? true : v === "1";
    });
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                SHOW_DESC_KEY,
                showDescriptions ? "1" : "0",
            );
        }
    }, [showDescriptions]);
    return (
        <div
            className={
                "flex flex-col gap-6 pb-3 text-xs font-mono text-neutral-300 max-w-2xl" +
                // Tailwind arbitrary variant: hide every <p> nested under a <section>
                // (the section description paragraphs) when the toggle is off.
                (showDescriptions ? "" : " [&_section_p]:hidden")
            }
        >
            <div className="flex items-center gap-3">
                <button
                    onClick={reset}
                    disabled={!dirty}
                    title="reset all settings to defaults"
                    className={
                        "self-start flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border " +
                        (dirty
                            ? "text-neutral-300 bg-neutral-900/60 border-neutral-700 hover:bg-neutral-700 hover:text-neutral-100"
                            : "text-neutral-600 border-neutral-800 cursor-default")
                    }
                >
                    <span aria-hidden className="text-base leading-none">
                        ↺
                    </span>
                    reset settings
                </button>
                <label
                    className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none"
                    title="hide the descriptive paragraph in each section"
                >
                    <input
                        type="checkbox"
                        checked={showDescriptions}
                        onChange={(e) => setShowDescriptions(e.target.checked)}
                        className="accent-neutral-300"
                    />
                    show descriptions
                </label>
            </div>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    3D point density
                </div>
                <p className="text-neutral-400 leading-snug">
                    Base point size for the 3D brain scatter and the
                    visibility of cells outside the active filters (ghosts).
                    <span className="text-neutral-200"> Auto</span> scales the
                    rendered size with the canvas so a larger window keeps
                    the same dots-per-area density.
                    <span className="text-neutral-200"> Scale by filter</span>{" "}
                    derives both point size and ghost visibility from the
                    filter-passing cell count — small selections get bigger
                    dots and dimmer ghosts, full views get smaller dots and
                    brighter ghosts; when on, the sliders below are
                    overridden.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="let the viewer choose point size and ghost visibility automatically"
                >
                    <input
                        type="checkbox"
                        checked={settings.autoSizing}
                        onChange={(e) =>
                            update({ autoSizing: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    auto
                </label>
                {settings.autoSizing ? (
                    <label
                        className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-6"
                        title="on top of auto, vary point size and ghost visibility by the filter-passing cell count"
                    >
                        <input
                            type="checkbox"
                            checked={settings.scaleByFilterCount}
                            onChange={(e) =>
                                update({
                                    scaleByFilterCount: e.target.checked,
                                })
                            }
                            className="accent-neutral-300"
                        />
                        scale by filter
                    </label>
                ) : (
                    <>
                        <NumberRow
                            label="point size (px)"
                            value={settings.pointSize}
                            min={2}
                            max={40}
                            step={0.5}
                            onChange={(v) => update({ pointSize: v })}
                        />
                        <NumberRow
                            label="ghost visibility"
                            value={settings.ghostIntensity}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) =>
                                update({
                                    ghostIntensity: Math.max(0, Math.min(1, v)),
                                })
                            }
                        />
                    </>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    t-SNE point density
                </div>
                <p className="text-neutral-400 leading-snug">
                    Base point size for the t-SNE scatter and visibility of
                    out-of-filter cells (ghosts).
                </p>
                <NumberRow
                    label="point size (px)"
                    value={settings.umapPointSize}
                    min={2}
                    max={40}
                    step={0.5}
                    onChange={(v) => update({ umapPointSize: v })}
                />
                <NumberRow
                    label="ghost visibility"
                    value={settings.umapGhostIntensity}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) =>
                        update({
                            umapGhostIntensity: Math.max(0, Math.min(1, v)),
                        })
                    }
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Rendering
                </div>
                <p className="text-neutral-400 leading-snug">
                    Rendering controls for the scatter views. Ambient
                    occlusion affects only the 3D brain view and adds local
                    contact shadows so folds and dense boundaries are easier
                    to read. Opaque active cells disables foreground
                    transparency in both scatter views while leaving
                    ghost/background cells dimmed.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="enable screen-space ambient occlusion in the 3D viewer"
                >
                    <input
                        type="checkbox"
                        checked={settings.ambientOcclusion}
                        onChange={(e) =>
                            update({ ambientOcclusion: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    ambient occlusion
                </label>
                <div
                    className={
                        settings.ambientOcclusion
                            ? "opacity-100"
                            : "opacity-40 pointer-events-none"
                    }
                >
                    <NumberRow
                        label="occlusion strength"
                        value={settings.ambientOcclusionIntensity}
                        min={0}
                        max={0.4}
                        step={0.005}
                        onChange={(v) =>
                            update({
                                ambientOcclusionIntensity: Math.max(
                                    0,
                                    Math.min(0.4, v),
                                ),
                            })
                        }
                    />
                    <NumberRow
                        label="shadow radius (px)"
                        value={settings.ambientOcclusionRadius}
                        min={1}
                        max={72}
                        step={1}
                        onChange={(v) =>
                            update({
                                ambientOcclusionRadius: Math.max(
                                    1,
                                    Math.min(72, Math.round(v)),
                                ),
                            })
                        }
                    />
                </div>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="render active/in-filter cells at full opacity in both scatter views; ghost cells remain transparent"
                >
                    <input
                        type="checkbox"
                        checked={settings.opaqueActiveCells}
                        onChange={(e) =>
                            update({ opaqueActiveCells: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    opaque active cells
                </label>
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Gene plasma ceiling
                </div>
                <p className="text-neutral-400 leading-snug">
                    Upper anchor for the Gene scheme's plasma palette (raw FISH
                    spot count). Cells above this value saturate. Tune to match
                    the practical ceiling of the dataset's probe panel.
                </p>
                <NumberRow
                    label="max spot count"
                    value={settings.geneMaxSpots}
                    min={50}
                    max={5000}
                    step={50}
                    onChange={(v) => update({ geneMaxSpots: v })}
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Multi-gene coloring
                </div>
                <p className="text-neutral-400 leading-snug">
                    What the Gene color scheme paints when 2+ genes are
                    selected.
                    <span className="text-neutral-200"> Max</span> — the
                    strongest-expressing of the selected genes per cell.
                    <span className="text-neutral-200"> Sum</span> — total spot
                    count across the selected genes; emphasises co-expression
                    strength.
                    <span className="text-neutral-200"> Richness</span> — how
                    many of the selected genes the cell expresses (using the
                    same predicate as the gene filter).
                </p>
                <div className="flex items-center gap-2">
                    <KindToggle
                        value={settings.geneMultiColor}
                        onChange={(v) => update({ geneMultiColor: v })}
                        options={[
                            { value: "max", label: "Max" },
                            { value: "sum", label: "Sum" },
                            { value: "richness", label: "Richness" },
                        ]}
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Gene expression threshold
                </div>
                <p className="text-neutral-400 leading-snug">
                    How "expresses a gene" is decided for the gene filter and
                    the richness multi-gene coloring.
                    <span className="text-neutral-200"> Paper</span> uses the
                    paper's per-gene cutoffs (typically 25 spots, adjusted per
                    gene/fish via the Maximum-Deviation approach). The per-gene
                    threshold is shown in each gene-row tooltip.
                    <span className="text-neutral-200"> Global</span> applies a
                    single user-set spot count to every gene — useful for
                    sweeping looser/stricter cutoffs uniformly. Set to 1 for
                    "any detected".
                </p>
                <div className="flex items-center gap-2">
                    <KindToggle
                        value={settings.geneThresholdMode}
                        onChange={(v) => update({ geneThresholdMode: v })}
                        options={[
                            { value: "paper", label: "Paper" },
                            { value: "global", label: "Global" },
                        ]}
                    />
                </div>
                <div
                    className={
                        settings.geneThresholdMode === "global"
                            ? "opacity-100"
                            : "opacity-40 pointer-events-none"
                    }
                >
                    <NumberRow
                        label="global threshold (spots)"
                        value={settings.geneThresholdGlobal}
                        min={1}
                        max={500}
                        step={1}
                        onChange={(v) =>
                            update({
                                geneThresholdGlobal: Math.max(1, Math.round(v)),
                            })
                        }
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Stim correlation cutoffs
                </div>
                <p className="text-neutral-400 leading-snug">
                    Pearson r magnitude thresholds for stimulus correlation.
                    Cells inside the floor are treated as non-responsive
                    (neutral in the Stim color scheme; rejected by the Activity
                    filter when a sign band is enabled). Cells past saturation
                    clamp to the divergent ramp endpoints.
                </p>
                <NumberRow
                    label="responsive floor (|r| ≥)"
                    value={settings.stimLo}
                    min={0}
                    max={settings.stimHi - 0.01}
                    step={0.05}
                    onChange={(v) => update({ stimLo: Math.max(0, v) })}
                />
                <NumberRow
                    label="saturation (|r| ≥)"
                    value={settings.stimHi}
                    min={settings.stimLo + 0.01}
                    max={1}
                    step={0.05}
                    onChange={(v) => update({ stimHi: v })}
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Swim correlation cutoffs
                </div>
                <p className="text-neutral-400 leading-snug">
                    Magnitude thresholds for the signed swim-power correlation.
                    The <span className="text-neutral-200">floor</span> sets the
                    dead-band around zero — cells with |r| below it are treated
                    as unresponsive (neutral midpoint of the swim color ramp;
                    rejected by the swim filter). The{" "}
                    <span className="text-neutral-200">saturation</span> sets
                    the |r| at which the divergent ramp reaches its endpoints.
                    Defaults are tuned to WARP's tighter swim distribution.
                </p>
                <NumberRow
                    label="responsive floor (|r| ≥)"
                    value={settings.swimLo}
                    min={0}
                    max={settings.swimHi - 0.01}
                    step={0.05}
                    onChange={(v) => update({ swimLo: v })}
                />
                <NumberRow
                    label="saturation (|r| ≥)"
                    value={settings.swimHi}
                    min={settings.swimLo + 0.01}
                    max={1}
                    step={0.05}
                    onChange={(v) => update({ swimHi: v })}
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Fade weak correlations
                </div>
                <p className="text-neutral-400 leading-snug">
                    When on, the stim + swim color ramps scale alpha by |r|, so
                    cells near the neutral midpoint fade into the dark
                    background and the colored extremes stand out. When off,
                    every in-set cell renders at full opacity (including the
                    bright midpoint of the divergent ramp, which can dominate
                    visually).
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="fade out cells with |r| near zero so the divergent ramp's neutral midpoint doesn't compete with the colored extremes"
                >
                    <input
                        type="checkbox"
                        checked={settings.fadeWeakCorrelation}
                        onChange={(e) =>
                            update({ fadeWeakCorrelation: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    fade weak correlations
                </label>
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Activity ΔF/F anchors
                </div>
                <p className="text-neutral-400 leading-snug">
                    Lower / upper anchors of the Activity color scheme's plasma
                    ramp. Cells with trace values at or below the floor map to
                    the dark end; values at or above the ceiling saturate at the
                    bright end. Tune to match the practical dynamic range of the
                    dataset's calcium traces.
                </p>
                <NumberRow
                    label="floor (ΔF/F)"
                    value={settings.activityLo}
                    min={-2}
                    max={settings.activityHi - 0.1}
                    step={0.1}
                    onChange={(v) => update({ activityLo: v })}
                />
                <NumberRow
                    label="ceiling (ΔF/F)"
                    value={settings.activityHi}
                    min={settings.activityLo + 0.1}
                    max={5}
                    step={0.1}
                    onChange={(v) => update({ activityHi: v })}
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Debug
                </div>
                <p className="text-neutral-400 leading-snug">
                    Developer overlay. When on, the 3D viewer shows a small
                    readout in the top-left corner with the canvas size,
                    in-set cell count, and the inputs / outputs of the auto
                    + scale-by-filter math so the rendered point size and
                    ghost visibility are inspectable while tuning.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="show the diagnostic overlay on the 3D viewer"
                >
                    <input
                        type="checkbox"
                        checked={settings.debugMode}
                        onChange={(e) =>
                            update({ debugMode: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    debug overlay
                </label>
            </section>
        </div>
    );
}

function NumberRow({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-3 pl-3">
            <span className="text-neutral-300">{label}</span>
            <span className="flex items-center gap-2">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-32 accent-yellow-300"
                />
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) onChange(v);
                    }}
                    className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-neutral-200 w-20 font-mono text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
            </span>
        </label>
    );
}
