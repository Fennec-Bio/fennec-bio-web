# Carbon Mass Balance — Design

**Date:** 2026-05-07
**Repo:** `frontend`
**Scope:** Upgrade Carbon Consumption, Carbon Flux, and Carbon Balance tabs to use a shared fed-batch mass-balance computation that incorporates `batch_volume_ml`, batch and feed media carbon concentrations, and the per-experiment feed-rate `process_data` series.

## Goal

Today the three carbon analyses use concentration-delta math (`S(0) − S(t)` in g/L). For fed-batch experiments this silently double-counts dilution as "consumption" or hides real consumption masked by feed addition. With `batch_volume_ml`, `batch_media.carbon_sources[*].concentration`, `feed_media.carbon_sources[*].concentration`, and a feed-rate process_data series now available end-to-end, we can compute true mass-of-substrate-consumed and use it everywhere a "consumed" or "uptake rate" number is shown.

## Non-Goals

- Sampling and evaporation volume corrections.
- Multi-substrate (e.g. simultaneous glucose + glycerol) carbon balance.
- Per-phase qS breakdown (lag/exponential/stationary).
- Backend precomputation of mass-balance fields in the cohort payload.
- New visualizations of the time-resolved `V(t)`, `m_added(t)`, or `m_consumed(t)` series. The data is computed; no UI exposes them in this scope.

## Math

| Symbol | Source | Unit |
|---|---|---|
| `V_batch` | `experiment.batch_volume_ml` | mL |
| `C_batch_pct` | `batch_media.carbon_sources[i].concentration` (matched substrate) | % (w/v) |
| `C_feed_pct` | `feed_media.carbon_sources[i].concentration` (matched substrate) | % (w/v) |
| `F(t)` | `process_data` series with `name === experiment.feed_pump_series` | mL/h |
| `S(t)` | substrate time-series (existing `findSubstrateData`) | g/L |
| `X(t)` | biomass time-series | g/L |
| `f_C` | carbon fraction of the substrate (`compoundCarbonMetadata`) | dimensionless |

Conversion: `1 % (w/v) = 10 g/L`.

### Volume

```
V(t) = V_batch + ∫₀ᵗ F(τ) dτ              [mL]
```

Trapezoidal integration on F's own timepoints.

### Substrate mass balance

```
m_added(t)     = (V_batch · C_batch_g_per_L)/1000  +  ∫₀ᵗ F(τ) · C_feed_g_per_L /1000 dτ      [g]
m_remaining(t) = V(t) · S(t) / 1000                                                            [g]
m_consumed(t)  = m_added(t) − m_remaining(t)                                                   [g]

m_carbon_consumed(t) = m_consumed(t) · f_C                                                     [g of carbon]
```

`/1000` converts mL × g/L → g.

### Rates

```
Volumetric uptake rate:  r_S(t) = d m_consumed / dt    / V(t)               [g/(L·h)]
Specific uptake rate:    qS(t)  = r_S(t) / X(t)                              [g substrate / g DCW / h]
qS_max                  = max over t of qS(t)
```

### Yields

```
Y_p/s (overall, mass-based) = (P_final − P_0) · V_final / m_consumed(t_final)
```

### Assumptions and edge cases

- Vessel volume only grows from feed; sampling and evaporation are ignored.
- Feed media carbon concentration is constant for the run.
- Negative feed-rate values are clamped to 0 in the cumulative integral (sensor noise).
- `m_consumed(t)` clamped to 0 (substrate measurement noise can make `m_remaining` momentarily exceed `m_added`).
- Substrate measurement timepoints outside the feed-rate grid use linear extrapolation that flattens at the nearest endpoint (no inventing data).
- If `feed_pump_series` is set but no `process_data` series matches that exact name, treat as feed missing (`F = 0`) and tag the row.
- If `batch_media` has multiple carbon sources, use only the one whose name matches the measured substrate name (case-insensitive trim).

## Architecture

### File layout

```
frontend/src/lib/analysis/
└── carbonMassBalance.ts          ← NEW. Pure math + lookups. Zero React.

frontend/src/components/dashboard/analysis/
├── CarbonConsumption.tsx         ← unchanged shape; renders new fields + warning chip
├── carbonConsumptionLogic.ts     ← MODIFY: call carbonMassBalance, populate new fields
├── carbonConsumptionLogic.test.ts ← extend
├── CarbonFlux.tsx                ← unchanged shape; warning chip on excluded counter
├── carbonFluxLogic.ts            ← MODIFY: qsMax + yps come from helper
├── carbonFluxLogic.test.ts       ← extend
└── CarbonBalance.tsx             ← MODIFY: substrate-carbon term comes from helper;
                                              renders updated unaccounted slice +
                                              warning chip on per-bar basis
```

A new test file `frontend/src/lib/analysis/carbonMassBalance.test.ts` tests the helper in isolation.

### `carbonMassBalance.ts` exports

