---
title: Swim correlation filter
description: Filter by the per-cell Pearson r between calcium activity and estimated swim power.
---

# Swim correlation

The Swim card filters by the **per-cell Pearson r between calcium activity and estimated swim power**, a behavioral regressor derived from the ephys tail-electrode channel (windowed variance of the swim signal). It is a separate channel from the eight visual stimuli — swimming is a motor variable, not a sensory input — but is closely linked, since several stimuli (notably forward visual motion) elicit swimming.

The Swim card sits between **Visual Stimuli** and **Anatomy** in the Filters tab.

## Controls

Two independent toggle buttons, combined under OR:

- **+ swim-driven** — keep cells with `r ≥ +swimLo` (positively correlated with swim power; calcium activity ramps up during swimming).
- **− anti-swim** — keep cells with `r ≤ −swimLo` (negatively correlated; activity is suppressed during swimming).

State mapping:

| `+ swim-driven` | `− anti-swim` | Resulting filter |
|---|---|---|
| off | off | no filter |
| on | off | `r ≥ +swimLo` |
| off | on | `r ≤ −swimLo` |
| on | on | `|r| ≥ swimLo` |

## Threshold

The magnitude threshold is **`swimLo`** in [Settings → Swim correlation cutoffs](/settings#swim-correlation-cutoffs). Default `0.10`, matching the manuscript's swim-correlation cutoff (Methods: "Correlation to swimming behavior" — R > 0.1 / R < −0.1 identifies the swim-related subtypes).

The same threshold also sets the dim end (deadband) of the [Swim color scheme](./colors#swim-correlation).

## Color scheme

Set **Colors → Swim correlation** to paint visible cells by their signed swim r on a divergent ramp (blue → near-white → red), anchored symmetrically at `±swimLo` (deadband boundary) and `±swimHi` (saturation). The deadband around 0 maps to a neutral midpoint so unresponsive cells stay visually quiet while anti- and pro-correlated cells separate by sign of color.

The color scheme can be combined freely with any filter: e.g. set Transcriptomics = `pou4f2_cckb` and Colors = `Swim correlation` to see whether that cluster's cells are swim-driven, anti-swim, or unresponsive.

## Detail panel

The Detail panel ends with a **Swim correlation** section showing a 40-bin histogram of the selection's per-cell swim r, the deadband shaded gray, and the mean as a yellow vertical line. The summary line below reports mean, range, and the pro / anti / off partition counts using `swimLo` as the boundary. For a single focused cell the histogram degenerates to one bar and the summary collapses to `r = …`.

See [Detail panel → Swim correlation](/ui/detail#swim-correlation) for chart details.
