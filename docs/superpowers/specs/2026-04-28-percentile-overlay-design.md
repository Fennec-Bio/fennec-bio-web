# Percentile Overlay — Design Spec

**Date:** 2026-04-28
**Scope:** Frontend (`frontend/`) — analysis page only
**Status:** Approved, ready for implementation plan

## Summary

Add a new analysis to the Pattern Finding theme called **Percentile overlay**. The user picks one time-series metric (product, secondary product, or process data) to plot across all selected runs, and optionally a second metric whose scalar value drives a percentile-based color gradient on the first metric's lines (red = lower, green = higher). The existing Kinetics → Overlay analysis is left untouched.

Example: pick **DO** (process data) as the plot metric and **CBDa** (product, max value) as the color metric. The chart shows all selected runs' DO curves, with curves whose runs produced higher CBDa drawn in green and curves whose runs produced lower CBDa drawn in red.

## Where it lives

- **New analysis slug:** `percentile-overlay`, label `"Percentile overlay"`, added to the `pattern` theme in `frontend/src/lib/analysis/constants.ts`.
- **Type union:** `AnalysisSlug` in `frontend/src/lib/analysis/types.ts` extended with `'percentile-overlay'`.
- **New component:** `frontend/src/components/dashboard/analysis/PercentileOverlay.tsx`. Receives `payload: CohortPayload`.
- **Wiring:** `frontend/src/app/dashboard/analysis/page.tsx` adds a render branch for the new slug.
- **Existing `KineticOverlay`:** untouched. The Kinetics theme's "Overlay" stays where it is.

## Controls

A horizontal control bar above the chart, styled like the existing Overlay's control row.

### Plot metric (required, the first / curve metric)

- Category dropdown: `Product` / `Secondary product` / `Process data`
- Name dropdown: populated from the cohort payload — names of `time_series` entries in that category that appear on at least one selected experiment.

### Color by (optional, the second / percentile metric)

- Category dropdown: `(none)` / `Product` / `Secondary product` / `Process data`
- Name dropdown: same logic, scoped to that category. Hidden when category is `(none)`.
- Reduce-to-scalar dropdown: `Final value` / `Max value` / `Mean` / `Area under curve`. Hidden when category is `(none)`.

### State

Component-local React state (`useState`). No URL persistence — matches the existing Overlay.

## Computation

### Reducing a time-series to a single scalar (for the second metric)

| Option | Definition |
|---|---|
| Final value | Last finite point of `series.values`. |
| Max value | `max` of finite values. |
| Mean | Arithmetic mean of finite values. |
| Area under curve | Trapezoidal rule over `(timepoints_h, values)`, skipping null gaps (each null point breaks the segment). |

A run with zero finite points for the chosen second metric has no scalar (excluded from ranking).

### Percentile assignment

1. Collect scalars across all selected runs that have **both** metrics (the plot metric series exists, and the second metric scalar is finite).
2. Rank ascending (ties get the average rank).
3. Percentile = `rank / (n - 1)` for `n >= 2`, so worst = 0, best = 1.
4. Map percentile → color via `d3.interpolateRdYlGn` (red at 0 → yellow at 0.5 → green at 1).

### Plot

- One linear x-axis (time, hours) and one linear y-axis using the first metric's values.
- y-axis label shows the metric name and unit (the most common unit across runs that have it).
- One `<path>` per run for the first metric, drawn with `d3.line`.
- Hover: bump hovered line's `stroke-width` to 3 and fade others to `opacity: 0.25` (kept from existing Overlay).
- Tooltip on each line shows: experiment title, second-metric scalar value (when applicable), and percentile (when applicable).

### Legend (when second metric chosen)

Horizontal gradient strip beneath the chart, red → yellow → green, labeled with:
- Left end: minimum scalar value
- Right end: maximum scalar value
- Center label: `"<second metric name>, <reduction>: <min> → <max> <unit>"`

## Coloring rules — quick reference

| State | Coloring |
|---|---|
| First metric only, no second metric | Per-experiment, `d3.schemeTableau10` (matches existing Overlay). |
| Both metrics chosen, run has both | Percentile color via `d3.interpolateRdYlGn`. |
| Both metrics chosen, run is missing the second | Gray `#d1d5db`, low opacity (de-emphasized). |
| Fewer than 2 runs have a finite second-metric scalar | Fall back to per-experiment colors + show note (see edge cases). |
| All runs tie on the second metric | All percentiles collapse to 0.5 (yellow) + show note (see edge cases). |

## Empty states & edge cases

- **No experiments selected:** parent page handles this ("Pick experiments on the left").
- **No first metric chosen yet:** chart area shows muted text: `"Pick a metric to plot."`
- **First metric chosen, no selected run has that time-series:** chart area shows: `"No selected runs have data for <metric name>."`
- **First metric chosen, second category = none:** plot all runs colored per-experiment, no legend strip.
- **Second metric chosen, fewer than 2 runs have a finite scalar:** drop percentile coloring, fall back to per-experiment colors, show note: `"Not enough runs with <second metric> data to rank — coloring by experiment instead."`
- **Second metric chosen, all runs tie on the scalar:** all lines colored yellow; show note: `"All runs tied on <second metric> — no percentile spread."`
- **Some runs missing the second metric (but enough to rank others):** drawn in gray `#d1d5db` at lower opacity; show count: `"<N> selected runs excluded from ranking (missing <second metric>)."`
- **Mixed units within a category:** y-axis label shows the most common unit; runs whose unit differs are still plotted, with a `console.warn` (no UI noise).

## Testing

Frontend has limited unit-test coverage for analysis components, so the verification plan is:

- **Type-check + build:** `npm run build` passes (catches TS errors and Next.js build issues).
- **Manual QA in browser** (the project's `CLAUDE.md` requires testing the golden path and edge cases):
  - Pick a cohort with at least one experiment that has both products and process data.
  - Navigate to Pattern finding → Percentile overlay.
  - Verify each control works: category change clears name, reduction options recompute the gradient, `(none)` falls back to per-experiment.
  - Verify each empty/edge state from the list above.
  - Verify hover/tooltip and the legend strip values.

No backend changes — all computation is client-side over the existing `CohortPayload`.

## Out of scope

- URL persistence of picker state.
- Cross-category metric pairings beyond what the user picks (no auto-suggestion).
- Editing the existing Kinetics → Overlay analysis.
- Saving / sharing percentile-overlay views.
