# Plate Table Drag Fill And Rectangular Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel-like column-only drag-fill and rectangular paste to the plate create wizard's well table.

**Architecture:** Keep the feature inside `WellTableEditor.tsx`, where the plate wizard already owns editable cell rendering and controlled draft state updates. Build a local editable-column model from `variableNames` and `measurementIds`, then route paste and drag-fill writes through shared cell/block helpers.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, existing frontend lint/build scripts.

---

## File Structure

- Create `src/components/Plate/wellTableEditing.ts`: pure helpers for clipboard parsing, rectangular cell writes, and drag-fill row generation.
- Create `src/components/Plate/wellTableEditing.test.ts`: lightweight Node assertion coverage for the pure editing helper.
- Modify `src/components/Plate/WellTableEditor.tsx`: consume the helper, add focused-cell and drag-fill state, shared cell wrapper UI, and updated paste handlers.
- No backend changes.

## Task 1: Add Cell Addressing And Rectangular Write Helpers

**Files:**
- Create: `src/components/Plate/wellTableEditing.ts`
- Create: `src/components/Plate/wellTableEditing.test.ts`
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Write the failing helper test**

Create `src/components/Plate/wellTableEditing.test.ts` with assertions for `parsePastedBlock`, `applyCellBlock`, and `buildFillRows`. Run:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp\well-table-test-out src\components\Plate\wellTableEditing.test.ts
```

Expected: FAIL with `Cannot find module './wellTableEditing'`.

- [ ] **Step 2: Implement the helper**

Create `src/components/Plate/wellTableEditing.ts` with exported `EditableColumn`, `CellAddress`, `FillDragState`, `parsePastedBlock`, `applyCellBlock`, and `buildFillRows`.

- [ ] **Step 3: Run the helper test to verify it passes**

Run:

```powershell
npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .codex_tmp\well-table-test-out src\components\Plate\wellTableEditing.test.ts
node .codex_tmp\well-table-test-out\wellTableEditing.test.js
```

Expected: exit code 0 with no assertion output.

- [ ] **Step 4: Wire the helper into `WellTableEditor`**

Import helper types/functions, memoize `wellKeys` and editable columns, and route multi-cell paste writes through `applyCellBlock`.

## Task 2: Replace Flattened Paste With Rectangular Paste

**Files:**
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Replace paste handlers with one shared handler**

Replace `handleVariablePaste` and `handleMeasurementPaste` with:

```ts
  function handleCellPaste(e: React.ClipboardEvent<HTMLInputElement>, address: CellAddress) {
    const text = e.clipboardData.getData('text')
    const rows = parsePastedBlock(text)
    if (rows.length === 0) return
    if (rows.length === 1 && rows[0].length === 1) return
    e.preventDefault()
    writeBlock(address, rows)
  }
```

- [ ] **Step 2: Update variable-cell paste calls**

Change the variable cell render from:

```tsx
onPaste={e => handleVariablePaste(e, name, wellIdx)}
```

to:

```tsx
onPaste={e => handleCellPaste(e, { columnIndex: editableColumns.findIndex(col => col.kind === 'variable' && col.key === name), wellIndex: wellIdx })}
```

- [ ] **Step 3: Update measurement-cell paste calls**

Change the measurement cell render from:

```tsx
onPaste={e => handleMeasurementPaste(e, id, wellIdx)}
```

to:

```tsx
onPaste={e => handleCellPaste(e, { columnIndex: editableColumns.findIndex(col => col.kind === 'measurement' && col.key === id), wellIndex: wellIdx })}
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: `WellTableEditor.tsx` has no unused `fillVariableColumn`, `fillMeasurementColumn`, `handleVariablePaste`, or `handleMeasurementPaste` references. Delete unused old helpers if lint reports them.

## Task 3: Add Focused Cell UI And Fill Handle

**Files:**
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Add focused and drag state**

