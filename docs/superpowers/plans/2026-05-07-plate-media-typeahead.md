# Plate Media Typeahead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add media-name typeahead suggestions to `Media` cells in the plate create wizard, matching the existing `Strain` cell behavior.

**Architecture:** Reuse existing project-scoped media fetching via `useProjectMedia`. Pass media names down to `WellTableEditor` beside strain names, and use a small pure helper to select/filter suggestions by normalized variable column name.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, existing plate wizard components.

---

## File Structure

- Create: `src/components/Plate/variableCellSuggestions.ts` - pure helper for looking up and filtering suggestions for a variable cell.
- Modify: `src/components/Plate/CreatePlateWizard.tsx` - fetch project media names via `useProjectMedia` and pass them to step 2.
- Modify: `src/components/Plate/PlateStep2PlatesAndWells.tsx` - accept and forward `mediaSuggestions`.
- Modify: `src/components/Plate/WellTableEditor.tsx` - accept media suggestions and enable typeahead for the `Media` column through the shared helper.

## Task 1: Suggestion Helper

**Files:**
- Create: `src/components/Plate/variableCellSuggestions.ts`
- Temporary test: `.codex_tmp/variableCellSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `.codex_tmp/variableCellSuggestions.test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  filterSuggestions,
  getSuggestionsForVariable,
  type VariableSuggestionMap,
} from '../src/components/Plate/variableCellSuggestions'

const suggestions: VariableSuggestionMap = {
  strain: ['PFB-001', 'PFB-002'],
  media: ['YPD', 'YNB + 2% Glucose', '3x MN'],
}

assert.deepEqual(getSuggestionsForVariable('Media', suggestions), suggestions.media)
assert.deepEqual(getSuggestionsForVariable(' media ', suggestions), suggestions.media)
assert.deepEqual(getSuggestionsForVariable('Strain', suggestions), suggestions.strain)
assert.deepEqual(getSuggestionsForVariable('Carbon source', suggestions), [])
assert.deepEqual(filterSuggestions('ynb', suggestions.media), ['YNB + 2% Glucose'])
assert.deepEqual(filterSuggestions('', suggestions.media), suggestions.media)
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/variableCellSuggestions.test.ts
```

Expected: FAIL with `Cannot find module '../src/components/Plate/variableCellSuggestions'`.

- [ ] **Step 3: Implement the helper**

Create `src/components/Plate/variableCellSuggestions.ts`:

```ts
export type VariableSuggestionMap = Record<string, string[] | undefined>

export function normalizeVariableName(name: string): string {
  return name.trim().toLowerCase()
}

export function getSuggestionsForVariable(
  variableName: string,
  suggestionsByVariable: VariableSuggestionMap,
): string[] {
  return suggestionsByVariable[normalizeVariableName(variableName)] ?? []
}

export function filterSuggestions(query: string, suggestions: string[]): string[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return suggestions
  return suggestions.filter(s => s.toLowerCase().includes(normalizedQuery))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/variableCellSuggestions.test.ts
if ($LASTEXITCODE -eq 0) { node .codex_tmp/out/.codex_tmp/variableCellSuggestions.test.js }
```

Expected: exit code 0 with no assertion output.

## Task 2: Wire Media Suggestions Through the Wizard

**Files:**
- Modify: `src/components/Plate/CreatePlateWizard.tsx`
- Modify: `src/components/Plate/PlateStep2PlatesAndWells.tsx`

- [ ] **Step 1: Fetch media names in `CreatePlateWizard`**

Add:

```ts
import { useProjectMedia } from '@/hooks/useProjectMedia'
```

Near the existing strain hook, add:

```ts
const { names: mediaSuggestions } = useProjectMedia(projectId)
```

Pass `mediaSuggestions={mediaSuggestions}` to `<PlateStep2PlatesAndWells />`.

- [ ] **Step 2: Add the prop to `PlateStep2PlatesAndWells`**

Add `mediaSuggestions` to the destructured props and type:

```ts
mediaSuggestions,
```

```ts
mediaSuggestions: string[]
```

Pass `mediaSuggestions={mediaSuggestions}` to `<WellTableEditor />`.

- [ ] **Step 3: Typecheck**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: PASS.

## Task 3: Enable Media Typeahead in the Well Table

**Files:**
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Import the helper**

Add:

```ts
import {
  filterSuggestions,
  getSuggestionsForVariable,
  type VariableSuggestionMap,
} from '@/components/Plate/variableCellSuggestions'
```

- [ ] **Step 2: Add the media prop**

Extend `WellTableEditorProps`:

```ts
mediaSuggestions?: string[]
```

Destructure `mediaSuggestions` from props.

- [ ] **Step 3: Build the suggestion map**

Inside `WellTableEditor`, before rendering, add:

```ts
const suggestionsByVariable: VariableSuggestionMap = {
  strain: strainSuggestions,
  media: mediaSuggestions,
}
```

- [ ] **Step 4: Pass suggestions by variable to cells**

Replace the `VariableCellInput` prop:

```tsx
suggestions={strainSuggestions}
```

with:

```tsx
suggestionsByVariable={suggestionsByVariable}
```

- [ ] **Step 5: Update `VariableCellInput` props**

Change the props from:

```ts
suggestions?: string[]
```

to:

```ts
suggestionsByVariable: VariableSuggestionMap
```

Replace the typeahead gate and filtered list with:

```ts
const suggestions = getSuggestionsForVariable(name, suggestionsByVariable)
const typeaheadEnabled = suggestions.length > 0
const filtered = filterSuggestions(value, suggestions)
```

Keep the normal-input branch for `!typeaheadEnabled`.

- [ ] **Step 6: Verify focused behavior**

Run from `frontend/`:

```powershell
npx eslint src/components/Plate/CreatePlateWizard.tsx src/components/Plate/PlateStep2PlatesAndWells.tsx src/components/Plate/WellTableEditor.tsx src/components/Plate/variableCellSuggestions.ts
npx tsc --noEmit
```

Expected: both PASS.

## Task 4: Final Verification and Cleanup

**Files:**
- Remove temporary `.codex_tmp/variableCellSuggestions.test.ts`
- Remove temporary `.codex_tmp/out`

- [ ] **Step 1: Remove temporary test artifacts**

Run from `frontend/`:

```powershell
Remove-Item -LiteralPath .codex_tmp\variableCellSuggestions.test.ts -Force
if (Test-Path .codex_tmp\out) { Remove-Item -LiteralPath .codex_tmp\out -Recurse -Force }
```

- [ ] **Step 2: Run production build**

Run from `frontend/`:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 3: Review diff**

Run from `frontend/`:

```powershell
git diff -- src/components/Plate/CreatePlateWizard.tsx src/components/Plate/PlateStep2PlatesAndWells.tsx src/components/Plate/WellTableEditor.tsx src/components/Plate/variableCellSuggestions.ts
```

Expected: only the media typeahead wiring and helper changes appear in these files.
