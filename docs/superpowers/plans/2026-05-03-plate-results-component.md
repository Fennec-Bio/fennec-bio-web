# Plate Results Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Results` component to `/dashboard` that shows a stacked bar chart of plate-experiment data with optional replicate grouping (mean + 95% CI). Hide `QuickGraph` and `Overlay` when the sidebar is in Plates mode.

**Architecture:** Lift the reactor/plates section toggle and the selected-plate-experiment state to the dashboard page. Make `ExperimentList` accept optional controlled-section + plate-selection props (backwards-compatible — `/experiments` page is unaffected). The new `Results` component owns its own plate picker, measurement multi-select, and group-replicates toggle. Reuses the existing `usePlateExperiment` and `useDataCategories` hooks; no backend changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, d3 v7, Tailwind CSS v4, Clerk auth.

**Spec:** `frontend/docs/superpowers/specs/2026-05-03-plate-results-component-design.md`

**Verification convention:** This codebase has no unit-test runner installed (per `CLAUDE.md`: "or at minimum typecheck + build pass"). After every code change, run `npx tsc --noEmit` and `npm run lint`. After Task 12 (final wiring), run `npm run build` and a manual smoke. The spec's unit-test items (for `tCritical95` and the bar-data builder) are converted to **manual console verification** steps in Task 1 and Task 8 respectively — do not skip them.

**Working directory:** All paths relative to `frontend/`. All `git` operations from inside `frontend/` (frontend is its own git repo; there is no parent repo at `Fennec Bio/`).

**Branch:** Continue on the existing `improved-variable-analysis` branch (where the spec was committed) unless instructed otherwise.

---

### Task 1: Add `tCritical95` helper

**Files:**
- Create: `src/lib/stats.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/lib/stats.ts

// Two-tailed t-distribution critical values at alpha = 0.05.
// Source: standard t-table, df = 1..30.
const T_TABLE_95: Record<number, number> = {
  1: 12.706,  2: 4.303,  3: 3.182,  4: 2.776,  5: 2.571,
  6: 2.447,   7: 2.365,  8: 2.306,  9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}

/**
 * Two-tailed t-critical value at alpha = 0.05 for the given degrees of freedom.
 * df < 1 returns 0 (caller should skip the whisker).
 * df >= 31 returns 1.96 (normal approximation).
 */
export function tCritical95(df: number): number {
  if (df < 1) return 0
  if (df >= 31) return 1.96
  return T_TABLE_95[df] ?? 1.96
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual console verification**

Open `node` REPL or paste into the browser dev console after the dev server is running:

```js
// expected: 12.706, 2.776, 2.042, 1.96, 1.96, 0
[1, 4, 30, 31, 100, 0].forEach(df =>
  console.log(`df=${df} -> ${require('./src/lib/stats').tCritical95(df)}`)
)
```

If running from the browser dev console isn't convenient yet, defer this verification and confirm the values inline by reading the table — `tCritical95(1) === 12.706`, `tCritical95(4) === 2.776`, `tCritical95(30) === 2.042`, `tCritical95(31) === 1.96`, `tCritical95(0) === 0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stats.ts
git commit -m "add tCritical95 helper for 95% confidence intervals"
```

---

### Task 2: Add controlled-section props to `ExperimentList`

**Files:**
- Modify: `src/components/Shared/ExperimentList.tsx`

- [ ] **Step 1: Extend the props interface**

Locate `interface ExperimentListProps` (around line 46) and add four optional props:

```ts
import { DashboardTabs, DashboardSection } from '@/components/Plate/DashboardTabs'
import type { PlateExperimentListItem } from '@/hooks/usePlateExperiment'