Add near the existing `useState` calls in `WellTableEditor`:

```ts
  const [focusedCell, setFocusedCell] = useState<CellAddress | null>(null)
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null)
```

- [ ] **Step 2: Add fill range helpers**

Place before the `return`:

```ts
  function isSameAddress(a: CellAddress | null, b: CellAddress): boolean {
    return Boolean(a && a.columnIndex === b.columnIndex && a.wellIndex === b.wellIndex)
  }

  function isInFillPreview(address: CellAddress): boolean {
    if (!fillDrag || fillDrag.source.columnIndex !== address.columnIndex) return false
    const min = Math.min(fillDrag.source.wellIndex, fillDrag.targetWellIndex)
    const max = Math.max(fillDrag.source.wellIndex, fillDrag.targetWellIndex)
    return address.wellIndex >= min && address.wellIndex <= max
  }
```

- [ ] **Step 3: Add a reusable `EditableCellShell` component at the bottom of the file**

Add before `VariableCellInput`:

```tsx
function EditableCellShell({
  address,
  focused,
  preview,
  children,
  onFocusCell,
  onPointerEnterCell,
  onFillPointerDown,
}: {
  address: CellAddress
  focused: boolean
  preview: boolean
  children: React.ReactNode
  onFocusCell: (address: CellAddress) => void
  onPointerEnterCell: (address: CellAddress) => void
  onFillPointerDown: (e: React.PointerEvent<HTMLButtonElement>, address: CellAddress) => void
}) {
  return (
    <div
      className={`relative min-w-32 border border-transparent ${
        preview ? 'bg-[#eb5234]/10 border-[#eb5234]/40' : ''
      } ${focused ? 'ring-1 ring-[#eb5234] z-20' : ''}`}
      onFocusCapture={() => onFocusCell(address)}
      onPointerEnter={() => onPointerEnterCell(address)}
    >
      {children}
      {focused && (
        <button
          type="button"
          aria-label="Drag to fill this column"
          className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 cursor-ns-resize rounded-[2px] border border-white bg-[#eb5234] shadow"
          onPointerDown={e => onFillPointerDown(e, address)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wrap variable cells**

Inside the variable cell render, compute the address and wrap `VariableCellInput`:

```tsx
const columnIndex = editableColumns.findIndex(col => col.kind === 'variable' && col.key === name)
const address = { columnIndex, wellIndex: wellIdx }
```

Render:

```tsx
<EditableCellShell
  address={address}
  focused={isSameAddress(focusedCell, address)}
  preview={isInFillPreview(address)}
  onFocusCell={setFocusedCell}
  onPointerEnterCell={handleCellPointerEnter}
  onFillPointerDown={handleFillPointerDown}
>
  <VariableCellInput
    wellKey={wk}
    name={name}
    value={variableGrids[name]?.[wk] ?? ''}
    suggestions={strainSuggestions}
    onChange={next => setVariableCell(name, wk, next)}
    onPaste={e => handleCellPaste(e, address)}
  />
</EditableCellShell>
```

- [ ] **Step 5: Wrap measurement cells**

Inside the measurement cell render, compute the address and wrap the input:

```tsx
const columnIndex = editableColumns.findIndex(col => col.kind === 'measurement' && col.key === id)
const address = { columnIndex, wellIndex: wellIdx }
```

Render:

```tsx
<EditableCellShell
  address={address}
  focused={isSameAddress(focusedCell, address)}
  preview={isInFillPreview(address)}
  onFocusCell={setFocusedCell}
  onPointerEnterCell={handleCellPointerEnter}
  onFillPointerDown={handleFillPointerDown}
>
  <input
    className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
    value={measurementGrids[id]?.[wk] ?? ''}
    onChange={e => setMeasurementCell(id, wk, e.target.value)}
    onPaste={e => handleCellPaste(e, address)}
  />
