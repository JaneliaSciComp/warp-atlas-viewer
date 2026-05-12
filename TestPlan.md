# WARP Atlas test plan

Browser-driven validation of the viewer. Run `npm run dev` (or open a `npm run bundle` build over HTTP) and walk through each section.

Each test is independent. Reset between tests by clicking the **↺ reset filters** button at the top of the Filters tab — that returns every filter card to defaults but preserves any user-explicit selection (t-SNE lasso / 3D click focus). The **↺ reset settings** button (Settings tab) returns the Settings panel to defaults independently.

The bottom panel has three tabs: **Filters**, **Settings**, **Help**. The Filters tab is the default. Filter cards are laid out left-to-right as **Colors × Transcriptomics × Visual Stimuli × Anatomy** with `×` separators (logical AND).

---

## A. Color schemes — single-axis sanity checks

Validate each of the six color schemes renders correctly with no other filters active. Switch via Colors → scheme dropdown.

### A1. Simple (highlight)
- Setup: Colors=Simple, all other filters "all".
- Expected: every cell rendered with a single highlight color (no per-cell categorical or gradient encoding). The legend has no entries (no scale).
- Pass if the brain renders uniformly highlighted.

### A2. Region
- Setup: Colors=Region, all other filters "all".
- Expected: every cell colored by its region with the categorical palette. The Brain region legend (top-right of the 3D viewer) lists all 16 regions plus Unassigned.
- Pass if every cell renders in its region's categorical color and the legend lists all regions.

### A3. Gene expression — richness fallback
- Setup: Colors=Gene expression. Transcriptomics: no genes selected (default).
- Expected: plasma gradient paints the whole brain by **gene richness** — how many of the 41 panel genes each cell expresses by the curated binary call. Legend reads "Gene richness" with ticks `0..G` (G = number of selected genes if any, else 41). Cells with zero expressed genes appear dim.
- Toggle the Colors → "scale: log | linear" toggle; legend ticks change accordingly.
- Switch the Settings → "Gene expression predicate" between binary call and any-detected: richness should respond (any-detected typically raises richness for many cells).
- Pass if a richness map appears whenever no specific gene is in focus, and reflects the predicate toggle.

### A4. Gene expression — single gene
- Setup: Colors=Gene expression. Transcriptomics → "+ add gene" → pick a gene.
- Expected: plasma gradient over that gene's raw FISH spot count across the brain. Legend reads `Gene: <name>` with plasma bar + scale ticks `[0, 1, 10, 100, 1000]` (log) or `[0, 250, 500, 750, 1000]` (linear). The right-edge tick does NOT overflow past the legend border.
- The brain is also filtered to gene-positive cells (the gene-filter activates on the same selection); use Settings → predicate to widen/narrow the population if needed.
- Pass if the plasma gradient paints by single-gene expression, the scale toggle updates the legend ticks, and no tick is clipped.

### A5. Gene expression — multi-gene
- Setup: Colors=Gene expression. Add 2+ genes via Transcriptomics → "+ add gene". Settings → Multi-gene coloring → cycle between Max / Sum / Richness.
- Expected: the brain repaints to reflect the chosen aggregation (max spot count across the selection / sum across / count of "on" calls). Legend title shifts ("Max", "Sum", "Richness" wording) and ticks rescale.
- Transcriptomics → OR / AND toggle: under OR the filter keeps any cell that expresses *any* selected gene; under AND only cells expressing *every* selected gene. The colored population should visibly shrink when flipping OR → AND.
- Pass if every Max/Sum/Richness produces a sensible map and OR/AND visibly restricts the population.

### A6. Stim correlation
- Setup: Colors=Stim correlation, all other filters "all".
- Expected: plasma gradient by **max Pearson r across all 8 stimuli** for each cell. Legend ticks span the configured r range. Cells below Settings → "responsive floor (r ≥)" appear dim; cells at/above Settings → "saturation" hit the brightest plasma end.
- Tweak the floor / saturation in Settings and confirm the legend tick scale and the dim/bright partition responds.
- Now toggle ON one stimulus in Visual Stimuli. The map should switch to that stim's r (a stricter, sparser response pattern). Toggle ON a second: now it's the max across the two selected stims.
- Pass if the gradient tracks max-r when nothing's picked and the selected-subset's max when stims are picked.

