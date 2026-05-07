# Carbon Flux Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Carbon flux` component under the Kinetics theme — cohort scatter (overall Y_p/s on x, qP_max on y) plus a per-experiment cumulative substrate-vs-product drilldown.

**Architecture:** Pure math helpers extend `lib/analysis/kineticsUtils.ts`. A new client component `CarbonFlux.tsx` derives cohort points and drilldown lines from the existing `CohortPayload` — no backend changes. Co-located pure logic in `carbonFluxLogic.ts` is testable without React. `KineticAnalysis.tsx` is refactored to share `findBiomassData` / `findSubstrateData` from `kineticsUtils.ts` so both components stay aligned on biomass/substrate selection.

**Tech Stack:** Next.js 16, React 19, TypeScript, D3 v7, Tailwind CSS v4, Node built-in `node:test` style tests verified via targeted TypeScript checks.

**Spec:** `frontend/docs/superpowers/specs/2026-05-07-carbon-flux-analysis-design.md`

**Working directory:** all `npx`, `npm`, and `git` commands assume `frontend/` (the Next.js repo) as the working directory. Run `cd "Fennec Bio/frontend"` once at the start of the session.

**Component-level testing note:** the spec lists a "render `CarbonFlux` with a fixture and assert dot count, counter wording, click updates drilldown" component test. This codebase has no React testing library wired in (no jest/vitest/RTL). The same assertions are split as: pure-logic unit tests on `deriveCohortFluxPoints` covering the included/excluded counts (Task 6) + the manual smoke check confirming click-to-drilldown works (Task 11). Adding RTL is out of scope for this plan.

---

### Task 1: Extract `findBiomassData` and `findSubstrateData` to `kineticsUtils.ts`

Currently both helpers live as module-private functions inside `KineticAnalysis.tsx`. Move them to `lib/analysis/kineticsUtils.ts` so the new `CarbonFlux` component can reuse them without duplication.

**Files:**
- Modify: `frontend/src/lib/analysis/kineticsUtils.ts`
- Modify: `frontend/src/components/dashboard/analysis/kinetics/KineticAnalysis.tsx`

- [ ] **Step 1: Add the helpers (and a small interface) to `kineticsUtils.ts`**

Append these to `frontend/src/lib/analysis/kineticsUtils.ts`. Add a `TimeSeriesEntry` import at the top of the file (it currently has none).

```ts
import type { TimeSeriesEntry } from './types'

export interface BiomassSeries {
  name: string
  timepoints: number[]
  values: number[]
}

const BIOMASS_NAME_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /dcw|dry\s*cell\s*weight/i,        name: 'DCW' },
  { pattern: /biomass/i,                         name: 'Biomass' },
  { pattern: /od|optical\s*density/i,            name: 'OD' },
  { pattern: /cell\s*(weight|mass|density)/i,    name: 'Cell' },
]

export function findBiomassData(timeSeries: TimeSeriesEntry[]): BiomassSeries | null {
  const flagged = timeSeries.find((s) => s.role === 'biomass')
  if (flagged) return { name: flagged.name, timepoints: flagged.timepoints_h, values: flagged.values }

  for (const { pattern } of BIOMASS_NAME_PATTERNS) {
    const hit = timeSeries.find((s) => pattern.test(s.name))
    if (hit) return { name: hit.name, timepoints: hit.timepoints_h, values: hit.values }
  }
  return null
}

export function findSubstrateData(timeSeries: TimeSeriesEntry[]): TimeSeriesEntry | null {
  const flagged = timeSeries.find((s) => s.role === 'substrate')
  if (flagged) return flagged
  return timeSeries.find((s) => /glucose|sugar|substrate/i.test(s.name)) ?? null
}
```

- [ ] **Step 2: Update `KineticAnalysis.tsx` to import from the shared module**

Open `frontend/src/components/dashboard/analysis/kinetics/KineticAnalysis.tsx`.

Replace the existing `BiomassSeries` interface and the two private functions (lines 18-43 in the current file) with an import from the shared module.

Change:
```ts
import {
  type KineticParams,
  calculateGrowthRate,
  calculateProductionRate,
  calculateProductivity,
  calculateYield,
  detectPhases,
  getFinalTiter,
} from '@/lib/analysis/kineticsUtils'
```
to:
```ts
import {
  type KineticParams,
  type BiomassSeries,
  calculateGrowthRate,
  calculateProductionRate,
  calculateProductivity,
  calculateYield,
  detectPhases,
  findBiomassData,
  findSubstrateData,
  getFinalTiter,
} from '@/lib/analysis/kineticsUtils'
```

Then delete the now-redundant local definitions:
- The local `interface BiomassSeries { ... }` declaration.
- The local `function findBiomassData(...)` definition.
- The local `function findSubstrateData(...)` definition.

