# Plate Table Drag Fill And Rectangular Paste Design

**Date:** 2026-05-07
**Status:** Approved design, awaiting implementation plan
**Scope:** Frontend only. Create plate experiment wizard Step 2, specifically `src/components/Plate/WellTableEditor.tsx`.

## Summary

Add spreadsheet-style editing to the plate create wizard's well table. Users can drag a focused cell's fill handle to copy that cell's value up or down within the same column, and they can paste a rectangular block from Excel or another spreadsheet across multiple rows and adjacent editable columns.

The feature is limited to the create wizard table editor. It does not change the plate detail page, backend payloads, or the saved data model.

## Goals

- Copy a cell value by dragging within the same column only.
- Paste multi-row and multi-column clipboard data with Excel-like row and column mapping.
- Preserve the existing single-cell paste behavior.
- Keep all updates in the existing controlled draft state.
- Avoid backend or API changes.

## Non-Goals

- No drag-fill across multiple columns.
- No formulas, series generation, or auto-increment behavior.
- No fill operations between different plates.
- No changes to `WellGridEditor` or the plate detail page.
- No measurement validation changes. Measurement cells may hold draft text, and non-numeric measurement values continue to be ignored during submit.

## Behavior

### Cell Focus And Fill Handle

Each editable cell renders with a stable cell identity: column type, column key, and well row index. When a cell is focused, it gets a clear focused-cell style and shows a small fill handle at the right edge of the cell.

Dragging the fill handle starts a fill operation from the focused source cell. As the pointer moves over cells in the same column, the table previews the affected range from the source row to the hovered row. Releasing the pointer copies the source cell's current value into every well in that range. The source cell keeps its value.

If the pointer moves over a different column, the operation is clamped to the source column. If the pointer leaves the table and is released without a valid target row, no data changes.

### Column-Only Drag Fill

Drag-fill supports both directions:

- Dragging down from A1 to A12 fills A1 through A12 in the same data column.
- Dragging up from A12 to A1 fills A1 through A12 in the same data column.

This is value-copy behavior only. It does not generate numeric sequences.

### Rectangular Paste

Pasting from Excel, Google Sheets, or a tab/newline-delimited clipboard block fills a rectangle starting from the focused cell:

- Newline-separated clipboard rows map to increasing well rows.
- Tab-separated clipboard columns map to adjacent editable table columns.
- Data truncates at the bottom of the plate or the last editable column.
- Single-cell clipboard content falls through to the browser's normal text-input paste.

The existing old behavior flattened multi-cell pastes into one column. This changes multi-cell paste to preserve the pasted 2D shape while retaining single-column paste compatibility.

### Column Boundaries

Editable columns are ordered exactly as rendered:

1. Variable columns in `variableNames` order.
2. Measurement columns in `measurementIds` order.

Rectangular paste can cross from variable columns into measurement columns because both are draft text inputs. Submit-time behavior remains unchanged: numeric measurement payload values are parsed later, and invalid numeric values are silently omitted as they are today.

## Data Flow

`WellTableEditor` remains controlled by its parent. All drag-fill and rectangular-paste writes use the existing state shapes:

```ts
variableGrids: Record<string, Record<string, string>>
measurementGrids: Record<number, Record<string, string>>
```

The component builds a local editable-column model from `variableNames` and `measurementIds` so paste and drag-fill can address cells by row index and column index without changing parent state.

## Component Changes

### Modified: `src/components/Plate/WellTableEditor.tsx`

Add:

- A cell identity type for variable and measurement cells.
- Helpers to read and write one cell by identity.
- A helper to write a rectangular block across editable columns and well rows.
- Drag state for fill-handle source and current target row.
- Pointer handlers for starting, previewing, committing, and cancelling drag-fill.
- Focused-cell state so the fill handle appears only on the active cell.
- Shared cell wrapper styling for variable and measurement inputs.

Keep:

- Existing add/remove column behavior.
- Existing typeahead behavior for the `Strain` variable column.
- Existing controlled state API.
- Existing wizard and backend payload shape.

## Testing And Verification

Run frontend checks:

```bash
npm run lint
npm run build
```

Manual smoke test in the plate create wizard:

- Step 2 opens a 96-well plate table.
- Add variable columns `Strain` and `Media` if not already present.
- Type a value into A1 `Strain`, drag the fill handle to A12, and confirm A1-A12 all match.
- Type a value into H12, drag upward to H1, and confirm the range fills upward.
- Try dragging across another column and confirm only the source column changes.
- Copy a 2-row by 2-column block from a spreadsheet, paste into A1 `Strain`, and confirm it fills rows A1-A2 across adjacent editable columns.
- Copy a single-column 8-row block and paste into A1, confirming it fills down one column.
- Paste more rows or columns than fit and confirm extra values are ignored.
- Create the plate experiment and confirm existing submit behavior still works.
