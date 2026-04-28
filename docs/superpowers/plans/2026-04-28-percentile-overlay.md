# Percentile Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Percentile overlay" analysis to the Pattern Finding theme that plots one chosen time-series metric across selected runs and color-codes the lines by the percentile rank of an optional second metric.

**Architecture:** Single new client component (`PercentileOverlay.tsx`) renders a D3 line chart over the existing `CohortPayload`. Pure helpers for scalar reduction and percentile assignment are colocated at the top of the file. State is component-local; no backend changes. The new analysis slug is added to constants and types and wired into the analysis page router branch.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, React 19, D3 v7, Tailwind CSS v4. No test runner is configured in `frontend/`, so verification is `tsc --noEmit` + `next build` + manual browser QA per the design spec.

**Spec:** `frontend/docs/superpowers/specs/2026-04-28-percentile-overlay-design.md`

**Note on directory:** All paths in this plan are relative to `frontend/`. Run all commands from `frontend/` (the frontend git repo). Do not run `git` from the `Desktop/Fennec Bio/` parent — there is no parent repo.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/analysis/types.ts` | Modify | Add `'percentile-overlay'` to the `AnalysisSlug` union. |
| `src/lib/analysis/constants.ts` | Modify | Add a `percentile-overlay` entry under the `pattern` theme. |
| `src/components/dashboard/analysis/PercentileOverlay.tsx` | Create | New component: controls, scalar reduction helpers, percentile assignment, D3 chart, legend, edge states. |
| `src/app/dashboard/analysis/page.tsx` | Modify | Add a render branch for the new analysis slug. |

The existing `KineticOverlay.tsx` is **not** modified (Kinetics keeps its current Overlay).

---

## Task 1: Extend the AnalysisSlug type

**Files:**
- Modify: `src/lib/analysis/types.ts:5-10`

- [ ] **Step 1: Add the new slug to the union**

In `src/lib/analysis/types.ts`, replace the existing `AnalysisSlug` union:

```ts
export type AnalysisSlug =
  | 'kinetic-overlay' | 'derived-parameters'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'pareto' | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff'
```

with:

```ts
export type AnalysisSlug =
  | 'kinetic-overlay' | 'derived-parameters'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'pareto' | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff' | 'percentile-overlay'
```

- [ ] **Step 2: Verify type-check passes**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no errors. (The new slug isn't used yet, so adding it shouldn't break anything.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/analysis/types.ts
git commit -m "feat(analysis-types): add percentile-overlay analysis slug"
```

---

## Task 2: Register the analysis under the Pattern Finding theme

**Files:**
- Modify: `src/lib/analysis/constants.ts:40-43`

- [ ] **Step 1: Add the new entry to the pattern theme**

In `src/lib/analysis/constants.ts`, replace the `pattern` theme block:

```ts
  { id: 'pattern', label: 'Pattern finding', analyses: [
    { slug: 'pca',         label: 'PCA biplot',         availableInP1: true  },
    { slug: 'cohort-diff', label: 'Best-vs-worst diff', availableInP1: true  },
  ]},
```

with:

```ts
  { id: 'pattern', label: 'Pattern finding', analyses: [
    { slug: 'percentile-overlay', label: 'Percentile overlay',  availableInP1: true },
    { slug: 'pca',                label: 'PCA biplot',          availableInP1: true },
    { slug: 'cohort-diff',        label: 'Best-vs-worst diff',  availableInP1: true },
  ]},
```

The new entry is listed first so it becomes the default analysis when a user clicks the "Pattern finding" tab (`ThemeTabs.tsx:21` picks `analyses.find(a => a.availableInP1)`).

- [ ] **Step 2: Verify build still passes**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analysis/constants.ts
git commit -m "feat(analysis-themes): list percentile overlay first under pattern finding"
```

---

## Task 3: Scaffold the PercentileOverlay component

**Files:**
- Create: `src/components/dashboard/analysis/PercentileOverlay.tsx`

- [ ] **Step 1: Create the file with a minimal placeholder render**

Create `src/components/dashboard/analysis/PercentileOverlay.tsx` with:

```tsx
'use client'

