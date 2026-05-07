# Plate Results Component — Design

**Date:** 2026-05-03
**Scope:** Frontend only (no backend changes)

## Summary

Add a new `Results` component to the dashboard (`/dashboard`) that renders a stacked bar chart of plate-experiment data with optional replicate grouping (mean + 95% confidence interval). When the user switches the dashboard sidebar to **Plates** mode, the existing `QuickGraph` and `Overlay` sections are hidden and `Results` is shown in their place.

## Behavior

### Section toggle drives layout

The dashboard sidebar (`ExperimentList`) already exposes a Reactor/Plates toggle via `DashboardTabs`. Today that toggle's state is internal to `ExperimentList`. We lift it to the dashboard page so the page itself can decide which main-content sections to render:

- **Reactor mode** (current default): AI Recommendations, Quick Graph, Overlay, Analysis. Unchanged.
- **Plates mode**: AI Recommendations, **Results** (new), Analysis. `QuickGraph` and `Overlay` are not rendered.

### Plate-experiment selection from sidebar

Today, plate-experiment items in the sidebar are `<Link>`s to `/dashboard/plates/[id]`. On `/dashboard`, they become **selection buttons** instead. Selecting a plate experiment populates the `Results` component on the same page.

The full plate editor at `/dashboard/plates/[id]` remains accessible via direct URL only (no in-app link added in this iteration). On the `/experiments` page, sidebar plate items continue to be links — behavior is preserved by making the new selection wiring opt-in via prop.

When the user enters plates mode, if the project has plate experiments, the first one is auto-selected (mirrors the `rightGraphDefault` pattern used for reactor experiments).

### Results component

A collapsible card that renders:

- A toolbar: plate picker (only if the experiment has >1 plate), measurements multi-select dropdown, "Group replicates" toggle button.
- A stacked bar chart (d3) of the selected plate's wells, with a Y axis showing the measurement value (or sum across stacked measurements).
- A legend below the chart when ≥2 measurements are selected.
- A Y-axis caption: shared unit when measurements agree, otherwise "Mixed units".

States:

| State | Render |
|---|---|
| No plate experiment selected | "Select a plate experiment from the sidebar to see results." |
| Loading | "Loading plate data…" |
| Hook error | Red error text |
| Experiment loaded but no plates | "This experiment has no plates yet." |
| Plate selected, no wells with chosen measurement | "No data for this measurement on this plate." |
| User deselected all measurements | "Select at least one measurement." inside the chart area |

### Replicate grouping

A toggle (default: **on**) controls whether wells are grouped into replicates. Two replicates are wells whose **full set of `WellVariable { name, value }` pairs is identical**. This naturally separates `isolate=1` from `isolate=2` because their variable sets differ.

**When grouped (default):**

For each unique condition key, for each selected measurement `m_i`:
- Collect each replicate well's value for `m_i`.
- `mean_i = mean(values)`, `n_i = count(values)`.
- 95% CI half-width: `h_i = t_{0.025, n_i − 1} × stddev_i / √n_i` for `n_i ≥ 2`, else `h_i = 0`.

Each bar is a stack of measurement segments (in user-selected order, bottom = first selected). Each segment has its own whisker centered on the cumulative top of the segment, spanning `[cum_top − h_i, cum_top + h_i]`.

**When ungrouped:**

One bar per well. Bars stack by measurement. No whiskers.

### Bar labels

Grouped mode uses the well's `strain` variable (case-insensitive name match) as the X-axis label. If no `strain` variable is present on the wells, fall back to the first well's `${row}${column}` (e.g., `B7`) — matches existing `PlateBarChart` behavior. Duplicate labels get suffixed `(2)`, `(3)`, etc. for disambiguation.

Ungrouped mode uses `${row}${column}` (e.g., `B7`).

A hover tooltip on each segment shows the full condition + the segment's mean and CI:
`Strain: PFB-027 · Media: M9-glycerol · Olivetolic Acid: 12.4 ± 1.8 mg/L (n=4, 95% CI)`

### Colors

Single measurement: brand color `#eb5234` (matches existing `PlateBarChart`).
Multiple measurements: shadcn semantic chart tokens `--chart-1` through `--chart-5` from `globals.css`, in selection order.