Leave `findProductSeries` (it's product-specific and not shared yet) and the rest of the file unchanged.

- [ ] **Step 3: Verify the refactor compiles**

Run from `frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors. If `BiomassSeries` was used by name elsewhere in `KineticAnalysis.tsx`, the import added in Step 2 covers it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analysis/kineticsUtils.ts src/components/dashboard/analysis/kinetics/KineticAnalysis.tsx
git commit -m "refactor(analysis): share findBiomassData and findSubstrateData via kineticsUtils

So a forthcoming CarbonFlux component can reuse the same biomass/substrate
selection rules. No behavior change."
```

---

### Task 2: Add `computeCumulativeMassSeries` helper (TDD)

A pure function that turns a `TimeSeriesEntry`-like input into cumulative deltas relative to the first sample. Used twice by the drilldown — once for substrate (anchor = `S_0`, sign-flipped: `S_0 − S(t)`) and once for product (anchor = `P_0`, monotone: `P(t) − P_0`). Direction is selected by the caller.

**Files:**
- Modify: `frontend/src/lib/analysis/kineticsUtils.ts`
- Create: `frontend/src/lib/analysis/kineticsUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/analysis/kineticsUtils.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeCumulativeMassSeries,
} from './kineticsUtils'

describe('computeCumulativeMassSeries', () => {
  it('returns deltas relative to first sample when direction is "increase"', () => {
    const out = computeCumulativeMassSeries(
      { timepoints: [0, 5, 10], values: [0, 1.5, 4] },
      'increase',
    )
    assert.deepEqual(out.timepoints, [0, 5, 10])
    assert.deepEqual(out.cumulative, [0, 1.5, 4])
  })

  it('returns sign-flipped deltas when direction is "decrease"', () => {
    const out = computeCumulativeMassSeries(
      { timepoints: [0, 5, 10], values: [50, 30, 10] },
      'decrease',
    )
    assert.deepEqual(out.timepoints, [0, 5, 10])
    assert.deepEqual(out.cumulative, [0, 20, 40])
  })

  it('returns empty arrays for an empty input', () => {
    const out = computeCumulativeMassSeries({ timepoints: [], values: [] }, 'increase')
    assert.deepEqual(out.timepoints, [])
    assert.deepEqual(out.cumulative, [])
  })

  it('sorts unsorted timepoints before differencing', () => {
    const out = computeCumulativeMassSeries(
      { timepoints: [10, 0, 5], values: [10, 50, 30] },
      'decrease',
    )
    assert.deepEqual(out.timepoints, [0, 5, 10])
    assert.deepEqual(out.cumulative, [0, 20, 40])
  })
})
```

- [ ] **Step 2: Run the test (expect type errors)**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: error TS2305 — `Module './kineticsUtils' has no exported member 'computeCumulativeMassSeries'`.

- [ ] **Step 3: Implement the helper**

Append to `frontend/src/lib/analysis/kineticsUtils.ts`:

```ts
export type CumulativeDirection = 'increase' | 'decrease'

export function computeCumulativeMassSeries(
  series: { timepoints: number[]; values: number[] },
  direction: CumulativeDirection,
): { timepoints: number[]; cumulative: number[] } {
  const n = Math.min(series.timepoints.length, series.values.length)
  if (n === 0) return { timepoints: [], cumulative: [] }
  const sorted = Array.from({ length: n }, (_, i) => ({ t: series.timepoints[i], v: series.values[i] }))
    .sort((a, b) => a.t - b.t)
  const first = sorted[0].v
  const sign = direction === 'increase' ? 1 : -1
  return {
    timepoints: sorted.map((p) => p.t),
    cumulative: sorted.map((p) => sign * (p.v - first)),
  }
}
```

- [ ] **Step 4: Re-run the type check**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/kineticsUtils.ts src/lib/analysis/kineticsUtils.test.ts
git commit -m "feat(analysis): add computeCumulativeMassSeries helper

Pure helper that converts a time-series into deltas relative to the first
sample, with caller-selectable direction (increase/decrease) so it can serve
both product-formed and substrate-consumed drilldown lines."
```

---

### Task 3: Add `computeYpsOverall` helper (TDD)

Overall yield Y_p/s = (final P − initial P) / (initial S − final S). Returns `null` when the substrate didn't decline or either series is too short.

**Files:**
- Modify: `frontend/src/lib/analysis/kineticsUtils.ts`
- Modify: `frontend/src/lib/analysis/kineticsUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `kineticsUtils.test.ts`:

```ts
import { computeYpsOverall } from './kineticsUtils'
import type { TimeSeriesEntry } from './types'

const seriesEntry = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'],
  timepoints_h: number[],
  values: number[],
): TimeSeriesEntry => ({ category, name, role, unit: 'g/L', timepoints_h, values })

describe('computeYpsOverall', () => {
  it('returns ΔP / ΔS for monotone series', () => {
    const product   = seriesEntry('product',      'CBDa',    null,        [0, 10], [0, 2])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    assert.equal(computeYpsOverall(product, substrate), 0.1)
  })

  it('returns null when substrate did not decline', () => {
    const product   = seriesEntry('product',      'CBDa',    null,        [0, 10], [0, 2])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [30, 30])
    assert.equal(computeYpsOverall(product, substrate), null)
  })

  it('returns null when either series has fewer than 2 points', () => {
    const product   = seriesEntry('product',      'CBDa',    null,        [0],     [0])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    assert.equal(computeYpsOverall(product, substrate), null)
  })
})
```

- [ ] **Step 2: Run the type check (expect failure)**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: `Module './kineticsUtils' has no exported member 'computeYpsOverall'`.

- [ ] **Step 3: Implement the helper**

Append to `kineticsUtils.ts`:

```ts
export function computeYpsOverall(
  product: TimeSeriesEntry,
  substrate: TimeSeriesEntry,
): number | null {
  if (product.timepoints_h.length < 2 || substrate.timepoints_h.length < 2) return null

  const sortByT = <T,>(ts: number[], vs: number[]): { t: number[]; v: number[] } => {
    const pairs = ts.map((t, i) => ({ t, v: vs[i] })).sort((a, b) => a.t - b.t)
    return { t: pairs.map((p) => p.t), v: pairs.map((p) => p.v) }
  }
  const p = sortByT(product.timepoints_h, product.values)
  const s = sortByT(substrate.timepoints_h, substrate.values)

  const deltaP = p.v[p.v.length - 1] - p.v[0]
  const deltaS = s.v[0] - s.v[s.v.length - 1]
  if (deltaS <= 0) return null
  return deltaP / deltaS
}
```

- [ ] **Step 4: Re-run the type check**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/kineticsUtils.ts src/lib/analysis/kineticsUtils.test.ts
git commit -m "feat(analysis): add computeYpsOverall helper

Overall yield product/substrate from final-vs-initial deltas. Returns null
when substrate did not decline or either series is too short."
```

---

### Task 4: Add `computeQsMax` helper (TDD)

Specific substrate uptake rate qS_max = max over rolling windows of (1/X̄) · |ΔS/Δt|, mirroring `calculateProductionRate` for products. Used as a tooltip value on the cohort scatter.

**Files:**
- Modify: `frontend/src/lib/analysis/kineticsUtils.ts`
- Modify: `frontend/src/lib/analysis/kineticsUtils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `kineticsUtils.test.ts`:

```ts
import { computeQsMax } from './kineticsUtils'

describe('computeQsMax', () => {
  it('computes specific uptake rate at peak interval', () => {
    // Substrate drops fast between 5h and 10h; biomass averages ~3 there.
    const substrate = seriesEntry(
      'process_data', 'Glucose', 'substrate',
      [0, 5, 10, 15], [50, 40, 10, 5],
    )
    const biomass = { timepoints: [0, 5, 10, 15], values: [1, 2, 4, 5] }
    const out = computeQsMax(substrate, biomass)
    assert.notEqual(out, null)
    // dS/dt = -6 g/L/h between 5 and 10h, mean X = 3 → qS = 2.0
    assert.equal(out!.qsMax.toFixed(3), '2.000')
    assert.equal(out!.qsMaxTime, 7.5)
  })

  it('returns null when biomass is non-positive at every interval', () => {
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    const biomass   = { timepoints: [0, 10], values: [0, 0] }
    assert.equal(computeQsMax(substrate, biomass), null)
  })

  it('returns null when fewer than 2 substrate points', () => {
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0], [50])
    const biomass   = { timepoints: [0, 10], values: [1, 2] }
    assert.equal(computeQsMax(substrate, biomass), null)
  })
})
```

- [ ] **Step 2: Run the type check (expect failure)**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: `Module './kineticsUtils' has no exported member 'computeQsMax'`.

- [ ] **Step 3: Implement the helper**

Append to `kineticsUtils.ts`:

```ts
export function computeQsMax(
  substrate: TimeSeriesEntry,
  biomass: { timepoints: number[]; values: number[] },
): { qsMax: number; qsMaxTime: number } | null {
  if (substrate.timepoints_h.length < 2) return null

  const subData = substrate.timepoints_h
    .map((t, i) => ({ time: t, value: substrate.values[i] }))
    .sort((a, b) => a.time - b.time)
  const odData = biomass.timepoints
    .map((t, i) => ({ time: t, value: biomass.values[i] }))
    .sort((a, b) => a.time - b.time)
  if (odData.length === 0) return null

  const interpolateX = (time: number): number => {
    if (time <= odData[0].time) return odData[0].value
    if (time >= odData[odData.length - 1].time) return odData[odData.length - 1].value
    for (let i = 0; i < odData.length - 1; i++) {
      const a = odData[i], b = odData[i + 1]
      if (time >= a.time && time <= b.time) {
        const r = (time - a.time) / (b.time - a.time)
        return a.value + r * (b.value - a.value)
      }
    }
    return odData[odData.length - 1].value
  }

  let bestQs = 0
  let bestTime = 0
  for (let i = 0; i < subData.length - 1; i++) {
    const dt = subData[i + 1].time - subData[i].time
    if (dt <= 0) continue
    const dS = subData[i + 1].value - subData[i].value
    if (dS >= 0) continue // not consuming
    const avgTime = (subData[i].time + subData[i + 1].time) / 2
    const avgX = interpolateX(avgTime)
    if (avgX <= 0) continue
    const qs = (-dS / dt) / avgX
    if (qs > bestQs) {
      bestQs = qs
      bestTime = avgTime
    }
  }

  return bestQs > 0 ? { qsMax: bestQs, qsMaxTime: bestTime } : null
}
```

- [ ] **Step 4: Re-run the type check**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/lib/analysis/kineticsUtils.test.ts
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/kineticsUtils.ts src/lib/analysis/kineticsUtils.test.ts
git commit -m "feat(analysis): add computeQsMax helper

Specific substrate uptake rate at the peak consumption interval, biomass-
interpolated. Mirrors calculateProductionRate's structure so qS and qP read
the same way."
```

---

### Task 5: Register `carbon-flux` slug in types and constants

**Files:**
- Modify: `frontend/src/lib/analysis/types.ts`
- Modify: `frontend/src/lib/analysis/constants.ts`

- [ ] **Step 1: Add the slug to the `AnalysisSlug` union**

In `frontend/src/lib/analysis/types.ts`, change:
```ts
export type AnalysisSlug =
  | 'cohort-overview'
  | 'kinetic-analysis'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff' | 'percentile-overlay'
```
to:
```ts
export type AnalysisSlug =
  | 'cohort-overview'
  | 'kinetic-analysis' | 'carbon-flux'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff' | 'percentile-overlay'
```

- [ ] **Step 2: Register the slug under the Kinetics theme**

In `frontend/src/lib/analysis/constants.ts`, change:
```ts
  { id: 'kinetics', label: 'Kinetics', analyses: [
    { slug: 'kinetic-analysis', label: 'Kinetic Analysis', availableInP1: true },
    { slug: 'yield-summary',    label: 'Yield summary',    availableInP1: true },
  ]},
```
to:
```ts
  { id: 'kinetics', label: 'Kinetics', analyses: [
    { slug: 'kinetic-analysis', label: 'Kinetic Analysis', availableInP1: true },
    { slug: 'carbon-flux',      label: 'Carbon flux',      availableInP1: true },
    { slug: 'yield-summary',    label: 'Yield summary',    availableInP1: true },
  ]},
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors. (The page.tsx exhaustive switch is `if`-chain based, not a typed `switch`, so adding the slug doesn't cause a type error there.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/constants.ts
git commit -m "feat(analysis): register carbon-flux slug under Kinetics theme

Slug only — the component itself follows in the next commit."
```

---

### Task 6: Add `carbonFluxLogic.ts` — pure cohort-point and drilldown derivation (TDD)

A single co-located logic module with two pure functions:
- `deriveCohortFluxPoints(payload, productName)` — returns `{ points, excluded }` for the scatter.
- `deriveDrilldownSeries(experiment, productName)` — returns the cumulative substrate and product series and the detected phases for the drilldown.

This keeps the React component thin and makes the math testable.

**Files:**
- Create: `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts`
- Create: `frontend/src/components/dashboard/analysis/carbonFluxLogic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/analysis/carbonFluxLogic.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  CohortPayload,
  ExperimentInPayload,
  TimeSeriesEntry,
} from '../../../lib/analysis/types'
import {
  deriveCohortFluxPoints,
  deriveDrilldownSeries,
} from './carbonFluxLogic'

const series = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'],
  timepoints_h: number[],
  values: number[],
): TimeSeriesEntry => ({ category, name, role, unit: 'g/L', timepoints_h, values })

