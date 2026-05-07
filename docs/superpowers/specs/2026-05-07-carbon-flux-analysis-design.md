# Carbon flux analysis component — design

**Date:** 2026-05-07
**Repo:** `frontend`
**Theme placement:** Kinetics (alongside Kinetic Analysis and Yield summary)

## Goal

Help the user understand carbon consumption rates and how they relate to product formation. Today the analysis section shows final stacked carbon mass (`CarbonBalance`), per-experiment μmax/qP/Yp/s scalars (`KineticAnalysis`), and scalar yields (`YieldSummary`). Nothing connects substrate consumption dynamics to product formation, either across a cohort or within a single run.

## Component overview

A single combined component, `CarbonFlux`, with two stacked views:

1. **Cohort scatter** (top): one dot per experiment. x = overall Y_p/s (yield product/substrate), y = qP_max (peak specific product formation rate). Quadrants tell the user whether a condition is efficient, fast, both, or neither at a glance.
2. **Per-experiment drilldown** (bottom): when a dot is clicked, show cumulative substrate-consumed and cumulative product-formed as two lines on a shared time axis with shared y-axis (g/L). The vertical gap at any time t equals the local Y_p/s up to that point.

Specific (per-biomass) rates are used: `qS = (1/X) · dS/dt`, `qP = (1/X) · dP/dt`. This matches the existing `KineticAnalysis` convention and normalizes for cell-density differences across experiments.

## Architecture

### File layout

- `frontend/src/components/dashboard/analysis/CarbonFlux.tsx` — new top-level component, with two internal sub-components (`CohortFluxScatter`, `ExperimentFluxDrilldown`).
- `frontend/src/lib/analysis/kineticsUtils.ts` — extended with three pure helpers:
  - `computeYpsOverall(productSeries, substrateSeries): number | null`
  - `computeCumulativeMassSeries(series): { timepoints: number[]; cumulative: number[] }`
  - `computeQsMax(substrateSeries, biomassSeries): { qsMax: number; qsMaxTime: number } | null`
- `frontend/src/lib/analysis/types.ts` — add `'carbon-flux'` to the `AnalysisSlug` union.
- `frontend/src/lib/analysis/constants.ts` — register the slug in the Kinetics theme, between `kinetic-analysis` and `yield-summary`.
- `frontend/src/app/dashboard/analysis/page.tsx` — add the `state.analysis === 'carbon-flux'` branch. The slug is added to the existing whitelist that triggers `OutcomePicker`.

### No backend changes

The cohort payload already exposes everything needed: per-experiment `time_series` (with `role: 'substrate' | 'biomass' | null`) and `outcomes`. Computation happens in TypeScript in the browser, mirroring `KineticAnalysis`. Performance is acceptable for cohorts up to several hundred experiments with O(N · T) work per render where T is timepoint count per series.

## Components

### `CarbonFlux` (top-level)

Owns:
- Selected product (string). Defaults to the first product in `payload.products` (matching `KineticAnalysis`).
- Selected experiment id for drilldown (`number | null`).

Layout (top to bottom):
1. Product selector — driven by the existing `OutcomePicker` mounted by the parent page; `CarbonFlux` reads `state.product` and `state.outcome` from `useAnalysisState()`. (The outcome picker is already shown by the parent for any analysis in its whitelist; we add `'carbon-flux'` to that whitelist.)
2. `CohortFluxScatter` — fills available width.
3. Excluded-experiments counter and legend strip ("N of M experiments included · color = strain").
4. `ExperimentFluxDrilldown` — fills available width below; empty state when no dot is selected.

### `CohortFluxScatter` (internal)

Props: `cohort: CohortFluxPoint[]`, `selectedExperiment: number | null`, `onSelect(id: number): void`.

Rendering:
- D3 SVG, full container width, fixed aspect ratio.
- Linear scales for both axes; padding includes negative-yield experiments (rare but possible with noisy substrate).
- Dots colored by strain name using `d3.scaleOrdinal(d3.schemeTableau10)` for parity with `KineticAnalysis`. Strains not in the active cohort are omitted from the legend. Experiments with `strain == null` go into a gray `"Unknown"` bucket.
- Selected dot is enlarged and gets a black stroke.
- Hover tooltip shows: experiment title, strain, qS_max, qP_max, Y_p/s, batch media name.
- Click anywhere on a dot calls `onSelect(id)`.

### `ExperimentFluxDrilldown` (internal)

Props: `experiment: ExperimentInPayload | null`, `productName: string`.

Rendering:
- D3 SVG, full width.
- Two paths over time:
  - **Substrate consumed**: at each substrate timepoint t, `S(0) − S(t)` (blue, `#3b82f6`).
  - **Product formed**: at each product timepoint t, `P(t) − P(0)` (orange, `#eb5234` — the brand color).