```ts
export interface MassBalanceInputs {
  experiment: ExperimentInPayload
  substrate: TimeSeriesEntry        // already chosen by caller
}

export type MassBalanceMode = 'mass' | 'concentration-only'

export interface MassBalanceMissingInputs {
  feedRateSeries: boolean
  batchVolume: boolean
  batchCarbonConcentration: boolean
  feedCarbonConcentration: boolean   // ignored if feedRateSeries is missing
}

export interface MassBalanceResult {
  mode: MassBalanceMode
  missing: MassBalanceMissingInputs
  volumeML:        { timepoints_h: number[]; valuesML: number[] }   // V(t)
  massAddedG:      { timepoints_h: number[]; valuesG: number[] }    // cumulative
  massRemainingG:  { timepoints_h: number[]; valuesG: number[] }    // V(t) · S(t)
  massConsumedG:   { timepoints_h: number[]; valuesG: number[] }    // added − remaining
  carbonConsumedG: { timepoints_h: number[]; valuesG: number[] }
  scalars: {
    massConsumedFinalG:   number | null
    carbonConsumedFinalG: number | null
    initialCarbonG:       number | null
    fedCarbonFinalG:      number | null
  }
}

export function computeMassBalance(input: MassBalanceInputs): MassBalanceResult
export function pickFeedRateSeries(exp: ExperimentInPayload): TimeSeriesEntry | null
export function pickBatchCarbonConcentrationGperL(
  media: MediaInPayload | null, substrateName: string,
): number | null
export function pickFeedCarbonConcentrationGperL(
  media: MediaInPayload | null, substrateName: string,
): number | null
```

### Required vs optional inputs for `mode === 'mass'`

- **Required:** `batch_volume_ml` set, batch media carbon concentration set for the substrate, substrate time-series has ≥ 2 points.
- **Optional:** feed rate series (missing → `F = 0`, batch-only math), feed media carbon concentration (missing → fed carbon treated as 0, soft warning).

If any required input is missing, `mode === 'concentration-only'` and the helper returns empty time-series arrays + null scalars; the calling logic file fills its row from today's g/L delta math.

## Data flow

```
existing tab logic (e.g. carbonConsumptionLogic.ts)
   │
   ├── build the row as today (selecting substrate, target product, etc.)
   │
   ├── computeMassBalance({ experiment, substrate })
   │      ├─ if any required input missing → mode = 'concentration-only',
   │      │   scalars from old g/L delta math
   │      └─ else → mode = 'mass', scalars from real integration
   │
   └── populate new fields:
         row.massBalanceMode      = result.mode
         row.massBalanceMissing   = result.missing
         row.substrateConsumedG   = result.scalars.massConsumedFinalG ?? legacy_proxy
         row.carbonConsumedG      = result.scalars.carbonConsumedFinalG ?? legacy_proxy
         row.uptakeRateGPerH      = massConsumedFinalG / elapsedH (when mode='mass')
```

## Per-tab integration

### Carbon Consumption (`carbonConsumptionLogic.ts`)

| Field | `mode === 'mass'` | `mode === 'concentration-only'` |
|---|---|---|
| `substrateConsumedG` | `balance.scalars.massConsumedFinalG` | `(S(0) − S(final)) · V_batch_L` if `V_batch` known, else `null` |
| `carbonConsumedG` | `balance.scalars.carbonConsumedFinalG` | `substrateConsumedG · f_C` |
| `uptakeRateGPerH` | `massConsumedFinalG / elapsedHours` | derived from concentration delta as today |
| `apparentConversion` | `(targetDelta · V_batch_L) / massConsumedG` | today's value |
| `carbonConversion` | `targetCarbonG / carbonConsumedG` | today's value |
| `allocations.carbon.unaccounted` | `carbonConsumedG − Σ(target+others+by+biomass).carbon` | today's value |

`CarbonConsumptionRow` gains: `massBalanceMode: MassBalanceMode`, `massBalanceMissing: MassBalanceMissingInputs`, `substrateConsumedG: number | null`. The existing `substrateConsumed` (g/L) field stays for backward compatibility.

`CarbonConsumption.tsx`:
- Slate `concentration-only` chip next to the experiment title when `mode === 'concentration-only'`. Tooltip enumerates the missing inputs.
- "Substrate consumed" header tooltip explains that the column shows mass when supported, falls back to g/L otherwise. Numbers render with their actual unit.

### Carbon Flux (`carbonFluxLogic.ts`)

- **`yps`:** when `mode === 'mass'`, `Y_p/s = (P_final − P_0) · V_final / massConsumedFinalG`. Else today's `computeYpsOverall`.
- **`qsMax`:** when `mode === 'mass'`, derive from `d massConsumed / dt / V(t) / X(t)`. Else today's `computeQsMax`.
- **`qpMax`:** unchanged (already a specific rate from biomass and product).
- **Drilldown substrate-consumed line:** when `'mass'`, plot `balance.massConsumedG` directly. Else today's cumulative `S(0) − S(t)` line.

`CohortFluxPoint` gains `massBalanceMode`. Concentration-only dots render with a faint hatch/halo. Counter strip extends with `· K shown with concentration-only fallback`.

### Carbon Balance (`CarbonBalance.tsx`)