const baseExperiment = (overrides: Partial<ExperimentInPayload> = {}): ExperimentInPayload => ({
  id: 1,
  title: 'Ferm 1',
  date: null,
  project_id: 1,
  strain: { id: 1, name: 'S1', parent_strain: null, modifications: [] },
  batch_media: null,
  feed_media: null,
  variables: [],
  outcomes: {
    final_titer: {}, max_titer: {}, productivity: {},
    yps: {}, ypx: {},
    biomass: null, mu_max: null, substrate_rate: null,
  },
  time_series: [
    series('product',      'CBDa',    null,        [0, 5, 10], [0, 1, 2]),
    series('process_data', 'Glucose', 'substrate', [0, 5, 10], [50, 30, 10]),
    series('process_data', 'DCW',     'biomass',   [0, 5, 10], [1, 3, 5]),
  ],
  ...overrides,
})

const payload = (experiments: ExperimentInPayload[]): CohortPayload => ({
  experiments,
  products: ['CBDa'],
  role_map_version: 1,
  warnings: [],
})

describe('deriveCohortFluxPoints', () => {
  it('returns one point per included experiment with Y_p/s and qP_max', () => {
    const out = deriveCohortFluxPoints(payload([baseExperiment()]), 'CBDa')
    assert.equal(out.points.length, 1)
    assert.equal(out.excluded.length, 0)
    const p = out.points[0]
    assert.equal(p.experimentId, 1)
    assert.equal(p.title, 'Ferm 1')
    assert.equal(p.strainName, 'S1')
    // Y_p/s = (2 - 0) / (50 - 10) = 0.05
    assert.equal(p.yps, 0.05)
    // qS_max and qP_max should both be > 0 since both move
    assert.ok(p.qsMax !== null && p.qsMax > 0)
    assert.ok(p.qpMax !== null && p.qpMax > 0)
  })

  it('excludes an experiment that is missing biomass', () => {
    const exp = baseExperiment({
      time_series: [
        series('product',      'CBDa',    null,        [0, 10], [0, 2]),
        series('process_data', 'Glucose', 'substrate', [0, 10], [50, 30]),
      ],
    })
    const out = deriveCohortFluxPoints(payload([exp]), 'CBDa')
    assert.equal(out.points.length, 0)
    assert.equal(out.excluded.length, 1)
    assert.equal(out.excluded[0].reason, 'missing biomass')
  })

  it('excludes an experiment with non-declining substrate', () => {
    const exp = baseExperiment({
      time_series: [
        series('product',      'CBDa',    null,        [0, 10], [0, 2]),
        series('process_data', 'Glucose', 'substrate', [0, 10], [30, 30]),
        series('process_data', 'DCW',     'biomass',   [0, 10], [1, 3]),
      ],
    })
    const out = deriveCohortFluxPoints(payload([exp]), 'CBDa')
    assert.equal(out.points.length, 0)
    assert.equal(out.excluded[0].reason, 'substrate did not decline')
  })

  it('excludes an experiment that is missing the selected product', () => {
    const exp = baseExperiment({
      time_series: [
        series('process_data', 'Glucose', 'substrate', [0, 10], [50, 30]),
        series('process_data', 'DCW',     'biomass',   [0, 10], [1, 3]),
      ],
    })
    const out = deriveCohortFluxPoints(payload([exp]), 'CBDa')
    assert.equal(out.excluded[0].reason, 'missing product')
  })

  it('uses "Unknown" as strain name when strain is null', () => {
    const exp = baseExperiment({ strain: null })
    const out = deriveCohortFluxPoints(payload([exp]), 'CBDa')
    assert.equal(out.points[0].strainName, 'Unknown')
  })
})