interface ExperimentListProps {
  onExperimentSelect?: (experiment: Experiment) => void
  onExperimentsChange?: (experiments: Experiment[]) => void
  onExperimentSetSelect?: (setId: string) => void
  isMobileDrawer?: boolean
  refreshKey?: number
  // New — controlled mode (all optional, all backwards-compatible)
  section?: DashboardSection
  onSectionChange?: (s: DashboardSection) => void
  onPlateExperimentSelect?: (id: string) => void
  selectedPlateExperimentId?: string | null
  onPlateExperimentsChange?: (items: PlateExperimentListItem[]) => void
}
```

- [ ] **Step 2: Wire `section` to be controlled when provided**

Find `const [section, setSection] = useState<DashboardSection>('reactor')` (around line 74) and replace with:

```ts
const [internalSection, setInternalSection] = useState<DashboardSection>('reactor')
const sectionControlled = props.section !== undefined && props.onSectionChange !== undefined
const section: DashboardSection = sectionControlled ? props.section! : internalSection
const setSection = (s: DashboardSection) => {
  if (sectionControlled) props.onSectionChange!(s)
  else setInternalSection(s)
}
```

(Update the destructure at the top of the component to include the new props, e.g.
`export const ExperimentList = ({ onExperimentSelect, onExperimentsChange, onExperimentSetSelect, isMobileDrawer = false, refreshKey, section: controlledSection, onSectionChange, onPlateExperimentSelect, selectedPlateExperimentId, onPlateExperimentsChange }: ExperimentListProps) => { ... }` — and rewire the controlled logic accordingly. Use whichever style matches the existing destructure.)

- [ ] **Step 3: Find the `DashboardTabs` usage and pass controlled props**

Locate the `<DashboardTabs ... />` usage inside the rendering. It already supports `value`/`onChange`. Pass:

```tsx
<DashboardTabs value={section} onChange={setSection} />
```

(If it's already passing `value`/`onChange`, leave it.)

- [ ] **Step 4: Notify parent when plate experiments load**

Find the `usePlateExperiments` hook call (around line 76). Just below it, add:

```ts
useEffect(() => {
  if (onPlateExperimentsChange && plateData) {
    onPlateExperimentsChange(plateData.results)
  }
}, [plateData, onPlateExperimentsChange])
```

Make sure `useEffect` is imported (it's already imported in this file).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors. (If `lint` flags any unused destructured prop from Step 2, ensure each is used.)

- [ ] **Step 6: Commit**

```bash
git add src/components/Shared/ExperimentList.tsx
git commit -m "ExperimentList: accept controlled section and plate-experiment selection props"
```

---

### Task 3: Render plate items as selection buttons when handler is provided

**Files:**
- Modify: `src/components/Shared/ExperimentList.tsx`

- [ ] **Step 1: Locate the plate item rendering**

The current rendering (around line 1113–1121) looks like:

```tsx
{plateData.results.map((pe) => (
  <Link
    key={pe.id}
    href={`/dashboard/plates/${pe.id}`}
    className="..."
  >
    {/* item content */}
    {pe.plate_count} plate{pe.plate_count === 1 ? '' : 's'} · {pe.date ?? '—'}
  </Link>
))}
```

Read the surrounding ~30 lines first so you preserve all the styling and content of the existing card.

- [ ] **Step 2: Switch to button when `onPlateExperimentSelect` is provided**

Replace the `Link` with a conditional render. The `<button>` branch reuses the same className except adds the selected-row highlight when `pe.id === selectedPlateExperimentId`.

```tsx
{plateData.results.map((pe) => {
  const isSelected = selectedPlateExperimentId === pe.id
  const itemClass = `... existing classes ...${
    onPlateExperimentSelect && isSelected ? ' bg-blue-100 border-blue-300' : ''
  }`
  if (onPlateExperimentSelect) {
    return (
      <button
        key={pe.id}
        type="button"
        onClick={() => onPlateExperimentSelect(pe.id)}
        className={`${itemClass} text-left w-full`}
      >
        {/* same item content */}
      </button>
    )
  }
  return (
    <Link key={pe.id} href={`/dashboard/plates/${pe.id}`} className={itemClass}>
      {/* same item content */}
    </Link>
  )
})}
```

Replace `... existing classes ...` with the actual className string currently on the `<Link>`. Preserve every child element — only the wrapping element changes.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Shared/ExperimentList.tsx
git commit -m "ExperimentList: render plate items as buttons when select handler provided"
```

---

