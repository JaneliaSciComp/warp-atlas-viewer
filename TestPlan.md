# Filter UX test plan

Browser-driven validation of the four-filter (Colors × Anatomy × Transcriptomics × Activity) bottom panel.

Run `npm run dev` and open the browser. Each test is independent — reset by clicking the **↺ reset** button (next to the "Filters" title) before starting the next one.

---

## A. Identity sweep — single-axis color modes

Validate each of the four color modes renders correctly with no other filters active.

### A1. Region mode
- Setup: Colors=Region, all other filters "all"
- Expected: every cell colored by its region with the categorical palette; the region legend (top-right) lists all regions.
- Pass if every cell renders in its region's categorical color and the legend lists all regions.

### A2. Gene mode (single gene across whole brain)
- Setup: Colors=Gene, Anatomy=all, Activity=all. Then in Transcriptomics → Single gene, **pick a gene** (this activates the filter — most of the brain goes grey), **then switch the same dropdown back to "all"** (deactivates the filter; the persistent gene index stays). Anatomy and Activity stay at "all".
- Expected: plasma gradient over the whole brain showing that gene's raw spot-count expression; non-expressers faint dark gray. Legend reads "Gene: <name>" with plasma bar + scale ticks. The "1000" tick at the right edge does NOT overflow.
- Toggle scale: log ↔ linear in Colors card. Tick labels in legend should change between [0,1,10,100,1000] and [0,250,500,750,1000].
- Pass if the plasma gradient paints the whole brain by gene expression and the scale toggle updates the legend ticks.

### A3. Cluster mode
- Setup: Colors=Cluster, Transcriptomics=Subtype → pick any cluster
- Expected: only the picked cluster is bright yellow, everything else background-dim. Detail panel shows cells from that cluster.
- Pass if only the picked cluster is bright and the rest is dimmed.

### A4. Co-coding mode
- Setup: Colors=Co-coding, Anatomy=all, Activity → any stimulus. Then in Transcriptomics → Single gene, pick a gene then switch back to "all" (same two-step trick as A2 — sets the persistent gene without restricting cells to gene+ only).
- Expected: 4-tier bivariate (gray / blue / green / red); red cells (gene+ AND stim+) are larger and stand out; legend shows the two gene+/gene− gradient bands.
- Pass if the 4-tier bivariate renders with red (gene+ AND stim+) cells emphasized.

### A5. Gene richness mode
- Setup: Colors=Gene, Transcriptomics=Single gene → "all" (default initial state), Anatomy=all, Activity=all
- Expected: every cell painted by **how many of the 41 panel genes it expresses by the binary call** — plasma gradient where bright = many genes, dim = few genes. Legend reads "Gene richness" with ticks scaled to [0..G] (G=41 in the WARP dataset). Cells with zero expressed genes appear dim; high-richness regions visibly stand out.
- Switch Transcriptomics → Subtype → pick a cluster: legend stays in richness mode (still "Gene richness"); only that cluster's cells are colored, everything else dim. Richness still drives the in-cluster colors.
- Toggle Colors=Gene scale log ↔ linear: ticks change accordingly.
- Pass if richness aggregation appears whenever no specific gene is in focus.

### A6. Binary-call predicate toggle
- Setup: Colors=Region, Transcriptomics=Single gene → pick a gene. The "binary call" checkbox should appear on its own row inside the Transcriptomics card.
- With "binary call" CHECKED (default): the filter selects only cells where the curated `geneBinary === 1`. DetailPanel count = the curated population for that gene.
- Uncheck "binary call": filter relaxes to "any detected expression" (`raw > 0`). DetailPanel count visibly increases (typically by a lot — many cells have raw=1 or 2 below the binary threshold). The 3D view shows more cells colored.
- Re-check: count drops back.
- Switch Transcriptomics → "all": the checkbox disappears (only relevant when a specific gene is picked). Switch back to a specific gene: checkbox reappears with its prior state preserved.
- Pass if the checkbox toggles the predicate and visibly changes the cell count, and is hidden when "all" is selected.

---

## B. Compositions — multi-filter combinations

### B1. Anatomy × Transcriptomics(gene) × Color=Cluster
- Setup: Colors=Cluster; Anatomy → pick a region (e.g., the first in the list); Transcriptomics=Single gene → any gene; Activity=all
- Expected:
  - Cells inside the chosen region AND expressing the gene that also belong to the persistent `selectedCluster`: bright yellow.
  - Cells inside the region AND expressing the gene but NOT in that cluster: rendered (small set).
  - Cells inside the region but NOT expressing the gene: lifted gray (alpha ~0.5) — region outline visible.
  - Cells outside the region: deep dim.
- Pass if you can clearly see the region outline + a small foreground subset highlighted within it.

### B2. Anatomy × Transcriptomics(subtype) × Color=Gene (richness)
- Setup: Colors=Gene; Anatomy → pick a region; Transcriptomics=Subtype → pick a cluster; Activity=all
- Expected: cells in BOTH the region AND the cluster are colored by **gene richness** plasma (since no specific gene is in focus, A5 rules apply); in-region non-cluster cells are lifted gray; out-of-region cells deep dim.
- Pass if a small richness-colored intersection is visible inside a gray region outline. Legend reads "Gene richness".