describe('deriveDrilldownSeries', () => {
  it('returns cumulative substrate-consumed and product-formed plus phases', () => {
    const out = deriveDrilldownSeries(baseExperiment(), 'CBDa')
    assert.notEqual(out, null)
    assert.deepEqual(out!.substrateConsumed.cumulative, [0, 20, 40])
    assert.deepEqual(out!.productFormed.cumulative, [0, 1, 2])
    assert.equal(out!.substrateName, 'Glucose')
    assert.equal(out!.productName, 'CBDa')
    assert.equal(out!.biomassName, 'DCW')
    assert.ok(Array.isArray(out!.phases))
  })

  it('returns null when biomass is missing', () => {
    const exp = baseExperiment({
      time_series: [
        series('product',      'CBDa',    null,        [0, 10], [0, 2]),
        series('process_data', 'Glucose', 'substrate', [0, 10], [50, 30]),
      ],
    })
    assert.equal(deriveDrilldownSeries(exp, 'CBDa'), null)
  })
})
```

- [ ] **Step 2: Run the type check (expect failure)**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/components/dashboard/analysis/carbonFluxLogic.test.ts
```
Expected: cannot find module `./carbonFluxLogic`.

- [ ] **Step 3: Implement the logic module**

Create `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts`:

```ts
import type {
  CohortPayload,
  ExperimentInPayload,
  TimeSeriesEntry,
} from '../../../lib/analysis/types'
import {
  calculateProductionRate,
  computeCumulativeMassSeries,
  computeQsMax,
  computeYpsOverall,
  detectPhases,
  findBiomassData,
  findSubstrateData,
  type Phase,
} from '../../../lib/analysis/kineticsUtils'

export type FluxExclusionReason =
  | 'missing biomass'
  | 'missing substrate'
  | 'missing product'
  | 'substrate did not decline'

export interface CohortFluxPoint {
  experimentId: number
  title: string
  strainName: string
  batchMediaName: string | null
  yps: number
  qpMax: number | null
  qsMax: number | null
}

export interface CohortFluxResult {
  points: CohortFluxPoint[]
  excluded: Array<{ experimentId: number; title: string; reason: FluxExclusionReason }>
}

export interface DrilldownSeries {
  substrateName: string
  productName: string
  biomassName: string
  substrateConsumed: { timepoints: number[]; cumulative: number[] }
  productFormed:     { timepoints: number[]; cumulative: number[] }
  phases: Phase[]
}

function findProductSeries(exp: ExperimentInPayload, productName: string): TimeSeriesEntry | null {
  return exp.time_series.find((s) => s.category === 'product' && s.name === productName) ?? null
}

export function deriveCohortFluxPoints(
  payload: CohortPayload,
  productName: string,
): CohortFluxResult {
  const points: CohortFluxPoint[] = []
  const excluded: CohortFluxResult['excluded'] = []

  for (const exp of payload.experiments) {
    const biomass   = findBiomassData(exp.time_series)
    const substrate = findSubstrateData(exp.time_series)
    const product   = findProductSeries(exp, productName)

    if (!biomass) {
      excluded.push({ experimentId: exp.id, title: exp.title, reason: 'missing biomass' })
      continue
    }
    if (!substrate) {
      excluded.push({ experimentId: exp.id, title: exp.title, reason: 'missing substrate' })
      continue
    }
    if (!product) {
      excluded.push({ experimentId: exp.id, title: exp.title, reason: 'missing product' })
      continue
    }

    const yps = computeYpsOverall(product, substrate)
    if (yps === null) {
      excluded.push({ experimentId: exp.id, title: exp.title, reason: 'substrate did not decline' })
      continue
    }

    const qP = calculateProductionRate(
      product.timepoints_h, product.values,
      biomass.timepoints,    biomass.values,
    )
    const qS = computeQsMax(substrate, biomass)

    points.push({
      experimentId:  exp.id,
      title:         exp.title,
      strainName:    exp.strain?.name ?? 'Unknown',
      batchMediaName: exp.batch_media?.name ?? null,
      yps,
      qpMax: qP?.qpMax ?? null,
      qsMax: qS?.qsMax ?? null,
    })
  }

  return { points, excluded }
}

export function deriveDrilldownSeries(
  exp: ExperimentInPayload,
  productName: string,
): DrilldownSeries | null {
  const biomass   = findBiomassData(exp.time_series)
  const substrate = findSubstrateData(exp.time_series)
  const product   = findProductSeries(exp, productName)
  if (!biomass || !substrate || !product) return null

  return {
    substrateName: substrate.name,
    productName:   product.name,
    biomassName:   biomass.name,
    substrateConsumed: computeCumulativeMassSeries(
      { timepoints: substrate.timepoints_h, values: substrate.values },
      'decrease',
    ),
    productFormed: computeCumulativeMassSeries(
      { timepoints: product.timepoints_h, values: product.values },
      'increase',
    ),
    phases: detectPhases(biomass.timepoints, biomass.values),
  }
}
```

