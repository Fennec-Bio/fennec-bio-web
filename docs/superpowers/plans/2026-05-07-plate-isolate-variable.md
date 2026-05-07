# Plate Isolate Variable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-well `Isolate` support to plate creation so wells with the same strain and variables but different isolates are not treated as technical replicates, and grouped chart labels display `strain-isolate`.

**Architecture:** Store isolate as a normal well variable named `Isolate`, added from a `No isolates` button beside the `Strain` header in `WellTableEditor`. Move replicate grouping keys and grouped labels into a pure helper so both chart paths use the same behavior and the isolate grouping contract can be tested without rendering React or D3.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, existing plate wizard and plate result components.

---

## File Structure

- Create: `src/components/Plate/plateReplicateGrouping.ts`
  - Owns pure functions for plate well condition keys and grouped labels.
  - Used by `PlateBarChart.tsx` and `dashboard/Results.tsx`.
- Create: `src/components/Plate/plateVariableColumns.ts`
  - Owns pure functions for case-insensitive variable-column lookup and idempotent column appending.
  - Used by `WellTableEditor.tsx` to add `Isolate` once.
- Modify: `src/components/Plate/WellTableEditor.tsx`
  - Adds the `No isolates` / `Isolate` button beside the `Strain` column header.
  - Appends `Isolate` to the current plate's `variableNames` when clicked.
- Modify: `src/components/Plate/PlateBarChart.tsx`
  - Uses the shared grouping helper for grouped chart labels and keys.
- Modify: `src/components/dashboard/Results.tsx`
  - Uses the shared grouping helper for grouped chart labels and keys.

Commit policy: do not make implementation commits automatically in this workspace. Several touched files already contain uncommitted feature work from the media typeahead and analysis-tab fixes, so staging commits safely needs an explicit user request.

## Task 1: Replicate Grouping Helper

**Files:**
- Create: `src/components/Plate/plateReplicateGrouping.ts`
- Temporary test: `.codex_tmp/plateReplicateGrouping.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `.codex_tmp/plateReplicateGrouping.test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  conditionKey,
  groupedWellLabel,
  strainIsolateLabel,
  type ReplicateWell,
} from '../src/components/Plate/plateReplicateGrouping'

const sameConditionA1: ReplicateWell = {
  row: 'A',
  column: 1,
  variables: [
    { name: 'Strain', value: 'S1' },
    { name: 'Media', value: 'M1' },
    { name: 'Isolate', value: '1' },
  ],
}

const sameConditionA2: ReplicateWell = {
  row: 'A',
  column: 2,
  variables: [
    { name: 'Media', value: 'M1' },
    { name: 'Isolate', value: '1' },
    { name: 'Strain', value: 'S1' },
  ],
}

const differentIsolate: ReplicateWell = {
  row: 'A',
  column: 3,
  variables: [
    { name: 'Strain', value: 'S1' },
    { name: 'Media', value: 'M1' },
    { name: 'Isolate', value: '2' },
  ],
}

const noIsolate: ReplicateWell = {
  row: 'A',
  column: 4,
  variables: [
    { name: 'Strain', value: 'S1' },
    { name: 'Media', value: 'M1' },
  ],
}

const noStrain: ReplicateWell = {
  row: 'B',
  column: 1,
  variables: [
    { name: 'Media', value: 'M1' },
    { name: 'Isolate', value: '1' },
  ],
}

assert.equal(conditionKey(sameConditionA1), conditionKey(sameConditionA2))
assert.notEqual(conditionKey(sameConditionA1), conditionKey(differentIsolate))
assert.equal(strainIsolateLabel(sameConditionA1), 'S1-1')
assert.equal(strainIsolateLabel(noIsolate), 'S1')
assert.equal(strainIsolateLabel(noStrain), undefined)
assert.equal(groupedWellLabel(sameConditionA1), 'S1-1')
assert.equal(groupedWellLabel(noIsolate), 'S1')
assert.equal(groupedWellLabel(noStrain), 'B1')
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/plateReplicateGrouping.test.ts
```

Expected: FAIL with `Cannot find module '../src/components/Plate/plateReplicateGrouping'`.

- [ ] **Step 3: Implement the helper**

Create `src/components/Plate/plateReplicateGrouping.ts`:

```ts
export type ReplicateVariable = {
  name: string
  value: string
}

export type ReplicateWell = {
  row: string
  column: number
  variables: ReplicateVariable[]
}

export function conditionKey(well: Pick<ReplicateWell, 'variables'>): string {
  return well.variables
    .map(v => `${v.name}=${v.value}`)
    .sort()
    .join('|')
}