### B3. Triple-filter intersection
- Setup: Colors=Region; Anatomy → pick a region; Transcriptomics=Single gene → any gene; Activity → any stimulus
- Expected: only the (small) intersection of all three filters is colored by region; the rest is dimmed (with anatomical lift inside the chosen region).
- Pass if the colored set is visibly smaller than any single-filter intersection. The detail panel should show a count matching the visible bright cells.

### B4. Activity-only filter
- Setup: Colors=Region, Anatomy=all, Transcriptomics=all, Activity → pick a stimulus
- Expected: only stim-responsive cells (r ≥ 0.30) colored by region; non-responsive cells background-dim.
- Pass if a sparse, region-colored "stim-responsive map" is visible.

### B5. Co-coding restricted to a region
- Setup: Colors=Co-coding, Anatomy → a region. Transcriptomics: pick a gene then switch back to "all" (so the gene filter is inactive but the persistent gene index drives the bivariate axis). Activity → any stim.
- Expected: bivariate colors only inside the region; region outline preserved; outside dim.
- Pass if the bivariate palette is anatomically localized.

---

## C. Persistence behavior

### C1. txMode flip preserves both indices
- Setup: Transcriptomics=Single gene → pick gene "X"; flip to Subtype → pick cluster "Y"; flip back to Single gene.
- Expected: the gene dropdown still shows "X" (not reset). Flip to Subtype again → cluster dropdown still shows "Y".
- Pass if both selections survive the flip.

### C2. "all" preserves the prior pick
- Setup: Transcriptomics=Single gene → pick gene "X" (filter activates); now switch the dropdown to "all" (filter deactivates); set Colors=Gene.
- Expected: the gene legend should show "Gene: X" — the persistent index survived even though the filter is "all" — and the brain is painted by gene X expression across all cells.
- Pass if the persistent gene drives the visualization while the filter is "all".

### C3. Color scheme switch preserves filter state
- Setup: Anatomy=region, Transcriptomics=Subtype/cluster, Activity=stimulus; cycle Colors through Region → Gene → Cluster → Co-coding and back.
- Expected: each color scheme repaints, but the Anatomy/Transcriptomics/Activity dropdowns retain their settings. Detail panel keeps the same intersection count.
- Pass if filter dropdowns don't reset when Colors changes.

### C4. binary-call checkbox state persists across "all" toggles
- Setup: Transcriptomics=Single gene → pick a gene → uncheck "binary call". Switch to "all" (checkbox disappears). Switch back to a specific gene.
- Expected: the checkbox reappears and is still UNCHECKED.
- Pass if the geneStrict state survives the dropdown round-trip.

---

## D. Selection coherence

### D1. Filter-derived selection updates DetailPanel
- Setup: All filters "all". Pick Anatomy → a region.
- Expected: DetailPanel shows aggregate stats for cells in that region (count, top regions/genes, etc.).
- Add Transcriptomics=Single gene → a gene. DetailPanel updates to the smaller intersection. Add Activity → a stim. Updates again.
- Pass if DetailPanel count shrinks monotonically as filters are added.

### D2. Returning all filters to "all" drops the filter-derived selection
- Setup: continue from D1, but make sure no t-SNE drag / 3D click is active. Click the ↺ reset button (or set every filter back to "all" manually).
- Expected: DetailPanel empties (no filter intersection to fall back to); the brain shows the bare Highlight scheme.
- Pass if the DetailPanel clears.
- Variant: with a t-SNE drag selection ALREADY in place, do the same. The DetailPanel should keep showing the t-SNE selection — it's user-explicit and isn't tied to filters.

### D3. User selection is independent of filters; order of operations doesn't matter
- Setup A (drag-then-filter): All filters "all". Drag-select a cluster of cells in the t-SNE panel — they highlight (brightness/size boost) in the 3D viewer. Now add Anatomy → some region.
- Setup B (filter-then-drag): Reset everything. Add Anatomy → that same region first, then drag-select the same cluster of cells in t-SNE.
- Expected (both setups): identical end state. The t-SNE box-selected cells are highlighted with the user-selection boost (visible in both 3D and t-SNE). The anatomy filter applies to the rest of the brain (out-of-region cells dim). DetailPanel shows the t-SNE selection (it wins over the filter intersection).
- Now repeat the comparison with a 3D click instead of a t-SNE drag. Click a neuron (single-neuron focus); add a filter. Focused neuron persists. Reverse: filter first, then click — same end state.
- Pass if every order-of-operations pairing reaches the same final visualization and DetailPanel content.

### D4. Filter-derived selection does NOT get the user-selection brightness boost
- Setup: Anatomy → a region with many cells; Color=Region.
- Expected: the in-region cells are colored by region, but they should NOT have the extra brightness/size boost that 3D-clicked cells get. (Compare to D3 where dragging in t-SNE clearly enlarges/lights up the selected cells.)
- Pass if filter-derived "selections" look like the natural color scheme rather than the user-selection bright halo.