You also need to export `Phase` from `kineticsUtils.ts`. It's already exported as a type — no change needed if `export type PhaseName` and `export interface Phase` are intact. If `Phase` isn't exported from `kineticsUtils.ts`, add `export` to its declaration.

- [ ] **Step 4: Re-run the type check**

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/components/dashboard/analysis/carbonFluxLogic.test.ts
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/analysis/carbonFluxLogic.ts src/components/dashboard/analysis/carbonFluxLogic.test.ts
git commit -m "feat(analysis): add carbon-flux pure derivation logic

deriveCohortFluxPoints turns a CohortPayload + product into scatter rows
plus exclusion reasons. deriveDrilldownSeries turns one experiment into
cumulative substrate-consumed and product-formed series with detected
biomass phases. Pure, framework-free, fully unit-tested."
```

---

### Task 7: Stub `CarbonFlux.tsx` and wire it into the analysis page

Create the React component with a placeholder body (no D3 yet) and connect it to the page so we can see the tab appear in the Kinetics theme. Real rendering follows in Tasks 8-10.

**Files:**
- Create: `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`
- Modify: `frontend/src/app/dashboard/analysis/page.tsx`

- [ ] **Step 1: Create the stub component**

`frontend/src/components/dashboard/analysis/CarbonFlux.tsx`:

```tsx
'use client'