### Task 4: Lift section + selection state to Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import the section type**

Add at the top with other imports:

```ts
import { DashboardSection } from '@/components/Plate/DashboardTabs'
import type { PlateExperimentListItem } from '@/hooks/usePlateExperiment'
```

- [ ] **Step 2: Add the new state hooks**

Just below the existing `useState` block in the `Dashboard` component (after `setIsAIRecommendationsOpen`):

```ts
const [section, setSection] = useState<DashboardSection>('reactor')
const [selectedPlateExperimentId, setSelectedPlateExperimentId] = useState<string | null>(null)
const [plateExperimentsList, setPlateExperimentsList] = useState<PlateExperimentListItem[]>([])
```

- [ ] **Step 3: Auto-select first plate experiment when entering plates mode**

Add a `useEffect` immediately after the section state:

```ts
useEffect(() => {
  if (section === 'plates' && selectedPlateExperimentId === null && plateExperimentsList.length > 0) {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPlateExperimentId(plateExperimentsList[0].id)
  }
}, [section, selectedPlateExperimentId, plateExperimentsList])
```

- [ ] **Step 4: Reset plate selection when project changes**

Find the existing `useEffect` that resets `expectingFreshDefaultRef` on `activeProject?.id` change (around line 90). Add a sibling effect:

```ts
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setSelectedPlateExperimentId(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setPlateExperimentsList([])
}, [activeProject?.id])
```

- [ ] **Step 5: Wire `ExperimentList` (both desktop sidebar and mobile drawer)**

Both `<ExperimentList ... />` usages need the new props. For each one, add:

```tsx
<ExperimentList
  onExperimentSelect={handleExperimentSelect}
  onExperimentsChange={handleExperimentsChange}
  onExperimentSetSelect={handleExperimentSetSelect}
  // existing: isMobileDrawer={true}/false
  section={section}
  onSectionChange={setSection}
  onPlateExperimentSelect={setSelectedPlateExperimentId}
  selectedPlateExperimentId={selectedPlateExperimentId}
  onPlateExperimentsChange={setPlateExperimentsList}
/>
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Dashboard: lift section + selected plate experiment state"
```

---

### Task 5: Create the `Results` component skeleton (states only, no chart yet)

**Files:**
- Create: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Write the skeleton**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePlateExperiment } from '@/hooks/usePlateExperiment'
import { useDataCategories } from '@/hooks/useDataCategories'

interface ResultsProps {
  plateExperimentId: string | null
}

