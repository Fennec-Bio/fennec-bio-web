# Plate Isolate Variable - Design

**Date:** 2026-05-07
**Scope:** Frontend-first plate experiment create flow, with result label behavior

## Summary

Add per-well isolate support to the plate create table. The user can opt into isolates from the `Strain` column header by clicking a `No isolates` button. Once enabled, the current plate gains an `Isolate` variable column where each well can receive an isolate number or label.

Isolate values are stored as normal well variables named `Isolate`. No backend schema change is required.

## Behavior

In the 96/384-well plate create wizard:

- The `Strain` column header shows a compact `No isolates` button when the current plate does not have an isolate variable column.
- Clicking `No isolates` adds an `Isolate` variable column to the current plate, if it is not already present.
- Once the `Isolate` column exists, the button text changes to `Isolate`.
- The `Isolate` column is editable per well like other variable columns.
- The `Isolate` column is stored in the same payload shape as other well variables:

```json
{ "name": "Isolate", "value": "1" }
```

The isolate value is independent of the strain catalog's existing `isolate` field. This feature captures the isolate used for a specific well in a plate run.

## Technical Replicates

Plate result grouping already builds replicate groups from all well variables. Because `Isolate` is a normal variable, wells with the same strain and other variables but different isolate values will receive different grouping keys.

Example:

- Well A1: `Strain=S1`, `Media=M1`, `Isolate=1`
- Well A2: `Strain=S1`, `Media=M1`, `Isolate=2`

These are not technical replicates and will render as separate grouped bars.

## Labels

Grouped result labels will display the isolate when both strain and isolate are present:

- `S1-1`
- `S1-2`

If a well has strain but no isolate, the label remains the strain name. If a well has no strain, existing fallback behavior remains unchanged.

The same label behavior will apply to both plate chart paths that currently label grouped bars by strain:

- `src/components/Plate/PlateBarChart.tsx`
- `src/components/dashboard/Results.tsx`

## Architecture

`WellTableEditor` owns variable-column editing UI. It will add a small header action for the normalized `strain` variable:

- compute whether the current plate already has an isolate column by case-insensitive name comparison
- render the button beside the `Strain` header
- on click, append `Isolate` to `variableNames` if missing

The column will be added only to the currently selected plate because `PlateStep2PlatesAndWells` passes the selected plate's controlled state into `WellTableEditor`.

Create a small pure helper for plate grouping labels and grouping keys so replicate behavior can be tested without rendering React or D3.

## Files

Modified:

- `src/components/Plate/WellTableEditor.tsx`
- `src/components/Plate/PlateBarChart.tsx`
- `src/components/dashboard/Results.tsx`

Added:

- `src/components/Plate/plateReplicateGrouping.ts`

Unchanged:

- Backend models and serializers
- Plate well payload shape
- Strain catalog isolate field
- Media and strain typeahead behavior

## Testing

The implementation will include a helper-level test that proves:

- wells with identical variables group together
- wells with the same `Strain` and `Media` but different `Isolate` values do not group together
- labels render as `strain-isolate` when both are present
- labels fall back to the strain when isolate is absent

Verification commands:

- targeted helper test through `tsc` + `node`
- targeted ESLint on touched files
- `npx tsc --noEmit`
- `npm run build`

Full `npm run lint` currently has unrelated pre-existing hook-rule failures in analysis/kinetics files; this feature will keep touched files clean.

## Out of Scope

- Creating or editing strain-catalog isolate metadata
- Backend schema changes
- Isolate suggestions or dropdown values
- Automatically applying an isolate value across selected wells
- Changing plate filters to expose isolate as a first-class filter