- The two series are plotted on their native timepoint grids — no interpolation.
- Hover crosshair: vertical line follows the cursor at time `t`. Tooltip shows `S_consumed(t) = S_0 − S(t_S)` and `P_formed(t) = P(t_P) − P_0` (using the nearest substrate and product timepoints respectively), and the running yield up to that time `Y_p/s(0..t) = P_formed(t) / S_consumed(t)`.
- Phase shading (lag/exponential/stationary) from the existing `detectPhases` helper is rendered as light-tinted background bands. Use the same band colors as `PhaseDetector` (read from that file at implementation time to keep palettes in sync).

## Data flow

```
useCohortPayload(state.ids)
        │  payload: CohortPayload
        ▼
   CarbonFlux
        │
        ├── deriveCohortPoints(payload, productName)
        │      for each experiment:
        │        biomass  = findBiomassData(time_series)
        │        substrate = findSubstrateData(time_series)
        │        product   = time_series.find(category=product, name=productName)
        │        if any missing → skip (count as excluded)
        │        qS_max    = computeQsMax(substrate, biomass)
        │        qP_max    = calculateProductionRate(product, biomass).qpMax  (existing)
        │        Y_ps      = computeYpsOverall(product, substrate)
        │        if (S_0 − S_final) ≤ 0 → skip
        │      → CohortFluxPoint[]
        │
        ├── CohortFluxScatter (renders points, emits onSelect)
        │
        └── deriveDrilldown(experiment, productName)
               substrate cumulative series  (S_0 − S(t))
               product cumulative series    (P(t) − P_0)
               phases = detectPhases(biomass.timepoints, biomass.values)
               → ExperimentFluxDrilldown
```

`findBiomassData` and `findSubstrateData` already exist in `KineticAnalysis.tsx` and are extracted to `lib/analysis/kineticsUtils.ts` as part of this work so both components share them.

## Error handling

- **Missing biomass, substrate, or selected product** → experiment silently excluded from the scatter. Counter below the chart reads `"N of M experiments included · K excluded (missing biomass/substrate/product)"`.
- **Non-decreasing substrate** (`S_0 − S_final ≤ 0`, noisy meter or no consumption) → excluded; counted in the same warning. The exclusion reason is exposed in a hover tooltip on the counter so the user can see which experiments dropped out and why.
- **Empty cohort or no products** → reuse the `KineticAnalysis` empty state copy: "No kinetic data available. Experiments must have biomass, substrate, and product measurements."
- **No drilldown selection** → drilldown panel shows "Click a point above to inspect" placeholder.
- **Negative cumulative product** (rare; product measurement noise around zero) → still plotted; truncating would hide real data. The shared y-axis includes negatives if present.

## Testing

### Unit tests (new)

Add to the existing `lib/analysis/kineticsUtils.test.ts` if present, or create it following the harness pattern used elsewhere in the frontend.

- `computeYpsOverall`
  - monotone-decreasing substrate, monotone-increasing product → returns ΔP/ΔS.
  - flat substrate → returns `null`.
  - increasing substrate (impossible in practice but defensive) → returns `null`.
  - single-point series → returns `null`.
- `computeCumulativeMassSeries`
  - input `{ timepoints: [0, 5, 10], values: [50, 30, 10] }` returns cumulative `[0, 20, 40]`.
  - empty input → empty arrays.
- `computeQsMax`
  - known-input known-output on a small fixture; verifies `dS/dt` is signed correctly (consumption is positive).

### Component test

Render `CarbonFlux` with a fixture `CohortPayload` (3 experiments — one missing biomass, one with flat substrate, one healthy). Assert:
- Scatter renders one dot.
- Counter reads `"1 of 3 experiments included · 2 excluded"`.
- Clicking the dot updates the drilldown to that experiment's title.

### Existing tests

- Confirm `lib/analysis/constants.ts` ordering tests (if any) are updated to include the new slug.

## Out of scope (explicit)

- Volumetric (non-specific) rate toggle. Specific rates only for v1.
- Multi-substrate experiments (sum or pick). Uses the single substrate-role series with the existing fallback.
- Per-phase qS/qP breakdown. The drilldown shades phases but doesn't tabulate metrics by phase. Could be added later if useful.
- Backend pre-computation in `outcomes_cache.py`. Frontend-only first; revisit if cohorts grow large enough that browser computation feels slow.
- Comparison overlay of multiple drilldowns. One experiment at a time.

## Open questions to resolve in the implementation plan

- Whether `findBiomassData` / `findSubstrateData` are extracted to `kineticsUtils.ts` in this PR or kept duplicated. Leaning toward extracting because the duplication is small and shared with `KineticAnalysis`.
- Whether `useAnalysisState` should track the drilldown experiment id in the URL. KineticAnalysis uses local state; matching that for consistency is the default.
- Tooltip library vs hand-rolled SVG `<title>` — match whatever `KineticAnalysis` uses.