### D5. binary-call checkbox affects the derived selection too
- Setup: All filters "all". Pick Transcriptomics=Single gene → a gene; note the DetailPanel count. Uncheck "binary call".
- Expected: the DetailPanel count should change to match the more permissive `raw > 0` predicate (typically larger). The 3D view's bright-cell set should match the new count.
- Pass if the visualization and the derived selection agree under both checkbox states.

---

## E. UI / layout

### E1. "Filters" title and adjacent reset
- Expected: above the row of cards, a small "Filters" label; immediately to its right, a "↺ reset" button.
- Pass if both render as a single header row above the cards.

### E2. × separators visible between cards
- Expected: in the bottom panel, four cards labeled "Colors / Anatomy / Transcriptomics / Activity" with `×` symbols between them.
- Pass if separators are clearly visible.

### E3. Vertical control stacking inside cards
- Expected: every control inside a card sits on its own row.
  - Colors: scheme dropdown on row 1; (when scheme=Gene) "scale: log | linear" on row 2.
  - Anatomy: region dropdown on row 1.
  - Transcriptomics: Single gene/Subtype toggle on row 1; the gene/cluster dropdown on row 2; (when a specific gene is picked) the "binary call" checkbox on row 3.
  - Activity: stimulus dropdown on row 1.
- Pass if no card has two controls side-by-side on the same line.

### E4. Wrap on narrow window
- Resize the window narrower until the four cards no longer fit on one row.
- Expected: cards wrap to a second row; layout doesn't break.
- Pass if no horizontal scroll appears in the filter panel.

### E5. Filter panel scrolls when content overflows
- Resize the window narrow enough that the wrapped cards + Tips section don't fit in the bottom-left panel's vertical space.
- Expected: a vertical scrollbar appears inside the bottom-left panel; you can scroll to reveal hidden cards/Tips. The 3D viewer and t-SNE panel are unaffected.
- Pass if the bottom-left scrolls without spilling into the rest of the layout.

### E6. Dropdown arrow cycling
- In any dropdown with arrows (Anatomy region, Activity stim, Transcriptomics gene/cluster), click ‹ and › repeatedly past the boundaries.
- Expected: cycles through "all" + all options without dead-ending; wraps from the last option back to "all".
- Pass if cycling never gets stuck.

### E7. Gene scale toggle visibility
- Set Colors=Gene → "scale: log | linear" toggle should appear inside the Colors card.
- Set Colors=anything else → toggle disappears.
- Pass if scale toggle only shows when Colors=Gene.

### E8. Reset button behavior
- Setup: change every filter (pick a region, switch txMode to Subtype with a cluster picked, pick a stimulus, change Colors to Co-coding, uncheck binary call).
- Click the **↺ reset** button next to the "Filters" title.
- Expected: every card returns to defaults — Colors=Region, Anatomy=all, Transcriptomics=Single gene with "all", Activity=all, "binary call" reverts to checked. DetailPanel clears (any filter-derived selection is dropped).
- Now repeat the test but make a t-SNE box-selection FIRST, then change filters, then click reset.
- Expected: filters reset to defaults but the t-SNE selection survives (still highlighted in 3D + t-SNE; DetailPanel still shows it).
- Pass if reset clears filters only, not user-explicit selections.

### E9. t-SNE header is bare
- Expected: the t-SNE panel header just reads "t-SNE" (plus an optional "reset view" button when zoomed/panned).
- Tip text for t-SNE controls should appear in the Tips list at the bottom of the filter panel.
- Pass if the header is just a title, with t-SNE control hints living in Tips.

### E10. Gene-legend tick alignment
- Set Colors=Gene (either richness or single-gene mode).
- Expected: the leftmost tick label ("0") sits at the bar's left edge; the rightmost tick label ("1000" for single-gene log/linear, "G" for richness) sits at the bar's right edge — neither overflows the legend's border.
- Pass if no tick label is clipped.

---

## F. Quick smoke checks

- **F1.** Hover a cell in the 3D view. Tooltip still shows ID/region/top genes.
- **F2.** Box-select in t-SNE while a filter is active. Selection should be the user box-select (source 'umap'), with brightness boost overriding the filter intersection.
- **F3.** "Clear selection" button appears when a 3D-focus or UMAP-drag selection exists. Clicking it clears.
- **F4.** Reload the page. Initial state matches A1 (Region color, no filters, "Gene richness" legend if you switch Colors=Gene without picking a gene).

---

## What "fail" looks like

Capture any of these as bugs to file:
- A region outline that should read through (anatomy active) but is invisible because in-region non-foreground cells went to deep dim instead of lift.
- Filter dropdowns or the binary-call checkbox resetting unexpectedly when you change Colors or txMode.
- Selection from a cluster filter persisting after switching to "all".
- Dropdown cycling getting stuck at "all".
- Layout overflow / horizontal scroll in the filter panel (vertical scroll on overflow is the intended behavior — only horizontal is a bug).
- Reset button clearing the user's t-SNE / 3D-click selection.
- Gene legend tick label overflowing past the gradient's edge.
- Color=Gene with no specific gene in focus silently using a leftover persistent gene's expression instead of richness.

Report which test number failed and what you saw.
