import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { FilterState, SettingsState } from "../../data/types";
import { DEFAULT_SETTINGS } from "../../data/types";
import { KindToggle } from "./shared";

// Bolds a control's name inside a section description so the prose maps
// onto the toggle / slider / option it refers to.
function Ctl({ children }: { children: ReactNode }) {
    return (
        <strong className="font-semibold text-neutral-300">{children}</strong>
    );
}

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
    const signedProjectionActive = projectionActive && signedColorMode;
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
                    title="toggle section descriptions"
                >
                    <input
                        type="checkbox"
                        checked={showDescriptions}
                        onChange={(e) => setShowDescriptions(e.target.checked)}
                        className="accent-neutral-300"
                    />
                    show descriptions
                </label>
                {/* Only shown while screenshot mode is on, as an
                    always-visible escape that doesn't require scrolling
                    to the Screenshot section. Unchecking clears the mode,
                    so this control then disappears. */}
                {settings.screenshotMode && (
                    <label
                        className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none"
                        title="screenshot mode is on — uncheck to restore the hidden UI chrome"
                    >
                        <input
                            type="checkbox"
                            checked={settings.screenshotMode}
                            onChange={(e) =>
                                update({ screenshotMode: e.target.checked })
                            }
                            className="accent-neutral-300"
                        />
                        screenshot mode
                    </label>
                )}
            </div>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    3D point density
                </div>
                <p className="text-neutral-400 leading-snug">
                    Controls point size and ghost (out-of-filter cell)
                    visibility in the 3D view. <Ctl>Auto point sizes</Ctl>{" "}
                    derives both from the viewport height, hiding the manual
                    sliders. <Ctl>Scale by filter</Ctl> enlarges points when
                    fewer cells are visible; <Ctl>scale by depth</Ctl> applies
                    perspective, making closer points larger and farther ones
                    smaller.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="derive point size and ghost visibility from 3D view height"
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
                {!settings.autoSizing && (
                    <div className="flex flex-col gap-2 ml-3">
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
                    </div>
                )}
                {settings.autoSizing ? (
                    <label
                        className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-6"
                        title="enlarge active dots as fewer cells pass filters"
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
                    title="shrink points with camera distance"
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
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    3D camera controls
                </div>
                <p className="text-neutral-400 leading-snug">
                    <Ctl>Object-centric rotation</Ctl> orbits around the brain's
                    center. <Ctl>Momentum</Ctl> applies inertia, so rotation,
                    pan, and zoom continue briefly after the drag ends.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="rotate around the brain center"
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
                    Controls point size and ghost (out-of-filter cell)
                    visibility for the t-SNE plot.
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
                    <Ctl>Ambient occlusion</Ctl> darkens regions of dense point
                    overlap to convey depth. <Ctl>Opaque active cells</Ctl>{" "}
                    renders the cells that pass the filters at full opacity
                    rather than the default partial transparency;{" "}
                    <Ctl>active brightness</Ctl> applies an additive brightness
                    lift to those cells.
                </p>
                {projectionActive && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Ambient occlusion and opaque active cells are disabled
                        during projection.
                    </p>
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
                            ? "disabled while projection is active"
                            : "enable ambient occlusion in the 3D viewer"
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
                            ? "disabled while projection is active"
                            : "render active cells at full opacity"
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
                    Reduces the scalar color values along each view ray to a
                    single value per pixel — a volumetric, see-through
                    projection. Works with Gene, Activity, Stim, and Swim.{" "}
                    <Ctl>Min</Ctl> and <Ctl>Max</Ctl> take the lowest or highest
                    value; <Ctl>Min/Max</Ctl> keeps whichever is farthest from
                    zero; <Ctl>Mean</Ctl> averages; <Ctl>Sum</Ctl> accumulates.
                </p>
                {!projectionSupported && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Projection requires Gene, Activity, Stim, or Swim.
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
                            : "requires Gene, Activity, Stim, or Swim"
                    }
                >
                    <KindToggle
                        value={displayedProjectionMode}
                        disabled={!projectionSupported}
                        onChange={(v) => {
                            if (projectionSupported)
                                update({ projectionMode: v });
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
                            title="drop signal below this value"
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
                            Drops signal below this value before projection.
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
                            title="scale Sum before clamping"
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
                            Scales Sum before clamping.
                        </p>
                    </>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Gene plasma ceiling
                </div>
                <p className="text-neutral-400 leading-snug">
                    Sets the spot count that maps to the ceiling of the Gene
                    plasma color scale.
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
                    When two or more genes are pinned: <Ctl>Max</Ctl> uses the
                    highest single-gene value; <Ctl>Sum</Ctl> totals their spot
                    counts; <Ctl>Richness</Ctl> counts how many are expressed.
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
                    Sets how a gene counts as expressed. <Ctl>Paper</Ctl> uses
                    the study's per-gene calls; <Ctl>Global</Ctl> uses a single
                    spot-count cutoff for every gene.
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
                    <Ctl>Floor</Ctl> is the minimum |r| a cell needs to count as
                    responsive; <Ctl>saturation</Ctl> is where the color reaches
                    full intensity. <Ctl>Split +/−</Ctl> uses separate
                    saturation values for positive and negative correlations.
                </p>
                <NumberRow
                    label="responsive floor (|r| ≥)"
                    value={settings.stimLo}
                    min={0}
                    max={settings.stimHi - 0.01}
                    step={0.05}
                    onChange={(v) => update({ stimLo: Math.max(0, v) })}
                />
                <label
                    className="flex items-center gap-2 pl-3 text-xs cursor-pointer select-none text-neutral-300"
                    title="separate saturation by sign"
                >
                    <input
                        type="checkbox"
                        checked={settings.stimSplitSaturation}
                        onChange={(e) =>
                            update({ stimSplitSaturation: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    split +/− saturation
                </label>
                {settings.stimSplitSaturation ? (
                    <>
                        <NumberRow
                            label="saturation + (r ≥)"
                            value={settings.stimHiPos}
                            min={settings.stimLo + 0.01}
                            max={1}
                            step={0.05}
                            onChange={(v) => update({ stimHiPos: v })}
                        />
                        <NumberRow
                            label="saturation − (r ≤ −)"
                            value={settings.stimHiNeg}
                            min={settings.stimLo + 0.01}
                            max={1}
                            step={0.05}
                            onChange={(v) => update({ stimHiNeg: v })}
                        />
                    </>
                ) : (
                    <NumberRow
                        label="saturation (|r| ≥)"
                        value={settings.stimHi}
                        min={settings.stimLo + 0.01}
                        max={1}
                        step={0.05}
                        onChange={(v) => update({ stimHi: v })}
                    />
                )}
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Swim correlation cutoffs
                </div>
                <p className="text-neutral-400 leading-snug">
                    <Ctl>Floor</Ctl> is the minimum |r| a cell needs to count as
                    responsive; <Ctl>saturation</Ctl> is where the color reaches
                    full intensity.
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
                    Scales cell opacity by |r| in the Stim/Swim color modes,
                    fading weakly correlated cells toward the background. Also
                    governs opacity in signed Stim/Swim projections.
                </p>
                <label
                    className="flex items-center gap-2 text-xs cursor-pointer select-none ml-3 text-neutral-300"
                    title={
                        signedProjectionActive
                            ? "also controls projection opacity"
                            : signedColorMode
                              ? "fade weak correlations"
                              : "applies to Stim/Swim color modes"
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
                        Applies to this projection.
                    </p>
                )}
                {!signedProjectionActive && signedColorMode && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        Applies to this Stim/Swim view.
                    </p>
                )}
                {!signedColorMode && (
                    <p className="text-neutral-500 text-[11px] leading-snug ml-3">
                        No effect until the color mode is Stim or Swim.
                    </p>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Activity ΔF/F anchors
                </div>
                <p className="text-neutral-400 leading-snug">
                    Sets the floor and ceiling of the Activity (ΔF/F) color
                    scale.
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
                    Screenshot
                </div>
                <p className="text-neutral-400 leading-snug">
                    Hides certain UI elements (reset-view buttons, panel resize
                    handles, and the projection dropdown caret) for a clean
                    screen capture.
                </p>
                <label
                    className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none ml-3"
                    title="hide non-essential UI chrome for a clean screenshot"
                >
                    <input
                        type="checkbox"
                        checked={settings.screenshotMode}
                        onChange={(e) =>
                            update({ screenshotMode: e.target.checked })
                        }
                        className="accent-neutral-300"
                    />
                    screenshot mode
                </label>
            </section>

            <section className="flex flex-col gap-2">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Debug
                </div>
                <p className="text-neutral-400 leading-snug">
                    Shows a small diagnostic overlay on the 3D viewer.
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