</EditableCellShell>
```

- [ ] **Step 6: Add temporary no-op handlers so the wrapper compiles**

Add before `return`:

```ts
  function handleCellPointerEnter(address: CellAddress) {
    if (!fillDrag) return
    if (address.columnIndex !== fillDrag.source.columnIndex) return
    setFillDrag(prev => prev ? { ...prev, targetWellIndex: address.wellIndex } : prev)
  }

  function handleFillPointerDown(e: React.PointerEvent<HTMLButtonElement>, address: CellAddress) {
    e.preventDefault()
    e.stopPropagation()
    setFillDrag({ source: address, targetWellIndex: address.wellIndex })
  }
```

- [ ] **Step 7: Run lint**

Run: `npm run lint`

Expected: no new lint errors in `WellTableEditor.tsx`.

## Task 4: Commit Drag Fill On Pointer Release

**Files:**
- Modify: `src/components/Plate/WellTableEditor.tsx`

- [ ] **Step 1: Add a drag ref so document pointerup sees current state**

Update import:

```ts
import { useEffect, useRef, useState } from 'react'
```

Add after `fillDrag` state:

```ts
  const fillDragRef = useRef<FillDragState | null>(null)
```

Add an effect:

```ts
  useEffect(() => {
    fillDragRef.current = fillDrag
  }, [fillDrag])
```

- [ ] **Step 2: Add commit helper**

Place before `return`:

```ts
  function commitFillDrag(state: FillDragState) {
    const sourceColumn = editableColumns[state.source.columnIndex]
    const sourceWellKey = wellKeys[state.source.wellIndex]
    if (!sourceColumn || !sourceWellKey) return
    const value = getCellValue(state.source.columnIndex, sourceWellKey)
    const min = Math.min(state.source.wellIndex, state.targetWellIndex)
    const max = Math.max(state.source.wellIndex, state.targetWellIndex)
    const rows = Array.from({ length: max - min + 1 }, () => [value])
    writeBlock({ columnIndex: state.source.columnIndex, wellIndex: min }, rows)
  }
```

- [ ] **Step 3: Register document-level pointerup and pointercancel while dragging**

Add an effect:

```ts
  useEffect(() => {
    if (!fillDrag) return

    function finishFillDrag() {
      const current = fillDragRef.current
      if (current) commitFillDrag(current)
      setFillDrag(null)
    }

    function cancelFillDrag() {
      setFillDrag(null)
    }

    document.addEventListener('pointerup', finishFillDrag)
    document.addEventListener('pointercancel', cancelFillDrag)
    return () => {
      document.removeEventListener('pointerup', finishFillDrag)
      document.removeEventListener('pointercancel', cancelFillDrag)
    }
  }, [fillDrag])
```

- [ ] **Step 4: Capture pointer on fill handle when possible**

Extend `handleFillPointerDown`:

```ts
    e.currentTarget.setPointerCapture?.(e.pointerId)
```

Place it before `setFillDrag`.

- [ ] **Step 5: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands complete successfully. If unrelated dirty files fail lint/build, record the file and error without changing unrelated code.

## Task 5: Manual Verification

**Files:**
- No code changes unless verification finds a bug in `src/components/Plate/WellTableEditor.tsx`.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 2: Smoke test the wizard**

Open `/experiments`, choose `Create Experiment`, select `Plate Experiment`, continue to Step 2, and verify:

- `Strain` and `Media` columns render.
- Typing in A1 then dragging the fill handle to A12 fills only the `Strain` column.
- Typing in H12 then dragging upward to H1 fills upward.
- Dragging sideways over `Media` does not modify `Media`.
- Pasting a 2x2 spreadsheet block into A1 `Strain` fills A1/A2 across `Strain` and `Media`.
- Pasting a single-column 8-row block fills down one column.
- Pasting a block larger than the remaining rows or columns truncates without errors.

- [ ] **Step 3: Stop dev server**

Stop the dev server with `Ctrl+C` after manual verification.