export function Results({ plateExperimentId }: ResultsProps) {
  const { data, loading, error } = usePlateExperiment(plateExperimentId ?? '')
  const { categories } = useDataCategories(data?.project ?? null)

  const measurementCategories = useMemo(
    () => categories.filter(c => c.category !== 'process_data'),
    [categories],
  )

  const [plateIndex, setPlateIndex] = useState(0)
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<number[]>([])
  const [groupReplicates, setGroupReplicates] = useState(true)

  // Reset plate + measurements when the experiment changes
  useEffect(() => {
    setPlateIndex(0)
  }, [plateExperimentId])

  // Default measurement = first available, refreshed when categories load/change
  useEffect(() => {
    if (measurementCategories.length === 0) {
      setSelectedMeasurementIds([])
      return
    }
    setSelectedMeasurementIds(prev => {
      const stillValid = prev.filter(id => measurementCategories.some(c => c.id === id))
      if (stillValid.length > 0) return stillValid
      return [measurementCategories[0].id]
    })
  }, [measurementCategories])

  if (plateExperimentId === null) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        Select a plate experiment from the sidebar to see results.
      </div>
    )
  }
  if (loading) {
    return <div className="bg-white rounded-lg shadow p-6 text-gray-500">Loading plate data…</div>
  }
  if (error) {
    return <div className="bg-white rounded-lg shadow p-6 text-red-600">{error}</div>
  }
  if (!data) return null
  if (data.plates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        This experiment has no plates yet.
      </div>
    )
  }

  const plate = data.plates[Math.min(plateIndex, data.plates.length - 1)]

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="text-sm text-gray-500">
        {data.title} · {plate.label} ({plate.format}-well)
      </div>
      {/* Toolbar and chart added in later tasks */}
      <div className="text-xs text-gray-400">
        {selectedMeasurementIds.length} measurement(s) selected · groupReplicates={String(groupReplicates)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Results.tsx
git commit -m "Results: skeleton with loading/empty/error states"
```

---

### Task 6: Conditionally render `Results` in plates mode on Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import `Results`**

Add to imports:

```ts
import { Results } from '@/components/dashboard/Results'
```

- [ ] **Step 2: Add a `Results` collapsible section + conditionally hide QuickGraph & Overlay**

Wrap the `<CollapsibleSection title="Quick Graph">` and `<CollapsibleSection title="Overlay">` blocks in `{section === 'reactor' && (...)}` so they don't render in plates mode.

Add a new section just after the Overlay's location (i.e., it appears in the same vertical slot when in plates mode):

```tsx
{section === 'reactor' && (
  <>
    <CollapsibleSection
      title="Quick Graph"
      isOpen={isQuickGraphOpen}
      onToggle={() => setIsQuickGraphOpen(!isQuickGraphOpen)}
    >
      <QuickView
        selectedExperiment={selectedExperiment}
        onExperimentSelect={handleExperimentSelect}
        experiments={experiments}
        experimentSetData={selectedSetData}
        rightGraphDefault={rightGraphDefault}
        resetKey={activeProject?.id ?? null}
      />
    </CollapsibleSection>

    <CollapsibleSection
      title="Overlay"
      isOpen={isOverlayOpen}
      onToggle={() => setIsOverlayOpen(!isOverlayOpen)}
    >
      <Overlay experiments={experiments} preselectedExperiments={overlayPreselected} />
    </CollapsibleSection>
  </>
)}

{section === 'plates' && (
  <CollapsibleSection
    title="Results"
    isOpen={isResultsOpen}
    onToggle={() => setIsResultsOpen(!isResultsOpen)}
  >
    <Results plateExperimentId={selectedPlateExperimentId} />
  </CollapsibleSection>
)}
```

- [ ] **Step 3: Add the `isResultsOpen` state**

In the existing `useState` block alongside `isQuickGraphOpen` etc., add:

```ts
const [isResultsOpen, setIsResultsOpen] = useState(true)
```

- [ ] **Step 4: Verify in dev server**

Run: `npm run dev`
Open `http://localhost:3000/dashboard`. Confirm:
- Default load shows AI Recommendations, Quick Graph, Overlay, Analysis (reactor mode unchanged).
- Click the Reactor/Plates toggle in the sidebar header. Quick Graph and Overlay disappear; Results appears.
- Results shows the empty-state placeholder until a plate experiment is clicked, OR — if the project has plate experiments — auto-selects the first one and renders the skeleton with the experiment title.
- Toggle back to Reactor; Quick Graph and Overlay return.

Stop the dev server.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/app/dashboard/page.tsx
git commit -m "Dashboard: render Results in plates mode, hide QuickGraph/Overlay"
```

---

### Task 7: Add the toolbar — plate picker + group replicates toggle

**Files:**
- Modify: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Add the toolbar JSX**

Replace the placeholder `<div className="text-xs text-gray-400">…</div>` from Task 5 with:

```tsx
<div className="flex items-center gap-3 flex-wrap">
  {data.plates.length > 1 && (
    <select
      className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
      value={plateIndex}
      onChange={e => setPlateIndex(Number(e.target.value))}
      aria-label="Plate"
    >
      {data.plates.map((p, i) => (
        <option key={p.id} value={i}>{p.label}</option>
      ))}
    </select>
  )}
  {/* Measurements multi-select — added in Task 8 */}
  <button
    type="button"
    className={
      groupReplicates
        ? 'px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium'
        : 'px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'
    }
    onClick={() => setGroupReplicates(v => !v)}
  >
    {groupReplicates ? 'Grouping replicates' : 'Individual wells'}
  </button>
</div>
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/Results.tsx
git commit -m "Results: add plate picker and group-replicates toggle"
```

---

### Task 8: Add the measurement multi-select dropdown

**Files:**
- Modify: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Add a controlled-open state and click-outside handler**

Add to the imports:

```ts
import { useRef } from 'react'
import { ChevronDown } from 'lucide-react'
```

Add inside the component (alongside the other `useState` calls):

```ts
const [measurementsOpen, setMeasurementsOpen] = useState(false)
const measurementsRef = useRef<HTMLDivElement | null>(null)

useEffect(() => {
  if (!measurementsOpen) return
  const handler = (e: MouseEvent) => {
    if (measurementsRef.current && !measurementsRef.current.contains(e.target as Node)) {
      setMeasurementsOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [measurementsOpen])
```

- [ ] **Step 2: Insert the multi-select dropdown into the toolbar**

In the toolbar JSX from Task 7, between the plate picker and the group-replicates toggle, insert:

```tsx
<div className="relative" ref={measurementsRef}>
  <button
    type="button"
    onClick={() => setMeasurementsOpen(o => !o)}
    className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all flex items-center gap-1"
  >
    Measurements ({selectedMeasurementIds.length})
    <ChevronDown className="h-3 w-3 text-gray-500" />
  </button>
  {measurementsOpen && (
    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[220px] max-h-72 overflow-y-auto">
      {measurementCategories.length === 0 ? (
        <div className="px-4 py-2 text-sm text-gray-500">No measurements available</div>
      ) : (
        measurementCategories.map(c => {
          const checked = selectedMeasurementIds.includes(c.id)
          return (
            <label
              key={c.id}
              className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  setSelectedMeasurementIds(prev =>
                    checked ? prev.filter(id => id !== c.id) : [...prev, c.id],
                  )
                }}
              />
              <span>{c.name} ({c.unit || '—'})</span>
            </label>
          )
        })
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/Results.tsx
git commit -m "Results: add measurements multi-select dropdown"
```

---

### Task 9: Implement the bar-data builder

**Files:**
- Modify: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Define the data shape and pure builder**

Just below the `'use client'` line and imports — but above the component — add:

```ts
import * as d3 from 'd3'
import { Plate, Well } from '@/hooks/usePlateExperiment'
import { tCritical95 } from '@/lib/stats'

type BarSegment = { measurementId: number; mean: number; ci: number; n: number }
type Bar = { key: string; label: string; segments: BarSegment[] }

function conditionKey(well: Well): string {
  return well.variables
    .map(v => `${v.name}=${v.value}`)
    .sort()
    .join('|')
}

function strainLabel(well: Well): string | undefined {
  return well.variables.find(v => v.name.toLowerCase() === 'strain')?.value
}

export function buildBars(
  plate: Plate,
  measurementIds: number[],
  groupReplicates: boolean,
): Bar[] {
  if (measurementIds.length === 0) return []

  if (!groupReplicates) {
    return plate.wells.map(w => ({
      key: `${w.row}${w.column}`,
      label: `${w.row}${w.column}`,
      segments: measurementIds.map(mid => {
        const dp = w.data_points.find(d => d.data_category === mid)
        return { measurementId: mid, mean: dp?.value ?? 0, ci: 0, n: dp ? 1 : 0 }
      }),
    }))
  }

  // Group wells by full variable set
  const groups = new Map<string, Well[]>()
  plate.wells.forEach(w => {
    const k = conditionKey(w) || `${w.row}${w.column}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(w)
  })

  const baseLabels = new Map<string, string>()
  groups.forEach((wells, k) => {
    const label = strainLabel(wells[0]) ?? `${wells[0].row}${wells[0].column}`
    baseLabels.set(k, label)
  })

  // Disambiguate duplicate labels with (2), (3), ...
  const labelCounts = new Map<string, number>()
  const finalLabels = new Map<string, string>()
  baseLabels.forEach((label, k) => {
    const seen = labelCounts.get(label) ?? 0
    labelCounts.set(label, seen + 1)
    finalLabels.set(k, seen === 0 ? label : `${label} (${seen + 1})`)
  })

  return Array.from(groups.entries()).map(([k, wells]) => {
    const segments: BarSegment[] = measurementIds.map(mid => {
      const values = wells
        .map(w => w.data_points.find(d => d.data_category === mid)?.value)
        .filter((v): v is number => typeof v === 'number')
      const n = values.length
      if (n === 0) return { measurementId: mid, mean: 0, ci: 0, n: 0 }
      const mean = d3.mean(values) ?? 0
      if (n < 2) return { measurementId: mid, mean, ci: 0, n }
      const sd = d3.deviation(values) ?? 0
      const ci = tCritical95(n - 1) * sd / Math.sqrt(n)
      return { measurementId: mid, mean, ci, n }
    })
    return { key: k, label: finalLabels.get(k) ?? k, segments }
  })
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual verification**

This is the most math-heavy code in the feature, so run a sanity check before relying on it. Add this temporary console-log block at the bottom of the file (will be removed in Task 10):

```ts
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__verifyBuildBars = () => {
    const fakePlate = {
      id: 0, label: 't', format: '96' as const, position: 0,
      wells: [
        { id: 1, row: 'A', column: 1, variables: [{ id: 1, name: 'strain', value: 'X' }, { id: 2, name: 'media', value: 'M1' }],
          data_points: [{ id: 1, data_category: 7, data_category_name: '', data_category_category: '', unit: '', value: 10 }] },
        { id: 2, row: 'A', column: 2, variables: [{ id: 1, name: 'strain', value: 'X' }, { id: 2, name: 'media', value: 'M1' }],
          data_points: [{ id: 2, data_category: 7, data_category_name: '', data_category_category: '', unit: '', value: 12 }] },
        { id: 3, row: 'A', column: 3, variables: [{ id: 1, name: 'strain', value: 'X' }, { id: 2, name: 'media', value: 'M1' }],
          data_points: [{ id: 3, data_category: 7, data_category_name: '', data_category_category: '', unit: '', value: 14 }] },
        { id: 4, row: 'B', column: 1, variables: [{ id: 1, name: 'strain', value: 'X' }, { id: 2, name: 'media', value: 'M1' }, { id: 3, name: 'isolate', value: '2' }],
          data_points: [{ id: 4, data_category: 7, data_category_name: '', data_category_category: '', unit: '', value: 20 }] },
      ],
    }
    // eslint-disable-next-line no-console
    console.log('grouped:', buildBars(fakePlate, [7], true))
    // eslint-disable-next-line no-console
    console.log('ungrouped:', buildBars(fakePlate, [7], false))
  }
}
```

Run `npm run dev`, open the dashboard at `http://localhost:3000/dashboard`, open the dev console, and call `__verifyBuildBars()`. Expected:
- `grouped`: 2 bars. First: label `X`, mean 12, n 3, ci ≈ `2.776 * 2 / sqrt(3) ≈ 3.21`. Second: label `X (2)` (because isolate=2 makes it a different group but same strain), mean 20, n 1, ci 0.
- `ungrouped`: 4 bars (one per well), each with `n=1, ci=0` and means 10/12/14/20.

Stop the dev server. Remove the temporary block before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/Results.tsx
git commit -m "Results: implement bar-data builder with replicate grouping and 95% CI"
```

---

### Task 10: Render the stacked bar chart with d3

**Files:**
- Modify: `src/components/dashboard/Results.tsx`

- [ ] **Step 1: Add the chart-rendering hook and SVG ref**

Add to imports if not present: `useRef`. Add inside the component (after other state):

```ts
const svgRef = useRef<SVGSVGElement | null>(null)

const bars = useMemo(
  () => buildBars(plate, selectedMeasurementIds, groupReplicates),
  [plate, selectedMeasurementIds, groupReplicates],
)

const measurementColor = (mid: number, idx: number, total: number): string => {
  if (total === 1) return '#eb5234'
  const pos = selectedMeasurementIds.indexOf(mid)
  return `var(--chart-${(pos % 5) + 1})`
}
```

(Note: `plate` is the locally-derived `data.plates[Math.min(plateIndex, data.plates.length - 1)]` from Task 5.)

- [ ] **Step 2: Render the SVG**

In the returned JSX, after the toolbar, add:

```tsx
<svg ref={svgRef} className="w-full" />
{selectedMeasurementIds.length >= 2 && (
  <div className="flex flex-wrap gap-3 text-xs text-gray-700">
    {selectedMeasurementIds.map(mid => {
      const c = measurementCategories.find(c => c.id === mid)
      if (!c) return null
      return (
        <span key={mid} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: measurementColor(mid, 0, selectedMeasurementIds.length) }}
          />
          {c.name}
        </span>
      )
    })}
  </div>
)}
{(() => {
  const selected = measurementCategories.filter(c => selectedMeasurementIds.includes(c.id))
  const units = new Set(selected.map(c => c.unit || ''))
  if (selected.length === 0) return null
  return (
    <div className="text-xs text-gray-500">
      Y-axis: {units.size === 1 ? (selected[0].unit || '—') : 'Mixed units'}
    </div>
  )
})()}
```

- [ ] **Step 3: Add the d3 effect**

Add this `useEffect` to the component:

```ts
useEffect(() => {
  if (!svgRef.current) return
  const svg = d3.select(svgRef.current)
  svg.selectAll('*').remove()

  const margin = { top: 16, right: 16, bottom: 70, left: 48 }
  const width = 720 - margin.left - margin.right
  const height = 320 - margin.top - margin.bottom

  svg
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  if (selectedMeasurementIds.length === 0) {
    g.append('text').attr('x', width / 2).attr('y', height / 2)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280')
      .text('Select at least one measurement.')
    return
  }
  if (bars.length === 0) {
    g.append('text').attr('x', width / 2).attr('y', height / 2)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280')
      .text('No data for this measurement on this plate.')
    return
  }

  const x = d3.scaleBand<string>()
    .domain(bars.map(b => b.key))
    .range([0, width])
    .padding(0.2)

  const stackTotals = bars.map(b => b.segments.reduce((s, seg) => s + seg.mean, 0))
  const maxCi = d3.max(bars, b =>
    d3.max(b.segments.map((seg, i) =>
      b.segments.slice(0, i + 1).reduce((s, x) => s + x.mean, 0) + seg.ci,
    )) ?? 0,
  ) ?? 0
  const maxY = Math.max(d3.max(stackTotals) ?? 0, maxCi)
  const y = d3.scaleLinear().domain([0, (maxY * 1.1) || 1]).range([height, 0])

  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-40)')
    .style('text-anchor', 'end')

  // Re-label x ticks with the human label (not the key)
  g.selectAll('.tick text').each(function (d) {
    const bar = bars.find(b => b.key === d)
    if (bar) d3.select(this).text(bar.label)
  })

  g.append('g').call(d3.axisLeft(y))

  const total = selectedMeasurementIds.length

  // Segments
  bars.forEach(bar => {
    let cum = 0
    bar.segments.forEach(seg => {
      const segTop = cum + seg.mean
      const xPos = x(bar.key) ?? 0
      const w = x.bandwidth()
      g.append('rect')
        .attr('x', xPos)
        .attr('y', y(segTop))
        .attr('width', w)
        .attr('height', y(cum) - y(segTop))
        .attr('fill', measurementColor(seg.measurementId, 0, total))
        .append('title')
        .text(() => {
          const cat = measurementCategories.find(c => c.id === seg.measurementId)
          const unit = cat?.unit ? ` ${cat.unit}` : ''
          const ciStr = seg.n >= 2 ? ` ± ${seg.ci.toFixed(2)}${unit} (n=${seg.n}, 95% CI)` : ` (n=${seg.n})`
          return `${bar.label} · ${cat?.name ?? ''}: ${seg.mean.toFixed(2)}${unit}${ciStr}`
        })

      // Whisker for this segment (only if n >= 2)
      if (seg.n >= 2 && seg.ci > 0) {
        const cx = xPos + w / 2
        g.append('line')
          .attr('x1', cx).attr('x2', cx)
          .attr('y1', y(segTop - seg.ci)).attr('y2', y(segTop + seg.ci))
          .attr('stroke', '#111827').attr('stroke-width', 1)
        // Caps
        g.append('line')
          .attr('x1', cx - 4).attr('x2', cx + 4)
          .attr('y1', y(segTop + seg.ci)).attr('y2', y(segTop + seg.ci))
          .attr('stroke', '#111827').attr('stroke-width', 1)
        g.append('line')
          .attr('x1', cx - 4).attr('x2', cx + 4)
          .attr('y1', y(segTop - seg.ci)).attr('y2', y(segTop - seg.ci))
          .attr('stroke', '#111827').attr('stroke-width', 1)
      }
      cum = segTop
    })
  })
}, [bars, selectedMeasurementIds, measurementCategories])
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (You may need to add eslint-disable for `react-hooks/exhaustive-deps` on the chart effect if lint complains; only suppress if the warning is genuinely about a value safe to omit.)

- [ ] **Step 5: Verify in dev server**

Run: `npm run dev`. On `/dashboard`, switch to plates mode, pick a plate experiment, and confirm:
- A bar chart renders.
- Switching plates updates the chart.
- Toggling Group replicates / Individual wells changes bar counts.
- Picking a different measurement (single) updates the bar values.
- Picking 2+ measurements stacks segments with distinct colors and shows the legend.
- Hovering a segment shows the native tooltip with strain · measurement: value ± CI.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Results.tsx
git commit -m "Results: render stacked bar chart with per-segment 95% CI whiskers"
```

---

### Task 11: Final verification — typecheck, lint, build, manual smoke

**Files:**
- None modified.

- [ ] **Step 1: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Manual smoke checklist**

```bash
npm run dev
```

On `/dashboard`:

- [ ] Default load → reactor mode, AI Recommendations + Quick Graph + Overlay + Analysis visible.
- [ ] Switch sidebar toggle to Plates → Quick Graph and Overlay disappear; Results appears.
- [ ] If project has plate experiments, the first one is auto-selected; otherwise placeholder shown.
- [ ] Click a different plate experiment in the sidebar → highlighted (`bg-blue-100 border-blue-300`); Results updates.
- [ ] Plate picker only shows when experiment has >1 plate; switching plate updates the chart.
- [ ] Measurements (N) dropdown opens; checking/unchecking updates the chart.
- [ ] Group-replicates toggle: ON shows fewer wider bars with whiskers; OFF shows one bar per well with no whiskers.
- [ ] An experiment with `isolate=1` and `isolate=2` wells, same strain/media, shows them as separate bars when grouped.
- [ ] With 2+ measurements selected, bars are stacked, each segment has its own whisker, legend appears below.
- [ ] Hover over any segment → tooltip with `Strain · Measurement: value ± CI (n=N, 95% CI)`.
- [ ] Switch back to Reactor → Quick Graph and Overlay reappear; Results disappears. Reactor experiment selection still works.
- [ ] Visit `/experiments` → confirm sidebar plate items still navigate to `/dashboard/plates/[id]` (uncontrolled mode unchanged).

Stop the dev server.

- [ ] **Step 5: Final commit if any cleanup was needed**

If no cleanup needed, skip. Otherwise:

```bash
git add -p   # selectively stage
git commit -m "polish: <what>"
```

---

## File Map

| File | New/Modified | Responsibility |
|------|--------------|----------------|
| `src/lib/stats.ts` | New | `tCritical95(df)` helper |
| `src/components/dashboard/Results.tsx` | New | Plate-data stacked bar chart with replicate grouping |
| `src/app/dashboard/page.tsx` | Modified | Lift section + selection state; conditional render |
| `src/components/Shared/ExperimentList.tsx` | Modified | Controlled section + plate-selection (opt-in props) |

## Out of Scope

- New backend endpoints (none needed).
- Link/button from Results to the full plate editor (deferred per spec Q7).
- Cross-plate or cross-experiment aggregation.
- Adding a unit-test runner (none exists in this codebase; spec's unit-test items converted to manual verification per `CLAUDE.md`).
