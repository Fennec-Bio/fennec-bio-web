# Carbon Consumption Analysis - Design

**Date:** 2026-05-07
**Status:** Approved for implementation planning

## Summary

Add a focused **Carbon consumption** component to the analysis page under the
Metabolic engineering theme. The component helps compare measured substrate
uptake rates against selected-product formation, other product formation,
byproducts, biomass, and unaccounted carbon. It supports both practical
mass-based conversion and carbon-normalized conversion using built-in metadata
for common fermentation compounds.

## Goals

- Show how fast each experiment consumes measured substrate.
- Relate substrate uptake to the selected target product's titer,
  productivity, apparent conversion, and carbon-normalized conversion.
- Show product diversion: target product vs other products vs byproducts vs
  biomass.
- Support both apparent mass-based conversion and true carbon-normalized
  conversion when metadata is available.
- Keep the existing Carbon balance component simple by adding a separate
  focused sub-tab.
- Avoid a new API in v1 by deriving the analysis from the existing cohort
  payload.

## Non-Goals

- No feed-rate estimation from media recipes or pump profiles in v1.
- No user-editable compound metadata UI in v1.
- No backend persistence of compound metadata in v1.
- No full stoichiometric model or redox/NADPH accounting.
- No attempt to infer CO2 directly; unaccounted carbon remains a residual.

## Placement

Add a new analysis slug and sub-tab:

- Theme: `metabolic`
- Label: `Carbon consumption`
- Slug: `carbon-consumption`

The sub-tab sits beside the existing `Carbon balance` view. Carbon balance
continues to show the existing final mass stack. Carbon consumption owns the
rate/conversion/product-diversion workflow.

## Component Structure

Create `src/components/dashboard/analysis/CarbonConsumption.tsx`.

The component contains:

- **Controls row**
  - Target product selector populated from `payload.products`.
  - Conversion mode toggle: `Apparent`, `Carbon-normalized`, `Both`.
  - Optional color/group selector, initially `experiment`, `strain`,
    `batch media`, or `feed media`.
- **Summary cards**
  - Median substrate uptake rate.
  - Median target apparent conversion.
  - Median target carbon-normalized conversion.
  - Median target carbon share.
  - Metadata coverage count.
- **Main scatter**
  - X axis: substrate uptake rate.
  - Y axis: selected-product productivity by default, with a control to use
    final titer.
  - One point per experiment.
  - Color by selected grouping.
- **Carbon allocation chart**
  - Stacked bars per experiment.
  - Segments: selected target product, other products, byproducts, biomass,
    unaccounted.
  - In apparent mode, values are mass-based.
  - In carbon-normalized mode, values are carbon-mass based.
- **Comparison table**
  - Sortable rows for uptake rate, final target titer, productivity,
    apparent conversion, carbon-normalized conversion, target share,
    other-product share, byproduct share, biomass share, and warnings.

## Data Flow

The component derives its metrics from the existing `CohortPayload`:

```text
payload.experiments
  -> time_series
  -> substrate/product/secondary-product/biomass series
  -> carbon consumption rows
  -> summary cards, scatter, allocation chart, table
```

No new backend endpoint is required for v1.

Add a pure frontend utility:

`src/components/dashboard/analysis/carbonConsumptionLogic.ts`

This utility should export the compound metadata and metric calculation
functions so the math can be tested without rendering React.

## Calculation Model

For each experiment:

1. Select the canonical substrate series.
   - Prefer `role === 'substrate'`.
   - If multiple substrate series exist, use the first for v1 and attach a
     warning.
2. Sort substrate points by `timepoints_h`.
3. Compute consumed substrate:

```text
substrate_consumed = initial_substrate - final_substrate
```

4. Compute elapsed time:

```text
elapsed_h = final_substrate_time - initial_substrate_time
```

5. Compute substrate uptake rate:

```text
uptake_rate = substrate_consumed / elapsed_h
```

6. Compute selected product delta:

```text
target_delta = final_target_product - initial_target_product
```

7. Compute apparent target conversion:

```text
apparent_conversion = target_delta / substrate_consumed
```

8. Compute apparent allocation for target product, other products, byproducts,
   and biomass using mass deltas or final values where deltas are unavailable.
9. Compute carbon-normalized values when metadata is available:

```text
carbon_mass = compound_mass * carbon_fraction
carbon_conversion = target_product_carbon / substrate_carbon_consumed
```

10. Compute unaccounted carbon as:

```text
unaccounted = max(0, substrate_carbon_consumed - accounted_carbon)
```

## Built-In Compound Metadata

Add built-in defaults for common compounds:

- Glucose
- Sucrose
- Ethanol
- Acetate
- Glycerol
- CBDa
- CBGa
- THCa
- Olivetol
- Olivetolic acid / OLA
- Biomass, defaulting to `0.48 g C / g DCW`

Metadata can be represented as normalized-name aliases to carbon fraction:

```ts
interface CompoundCarbonMetadata {
  aliases: string[]
  carbonFraction: number
  molecularWeight?: number
  carbonCount?: number
}
```

Where molecular weight and carbon count are available, carbon fraction can be
derived as:

```text
carbon_fraction = carbon_count * 12.011 / molecular_weight
```

Rows with missing metadata remain valid in apparent mode. Carbon-normalized
fields become unavailable and include a metadata warning.

## Error Handling

- **No selected product:** select the first product in the cohort when possible;
  otherwise show an empty state.
- **No substrate series:** show the experiment row with uptake/conversion
  unavailable and a `missing substrate` warning.
- **Substrate does not decline:** mark uptake/conversion unavailable and warn
  `substrate did not decline`.
- **Elapsed time is zero or invalid:** mark uptake/conversion unavailable.
- **Multiple substrate series:** use the first and warn `multiple substrates`.
- **Missing selected product series:** keep the row visible with target metrics
  unavailable.
- **Missing compound metadata:** apparent metrics still render; carbon metrics
  are unavailable for the affected row/segment.
- **Unit mismatch:** assume current analysis convention of compatible mass
  concentration units and hours. If a unit is not recognizable as mass-per-L,
  warn rather than silently calculating.

## Testing

Add focused tests for `carbonConsumptionLogic.ts`:

- Substrate uptake rate from a declining substrate series.
- Apparent conversion for selected product delta over substrate consumed.
- Carbon fraction conversion from compound metadata.
- Carbon-normalized target conversion.
- Allocation split between selected product, other products, byproducts,
  biomass, and unaccounted carbon.
- Missing metadata fallback: apparent values render, carbon-normalized values
  do not.
- Missing substrate case.
- Nondeclining substrate case.
- Multiple substrate warning.

Frontend verification should include:

- `npx tsc --noEmit`
- `npm run build`
- Manual smoke on `/dashboard/analysis` with a cohort containing substrate,
  products, secondary products, and biomass.

## Open Implementation Notes

- The v1 utility should keep the calculation rules explicit and conservative.
- If users later need custom compound metadata, add a backend model and settings
  UI in a separate design.
- If feed-rate estimation becomes important, add it as a separate mode that
  uses media concentration plus process feed data instead of measured substrate
  decline.