## Architecture

### State lifted to `Dashboard`

```ts
const [section, setSection] = useState<DashboardSection>('reactor')
const [selectedPlateExperimentId, setSelectedPlateExperimentId] = useState<string | null>(null)
```

When `section` flips to `'plates'`, the dashboard renders `<Results plateExperimentId={selectedPlateExperimentId} />` in place of `QuickGraph` + `Overlay`.

### `ExperimentList` — controlled-section opt-in

New optional props (all backwards-compatible — when omitted, current local-state behavior is preserved):

```ts
section?: DashboardSection
onSectionChange?: (s: DashboardSection) => void
onPlateExperimentSelect?: (id: string) => void
selectedPlateExperimentId?: string | null
```

`DashboardTabs` already supports controlled mode, so we just thread `section` / `onSectionChange` through.

When `onPlateExperimentSelect` is provided, plate-experiment list items render as `<button>` (selection) rather than `<Link>` (navigation), and the selected one gets the `bg-blue-100 border-blue-300` highlight used elsewhere in the list.

### New: `src/components/dashboard/Results.tsx`

Owns:
- Selected plate index within the loaded experiment
- Selected measurement IDs (`number[]`)
- `groupReplicates` boolean
- Chart rendering (d3, same approach as existing `PlateBarChart`)

Consumes existing hooks: `usePlateExperiment(plateExperimentId)` and `useDataCategories(experiment.project)`. **No new backend endpoints.**

When `plateExperimentId` changes, reset plate index to 0 and measurements to `[firstAvailable]`.

### New: `src/lib/stats.ts`

```ts
export function tCritical95(df: number): number
```

Returns the two-tailed t-critical value at α = 0.05 for the given degrees of freedom. Implemented as a small lookup table (df 1–30) plus a `1.96` fallback for `df ≥ 31`. `df < 1` returns `0` (caller skips the whisker).

### Bar-data builder

The pure function that turns `(plate, measurementIds, groupReplicates)` into bar data lives next to `Results.tsx` (either as a non-exported helper or a sibling `results-bars.ts`). Pure → directly unit-testable.

## Files

**New:**
- `frontend/src/components/dashboard/Results.tsx`
- `frontend/src/lib/stats.ts`

**Modified:**
- `frontend/src/app/dashboard/page.tsx` — lift `section` and `selectedPlateExperimentId`; conditional render of QuickGraph/Overlay vs Results
- `frontend/src/components/Shared/ExperimentList.tsx` — accept the four new optional props; render plate items as buttons when `onPlateExperimentSelect` is provided

**Unchanged:**
- Backend (no API changes)
- `frontend/src/app/dashboard/plates/[id]/page.tsx` (full plate editor still uses the existing `PlateBarChart`)
- `frontend/src/components/Plate/PlateBarChart.tsx` (kept for the per-plate editor; `Results` is a separate dashboard-level component)

## Testing

Per `CLAUDE.md` ("component/unit tests where the codebase already has them, or at minimum typecheck + build pass"):

- **Unit test** `tCritical95` in `src/lib/stats.ts`: a few df values from the table, the `df ≥ 31` fallback, and `df < 1` returns `0`.
- **Unit test** the bar-data builder: synthetic plate fixture with covering cases:
  - Ungrouped mode produces one bar per well.
  - Grouped mode merges wells with identical variable sets.
  - `isolate=1` and `isolate=2` stay in separate groups.
  - `n=1` segment has zero whisker; `n≥2` segment has whisker matching `t × stddev / √n`.
  - Two stacked measurements produce two segments per bar in selection order.
- **Typecheck + build**: `npm run typecheck && npm run build` must pass.
- **Manual smoke** in dev server: switch reactor/plates; confirm QuickGraph/Overlay disappear in plates mode and Results renders; pick a plate experiment from the sidebar; switch measurement; toggle group-replicates; confirm CIs render with sensible widths and isolates remain separate bars.

## Out of scope

- A link or button to navigate from Results to the full plate editor at `/dashboard/plates/[id]` (deferred per Q7).
- Aggregating data across multiple plate experiments (Q1 chose select-one).
- Cross-plate aggregation within a single experiment (Q2 chose one plate at a time).
- Backend changes — none required.