export function variableValue(
  well: Pick<ReplicateWell, 'variables'>,
  variableName: string,
): string | undefined {
  const target = variableName.trim().toLowerCase()
  const match = well.variables.find(v => v.name.trim().toLowerCase() === target)
  return match?.value
}

export function strainIsolateLabel(
  well: Pick<ReplicateWell, 'variables'>,
): string | undefined {
  const strain = variableValue(well, 'strain')?.trim()
  if (!strain) return undefined
  const isolate = variableValue(well, 'isolate')?.trim()
  return isolate ? `${strain}-${isolate}` : strain
}

export function wellCoordinate(well: Pick<ReplicateWell, 'row' | 'column'>): string {
  return `${well.row}${well.column}`
}

export function groupedWellLabel(well: ReplicateWell): string {
  return strainIsolateLabel(well) ?? wellCoordinate(well)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/plateReplicateGrouping.test.ts
if ($LASTEXITCODE -eq 0) { node .codex_tmp/out/.codex_tmp/plateReplicateGrouping.test.js }
```

Expected: exit code 0 with no assertion output.

## Task 2: Variable Column Helper

**Files:**
- Create: `src/components/Plate/plateVariableColumns.ts`
- Temporary test: `.codex_tmp/plateVariableColumns.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `.codex_tmp/plateVariableColumns.test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  appendVariableColumnIfMissing,
  hasVariableColumn,
  normalizeVariableColumnName,
} from '../src/components/Plate/plateVariableColumns'

assert.equal(normalizeVariableColumnName(' Isolate '), 'isolate')
assert.equal(hasVariableColumn(['Strain', 'Media'], 'Isolate'), false)
assert.equal(hasVariableColumn(['Strain', 'isolate'], 'Isolate'), true)
assert.deepEqual(
  appendVariableColumnIfMissing(['Strain', 'Media'], 'Isolate'),
  ['Strain', 'Media', 'Isolate'],
)
assert.deepEqual(
  appendVariableColumnIfMissing(['Strain', 'isolate'], 'Isolate'),
  ['Strain', 'isolate'],
)
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/plateVariableColumns.test.ts
```

Expected: FAIL with `Cannot find module '../src/components/Plate/plateVariableColumns'`.

- [ ] **Step 3: Implement the helper**

Create `src/components/Plate/plateVariableColumns.ts`:

```ts
export function normalizeVariableColumnName(name: string): string {
  return name.trim().toLowerCase()
}

export function hasVariableColumn(variableNames: string[], columnName: string): boolean {
  const target = normalizeVariableColumnName(columnName)
  return variableNames.some(name => normalizeVariableColumnName(name) === target)
}

export function appendVariableColumnIfMissing(
  variableNames: string[],
  columnName: string,
): string[] {
  if (hasVariableColumn(variableNames, columnName)) return variableNames
  return [...variableNames, columnName]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp/out .codex_tmp/plateVariableColumns.test.ts
if ($LASTEXITCODE -eq 0) { node .codex_tmp/out/.codex_tmp/plateVariableColumns.test.js }
```

Expected: exit code 0 with no assertion output.

## Task 3: Add the Isolate Button to the Plate Create Table

**Files:**
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Import the variable column helper**

In `src/components/Plate/WellTableEditor.tsx`, add this import near the existing plate helper imports:

```ts
import {
  appendVariableColumnIfMissing,
  hasVariableColumn,
  normalizeVariableColumnName,
} from '@/components/Plate/plateVariableColumns'
```

- [ ] **Step 2: Add isolate-column state helpers**

Inside `WellTableEditor`, near the existing `availableMeasurements`, `hasNoColumns`, and `suggestionsByVariable` constants, add:

```ts
  const hasIsolateColumn = hasVariableColumn(variableNames, 'Isolate')

  function addIsolateColumn() {
    onVariableNamesChange(prev => appendVariableColumnIfMissing(prev, 'Isolate'))
  }
```

Keep `suggestionsByVariable` unchanged.

- [ ] **Step 3: Render the button beside the Strain header**

In the `variableNames.map(name => (` table header block, replace the current header inner `<div>`:

```tsx
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-900">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeVariable(name)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`Remove variable ${name}`}
                    >×</button>
                  </div>
```

with:

```tsx
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-900">{name}</span>
                    {normalizeVariableColumnName(name) === 'strain' && (
                      <button
                        type="button"
                        onClick={addIsolateColumn}
                        className={`ml-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                          hasIsolateColumn
                            ? 'border-[#eb5234]/30 bg-[#eb5234]/10 text-[#c24127]'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        aria-label={
                          hasIsolateColumn
                            ? 'Isolate variable column enabled'
                            : 'Add isolate variable column'
                        }
                      >
                        {hasIsolateColumn ? 'Isolate' : 'No isolates'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeVariable(name)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`Remove variable ${name}`}
                    >×</button>
                  </div>
```

The button remains clickable after the column exists, but `appendVariableColumnIfMissing` keeps it idempotent and prevents duplicate `Isolate` columns.

- [ ] **Step 4: Run targeted lint and typecheck**

Run from `frontend/`:

```powershell
npx eslint src/components/Plate/WellTableEditor.tsx src/components/Plate/plateVariableColumns.ts
npx tsc --noEmit
```

Expected: both commands exit 0.

## Task 4: Use Shared Grouping Labels in Both Chart Paths

**Files:**
- Modify: `src/components/Plate/PlateBarChart.tsx`
- Modify: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Update `PlateBarChart.tsx` imports**

Add:

```ts
import {
  conditionKey,
  groupedWellLabel,
} from '@/components/Plate/plateReplicateGrouping'
```

Delete the local `conditionKey(well: Well): string` function from `PlateBarChart.tsx`.

- [ ] **Step 2: Update `PlateBarChart.tsx` grouped labels**

Replace:

```ts
        const strain = well.variables.find(v => v.name.toLowerCase() === 'strain')?.value
        labels.set(key, strain ?? `${well.row}${well.column}`)
```

with:

```ts
        labels.set(key, groupedWellLabel(well))
```

- [ ] **Step 3: Update `Results.tsx` imports**

Add:

```ts
import {
  conditionKey,
  groupedWellLabel,
} from '@/components/Plate/plateReplicateGrouping'
```

Delete the local `conditionKey(well: Well): string` and `strainLabel(well: Well): string | undefined` functions from `Results.tsx`.

- [ ] **Step 4: Update `Results.tsx` grouped labels**

Replace:

```ts
    const label = strainLabel(wells[0]) ?? `${wells[0].row}${wells[0].column}`
    baseLabels.set(k, label)
```

with:

```ts
    baseLabels.set(k, groupedWellLabel(wells[0]))
```

- [ ] **Step 5: Run targeted lint and typecheck**

Run from `frontend/`:

```powershell
npx eslint src/components/Plate/PlateBarChart.tsx src/components/dashboard/Results.tsx src/components/Plate/plateReplicateGrouping.ts
npx tsc --noEmit
```

Expected: both commands exit 0.

## Task 5: Final Verification and Cleanup

**Files:**
- Remove temporary `.codex_tmp/plateReplicateGrouping.test.ts`
- Remove temporary `.codex_tmp/plateVariableColumns.test.ts`
- Remove temporary `.codex_tmp/out`

- [ ] **Step 1: Remove temporary test artifacts**

Run from `frontend/`:

```powershell
Remove-Item -LiteralPath .codex_tmp\plateReplicateGrouping.test.ts -Force
Remove-Item -LiteralPath .codex_tmp\plateVariableColumns.test.ts -Force
if (Test-Path .codex_tmp\out) { Remove-Item -LiteralPath .codex_tmp\out -Recurse -Force }
```

- [ ] **Step 2: Run final targeted verification**

Run from `frontend/`:

```powershell
npx eslint src/components/Plate/WellTableEditor.tsx src/components/Plate/PlateBarChart.tsx src/components/dashboard/Results.tsx src/components/Plate/plateReplicateGrouping.ts src/components/Plate/plateVariableColumns.ts
npx tsc --noEmit
npm run build
```

Expected: targeted ESLint exits 0, TypeScript exits 0, and the production build exits 0.

- [ ] **Step 3: Check full lint status**

Run from `frontend/`:

```powershell
npm run lint
```

Expected: may fail on unrelated pre-existing analysis/kinetics hook-rule issues. If it fails only on those files, record the failures in the final response and do not change unrelated files.

- [ ] **Step 4: Review the relevant diff**

Run from `frontend/`:

```powershell
git diff -- src/components/Plate/WellTableEditor.tsx src/components/Plate/PlateBarChart.tsx src/components/dashboard/Results.tsx src/components/Plate/plateReplicateGrouping.ts src/components/Plate/plateVariableColumns.ts
git status --short --untracked-files=all
```

Expected: isolate-related changes appear in the listed files. Existing unrelated dirty files remain untouched.