import type { CohortPayload } from '@/lib/analysis/types'

interface Props {
  payload: CohortPayload
  product: string | null
}

export function CarbonFlux({ payload, product }: Props) {
  if (!product) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Pick a product above to begin.
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 text-sm text-gray-500">
      Carbon flux for product <span className="font-medium text-gray-800">{product}</span>:
      cohort scatter and drilldown coming next. Cohort size: {payload.experiments.length}.
    </div>
  )
}
```

- [ ] **Step 2: Wire `CarbonFlux` into the analysis page**

In `frontend/src/app/dashboard/analysis/page.tsx`:

(a) Add the import next to the others, after `BestVsWorstDiff`:
```tsx
import { CarbonFlux } from '@/components/dashboard/analysis/CarbonFlux'
```

(b) Add `'carbon-flux'` to the OutcomePicker whitelist. Find the array literal:
```tsx
{[
  'anova-heatmap', 'main-effects', 'regression',
  'response-surface', 'media-scan', 'pca',
  'strain-lineage', 'cohort-diff',
].includes(state.analysis) && (
```
and change it to:
```tsx
{[
  'anova-heatmap', 'main-effects', 'regression',
  'response-surface', 'media-scan', 'pca',
  'strain-lineage', 'cohort-diff', 'carbon-flux',
].includes(state.analysis) && (
```

(c) Add the render branch. Find the block:
```tsx
              {state.analysis === 'kinetic-analysis' && (
                <KineticAnalysis payload={payload} />
              )}
```
and add immediately after it:
```tsx
              {state.analysis === 'carbon-flux' && (
                <CarbonFlux payload={payload} product={state.product} />
              )}
```

- [ ] **Step 3: Verify the page compiles and renders the new tab**

```bash
npx tsc --noEmit
```
Expected: no errors.

Then:
```bash
npm run dev
```
Open `http://localhost:3000/dashboard/analysis`, select the Kinetics theme, click `Carbon flux`, then pick any product from the OutcomePicker. You should see the placeholder card with the cohort size. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analysis/CarbonFlux.tsx src/app/dashboard/analysis/page.tsx
git commit -m "feat(analysis): wire CarbonFlux stub into Kinetics theme

Tab appears, OutcomePicker shows for the slug, placeholder body confirms the
component receives payload and selected product. D3 charts follow."
```

---

### Task 8: Implement `CohortFluxScatter` (D3 SVG, x = Y_p/s, y = qP_max)

A small internal sub-component rendered by `CarbonFlux`. One dot per `CohortFluxPoint`, colored by strain. Click dispatches selection.

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`

- [ ] **Step 1: Add the sub-component to `CarbonFlux.tsx`**

Replace the body of `CarbonFlux.tsx` so it imports D3 and adds an internal `CohortFluxScatter`. Final file content for this step:

```tsx
'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef } from 'react'
import type { CohortPayload } from '@/lib/analysis/types'
import { deriveCohortFluxPoints, type CohortFluxPoint } from './carbonFluxLogic'

interface Props {
  payload: CohortPayload
  product: string | null
}

export function CarbonFlux({ payload, product }: Props) {
  if (!product) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Pick a product above to begin.
      </div>
    )
  }
  const { points, excluded } = useMemo(
    () => deriveCohortFluxPoints(payload, product),
    [payload, product],
  )

  if (points.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No experiments include biomass, substrate, and product data for {product}.
        ({excluded.length} excluded.)
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CohortFluxScatter points={points} selectedId={null} onSelect={() => { /* drilldown wired in next task */ }} />
      <div className="text-xs text-gray-500">
        {points.length} of {payload.experiments.length} experiments included
        {excluded.length > 0 && ` · ${excluded.length} excluded`}
      </div>
    </div>
  )
}

interface ScatterProps {
  points: CohortFluxPoint[]
  selectedId: number | null
  onSelect: (id: number) => void
}

function CohortFluxScatter({ points, selectedId, onSelect }: ScatterProps) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const node = ref.current
    if (!node) return
    const W = node.clientWidth || 720
    const H = 360
    const m = { top: 24, right: 24, bottom: 44, left: 64 }
    const iw = W - m.left - m.right
    const ih = H - m.top - m.bottom

    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const xExtent = d3.extent(points, (p) => p.yps) as [number, number]
    const yExtent = d3.extent(points, (p) => p.qpMax ?? 0) as [number, number]
    const x = d3.scaleLinear().domain([Math.min(0, xExtent[0]), xExtent[1] || 1]).nice().range([0, iw])
    const y = d3.scaleLinear().domain([0, yExtent[1] || 1]).nice().range([ih, 0])

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    g.append('text')
      .attr('x', iw / 2).attr('y', ih + 36).attr('text-anchor', 'middle')
      .attr('fill', '#444').attr('font-size', 12)
      .text('Y p/s (overall yield)')
    g.append('text')
      .attr('transform', `translate(-46,${ih / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('fill', '#444').attr('font-size', 12)
      .text('qP_max (g product / g biomass / hr)')

    const strains = Array.from(new Set(points.map((p) => p.strainName)))
    const tableau = d3.schemeTableau10
    let ti = 0
    const colorRange = strains.map((s) => {
      if (s === 'Unknown') return '#9ca3af'
      const c = tableau[ti % tableau.length]
      ti += 1
      return c
    })
    const color = d3.scaleOrdinal<string, string>().domain(strains).range(colorRange)

    g.selectAll('circle.dot')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => x(d.yps))
      .attr('cy', (d) => y(d.qpMax ?? 0))
      .attr('r', (d) => d.experimentId === selectedId ? 8 : 6)
      .attr('fill', (d) => color(d.strainName) as string)
      .attr('stroke', (d) => d.experimentId === selectedId ? '#000' : 'white')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelect(d.experimentId))
      .append('title')
      .text((d) => [
        d.title,
        `strain: ${d.strainName}`,
        d.batchMediaName ? `batch media: ${d.batchMediaName}` : null,
        `Y_p/s: ${d.yps.toFixed(3)}`,
        d.qpMax != null ? `qP_max: ${d.qpMax.toFixed(3)}` : null,
        d.qsMax != null ? `qS_max: ${d.qsMax.toFixed(3)}` : null,
      ].filter(Boolean).join('\n'))
  }, [points, selectedId, onSelect])

  return <svg ref={ref} className="w-full" />
}
```

- [ ] **Step 2: Verify and view**

```bash
npx tsc --noEmit
```
Expected: no errors.

```bash
npm run dev
```
Visit `/dashboard/analysis`, click Kinetics → Carbon flux. With a cohort selected and a product picked you should see a labeled scatter. Hover dots to confirm tooltips. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/CarbonFlux.tsx
git commit -m "feat(analysis): render cohort flux scatter (Y_p/s vs qP_max)

D3 SVG scatter, color by strain (Unknown=gray), tooltip with strain, batch
media, Y_p/s, qP_max, qS_max. Click handler is plumbed but the drilldown
target lands in the next commit."
```

---

### Task 9: Implement `ExperimentFluxDrilldown` (cumulative dual-line chart)

A second internal sub-component. Cumulative substrate-consumed (blue) and product-formed (orange, brand color `#eb5234`) on a shared time axis with phase shading. Hover crosshair shows running yield.

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`

- [ ] **Step 1: Add `ExperimentFluxDrilldown` and a fresh import for `useState` and `deriveDrilldownSeries`**

At the top of `CarbonFlux.tsx`, change:
```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { CohortPayload } from '@/lib/analysis/types'
import { deriveCohortFluxPoints, type CohortFluxPoint } from './carbonFluxLogic'
```
to:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload, ExperimentInPayload } from '@/lib/analysis/types'
import {
  deriveCohortFluxPoints,
  deriveDrilldownSeries,
  type CohortFluxPoint,
  type DrilldownSeries,
} from './carbonFluxLogic'
```

Append this sub-component to the bottom of `CarbonFlux.tsx`:

```tsx
interface DrilldownProps {
  experiment: ExperimentInPayload
  productName: string
}

function ExperimentFluxDrilldown({ experiment, productName }: DrilldownProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const data: DrilldownSeries | null = useMemo(
    () => deriveDrilldownSeries(experiment, productName),
    [experiment, productName],
  )

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const node = ref.current
    if (!node || !data) return

    const W = node.clientWidth || 720
    const H = 320
    const m = { top: 24, right: 24, bottom: 44, left: 64 }
    const iw = W - m.left - m.right
    const ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const allTimes = [...data.substrateConsumed.timepoints, ...data.productFormed.timepoints]
    const allVals  = [...data.substrateConsumed.cumulative, ...data.productFormed.cumulative]
    const x = d3.scaleLinear().domain([Math.min(...allTimes, 0), Math.max(...allTimes, 1)]).nice().range([0, iw])
    const y = d3.scaleLinear().domain([Math.min(0, ...allVals), Math.max(1, ...allVals)]).nice().range([ih, 0])

    // Phase shading
    const phaseColors: Record<string, string> = {
      lag:         '#fef3c7',
      exponential: '#dcfce7',
      stationary:  '#e0e7ff',
    }
    for (const ph of data.phases) {
      g.append('rect')
        .attr('x', x(ph.startTime))
        .attr('y', 0)
        .attr('width', Math.max(0, x(ph.endTime) - x(ph.startTime)))
        .attr('height', ih)
        .attr('fill', phaseColors[ph.name] ?? '#eee')
        .attr('opacity', 0.45)
    }

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))
    g.append('text')
      .attr('x', iw / 2).attr('y', ih + 36).attr('text-anchor', 'middle')
      .attr('fill', '#444').attr('font-size', 12).text('time (h)')
    g.append('text')
      .attr('transform', `translate(-46,${ih / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('fill', '#444').attr('font-size', 12)
      .text('cumulative mass (g/L)')

    const lineGen = d3.line<{ t: number; v: number }>()
      .x((d) => x(d.t)).y((d) => y(d.v))

    const sPoints = data.substrateConsumed.timepoints.map((t, i) => ({ t, v: data.substrateConsumed.cumulative[i] }))
    const pPoints = data.productFormed.timepoints.map((t, i) => ({ t, v: data.productFormed.cumulative[i] }))

    g.append('path').attr('d', lineGen(sPoints) ?? '')
      .attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 2)
    g.append('path').attr('d', lineGen(pPoints) ?? '')
      .attr('fill', 'none').attr('stroke', '#eb5234').attr('stroke-width', 2)

    // Inline legend
    g.append('text').attr('x', 8).attr('y', 16).attr('font-size', 11)
      .attr('fill', '#3b82f6').text(`substrate consumed (${data.substrateName})`)
    g.append('text').attr('x', 8).attr('y', 32).attr('font-size', 11)
      .attr('fill', '#eb5234').text(`product formed (${data.productName})`)

    // Hover crosshair
    const crosshair = g.append('line')
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', '#888').attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
    const tooltipBg = g.append('rect')
      .attr('rx', 4).attr('ry', 4).attr('fill', 'white').attr('stroke', '#ccc').attr('opacity', 0)
    const tooltipText = g.append('text')
      .attr('font-size', 11).attr('fill', '#222').attr('opacity', 0)

    const findNearest = (arr: { t: number; v: number }[], t: number) => {
      if (arr.length === 0) return null
      let best = arr[0]
      for (const p of arr) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
      return best
    }

    g.append('rect')
      .attr('width', iw).attr('height', ih)
      .attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this)
        const t = x.invert(mx)
        const nS = findNearest(sPoints, t)
        const nP = findNearest(pPoints, t)
        if (!nS || !nP) return
        const yps = nS.v > 0 ? (nP.v / nS.v) : null
        crosshair.attr('opacity', 1).attr('x1', mx).attr('x2', mx)
        const lines = [
          `t = ${t.toFixed(1)} h`,
          `S consumed: ${nS.v.toFixed(2)} g/L`,
          `P formed:   ${nP.v.toFixed(2)} g/L`,
          yps != null ? `Y_p/s(0..t): ${yps.toFixed(3)}` : 'Y_p/s(0..t): n/a',
        ]
        tooltipText.attr('x', mx + 8).attr('y', 16).attr('opacity', 1)
          .selectAll('tspan').remove()
        tooltipText.selectAll('tspan').data(lines).enter()
          .append('tspan').attr('x', mx + 8).attr('dy', (_, i) => i === 0 ? 0 : 14).text((d) => d)
        const bbox = (tooltipText.node() as SVGTextElement).getBBox()
        tooltipBg.attr('x', bbox.x - 4).attr('y', bbox.y - 2)
          .attr('width', bbox.width + 8).attr('height', bbox.height + 4)
          .attr('opacity', 0.9)
      })
      .on('mouseleave', () => {
        crosshair.attr('opacity', 0)
        tooltipText.attr('opacity', 0)
        tooltipBg.attr('opacity', 0)
      })
  }, [data])

  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        This experiment is missing biomass, substrate, or product data for the selected product.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-2">
      <svg ref={ref} className="w-full" />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/CarbonFlux.tsx
