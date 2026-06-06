import { useEffect, useState } from "react";
import type { FilterState, SettingsState } from "../../data/types";
import { DEFAULT_SETTINGS } from "../../data/types";
import { KindToggle } from "./shared";

// Per-user UI preference: hides the verbose explainer paragraphs in
// every section so the tab is compact once you know what each control
// does. Lives in localStorage rather than SettingsState because it's
// a viewer chrome preference, not part of the shareable view state.
const SHOW_DESC_KEY = "warp.settings.showDescriptions";

export function SettingsTab({
    filter,
    settings,
    setSettings,
}: {
    filter: FilterState;
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
    const projectionSupported =
        filter.colorMode === "gene" ||
        filter.colorMode === "activity" ||
        filter.colorMode === "stim" ||
        filter.colorMode === "swim";
    const displayedProjectionMode = projectionSupported
        ? settings.projectionMode
        : "off";
    const projectionActive =
        projectionSupported && settings.projectionMode !== "off";
    const signedColorMode =
        filter.colorMode === "stim" || filter.colorMode === "swim";
    const signedProjectionActive =
        projectionActive && signedColorMode;
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
                    The same ghost visibility is used as projection-mode
                    context; ghosts stay visual only and do not contribute to
                    scalar projection reductions.
                    <span className="text-neutral-200"> Auto</span> derives
                    both from the 3D canvas height: very short views use
                    small dots (~2–3 px) with moderate ghost visibility
                    (~0.5); around 600 px tall dots are ~9 px; taller views
                    continue growing (about 17 px at 1500 px tall) while
                    ghosts peak near 0.8–0.85 and then taper back on very
                    tall views.
                    <span className="text-neutral-200"> Scale by filter</span>{" "}
                    additionally enlarges active (in-set) cells as the
                    filter narrows — 50 cells → 2× their base size, all
                    cells → 1×. Ghost cells are unaffected.
                    <span className="text-neutral-200"> Scale by depth</span>{" "}
                    is on by default and shrinks cells the farther they
                    sit from the camera (the familiar perspective look).
                    Turn it off to render every cell at a constant
                    on-screen size — the "see through the volume"
                    convention used by max-intensity projection in
                    volume rendering. Independent of the projection
                    toggle, so it can be combined with normal rendering
                    for a flat point-cloud look or layered onto any
                    projection mode.
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
                    auto point sizes
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
                ) : null}
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="shrink cells with distance from the camera; turn off to render every cell at a constant on-screen size (MIP convention)"
                >
                    <input
                        type="checkbox"
                        checked={settings.scaleByDepth}
                        onChange={(e) =>
                            update({ scaleByDepth: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    scale by depth
                </label>
                {!settings.autoSizing && (
                    <>
                        <NumberRow
                            label="3D point size (px)"
                            value={settings.pointSize}
                            min={1}
                            max={40}
                            step={0.5}
                            onChange={(v) => update({ pointSize: v })}
                        />
                        <NumberRow
                            label="3D ghost visibility"
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
                    3D camera controls
                </div>
                <p className="text-neutral-400 leading-snug">
                    <span className="text-neutral-200">Object-centric rotation</span>{" "}
                    keeps the orbit pivot pinned at the volume's center —
                    right-drag pans in screen space without moving that
                    pivot, so rotation always spins around the volume. Turn
                    off to use trackball-style pan: right-drag moves the
                    orbit target, and rotation then pivots around the new
                    target.
                    <span className="text-neutral-200"> Momentum</span>{" "}
                    controls how long rotation and pan continue to drift
                    after the mouse is released. 0 stops motion the moment
                    you let go; the default (0.9) matches the original
                    feel.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="rotation always pivots around the volume center; right-drag pans in screen space"
                >
                    <input
                        type="checkbox"
                        checked={settings.objectCentricRotation}
                        onChange={(e) =>
                            update({ objectCentricRotation: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    object-centric rotation
                </label>
                <NumberRow
                    label="momentum"
                    value={settings.rotationMomentum}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) =>
                        update({
                            rotationMomentum: Math.max(0, Math.min(1, v)),
                        })
                    }
                />
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
                    label="t-SNE point size (px)"
                    value={settings.umapPointSize}
                    min={2}
                    max={40}
                    step={0.5}
                    onChange={(v) => update({ umapPointSize: v })}
                />
                <NumberRow
                    label="t-SNE ghost visibility"
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
                    <span className="text-neutral-200"> Active brightness</span>{" "}
                    additively lifts the color of every in-set cell in both
                    views (and the color legend) — useful when the active
                    palette reads too dark against the dark background.
                </p>
                <label
                    className={
                        "flex items-center gap-2 text-xs cursor-pointer select-none ml-3 " +
                        (projectionActive
                            ? "text-neutral-500 cursor-not-allowed"
                            : "text-neutral-300")
                    }
                    title={
                        projectionActive
                            ? "projection mode renders without ambient occlusion"
                            : "enable screen-space ambient occlusion in the 3D viewer"
                    }
                >
                    <input
                        type="checkbox"
                        checked={settings.ambientOcclusion}
                        disabled={projectionActive}
                        onChange={(e) =>
                            update({ ambientOcclusion: e.target.checked })
                        }
                        className="accent-neutral-300 disabled:opacity-50"
                    />
                    ambient occlusion
                </label>
                {projectionActive && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Disabled while a projection mode is active —
                        projection renders without ambient occlusion.
                    </p>
                )}
                {settings.ambientOcclusion && !projectionActive && (
                    <>
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
                    </>
                )}
                <label
                    className={
                        "flex items-center gap-2 text-xs cursor-pointer select-none ml-3 " +
                        (projectionActive
                            ? "text-neutral-500 cursor-not-allowed"
                            : "text-neutral-300")
                    }
                    title={
                        projectionActive
                            ? "projection mode ignores per-cell alpha, so the opaque-active override has no effect"
                            : "render active/in-filter cells at full opacity in both scatter views; ghost cells remain transparent"
                    }
                >
                    <input
                        type="checkbox"
                        checked={settings.opaqueActiveCells}
                        disabled={projectionActive}
                        onChange={(e) =>
                            update({ opaqueActiveCells: e.target.checked })
                        }
                        className="accent-neutral-300 disabled:opacity-50"
                    />
                    opaque active cells
                </label>
                {projectionActive && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Disabled while a projection mode is active —
                        projection ignores per-cell alpha, so forcing
                        opaque has no visual effect.
                    </p>
                )}
                <NumberRow
                    label="active brightness"
                    value={settings.activeBrightness}
                    min={0}
                    max={0.4}
                    step={0.01}
                    onChange={(v) =>
                        update({
                            activeBrightness: Math.max(0, Math.min(0.4, v)),
                        })
                    }
                />
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Projection
                </div>
                <p className="text-neutral-400 leading-snug">
                    Reduces the scalar value behind the active color scheme
                    along the view ray, then recolors the reduced scalar.
                    Available for Gene, Activity, Stim, and Swim; categorical
                    schemes have no meaningful scalar projection.
                    <span className="text-neutral-200"> Min</span> — lowest
                    scalar along the ray.
                    <span className="text-neutral-200"> Mean</span> —
                    arithmetic mean scalar; in signed Stim/Swim with weak
                    correlations faded, the mean is weighted by signed-signal
                    strength so transparent near-zero samples do not dominate.
                    <span className="text-neutral-200"> Max</span> — highest
                    scalar along the ray.
                    <span className="text-neutral-200"> Min/Max</span> — the
                    value deviating most from neutral wins, keeping its sign.
                    <span className="text-neutral-200"> Sum</span> —
                    exposure-scaled signed/integrated scalar. Stim and swim
                    use signed correlations, so Min highlights negative
                    responses, Max highlights positive responses, and Min/Max
                    surfaces the strongest response of either sign (best for
                    seeing deep correlated cells of both polarities at once).
                    In stim/swim projection, near-zero or cancelled signed
                    values use low opacity instead of painting the coolwarm
                    white midpoint opaquely.
                </p>
                {!projectionSupported && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Projection is disabled for the current categorical
                        color scheme. Switch to Gene, Activity, Stim, or Swim
                        to project scalar values.
                    </p>
                )}
                <div
                    className={
                        "flex items-center gap-2 " +
                        (!projectionSupported ? "opacity-50" : "")
                    }
                    title={
                        projectionSupported
                            ? undefined
                            : "projection is only available for scalar color schemes"
                    }
                >
                    <KindToggle
                        value={displayedProjectionMode}
                        disabled={!projectionSupported}
                        onChange={(v) => {
                            if (projectionSupported) update({ projectionMode: v });
                        }}
                        options={[
                            { value: "off", label: "Off" },
                            { value: "min", label: "Min" },
                            { value: "max", label: "Max" },
                            { value: "maxabs", label: "Min/Max" },
                            { value: "mean", label: "Mean" },
                            { value: "sum", label: "Sum" },
                        ]}
                    />
                </div>
                {projectionActive && (
                    <>
                        <NumberRow
                            label="projection threshold"
                            value={settings.projectionIntensityFloor}
                            min={0}
                            max={1}
                            step={0.01}
                            title="minimum projection intensity included; for signed mean/sum this also hides reduced near-zero/cancelled signal"
                            onChange={(v) =>
                                update({
                                    projectionIntensityFloor: Math.max(
                                        0,
                                        Math.min(1, v),
                                    ),
                                })
                            }
                        />
                        <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                            Threshold culls cells below this scheme-aware
                            intensity before projecting. Lower it to include
                            weak signal; raise it to reduce haze/noise.
                        </p>
                    </>
                )}
                {projectionSupported && settings.projectionMode === "sum" && (
                    <>
                        <NumberRow
                            label="sum exposure"
                            value={settings.projectionSumExposure}
                            min={0.05}
                            max={5}
                            step={0.05}
                            title="multiplier applied to Sum's accumulated signal before display clamping"
                            onChange={(v) =>
                                update({
                                    projectionSumExposure: Math.max(
                                        0.05,
                                        Math.min(5, v),
                                    ),
                                })
                            }
                        />
                        <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                            Exposure scales Sum before clamping. Lower values
                            preserve detail in dense projections; higher values
                            boost faint integrated signal.
                        </p>
                    </>
                )}
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
                    visually). This only affects Stim/Swim color modes; in
                    signed Stim/Swim projection it also controls the opacity of
                    the projected reduced scalar.
                </p>
                <label
                    className="flex items-center gap-2 text-xs cursor-pointer select-none ml-3 text-neutral-300"
                    title={
                        signedProjectionActive
                            ? "also controls signed projection opacity: weak/cancelled projected correlations use low opacity when enabled"
                            : signedColorMode
                                ? "fade out cells with |r| near zero so the divergent ramp's neutral midpoint doesn't compete with the colored extremes"
                                : "stored for Stim/Swim views; the current color mode has no signed correlation ramp"
                    }
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
                {signedProjectionActive && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Applies to signed projection too — when enabled,
                        near-zero or cancelled projected correlations use low
                        opacity instead of painting the coolwarm white midpoint
                        opaquely.
                    </p>
                )}
                {!signedProjectionActive && signedColorMode && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Currently active in normal Stim/Swim rendering. It
                        will also apply if you enable a Stim/Swim projection.
                    </p>
                )}
                {!signedColorMode && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        No visual effect in the current color mode; it applies
                        when viewing Stim or Swim correlations, including their
                        projection modes.
                    </p>
                )}
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
    disabled,
    title,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <label
            className={
                "flex items-center justify-between gap-3 pl-3 " +
                (disabled ? "opacity-50 cursor-not-allowed" : "")
            }
            title={title}
        >
            <span className="text-neutral-300">{label}</span>
            <span className="flex items-center gap-2">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-32 accent-yellow-300"
                />
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={disabled}
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