### A7. Activity
- Setup: Colors=Activity. The Colors card grows a **time slider** (sample index ‹ › arrows + range), a "t s" readout, a play ▶ button, and a speed dropdown (1×–100×).
- Expected: plasma gradient over the mean ΔF/F at the chosen sample. Scrubbing the slider repaints the brain frame-by-frame. The Detail panel's trace plot shows a vertical activity cursor at the current time.
- Hit Play: time advances, brain animates; the URL hash does NOT update mid-playback (URL bar shouldn't change while playing). Pause: the URL is then written with the paused-at sample.
- Settings → Activity ΔF/F anchors: tweak floor / ceiling and confirm the bright / dim partition rescales.
- Pass if scrubbing animates the brain, the trace cursor follows, playback doesn't pollute history, and the legend's ΔF/F ticks reflect Settings.

### A8. Specimen
- Setup: Colors=Specimen.
- Expected: each cell colored categorically by its source fish (3 colors). Legend lists each fish ID present in the dataset.
- Pass if the per-fish partition is visible (registration consistency: regions should look like the same anatomy in three colors rather than three disjoint blobs).

---

## B. Filter compositions — multi-card combinations

The `×` between filter cards is logical AND. A card set to "all" doesn't restrict.

### B1. Region × Single gene
- Setup: Colors=Region; Anatomy → pick a region; Transcriptomics → add one gene; Visual Stimuli=all.
- Expected: only cells inside the region AND expressing the gene are colored by region; cells inside the region not expressing the gene are "lifted" (alpha ~0.5) so the region outline still reads through; cells outside the region are deep-dim.
- Pass if you can see the region outline in lifted gray plus the small bright in-region/gene-positive subset.

### B2. Subtype × Gene-expression coloring
- Setup: Colors=Gene expression; Transcriptomics → Subtype → pick a cluster; Visual Stimuli=all; Anatomy=all.
- Expected: only the picked cluster's cells are colored, by gene richness (no specific gene pinned → A3 fallback rules). Legend reads "Gene richness". Everything else is deep-dim.
- Pass if the cluster lights up colored by richness while non-cluster cells go dim.

### B3. Triple-filter intersection
- Setup: Colors=Region; Anatomy → a region; Transcriptomics → one gene; Visual Stimuli → one stim.
- Expected: only the (small) intersection of all three filters is colored by region. Out-of-region cells are deep-dim; in-region non-intersection cells are lifted.
- Pass if the colored set is visibly smaller than any single-filter intersection, and the Detail panel count matches the visible bright cells.

### B4. Activity-only filter
- Setup: Colors=Region, Anatomy=all, Transcriptomics: no genes, Visual Stimuli → pick a stim.
- Expected: only cells with r ≥ Settings.stimLo for the selected stim are colored by region. Non-responsive cells are deep-dim. Tightening `stimLo` in Settings should shrink the colored set.
- Pass if a sparse, region-colored stim-responsive map appears.

### B5. Multi-stimulus AND vs OR
- Setup: Colors=Region, Anatomy=all, Transcriptomics: no genes, Visual Stimuli → toggle ON 2+ stimuli.
- Expected: under OR the colored set is the union of responders; under AND it's the (typically much smaller) intersection. Flipping the OR/AND toggle in the Visual Stimuli card should visibly resize the set.
- Pass if OR ⊇ AND in every multi-stim case.

### B6. Co-coding (Stim color × gene filter)
- Setup: Colors=Stim correlation. Transcriptomics → add a gene. Anatomy=all. Visual Stimuli → pick a stim.
- Expected: only gene-positive cells are kept; among those, plasma encodes their r against the selected stim. This reproduces the "co-coding" view from the older UI (gene-positive AND stim-correlated).
- Pass if a sparse, gene-positive, plasma-by-stim-r map appears.

### B7. Anatomy → specimen filter
- Setup: Anatomy → specimen → pick one fish (only visible if the dataset has more than one fish).
- Expected: only that fish's cells are kept. The brain should still look like a brain (registration is into the shared mapzebrain frame), but in only one specimen's coverage.
- Toggle Colors=Specimen to confirm only that fish's color is present.
- Pass if only one fish's cells render, with mapzebrain-aligned anatomy preserved.

---

## C. Persistence behavior

### C1. txMode flip preserves both indices
- Setup: Transcriptomics → Gene → add gene "X"; flip to Subtype → pick cluster "Y"; flip back to Gene.
- Expected: gene "X" still in the gene list. Flip to Subtype again → cluster "Y" still picked.
- Pass if both selections survive every flip.

### C2. Removing all genes preserves color-mode behavior
- Setup: Transcriptomics → Gene → pick a gene; Colors=Gene expression (single-gene map). Now click the × on the gene to remove it.
- Expected: Colors stays on Gene expression but switches to **richness** automatically (A3 rules). Legend retitles to "Gene richness". The filter releases (more cells render).
- Pass if removing the last gene cleanly returns to richness without leaving a stale single-gene legend.

### C3. Color-scheme switch preserves filter state
- Setup: Anatomy → a region; Transcriptomics → Subtype → cluster; Visual Stimuli → a stim; then cycle Colors through Simple → Region → Gene → Stim → Activity → Specimen and back.
- Expected: each color scheme repaints, but Anatomy / Transcriptomics / Visual Stimuli retain their picks. Detail panel keeps the same intersection count.
- Pass if no filter dropdown / chip resets when Colors changes.

### C4. Settings.geneStrict (binary call) state affects filter + coloring
- Setup: Colors=Gene expression. Transcriptomics → add a gene; note Detail panel count. Settings → Gene expression predicate → uncheck "binary call".
- Expected: Detail panel count rises (any-detected is more permissive than the curated binary call). The 3D bright-cell set grows. Re-check: count drops back.
- Pass if the predicate visibly changes both the filter membership and the richness colors (A3 / A5).

### C5. URL hash round-trip
- Setup: Configure a non-default state (pick a color mode, add a gene, toggle a stim, isolate a region, scrub activity, lasso in t-SNE, click a 3D neuron). Copy the URL.
- Open the URL in a new tab.
- Expected: the new tab restores filter + settings + camera + t-SNE viewport + lasso + focused neuron exactly. The lasso polygon may be dropped if the URL hit the 6 kB hash cap (console warns); without that, the lasso indices should be re-derived and the selection re-displayed.
- Pass if a fresh page load reaches the same visible state.

### C6. Activity playback doesn't pollute URL
- Setup: Colors=Activity. Hit Play. Watch the URL bar.
- Expected: the URL hash does not visibly tick along with playback. Click Pause: the URL then updates once to the paused-at sample.
- Pass if playback is silent in the URL.

---

## D. Selection coherence

### D1. Filter-derived selection updates DetailPanel
- Setup: All filters "all". Pick Anatomy → a region.
- Expected: DetailPanel shows aggregate stats for cells in that region (count, top regions/genes, mean trace, per-stim correlation).
- Add Transcriptomics → a gene. DetailPanel updates to the smaller intersection. Add Visual Stimuli → a stim. Updates again.
- Pass if DetailPanel count shrinks monotonically as filters are added.

### D2. Reset clears filters only
- Setup: continue from D1. Click ↺ reset filters.
- Expected: every filter card returns to defaults; DetailPanel empties (no filter intersection to fall back to). User-explicit selections (lasso / 3D-focus) are NOT touched.
- Variant: make a t-SNE lasso selection first, change filters, click ↺ reset filters. The lasso must survive; DetailPanel must still show the lasso.
- Pass if the reset only clears filter state.

### D3. User selection is independent of filters; order of operations doesn't matter
- Setup A (lasso-then-filter): all filters "all". Lasso a cluster of cells in the t-SNE — they highlight (brightness+size boost) in both views. Add Anatomy → a region.
- Setup B (filter-then-lasso): Reset everything. Anatomy → that same region first, then lasso the same cells.
- Expected (both): identical end state. The lasso-selected cells get the user-selection boost in both views; the anatomy filter dims out-of-region cells. DetailPanel shows the lasso (it wins over the filter intersection).
- Repeat with a 3D click instead of a lasso (single-neuron focus).
- Pass if every order-of-operations pairing reaches the same final visualization.

### D4. Filter-derived selection does NOT get the user-selection brightness boost
- Setup: Anatomy → a region with many cells; Color=Region.
- Expected: the in-region cells are colored by region but should NOT have the extra brightness/size halo that lasso-selected cells get.
- Pass if filter-driven highlighting looks like the natural color scheme rather than the bright user-selection halo.

### D5. Clear-selection button on t-SNE panel
- Setup: lasso something in t-SNE → "clear selection" button appears in the t-SNE header.
- Expected: clicking it drops the lasso (selection cleared in 3D + t-SNE; DetailPanel falls back to filter intersection if any, else empty).
- Pass if "clear selection" disappears after one click and the lasso is gone.

### D6. 3D-click focus
- Setup: click any visible neuron in the 3D viewer.
- Expected: DetailPanel header changes to "Focused neuron #N" and shows that single cell's gene bars, trace, and per-stim correlation. A focus ring renders around the cell. Click empty space: focus clears.
- A lasso, if present, persists through focus changes.
- Pass if the focus is independent of the lasso and clears on empty-space click.

---

## E. Tabs and panels

### E1. Filters / Settings / Help tabs
- Click each tab in the bottom panel.
- Expected: only one tab pane is visible at a time; the active tab has a yellow underline.
- Pass if tab switching is clean and stateless (switching back doesn't reset filter state).

### E2. Bottom panel hide/show
- Click the `⌄` handle at the bottom-center of the 3D viewer.
- Expected: the bottom row (Filters + t-SNE) collapses and the 3D viewer reclaims the full height; handle flips to `⌃`. Click again to restore.
- Pass if the brain viewer cleanly resizes to fill the space without distortion.

### E3. Detail panel hide/show
- Click the `›` handle on the right edge of the screen (on the panel border when open; on the viewport edge when closed).
- Expected: the detail panel collapses; the main column reclaims the width. Handle flips to `‹`.
- Pass if the layout reflows without horizontal scroll.

### E4. × separators visible between filter cards
- Expected: four cards `Colors × Transcriptomics × Visual Stimuli × Anatomy` with `×` separators between them.
- Pass if separators are visible.

### E5. Filter card wraps on narrow window
- Resize the window narrower until the four cards no longer fit on one row.
- Expected: cards wrap to a second row; layout doesn't break; no horizontal scroll in the filter panel.
- Pass if wrapping is clean.

### E6. Filter panel scrolls when content overflows
- Resize narrow enough that the wrapped cards don't fit vertically.
- Expected: a vertical scrollbar appears inside the bottom-left panel; the 3D viewer and t-SNE are unaffected.
- Pass if vertical scroll appears without horizontal.

### E7. Dropdown arrow cycling
- In any dropdown with `‹ ›` arrows (Anatomy region, Anatomy specimen, Transcriptomics subtype), click both arrows past the boundaries.
- Expected: cycles through "all" + all options without dead-ending; wraps from the last option back to "all".
- Pass if cycling never gets stuck.

### E8. Gene scale toggle visibility
- Set Colors=Gene expression → the "scale: log | linear" toggle should appear inside the Colors card. Set Colors anything else → the toggle disappears.
- Pass if the toggle only appears when Colors=Gene expression.

### E9. Activity time row visibility
- Set Colors=Activity → the time slider + ‹ › arrows + play button + speed dropdown appear inside the Colors card. Switch to any other color mode → they disappear.
- Pass if the activity controls only appear when Colors=Activity.

### E10. Reset filters button
- Setup: change every filter card. Click ↺ reset filters.
- Expected: every card returns to its default (Colors=Region, no genes, no stims, Anatomy=all, etc.). DetailPanel clears any filter-derived selection.
- The button does NOT clear user-explicit selections (a t-SNE lasso made BEFORE the reset survives).
- Pass if reset clears filters only, not user selections.

### E11. Reset settings button
- Setup: change every Settings control (move sliders, toggle binary call, etc.). Click ↺ reset settings (Settings tab).
- Expected: every Settings control returns to defaults. Filters and selections are untouched.
- Pass if reset settings only affects the Settings tab.

### E12. Gene-legend tick alignment
- Set Colors=Gene expression (either richness or single-gene mode).
- Expected: the leftmost tick label ("0") sits at the bar's left edge; the rightmost (e.g. "1000" or "41") sits at the bar's right edge — neither overflows the legend's border.
- Pass if no tick label is clipped.

### E13. t-SNE header is bare
- Expected: the t-SNE panel header reads "t-SNE" plus an optional "reset view" button (when zoomed/panned) and an optional "clear selection" button (when a lasso is active). Nothing else.
- Pass if the header stays minimal.

### E14. Stim icons render with correct on/off styling
- In the Visual Stimuli card, each of the 8 stims renders as a 32×32 icon button. Untoggled buttons are semi-dim; toggled-on buttons have a yellow ring + full opacity.
- Pass if every icon renders and the on/off styling is unambiguous.

### E15. OR / AND toggles dim out when irrelevant
- Visual Stimuli card with 0 or 1 stims selected: the OR/AND toggle appears but at reduced opacity (50%) with a tooltip explaining it only matters at 2+ selections.
- Add a second stim: opacity returns to 100%.
- Same behavior for the Transcriptomics gene-list OR/AND toggle.
- Pass if both toggles correctly dim/undim.

---

## F. Help tab presets

### F1. Each preset is enabled iff its referenced cluster/gene exists
- Open the Help tab. Each "reproduce a finding" button references a cluster name (e.g. `pou4f2_cckb`) or a gene (`otpa`).
- Expected: buttons are enabled when the dataset contains the named cluster/gene; disabled (grayed out) otherwise. In the mock dataset most will be disabled; in the real dataset most should be enabled.
- Pass if enable-state matches dataset content.

### F2. Clicking a preset applies it cleanly
- Click any enabled preset.
- Expected: the filter resets and then loads the preset's color mode + cluster/gene + stimulus picks; any prior lasso / 3D focus is cleared (presets are meant to start from a clean slate). The 3D view repaints; the legend reflects the preset.
- Pass if the preset gets you to the described view (e.g. `pou4f2_cckb` tectal cells highlighted by dark-flash r).

---

## G. Quick smoke checks

- **G1.** Hover a cell in the 3D view. Tooltip shows ID / region / top genes.
- **G2.** Box-/lasso-select in t-SNE while a filter is active. Selection should be the user lasso (source 'umap') with the brightness boost overriding the filter intersection.
- **G3.** Click "clear selection" or click empty 3D space — clears the corresponding selection.
- **G4.** Reload the page. Initial state matches A2 (Region color, no filters), or whatever the URL hash specifies if you arrived via a shared URL.
- **G5.** Switch Colors=Activity → Play. Both the 3D view and the Detail-panel trace cursor advance together.
- **G6.** Open in a second tab via copied URL; the second tab matches.

---

## What "fail" looks like

Capture any of these as bugs:

- A region outline that should read through (anatomy active) but is invisible because in-region non-foreground cells went to deep dim instead of "lifted" gray.
- Filter dropdowns / gene chips / stim toggles resetting unexpectedly when you change Colors or txMode.
- Selection from a subtype filter persisting after clearing it.
- Dropdown cycling getting stuck at "all".
- Horizontal scroll in the filter panel (vertical scroll on overflow is intended).
- Reset filters clearing the user's t-SNE lasso or 3D focus.
- Gene legend tick label overflowing past the gradient's edge.
- Colors=Gene expression with no specific gene in focus silently using a leftover gene's expression instead of richness.
- Activity playback writing intermediate samples to the URL (history pollution).
- A shared URL failing to restore the camera, viewport, or lasso when the hash is under the 6 kB cap.
- OR/AND toggle changing nothing when 2+ stims are selected.

Report which test number failed and what you saw.