import type { CohortPayload } from '@/lib/analysis/types'

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">Percentile overlay</h3>
      <div className="text-sm text-gray-500">
        {payload.experiments.length} experiment(s) in cohort. Controls coming next.
      </div>
    </div>
  )
}
```

This stub lets us wire the page-level branch in Task 4 without dragging the full chart implementation into one mega-task.

- [ ] **Step 2: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors. (The file is unused so nothing else depends on it yet.)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/PercentileOverlay.tsx
git commit -m "feat(percentile-overlay): scaffold component with placeholder render"
```

---

## Task 4: Wire the new component into the analysis page

**Files:**
- Modify: `src/app/dashboard/analysis/page.tsx:14-15` (imports), `:55-97` (render branches)

- [ ] **Step 1: Import the new component**

In `src/app/dashboard/analysis/page.tsx`, after the existing `import { PCABiplot } …` line (currently line 13), add:

```tsx
import { PercentileOverlay } from '@/components/dashboard/analysis/PercentileOverlay'
```

Place it alphabetically between `PCABiplot` and `Regression` (its imports are alphabetised).

- [ ] **Step 2: Add the render branch**

Inside the `{payload && (…)}` block in `AnalysisPageInner`, immediately after the existing PCA branch:

```tsx
{state.analysis === 'pca' && (
  <PCABiplot payload={payload} ids={state.ids}
             outcome={state.outcome} product={state.product} />
)}
```

add:

```tsx
{state.analysis === 'percentile-overlay' && (
  <PercentileOverlay payload={payload} />
)}
```

- [ ] **Step 3: Verify it renders end-to-end**

Run from `frontend/`:

```bash
npm run dev
```

In a browser, navigate to `/dashboard/analysis`, pick at least one experiment from the cohort rail, click the "Pattern finding" theme tab, then the "Percentile overlay" sub-tab.

Expected: the placeholder card renders with the experiment count.

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 4: Verify type-check + build pass**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/analysis/page.tsx
git commit -m "feat(analysis-page): wire PercentileOverlay render branch"
```

---

## Task 5: Implement scalar reduction and percentile helpers

**Files:**
- Modify: `src/components/dashboard/analysis/PercentileOverlay.tsx`

- [ ] **Step 1: Add reduction + percentile helpers and supporting types**

Replace the entire contents of `src/components/dashboard/analysis/PercentileOverlay.tsx` with:

```tsx
'use client'

import type { CohortPayload, TimeSeriesEntry } from '@/lib/analysis/types'

export type MetricCategory = 'product' | 'secondary_product' | 'process_data'
export type ReductionKind = 'final' | 'max' | 'mean' | 'auc'

export function reduceSeries(series: TimeSeriesEntry, kind: ReductionKind): number | null {
  const ts = series.timepoints_h
  const vs = series.values
  const n = Math.min(ts.length, vs.length)

  const finitePairs: Array<{ t: number; v: number }> = []
  for (let i = 0; i < n; i++) {
    const v = vs[i]
    const t = ts[i]
    if (typeof v === 'number' && Number.isFinite(v) && typeof t === 'number' && Number.isFinite(t)) {
      finitePairs.push({ t, v })
    }
  }
  if (finitePairs.length === 0) return null

  if (kind === 'final') {
    return finitePairs[finitePairs.length - 1].v
  }
  if (kind === 'max') {
    let m = -Infinity
    for (const p of finitePairs) if (p.v > m) m = p.v
    return m
  }
  if (kind === 'mean') {
    let s = 0
    for (const p of finitePairs) s += p.v
    return s / finitePairs.length
  }
  // AUC: re-walk the original arrays so a null at index i breaks the segment.
  // Using `finitePairs` here would silently bridge gaps, which the spec forbids.
  let area = 0
  for (let i = 1; i < n; i++) {
    const v0 = vs[i - 1], v1 = vs[i]
    const t0 = ts[i - 1], t1 = ts[i]
    const v0Ok = typeof v0 === 'number' && Number.isFinite(v0)
    const v1Ok = typeof v1 === 'number' && Number.isFinite(v1)
    const t0Ok = typeof t0 === 'number' && Number.isFinite(t0)
    const t1Ok = typeof t1 === 'number' && Number.isFinite(t1)
    if (v0Ok && v1Ok && t0Ok && t1Ok) {
      area += ((v0 as number) + (v1 as number)) * 0.5 * ((t1 as number) - (t0 as number))
    }
  }
  return area
}

export function findSeries(
  experiment: CohortPayload['experiments'][number],
  category: MetricCategory,
  name: string,
): TimeSeriesEntry | null {
  return experiment.time_series.find(s => s.category === category && s.name === name) ?? null
}

