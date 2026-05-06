# Filter UX test plan

Browser-driven validation of the four-filter (Colors × Anatomy × Transcriptomics × Activity) bottom panel.

Run `npm run dev` and open the browser. Each test is independent — reset by clicking the **reset** button (or by setting all four filter cards to "all" and Colors=Region) before starting the next one.

---

## A. Identity sweep — old behaviors still reproducible

Validate each of the four old "color modes" can still be reached, and looks like it did before this PR.

### A1. Region mode
- Setup: Colors=Region, all other filters "all"
- Expected: every cell colored by its region with the categorical palette; the region legend (top-right) lists all regions.
- Pass if the brain looks like the old "Region" mode.

### A2. Gene mode
- Setup: Colors=Gene, Transcriptomics=Single gene → pick any gene, Anatomy=all, Activity=all
- Expected: plasma gradient over expression; non-expressers faint dark gray; gene legend shows plasma bar + scale ticks.
- Toggle scale: log ↔ linear in Colors card. Tick labels in legend should change between [0,1,10,100,1000] and [0,250,500,750,1000].
- Pass if it looks like old "Gene" mode and the scale toggle works.

### A3. Cluster mode
- Setup: Colors=Cluster, Transcriptomics=Subtype → pick any cluster
- Expected: only the picked cluster is bright yellow, everything else background-dim. Detail panel shows cells from that cluster.
- Pass if it looks like old "Cluster" mode.

### A4. Co-coding mode
- Setup: Colors=Co-coding, Transcriptomics=Single gene → any gene, Activity → any stimulus, Anatomy=all
- Expected: 4-tier bivariate (gray / blue / green / red); red cells (gene+ AND stim+) are larger and stand out; legend shows the two gene+/gene− gradient bands.
- Pass if it matches old "Co-coding" mode.

---

## B. Compositions — combinations that weren't possible before

### B1. Anatomy × Transcriptomics(gene) × Color=Cluster
- Setup: Colors=Cluster; Anatomy → pick a region (e.g., the first in the list); Transcriptomics=Single gene → any gene; Activity=all
- Expected:
  - Cells inside the chosen region AND expressing the gene that also belong to the persistent `selectedCluster`: bright yellow.
  - Cells inside the region AND expressing the gene but NOT in that cluster: rendered (small set).
  - Cells inside the region but NOT expressing the gene: lifted gray (alpha ~0.5) — region outline visible.
  - Cells outside the region: deep dim.
- Pass if you can clearly see the region outline + a small foreground subset highlighted within it.

### B2. Anatomy × Transcriptomics(subtype) × Color=Gene
- Setup: Colors=Gene; Anatomy → pick a region; Transcriptomics=Subtype → pick a cluster; Activity=all
- Expected: only cells in BOTH the region AND the cluster are colored by gene-expression plasma; in-region non-cluster cells are lifted gray; out-of-region cells deep dim.
- Pass if a small plasma-colored intersection is visible inside a gray region outline.

### B3. Triple-filter intersection
- Setup: Colors=Region; Anatomy → pick a region; Transcriptomics=Single gene → any gene; Activity → any stimulus
- Expected: only the (small) intersection of all three filters is colored by region; the rest is dimmed (with anatomical lift inside the chosen region).
- Pass if the colored set is visibly smaller than any single-filter intersection. The detail panel should show a count matching the visible bright cells.

### B4. Activity-only filter
- Setup: Colors=Region, Anatomy=all, Transcriptomics=all, Activity → pick a stimulus
- Expected: only stim-responsive cells (r ≥ 0.30) colored by region; non-responsive cells background-dim.
- Pass if a sparse, region-colored "stim-responsive map" is visible.

### B5. Co-coding restricted to a region
- Setup: Colors=Co-coding, Anatomy → a region, Transcriptomics=Single gene → any gene, Activity → any stim
- Expected: bivariate colors only inside the region; region outline preserved; outside dim.
- Pass if the bivariate palette is anatomically localized.

---

## C. Persistence behavior

### C1. txMode flip preserves both indices
- Setup: Transcriptomics=Single gene → pick gene "X"; flip to Subtype → pick cluster "Y"; flip back to Single gene.
- Expected: the gene dropdown still shows "X" (not reset). Flip to Subtype again → cluster dropdown still shows "Y".
- Pass if both selections survive the flip.

### C2. "all" preserves the prior pick
- Setup: Transcriptomics=Single gene → pick gene "X"; change the gene dropdown to "all"; change it back away from "all".
- Note: changing back from "all" via the dropdown gives whatever option you click. To test persistence, watch the legend or the Color=Gene visual: after picking "all", set Colors=Gene — the legend should show "X" (the persistent index), not gene 0.
- Pass if the legend retains the previously-picked gene name even when the gene filter is "all".

