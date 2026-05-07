# Plate Media Typeahead - Design

**Date:** 2026-05-07
**Scope:** Frontend only (plate experiment create wizard)

## Summary

Add a media-name typeahead dropdown to the 96/384-well plate create wizard. The behavior should match the existing strain cell dropdown: when the user types in a `Media` variable cell, a dropdown shows project-scoped media names that contain the typed text, and selecting a row writes the media **name** into that well variable cell.

No backend or data-model changes are needed. Plate wells already store variables as `{ name, value }`, and existing plate media filters resolve media by name.

## Behavior

The `Media` variable column in the plate well table should support the same typeahead interaction as the `Strain` column:

- Focus a `Media` cell: show matching media names.
- Type in the cell: filter matches case-insensitively by substring.
- Click a match: write that media name into the cell and close the dropdown.
- Press Escape: close the dropdown.
- Paste behavior remains unchanged; multi-cell paste still fills the column.
- If no media exists for the active project, the cell behaves like a normal text input.

The stored value remains plain text, not a media ID.

## Architecture

`CreatePlateWizard` already fetches strain names through `useProjectStrains(projectId)`. It will also call `useProjectMedia(projectId)` to retrieve project-scoped media names.

`PlateStep2PlatesAndWells` will accept a new `mediaSuggestions: string[]` prop and pass it through to `WellTableEditor`.

`WellTableEditor` will replace the current strain-only suggestion prop with a small suggestion map keyed by normalized variable name:

```ts
{
  strain: strainSuggestions,
  media: mediaSuggestions,
}
```

`VariableCellInput` will choose suggestions by `name.toLowerCase()`. This keeps the existing strain behavior and adds media behavior through the same path. Other variable columns continue to render as plain inputs.

## Files

Modified:

- `src/components/Plate/CreatePlateWizard.tsx`
- `src/components/Plate/PlateStep2PlatesAndWells.tsx`
- `src/components/Plate/WellTableEditor.tsx`

Unchanged:

- Backend APIs and models
- Plate well payload shape
- Plate filter behavior

## Testing

The frontend repo does not currently have a component test runner. Verification will be:

- TypeScript: `npx tsc --noEmit`
- Targeted ESLint on touched plate files
- Production build: `npm run build`
- Manual smoke check in the create plate experiment wizard:
  - `Strain` typeahead still works.
  - `Media` typeahead opens on focus and filters while typing.
  - Selecting a media writes the media name into the cell.
  - Multi-cell paste into `Media` still fills the column.

## Out of Scope

- Storing media IDs in well variables.
- Adding a new backend endpoint.
- Changing the plate filter bar.
- Adding typeahead for arbitrary custom variable columns.