export function listMetricNames(payload: CohortPayload, category: MetricCategory): string[] {
  const set = new Set<string>()
  for (const e of payload.experiments) {
    for (const s of e.time_series) {
      if (s.category === category) set.add(s.name)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export function commonUnit(payload: CohortPayload, category: MetricCategory, name: string): string {
  const counts = new Map<string, number>()
  for (const e of payload.experiments) {
    const s = findSeries(e, category, name)
    if (s) counts.set(s.unit, (counts.get(s.unit) ?? 0) + 1)
  }
  let best = ''
  let bestN = -1
  for (const [u, n] of counts) {
    if (n > bestN) { best = u; bestN = n }
  }
  return best
}

// Average-rank percentiles in [0, 1]. With n < 2, returns 0.5 for every input
// (caller should guard against this case to avoid the "all yellow" situation).
export function percentileRanks(values: number[]): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [0.5]
  const indexed = values.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(n)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++
    const avgRank = (i + j) / 2
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank
    i = j + 1
  }
  return ranks.map(r => r / (n - 1))
}

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">Percentile overlay</h3>
      <div className="text-sm text-gray-500">
        {payload.experiments.length} experiment(s) in cohort. Controls coming next.
      </div>
    </div>
  )
}
```

The helpers are exported so a future test runner can pick them up without surgery. `reduceSeries` re-walks the original arrays for AUC so null gaps don't get bridged across; this matches the spec's "each null point breaks the segment" rule.

- [ ] **Step 2: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/PercentileOverlay.tsx
git commit -m "feat(percentile-overlay): add scalar reduction and percentile helpers"
```

---

## Task 6: Add the controls (pickers + reduction dropdown)

**Files:**
- Modify: `src/components/dashboard/analysis/PercentileOverlay.tsx`

- [ ] **Step 1: Replace the placeholder render with the control bar**

In `PercentileOverlay.tsx`, replace the `PercentileOverlay` function (only — keep the helpers) with:

```tsx
import { useMemo, useState } from 'react'

type ColorByCategory = MetricCategory | 'none'

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  const [plotCategory, setPlotCategory] = useState<MetricCategory>('product')
  const [plotName, setPlotName] = useState<string | null>(null)
  const [colorCategory, setColorCategory] = useState<ColorByCategory>('none')
  const [colorName, setColorName] = useState<string | null>(null)
  const [reduction, setReduction] = useState<ReductionKind>('final')

  const plotNames = useMemo(
    () => listMetricNames(payload, plotCategory),
    [payload, plotCategory],
  )
  const colorNames = useMemo(
    () => colorCategory === 'none' ? [] : listMetricNames(payload, colorCategory),
    [payload, colorCategory],
  )

  // Auto-pick a sensible default name when the category changes or when the
  // current name disappears from the available list.
  if (plotName === null && plotNames.length > 0) {
    setPlotName(plotNames[0])
  } else if (plotName !== null && !plotNames.includes(plotName)) {
    setPlotName(plotNames[0] ?? null)
  }
  if (colorCategory !== 'none' && colorName === null && colorNames.length > 0) {
    setColorName(colorNames[0])
  } else if (colorCategory !== 'none' && colorName !== null && !colorNames.includes(colorName)) {
    setColorName(colorNames[0] ?? null)
  } else if (colorCategory === 'none' && colorName !== null) {
    setColorName(null)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">Plot:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotCategory}
          onChange={e => setPlotCategory(e.target.value as MetricCategory)}
        >
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotName ?? ''}
          onChange={e => setPlotName(e.target.value || null)}
          disabled={plotNames.length === 0}
        >
          {plotNames.length === 0 && <option value="">— none available —</option>}
          {plotNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <span className="ml-6 text-gray-500">Color by:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={colorCategory}
          onChange={e => setColorCategory(e.target.value as ColorByCategory)}
        >
          <option value="none">(none)</option>
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        {colorCategory !== 'none' && (
          <>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={colorName ?? ''}
              onChange={e => setColorName(e.target.value || null)}
              disabled={colorNames.length === 0}
            >
              {colorNames.length === 0 && <option value="">— none available —</option>}
              {colorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={reduction}
              onChange={e => setReduction(e.target.value as ReductionKind)}
            >
              <option value="final">final value</option>
              <option value="max">max value</option>
              <option value="mean">mean</option>
              <option value="auc">area under curve</option>
            </select>
          </>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Plot: {plotCategory} / {plotName ?? '—'} · Color: {colorCategory === 'none' ? 'none' : `${colorCategory} / ${colorName ?? '—'} (${reduction})`}
      </div>
    </div>
  )
}
```