git commit -m "feat(analysis): render cumulative carbon-flux drilldown

Dual-line cumulative substrate consumed + product formed, shared time axis
with phase shading and hover crosshair showing running Y_p/s. Not yet wired
to scatter clicks — next commit."
```

---

### Task 10: Compose `CarbonFlux` — wire scatter clicks to drilldown selection

Connect the click handler from the scatter to drive a local `selectedId` state, then render `ExperimentFluxDrilldown` for the chosen experiment.

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`

- [ ] **Step 1: Replace the body of `CarbonFlux` to manage `selectedId`**

Replace the existing `CarbonFlux` function body (everything from `export function CarbonFlux` to the close of the function) with:

```tsx
export function CarbonFlux({ payload, product }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (!product) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Pick a product above to begin.
      </div>
    )
  }

  const { points, excluded } = useMemo(
    () => deriveCohortFluxPoints(payload, product),
    [payload, product],
  )

  // If the previously-selected experiment is no longer in the included set, drop the selection.
  useEffect(() => {
    if (selectedId !== null && !points.find((p) => p.experimentId === selectedId)) {
      setSelectedId(null)
    }
  }, [points, selectedId])

  if (points.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No experiments include biomass, substrate, and product data for {product}.
        ({excluded.length} excluded.)
      </div>
    )
  }

  const selectedExperiment =
    selectedId === null ? null : payload.experiments.find((e) => e.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <CohortFluxScatter
        points={points}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="text-xs text-gray-500">
        {points.length} of {payload.experiments.length} experiments included
        {excluded.length > 0 && ` · ${excluded.length} excluded`}
        <span className="ml-2 text-gray-400">· color = strain</span>
      </div>
      {selectedExperiment ? (
        <ExperimentFluxDrilldown experiment={selectedExperiment} productName={product} />
      ) : (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          Click a point above to inspect its substrate-vs-product trajectory.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify and click through**

```bash
npx tsc --noEmit
```
Expected: no errors.

```bash
npm run dev
```
Visit `/dashboard/analysis`, Kinetics theme, Carbon flux. Pick a product. Click any dot — the drilldown panel should appear below with two lines, phase shading, and a hover crosshair showing running yield. Click another dot — drilldown updates. Change product — selection clears if the prior experiment is no longer eligible. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analysis/CarbonFlux.tsx
git commit -m "feat(analysis): connect scatter selection to drilldown view

selectedId in local state, kept in sync with the eligible point set as the
product or cohort changes. Empty state when nothing is selected."
```

---

### Task 11: Final verification

**Files:** none modified.

- [ ] **Step 1: Whole-project typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```
Expected: build succeeds with no errors. Warnings about unused imports anywhere in `CarbonFlux.tsx` should be fixed.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```
With a cohort that has at least one experiment carrying biomass + substrate + product data:
- Kinetics → Carbon flux loads.
- OutcomePicker shows above the chart.
- Scatter renders with one dot per included experiment, colored by strain.
- Counter reads `N of M experiments included`.
- Click → drilldown shows two lines, phase shading, hover crosshair with running yield.
- Switch products → scatter and drilldown update; an experiment with no data for the new product disappears from the scatter.

Stop the dev server. No commit for this task.

---

## Out of scope (carry forward to a separate plan if desired)

- Volumetric (non-specific) rate toggle.
- Per-phase qS/qP table in the drilldown.
- Multi-experiment overlay in the drilldown.
- Backend pre-computation of qS / cumulative arrays in `outcomes_cache.py`.
- Persisting the drilldown selection in the URL via `useAnalysisState`.