### C3. Color scheme switch preserves filter state
- Setup: Anatomy=region, Transcriptomics=Subtype/cluster, Activity=stimulus; cycle Colors through Region → Gene → Cluster → Co-coding and back.
- Expected: each color scheme repaints, but the Anatomy/Transcriptomics/Activity dropdowns retain their settings. Detail panel keeps the same intersection count.
- Pass if filter dropdowns don't reset when Colors changes.

---

## D. Selection coherence

### D1. Filter-derived selection updates DetailPanel
- Setup: All filters "all". Pick Anatomy → a region.
- Expected: DetailPanel shows aggregate stats for cells in that region (count, top regions/genes, etc.).
- Add Transcriptomics=Single gene → a gene. DetailPanel updates to the smaller intersection. Add Activity → a stim. Updates again.
- Pass if DetailPanel count shrinks monotonically as filters are added.

### D2. Returning all filters to "all" clears the filter-derived selection
- Setup: continue from D1. Reset every filter back to "all".
- Expected: DetailPanel empties (no "selection" displayed); the t-SNE panel has no visible selection rectangle; the brain has no highlighted subset.
- Pass if no selection lingers after all filters are "all".

### D3. 3D/UMAP selection is preserved across filter changes
- Setup: All filters "all". Drag-select a cluster of cells in the t-SNE panel. The selected cells should highlight (brightness/size boost) in the 3D viewer.
- Now change Anatomy → some region.
- Expected: the t-SNE selection should persist (same cells still highlighted in 3D and in t-SNE), even as the filter intersection becomes the dominant rendering. Visually, the user-selected cells remain "boosted" wherever they fall.
- Pass if the t-SNE selection survives an Anatomy filter change.
- Repeat with: 3D click on a cell (single-neuron focus). Change a filter. Focused neuron stays focused.

### D4. Filter-derived selection does NOT get the user-selection brightness boost
- Setup: Anatomy → a region with many cells; Color=Region.
- Expected: the in-region cells are colored by region, but they should NOT have the extra brightness/size boost that 3D-clicked cells get. (Compare to D3 where dragging in t-SNE clearly enlarges/lights up the selected cells.)
- Pass if filter-derived "selections" look like the natural color scheme rather than the user-selection bright halo.

---

## E. UI / layout

### E1. × separators visible between cards
- Expected: in the bottom panel, four cards labeled "Colors / Anatomy / Transcriptomics / Activity" with `×` symbols between them.
- Pass if separators are clearly visible.

### E2. Wrap on narrow window
- Resize the window narrower until the four cards no longer fit on one row.
- Expected: cards wrap to a second row; layout doesn't break.
- Pass if no horizontal scroll appears in the filter panel.

### E3. Dropdown arrow cycling
- In any dropdown with arrows (Anatomy region, Activity stim, Transcriptomics gene/cluster), click ‹ and › repeatedly past the boundaries.
- Expected: cycles through "all" + all options without dead-ending; wraps from the last option back to "all".
- Pass if cycling never gets stuck.

### E4. Gene scale toggle visibility
- Set Colors=Gene → "scale: log | linear" toggle should appear inside the Colors card.
- Set Colors=anything else → toggle disappears.
- Pass if scale toggle only shows when Colors=Gene.

### E5. Reset button
- Setup: change every filter (pick a region, switch txMode to Subtype with a cluster picked, pick a stimulus, change Colors to Co-coding).
- Click the **↺ reset** button on the right edge of the filter row.
- Expected: every card returns to defaults — Colors=Region, Anatomy=all, Transcriptomics=Single gene with "all", Activity=all. DetailPanel clears (any filter-derived selection is dropped).
- Now repeat the test but make a t-SNE box-selection FIRST, then change filters, then click reset.
- Expected: filters reset to defaults but the t-SNE selection survives (still highlighted in 3D + t-SNE; DetailPanel still shows it).
- Pass if reset clears filters only, not user-explicit selections.

---

## F. Quick smoke checks

- **F1.** Hover a cell in the 3D view. Tooltip still shows ID/region/top genes.
- **F2.** Box-select in t-SNE while a filter is active. Selection should be the user box-select (source 'umap'), with brightness boost overriding the filter intersection.
- **F3.** "Clear selection" button appears when a 3D-focus or UMAP-drag selection exists. Clicking it clears.
- **F4.** Reload the page. Initial state matches A1 (Region color, no filters).

---

## What "fail" looks like

Capture any of these as bugs to file:
- A region outline that should read through (anatomy active) but is invisible because in-region non-foreground cells went to deep dim instead of lift.
- Filter dropdowns resetting to defaults when you change Colors or txMode.
- Selection from a cluster filter persisting after switching to "all".
- Dropdown cycling getting stuck at "all".
- Layout overflow / horizontal scroll in the filter panel.
- Reset button clearing the user's t-SNE / 3D-click selection.

Report which test number failed and what you saw.