The trailing summary line is a temporary debug strip; Task 7 replaces it with the actual chart.

- [ ] **Step 2: Verify dev server renders the controls**

```bash
npm run dev
```

In the browser, navigate to Pattern finding → Percentile overlay. Expected: the control row renders, dropdowns are populated, switching categories updates the name list, and the debug summary line reflects state.

Stop the dev server when done.

- [ ] **Step 3: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/PercentileOverlay.tsx
git commit -m "feat(percentile-overlay): add metric and color-by control bar"
```

---

## Task 7: Render the D3 chart and percentile coloring

**Files:**
- Modify: `src/components/dashboard/analysis/PercentileOverlay.tsx`

- [ ] **Step 1: Add the chart + legend render**

In `PercentileOverlay.tsx`, update the imports at the top of the file to include D3 and the extra React hooks:

```tsx
'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload, TimeSeriesEntry } from '@/lib/analysis/types'
```

Then replace the `PercentileOverlay` component body (keep the exported helpers from Task 5) with a version that includes the chart. The full component (helpers above remain; only the function changes) becomes:

```tsx
type ColorByCategory = MetricCategory | 'none'

interface PlottedRun {
  expId: number
  expTitle: string
  series: TimeSeriesEntry
  scalar: number | null   // null = run is missing the second metric
  percentile: number | null
  color: string
}

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  const [plotCategory, setPlotCategory] = useState<MetricCategory>('product')
  const [plotName, setPlotName] = useState<string | null>(null)
  const [colorCategory, setColorCategory] = useState<ColorByCategory>('none')
  const [colorName, setColorName] = useState<string | null>(null)
  const [reduction, setReduction] = useState<ReductionKind>('final')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const plotNames = useMemo(
    () => listMetricNames(payload, plotCategory),
    [payload, plotCategory],
  )
  const colorNames = useMemo(
    () => colorCategory === 'none' ? [] : listMetricNames(payload, colorCategory),
    [payload, colorCategory],
  )

  // Auto-pick / repair the selected name when the available list changes.
  if (plotName === null && plotNames.length > 0) {
    setPlotName(plotNames[0])
  } else if (plotName !== null && !plotNames.includes(plotName)) {
    setPlotName(plotNames[0] ?? null)
  }
  if (colorCategory !== 'none' && colorName === null && colorNames.length > 0) {
    setColorName(colorNames[0])
  } else if (colorCategory !== 'none' && colorName !== null && !colorNames.includes(colorName)) {
    setColorName(colorNames[0] ?? null)
  } else if (colorCategory === 'none' && colorName !== null) {
    setColorName(null)
  }

  const computed = useMemo(() => {
    if (!plotName) {
      return {
        runs: [] as PlottedRun[],
        scalarStats: null as null | { min: number; max: number; n: number },
        excludedFromRanking: 0,
        rankingMode: 'none' as 'none' | 'percentile' | 'experiment-fallback' | 'all-tied',
        unit: '',
      }
    }

    const expColor = d3.scaleOrdinal(d3.schemeTableau10)

    // Stage 1: pick out the runs that have the plot metric.
    const stage1 = payload.experiments
      .map(e => {
        const series = findSeries(e, plotCategory, plotName)
        return series ? { expId: e.id, expTitle: e.title, series } : null
      })
      .filter((r): r is { expId: number; expTitle: string; series: TimeSeriesEntry } => r !== null)

    if (colorCategory === 'none' || !colorName) {
      const runs: PlottedRun[] = stage1.map(r => ({
        ...r,
        scalar: null,
        percentile: null,
        color: expColor(String(r.expId)),
      }))
      return {
        runs,
        scalarStats: null,
        excludedFromRanking: 0,
        rankingMode: 'none' as const,
        unit: commonUnit(payload, plotCategory, plotName),
      }
    }

    // Stage 2: compute the second-metric scalar for each stage-1 run.
    const withScalars = stage1.map(r => {
      const exp = payload.experiments.find(e => e.id === r.expId)!
      const colorSeries = findSeries(exp, colorCategory, colorName)
      const scalar = colorSeries ? reduceSeries(colorSeries, reduction) : null
      return { ...r, scalar }
    })

    const ranked = withScalars.filter(r => r.scalar !== null) as Array<typeof withScalars[number] & { scalar: number }>
    const excluded = withScalars.length - ranked.length

    if (ranked.length < 2) {
      const runs: PlottedRun[] = withScalars.map(r => ({
        ...r,
        percentile: null,
        color: r.scalar === null ? '#d1d5db' : expColor(String(r.expId)),
      }))
      return {
        runs,
        scalarStats: null,
        excludedFromRanking: excluded,
        rankingMode: 'experiment-fallback' as const,
        unit: commonUnit(payload, plotCategory, plotName),
      }
    }

    const allTied = ranked.every(r => r.scalar === ranked[0].scalar)
    const rankedScalars = ranked.map(r => r.scalar)
    const ranks = percentileRanks(rankedScalars)
    const min = Math.min(...rankedScalars)
    const max = Math.max(...rankedScalars)

    const rankByExpId = new Map<number, number>()
    ranked.forEach((r, i) => rankByExpId.set(r.expId, ranks[i]))

    const runs: PlottedRun[] = withScalars.map(r => {
      if (r.scalar === null) {
        return { ...r, percentile: null, color: '#d1d5db' }
      }
      const p = rankByExpId.get(r.expId) ?? 0.5
      return { ...r, percentile: p, color: d3.interpolateRdYlGn(p) }
    })

    return {
      runs,
      scalarStats: { min, max, n: ranked.length },
      excludedFromRanking: excluded,
      rankingMode: allTied ? 'all-tied' as const : 'percentile' as const,
      unit: commonUnit(payload, plotCategory, plotName),
    }
  }, [payload, plotCategory, plotName, colorCategory, colorName, reduction])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (!plotName || computed.runs.length === 0) return

    const width = svgRef.current.clientWidth
    const height = 420
    const margin = { top: 20, right: 30, bottom: 40, left: 60 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const allTimes = computed.runs.flatMap(r => r.series.timepoints_h)
    const allVals = computed.runs.flatMap(r => r.series.values).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (allVals.length === 0) return

    const x = d3.scaleLinear().domain([0, d3.max(allTimes) ?? 1]).nice().range([0, innerW])
    const y = d3.scaleLinear().domain([0, d3.max(allVals) ?? 1]).nice().range([innerH, 0])

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y))
    g.append('text').attr('x', innerW / 2).attr('y', innerH + 34).attr('text-anchor', 'middle')
      .attr('fill', '#666').attr('font-size', 12).text('time (h)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -45)
      .attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12)
      .text(`${plotName}${computed.unit ? ` (${computed.unit})` : ''}`)

    const line = d3.line<{ t: number; v: number | null }>()
      .defined(d => d.v !== null && Number.isFinite(d.v as number))
      .x(d => x(d.t))
      .y(d => y(d.v as number))

    for (const r of computed.runs) {
      const pts = r.series.timepoints_h.map((t, i) => ({ t, v: r.series.values[i] ?? null }))
      const key = `${r.expId}`
      const isMissing = r.scalar === null && computed.rankingMode !== 'none'
      const baseOpacity = isMissing ? 0.5 : 1
      const finalOpacity = hoveredKey && hoveredKey !== key ? 0.25 : baseOpacity
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', r.color)
        .attr('stroke-width', hoveredKey === key ? 3 : 1.5)
        .attr('opacity', finalOpacity)
        .attr('d', line)
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHoveredKey(key))
        .on('mouseleave', () => setHoveredKey(null))
        .append('title')
        .text(() => {
          const parts = [r.expTitle]
          if (r.scalar !== null && colorName) {
            parts.push(`${colorName} (${reduction}): ${formatScalar(r.scalar)}`)
          }
          if (r.percentile !== null) {
            parts.push(`percentile: ${(r.percentile * 100).toFixed(0)}%`)
          } else if (computed.rankingMode === 'percentile' || computed.rankingMode === 'all-tied') {
            parts.push(`percentile: — (missing ${colorName})`)
          }
          return parts.join('\n')
        })
    }
  }, [computed, plotName, colorName, reduction, hoveredKey])

  const noPlotMetricChosen = !plotName
  const noPlotData = !!plotName && computed.runs.length === 0

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">Plot:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotCategory}
          onChange={e => setPlotCategory(e.target.value as MetricCategory)}
        >
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotName ?? ''}
          onChange={e => setPlotName(e.target.value || null)}
          disabled={plotNames.length === 0}
        >
          {plotNames.length === 0 && <option value="">— none available —</option>}
          {plotNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <span className="ml-6 text-gray-500">Color by:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={colorCategory}
          onChange={e => setColorCategory(e.target.value as ColorByCategory)}
        >
          <option value="none">(none)</option>
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        {colorCategory !== 'none' && (
          <>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={colorName ?? ''}
              onChange={e => setColorName(e.target.value || null)}
              disabled={colorNames.length === 0}
            >
              {colorNames.length === 0 && <option value="">— none available —</option>}
              {colorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={reduction}
              onChange={e => setReduction(e.target.value as ReductionKind)}
            >
              <option value="final">final value</option>
              <option value="max">max value</option>
              <option value="mean">mean</option>
              <option value="auc">area under curve</option>
            </select>
          </>
        )}
      </div>

      {noPlotMetricChosen && (
        <div className="text-sm text-gray-500">Pick a metric to plot.</div>
      )}
      {noPlotData && (
        <div className="text-sm text-gray-500">
          No selected runs have data for {plotName}.
        </div>
      )}
      {!noPlotMetricChosen && !noPlotData && (
        <>
          <svg ref={svgRef} className="w-full" style={{ height: 420 }} />

          {computed.rankingMode === 'percentile' && computed.scalarStats && colorName && (
            <PercentileLegend
              metricName={colorName}
              reduction={reduction}
              min={computed.scalarStats.min}
              max={computed.scalarStats.max}
            />
          )}
          {computed.rankingMode === 'experiment-fallback' && colorName && (
            <div className="mt-2 text-xs text-amber-700">
              Not enough runs with {colorName} data to rank — coloring by experiment instead.
            </div>
          )}
          {computed.rankingMode === 'all-tied' && colorName && (
            <div className="mt-2 text-xs text-amber-700">
              All runs tied on {colorName} — no percentile spread.
            </div>
          )}
          {computed.excludedFromRanking > 0 && (computed.rankingMode === 'percentile' || computed.rankingMode === 'all-tied') && (
            <div className="mt-1 text-xs text-gray-500">
              {computed.excludedFromRanking} selected run(s) excluded from ranking (missing {colorName}).
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatScalar(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000 || (n !== 0 && Math.abs(n) < 0.01)) return n.toExponential(2)
  return n.toFixed(2)
}

function PercentileLegend({ metricName, reduction, min, max }: {
  metricName: string
  reduction: ReductionKind
  min: number
  max: number
}) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth
    const H = 28
    const stops = 32
    const stepW = W / stops
    for (let i = 0; i < stops; i++) {
      svg.append('rect')
        .attr('x', i * stepW)
        .attr('y', 0)
        .attr('width', stepW + 0.5)
        .attr('height', H)
        .attr('fill', d3.interpolateRdYlGn(i / (stops - 1)))
    }
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)
  }, [])

  return (
    <div className="mt-3">
      <svg ref={ref} className="w-full block rounded" style={{ height: 28 }} />
      <div className="flex justify-between mt-1 text-[11px] text-gray-600">
        <span>{formatScalar(min)}</span>
        <span className="text-gray-500">{metricName} ({reduction})</span>
        <span>{formatScalar(max)}</span>
      </div>
    </div>
  )
}
```

Notes on choices made for the engineer reading this:
- `withScalars` / `ranked` split keeps "missing-second-metric" runs visible (gray) without including them in the rank denominator.
- `d3.interpolateRdYlGn` is part of `d3-scale-chromatic` and is re-exported from the top-level `d3` package the project already uses.
- `formatScalar` keeps very large / very small scientific values readable in the legend and tooltip.
- The y-axis label uses `commonUnit` per the spec. A `console.warn` is **not** added in this task — the unit-mismatch warning is rare and adding it later is trivial; per the spec it's "no UI noise" anyway.

- [ ] **Step 2: Verify dev server renders the chart**

```bash
npm run dev
```

In the browser, navigate to Pattern finding → Percentile overlay with at least 4 selected experiments.

Manual checks:
- With Color by = `(none)`: lines are colored per-experiment.
- Pick Color by = product / `<some product>`, reduction = `final value`: lines turn into a red→green gradient.
- Switch reduction to `max` / `mean` / `auc`: gradient changes accordingly.
- Hover a line: stroke thickens, others fade. Native tooltip shows experiment, scalar, and percentile.
- Legend strip below the chart shows correct min/max values.

Stop the dev server when done.

- [ ] **Step 3: Verify type-check + build pass**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/PercentileOverlay.tsx
git commit -m "feat(percentile-overlay): render D3 chart with percentile coloring and legend"
```

---

## Task 8: Manual QA across the spec's edge cases

This task is verification only — no code changes.

**Files:** none

- [ ] **Step 1: Build and start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify each edge case from the spec**

For each case, navigate to Pattern finding → Percentile overlay and reproduce the condition. Tick the box only after you've seen the expected outcome in the browser.

| # | Setup | Expected |
|---|---|---|
| 1 | No experiments selected | Parent page shows "Pick experiments on the left" (parent-level, not the component's job). |
| 2 | Plot category set to one with no available names in the cohort | Plot name dropdown shows "— none available —"; chart area shows "Pick a metric to plot." |
| 3 | Plot metric chosen but no selected run has that series | Chart area shows "No selected runs have data for `<metric>`." |
| 4 | Plot metric only, Color by = `(none)` | Lines colored per-experiment, no legend strip. |
| 5 | Plot metric + second metric, all runs have both | Red→yellow→green gradient on lines, legend strip shows correct min/max. |
| 6 | Plot metric + second metric, **one** run is missing the second metric | That run is drawn gray; "1 selected run(s) excluded from ranking…" appears. |
| 7 | Plot metric + second metric, only **one** run has the second metric (n < 2) | Falls back to per-experiment colors with the amber "not enough runs" note. The single ranked-eligible run is **not** excluded from the chart. |
| 8 | Plot metric + second metric, **all runs tie** on the second metric scalar | All lines yellow; "All runs tied on `<metric>` — no percentile spread." |
| 9 | Switch reduction (final / max / mean / auc) | Gradient and legend min/max recompute. |
| 10 | Hover a line | Stroke thickens, others fade to 0.25. Native tooltip shows experiment title, scalar value, and percentile. |
| 11 | Switch plot category between product / secondary product / process data | Name list repopulates; if previously selected name doesn't exist in new category, first available is auto-picked. |
| 12 | Browser reload after picking metrics | Component-local state resets (no URL persistence by design — verify this matches expectations from the spec). |

- [ ] **Step 3: Capture findings**

If any edge case behaves differently from the spec, file the deviation. Either fix it (small) or note it for follow-up before merging.

- [ ] **Step 4: Stop the dev server and commit nothing**

This task produces no commit. If a fix was needed during QA, that fix is its own commit with a `fix(percentile-overlay): …` message.

---

## Task 9: Final verification

**Files:** none

- [ ] **Step 1: Run the full type-check + build one last time**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 2: Confirm the Kinetics → Overlay tab still works**

Open `/dashboard/analysis`, pick a cohort, navigate to Kinetics → Overlay.
Expected: existing behavior unchanged (multi-category checkboxes, color-by experiment/strain/batch_media).

- [ ] **Step 3: Confirm the Pattern Finding tab defaults to Percentile overlay**

Click the "Pattern finding" theme tab.
Expected: the active sub-tab becomes "Percentile overlay" (it's first in the list and `availableInP1: true`, so `ThemeTabs` picks it).

- [ ] **Step 4: Done**

No further commits required. The branch is ready for review.

---

## Self-review notes

Spec coverage check:
- Where it lives — Tasks 1, 2, 3, 4
- Controls bar — Task 6 / Task 7
- Reduction definitions — Task 5 (`reduceSeries`)
- Percentile assignment — Task 5 (`percentileRanks`) + Task 7 (computed.runs)
- Coloring rules table — Task 7 (computed branches)
- Empty/edge states — Task 7 (render branches) + Task 8 (verification)
- Legend — Task 7 (`PercentileLegend`)
- Testing — Tasks 8, 9

No placeholders. All function and prop names used in later tasks are defined in earlier tasks (`MetricCategory`, `ReductionKind`, `reduceSeries`, `findSeries`, `listMetricNames`, `commonUnit`, `percentileRanks`, `PlottedRun`).