Carbon Balance keeps its computation inline in the component (no separate `carbonBalanceLogic.ts` exists). The change applies in the same component: when `mode === 'mass'`, replace today's concentration-derived substrate-carbon term with `balance.scalars.carbonConsumedFinalG` before computing the stacked bar's slices. The unaccounted slice then closes properly. Per-bar warning chip when the experiment falls back to concentration-only.

If extracting that math into a new `carbonBalanceLogic.ts` becomes natural during implementation (to enable unit testing on its own), do it — but it is not required by this spec.

### Soft-warning case: feed media missing concentration

`batch_media` has the substrate at known concentration but `feed_media.carbon_sources` is empty or has no entry for the substrate. The math still works (batch portion correct; fed carbon treated as 0). Row stays in `mode === 'mass'` with `missing.feedCarbonConcentration = true`. UI shows a softer chip (`feed not counted`) instead of `concentration-only`.

## Testing

### `carbonMassBalance.test.ts` (new)

- `pickFeedRateSeries`
  - Returns the matching `process_data` series when `feed_pump_series` matches a series name.
  - Returns `null` when `feed_pump_series` is empty or whitespace.
  - Returns `null` when no series matches the tag.
  - Ignores series whose category isn't `process_data`.
- `pickBatchCarbonConcentrationGperL` / `pickFeedCarbonConcentrationGperL`
  - 2.5% w/v Glucose → 25 g/L.
  - Case-insensitive match.
  - Multi-carbon media: returns the matching one only.
  - Returns `null` for null media, no matching source, or null concentration.
- `computeVolumeOverTime`
  - Constant 5 mL/h for 10 h from 800 mL → V(10) = 850 mL.
  - Empty/null feed → returns `[V_batch]` at t = 0.
  - Negative feed values clamp to 0.
  - Non-uniform timepoints integrate correctly via trapezoid.
- `computeMassBalance` happy path
  - Synthetic experiment: V_batch=800, batch glucose=2% (20 g/L), feed glucose=50% (500 g/L), F=5 mL/h from t=0 to t=24, substrate `[(0,20),(12,8),(24,2)]`.
  - Asserts `mode === 'mass'`, `initialMassG ≈ 16`, `massConsumedFinalG > initialMassG`, `massConsumedG` monotonically non-decreasing.
- `computeMassBalance` fallbacks
  - Missing `batch_volume_ml` → `'concentration-only'`, `missing.batchVolume === true`.
  - Missing batch carbon concentration → `'concentration-only'`.
  - Missing feed rate but batch_volume + batchC present → `mode === 'mass'`, `missing.feedRateSeries === true`, `fedCarbonFinalG === 0`.
  - Missing feed carbon concentration only → `mode === 'mass'`, `missing.feedCarbonConcentration === true`.
  - Substrate < 2 timepoints → `'concentration-only'`.
- `computeMassBalance` numerical safety
  - Substrate noise causing `m_remaining > m_added` → clamped to 0, no NaN.
  - Negative feed-rate spike → ignored in cumulative.

### `carbonConsumptionLogic.test.ts` (extend)

- "Mass-balance happy path" fixture → `massBalanceMode === 'mass'`, `substrateConsumedG > 0`, `uptakeRateGPerH > 0`.
- "Concentration-only fallback" fixture (same minus `batch_volume_ml`) → `massBalanceMode === 'concentration-only'`, warnings populated, `substrateConsumed` (g/L) still set.
- Existing tests stay green (the upgrade is additive).

### `carbonFluxLogic.test.ts` (extend)

- Cohort with one mass-mode and one concentration-only experiment. Both appear in `points` (concentration-only is not excluded; only the existing exclusion reasons still apply).
- Drilldown for a mass-mode experiment: last value of `substrateConsumed.cumulative` matches `balance.scalars.massConsumedFinalG` within float tolerance.

### Carbon Balance

Manual smoke check (typecheck + visual verification on a real cohort). If implementation extracts the inline math into a `carbonBalanceLogic.ts` file, add a "fed-batch experiment closes within 5%" unit test there.

### Component-level

- `CarbonConsumption.tsx`, `CarbonFlux.tsx`, `CarbonBalance.tsx`: typecheck + build pass.
- Manual verification of the chip rendering and tooltips on a real cohort.

### End-to-end smoke against BioTest

The 305 BioTest experiments now have `batch_volume_ml = 800` and `feed_pump_series = 'dm_spump2'`, so the natural smoke test:
- Pick a 5-experiment BioTest cohort with a `dm_spump2` `process_data` series and batch media glucose concentration set.
- Confirm Carbon Consumption rows show g (not g/L) and no `concentration-only` chip.
- Confirm Carbon Flux dots aren't hatched.
- Confirm Carbon Balance unaccounted % drops compared to today's value.

BioTest experiments lacking `dm_spump2` data or batch media glucose concentration fall back gracefully — the warning chip exposes which inputs are missing.

## Open questions

None at design freeze. The following are explicitly out of scope:
- Sampling/evaporation corrections.
- Multi-substrate carbon balance.
- Per-phase qS breakdown.
- Backend pre-computation.
- New visualizations of `V(t)`, `m_added(t)`, `m_consumed(t)`.
