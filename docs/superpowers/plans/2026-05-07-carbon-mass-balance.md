# Carbon Mass Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Carbon Consumption, Carbon Flux, and Carbon Balance tabs to use a shared fed-batch mass-balance helper that incorporates `batch_volume_ml`, batch and feed media carbon concentrations, and the per-experiment feed-rate `process_data` series — with a graceful concentration-only fallback per experiment.

**Architecture:** A new pure-TypeScript helper module `carbonMassBalance.ts` exposes `computeMassBalance` and three lookup helpers. The three carbon logic files (and `CarbonBalance.tsx`'s inline math) call the helper; when any required input is missing they fall back to today's concentration-delta math and tag the row `'concentration-only'`. UI components show a warning chip in the fallback case. Frontend-only — no backend changes.

**Tech Stack:** TypeScript 5, React 19 (Next.js 16 App Router), D3 v7, `node:test` via `npx tsx --test` for unit tests.

**Spec:** `frontend/docs/superpowers/specs/2026-05-07-carbon-mass-balance-design.md`

**Test command:** `npx tsx --test <path/to/file.test.ts>` (no test script in `package.json`; the existing carbon tests use this invocation).

**Working tree note:** the frontend repo currently has many unrelated modified and untracked files (carbon-flux, ai-report, plate components, etc.). Every commit step in this plan stages **only specific paths** so unrelated work doesn't get pulled in.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/analysis/carbonMassBalance.ts` | Create | Pure helper: `pickFeedRateSeries`, `pickBatchCarbonConcentrationGperL`, `pickFeedCarbonConcentrationGperL`, `computeVolumeOverTime`, `computeMassBalance` |
| `frontend/src/lib/analysis/carbonMassBalance.test.ts` | Create | Unit tests for the helper |
| `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.ts` | Modify | Call `computeMassBalance`, add new fields to `CarbonConsumptionRow` |
| `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.test.ts` | Modify | Extend with mass-mode and concentration-fallback fixture cases |
| `frontend/src/components/dashboard/analysis/CarbonConsumption.tsx` | Modify | Render `concentration-only` chip + correct unit on Substrate consumed |
| `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts` | Modify | Use mass-mode `yps` and `qsMax`; drilldown substrate-consumed series in g |
| `frontend/src/components/dashboard/analysis/carbonFluxLogic.test.ts` | Modify | Extend cohort and drilldown tests for mass mode + fallback |
| `frontend/src/components/dashboard/analysis/CarbonFlux.tsx` | Modify | Counter strip footer extension + hatched halo on concentration-only dots |
| `frontend/src/components/dashboard/analysis/CarbonBalance.tsx` | Modify | Add a third view mode "Carbon balance" that renders carbon-mass slices and an unaccounted slice using `computeMassBalance` |

---

## Phase 1 — Helper module

### Task 1: Skeleton, types, and `pickFeedRateSeries`

**Files:**
- Create: `frontend/src/lib/analysis/carbonMassBalance.ts`
- Create: `frontend/src/lib/analysis/carbonMassBalance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/analysis/carbonMassBalance.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ExperimentInPayload, TimeSeriesEntry } from './types'
import { pickFeedRateSeries } from './carbonMassBalance'

const series = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'] = null,
  values: number[] = [0, 5],
  timepoints: number[] = [0, 10],
): TimeSeriesEntry => ({
  category, name, role,
  unit: 'mL/h',
  timepoints_h: timepoints,
  values,
})

const baseExperiment = (overrides: Partial<ExperimentInPayload> = {}): ExperimentInPayload => ({
  id: 1, title: 'Ferm 1', date: null, project_id: 1, strain: null,
  batch_media: null, feed_media: null,
  batch_volume_ml: null,
  feed_pump_series: '',
  waste_pump_series: '',
  variables: [],
  outcomes: {
    final_titer: {}, max_titer: {}, productivity: {},
    yps: {}, ypx: {}, biomass: null, mu_max: null, substrate_rate: null,
  },
  time_series: [],
  ...overrides,
})

describe('pickFeedRateSeries', () => {
  it('returns the matching process_data series when feed_pump_series matches a name', () => {
    const exp = baseExperiment({
      feed_pump_series: 'dm_spump2',
      time_series: [
        series('process_data', 'dm_spump2', null, [0, 5]),
        series('process_data', 'pH', null, [7, 7]),
      ],
    })
    const result = pickFeedRateSeries(exp)
    assert.equal(result?.name, 'dm_spump2')
  })

  it('returns null when feed_pump_series is empty or whitespace', () => {
    const exp = baseExperiment({
      feed_pump_series: '   ',
      time_series: [series('process_data', 'dm_spump2')],
    })
    assert.equal(pickFeedRateSeries(exp), null)
  })

  it('returns null when no series matches the tag', () => {
    const exp = baseExperiment({
      feed_pump_series: 'dm_spump2',
      time_series: [series('process_data', 'pH')],
    })
    assert.equal(pickFeedRateSeries(exp), null)
  })

  it('ignores series whose category is not process_data', () => {
    const exp = baseExperiment({
      feed_pump_series: 'dm_spump2',
      time_series: [series('product', 'dm_spump2')],
    })
    assert.equal(pickFeedRateSeries(exp), null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: FAIL with `Cannot find module './carbonMassBalance'`.

- [ ] **Step 3: Create the helper module skeleton with `pickFeedRateSeries`**

Create `frontend/src/lib/analysis/carbonMassBalance.ts`:

```ts
import type { ExperimentInPayload, MediaInPayload, TimeSeriesEntry } from './types'

export type MassBalanceMode = 'mass' | 'concentration-only'

export interface MassBalanceMissingInputs {
  feedRateSeries: boolean
  batchVolume: boolean
  batchCarbonConcentration: boolean
  feedCarbonConcentration: boolean
}

export interface MassBalanceSeries {
  timepoints_h: number[]
  valuesG: number[]
}

export interface VolumeSeries {
  timepoints_h: number[]
  valuesML: number[]
}

export interface MassBalanceResult {
  mode: MassBalanceMode
  missing: MassBalanceMissingInputs
  volumeML: VolumeSeries
  massAddedG: MassBalanceSeries
  massRemainingG: MassBalanceSeries
  massConsumedG: MassBalanceSeries
  carbonConsumedG: MassBalanceSeries
  scalars: {
    massConsumedFinalG: number | null
    carbonConsumedFinalG: number | null
    initialCarbonG: number | null
    fedCarbonFinalG: number | null
  }
}

export interface MassBalanceInputs {
  experiment: ExperimentInPayload
  substrate: TimeSeriesEntry
}

export function pickFeedRateSeries(exp: ExperimentInPayload): TimeSeriesEntry | null {
  const tag = exp.feed_pump_series?.trim()
  if (!tag) return null
  return exp.time_series.find(
    (s) => s.category === 'process_data' && s.name === tag,
  ) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/analysis/carbonMassBalance.ts src/lib/analysis/carbonMassBalance.test.ts
git commit -m "feat(analysis): scaffold carbonMassBalance with feed-rate picker"
```

---

### Task 2: Media concentration lookups

**Files:**
- Modify: `frontend/src/lib/analysis/carbonMassBalance.ts`
- Modify: `frontend/src/lib/analysis/carbonMassBalance.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `frontend/src/lib/analysis/carbonMassBalance.test.ts`:

```ts
import {
  pickBatchCarbonConcentrationGperL,
  pickFeedCarbonConcentrationGperL,
} from './carbonMassBalance'
import type { MediaInPayload } from './types'

const media = (overrides: Partial<MediaInPayload> = {}): MediaInPayload => ({
  id: 1, name: 'M', type: 'batch',
  carbon_sources: [],
  nitrogen_sources: [],
  complex_components: [],
  additional_components: [],
  ...overrides,
})

describe('pickBatchCarbonConcentrationGperL', () => {
  it('converts 2.5% (w/v) Glucose to 25 g/L', () => {
    const m = media({
      carbon_sources: [{ name: 'Glucose', concentration: 2.5, molecular_weight: 180.16 }],
    })
    assert.equal(pickBatchCarbonConcentrationGperL(m, 'Glucose'), 25)
  })

  it('matches case-insensitively', () => {
    const m = media({
      carbon_sources: [{ name: 'GLUCOSE', concentration: 2, molecular_weight: 180.16 }],
    })
    assert.equal(pickBatchCarbonConcentrationGperL(m, 'glucose'), 20)
  })

  it('uses only the matching carbon source when media has multiple', () => {
    const m = media({
      carbon_sources: [
        { name: 'Glucose', concentration: 2, molecular_weight: 180.16 },
        { name: 'Glycerol', concentration: 5, molecular_weight: 92.09 },
      ],
    })
    assert.equal(pickBatchCarbonConcentrationGperL(m, 'Glycerol'), 50)
  })

  it('returns null when media is null', () => {
    assert.equal(pickBatchCarbonConcentrationGperL(null, 'Glucose'), null)
  })

  it('returns null when no carbon source matches the substrate name', () => {
    const m = media({
      carbon_sources: [{ name: 'Glucose', concentration: 2, molecular_weight: 180.16 }],
    })
    assert.equal(pickBatchCarbonConcentrationGperL(m, 'Glycerol'), null)
  })

  it('returns null when concentration is null', () => {
    const m = media({
      carbon_sources: [{ name: 'Glucose', concentration: null, molecular_weight: 180.16 }],
    })
    assert.equal(pickBatchCarbonConcentrationGperL(m, 'Glucose'), null)
  })
})

describe('pickFeedCarbonConcentrationGperL', () => {
  it('uses the same logic as the batch picker', () => {
    const m = media({
      carbon_sources: [{ name: 'Glucose', concentration: 50, molecular_weight: 180.16 }],
    })
    assert.equal(pickFeedCarbonConcentrationGperL(m, 'Glucose'), 500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: FAIL — `pickBatchCarbonConcentrationGperL` is not exported.

- [ ] **Step 3: Add the picker functions**

Append to `frontend/src/lib/analysis/carbonMassBalance.ts`:

```ts
const PCT_W_V_TO_G_PER_L = 10  // 1% (w/v) = 10 g/L

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function pickConcentrationGperL(
  media: MediaInPayload | null, substrateName: string,
): number | null {
  if (!media) return null
  const target = normalize(substrateName)
  const entry = media.carbon_sources.find((cs) => normalize(cs.name) === target)
  if (!entry || entry.concentration == null) return null
  return entry.concentration * PCT_W_V_TO_G_PER_L
}

export function pickBatchCarbonConcentrationGperL(
  media: MediaInPayload | null, substrateName: string,
): number | null {
  return pickConcentrationGperL(media, substrateName)
}

export function pickFeedCarbonConcentrationGperL(
  media: MediaInPayload | null, substrateName: string,
): number | null {
  return pickConcentrationGperL(media, substrateName)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: all picker tests pass (the 4 from Task 1 still pass too).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/analysis/carbonMassBalance.ts src/lib/analysis/carbonMassBalance.test.ts
git commit -m "feat(analysis): add batch/feed media carbon concentration pickers"
```

---

### Task 3: `computeVolumeOverTime` and `trapCumulative`

**Files:**
- Modify: `frontend/src/lib/analysis/carbonMassBalance.ts`
- Modify: `frontend/src/lib/analysis/carbonMassBalance.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `frontend/src/lib/analysis/carbonMassBalance.test.ts`:

```ts
import { computeVolumeOverTime } from './carbonMassBalance'

describe('computeVolumeOverTime', () => {
  it('returns [V_batch] at t=0 when feed is null', () => {
    const v = computeVolumeOverTime(800, null)
    assert.deepEqual(v.timepoints_h, [0])
    assert.deepEqual(v.valuesML, [800])
  })

  it('returns [V_batch] at t=0 when feed series is empty', () => {
    const v = computeVolumeOverTime(800, {
      category: 'process_data', name: 'dm_spump2', role: null,
      unit: 'mL/h', timepoints_h: [], values: [],
    })
    assert.deepEqual(v.timepoints_h, [0])
    assert.deepEqual(v.valuesML, [800])
  })

  it('integrates a constant 5 mL/h feed for 10h to V(10) = 850', () => {
    const v = computeVolumeOverTime(800, {
      category: 'process_data', name: 'dm_spump2', role: null,
      unit: 'mL/h',
      timepoints_h: [0, 5, 10],
      values: [5, 5, 5],
    })
    assert.deepEqual(v.timepoints_h, [0, 5, 10])
    assert.equal(v.valuesML[0], 800)
    assert.equal(v.valuesML[1], 825)
    assert.equal(v.valuesML[2], 850)
  })

  it('clamps negative feed values to zero in the cumulative integral', () => {
    const v = computeVolumeOverTime(800, {
      category: 'process_data', name: 'dm_spump2', role: null,
      unit: 'mL/h',
      timepoints_h: [0, 1, 2],
      values: [10, -5, 10],
    })
    // step 1: avg(10, -5) = 2.5 → clamp 0 step? Plan: clamp the step contribution,
    // not the input. Using avg-then-clamp: max(0, 2.5) * 1 = 2.5; max(0, 2.5) * 1 = 2.5.
    // (Behavior: we clamp negative *step contributions* to 0, not the raw values.)
    assert.equal(v.valuesML[0], 800)
    assert.equal(v.valuesML[1], 802.5)
    assert.equal(v.valuesML[2], 805)
  })

  it('integrates non-uniform timepoints via trapezoid', () => {
    const v = computeVolumeOverTime(0, {
      category: 'process_data', name: 'dm_spump2', role: null,
      unit: 'mL/h',
      timepoints_h: [0, 2, 5],
      values: [0, 10, 10],
    })
    // step 1: avg(0,10)=5, dt=2 → +10. step 2: avg(10,10)=10, dt=3 → +30.
    assert.deepEqual(v.valuesML, [0, 10, 40])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: FAIL — `computeVolumeOverTime` not exported.

- [ ] **Step 3: Add the integrator**

Append to `frontend/src/lib/analysis/carbonMassBalance.ts`:

```ts
function trapCumulative(
  timepoints_h: number[], rates: number[],
): number[] {
  const out: number[] = new Array(timepoints_h.length).fill(0)
  for (let i = 1; i < timepoints_h.length; i++) {
    const dt = timepoints_h[i] - timepoints_h[i - 1]
    const avg = (rates[i] + rates[i - 1]) / 2
    out[i] = out[i - 1] + Math.max(0, avg * dt)   // clamp negative step contribution
  }
  return out
}

export function computeVolumeOverTime(
  V_batch_ml: number, feed: TimeSeriesEntry | null,
): VolumeSeries {
  if (!feed || feed.timepoints_h.length === 0) {
    return { timepoints_h: [0], valuesML: [V_batch_ml] }
  }
  const cum = trapCumulative(feed.timepoints_h, feed.values)
  return {
    timepoints_h: feed.timepoints_h,
    valuesML: cum.map((c) => V_batch_ml + c),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: all tests pass (Task 1, Task 2, and Task 3 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/analysis/carbonMassBalance.ts src/lib/analysis/carbonMassBalance.test.ts
git commit -m "feat(analysis): add computeVolumeOverTime trapezoidal integrator"
```

---

### Task 4: `computeMassBalance` happy path

**Files:**
- Modify: `frontend/src/lib/analysis/carbonMassBalance.ts`
- Modify: `frontend/src/lib/analysis/carbonMassBalance.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `frontend/src/lib/analysis/carbonMassBalance.test.ts`:

```ts
import { computeMassBalance } from './carbonMassBalance'

const glucoseBatchMedia = (concentrationPct: number | null): MediaInPayload => media({
  carbon_sources: concentrationPct == null
    ? []
    : [{ name: 'Glucose', concentration: concentrationPct, molecular_weight: 180.16 }],
})

const glucoseFeedMedia = (concentrationPct: number | null): MediaInPayload => media({
  carbon_sources: concentrationPct == null
    ? []
    : [{ name: 'Glucose', concentration: concentrationPct, molecular_weight: 180.16 }],
})

describe('computeMassBalance — mass mode happy path', () => {
  it('integrates feed addition and substrate consumption into a real mass balance', () => {
    const exp = baseExperiment({
      batch_volume_ml: 800,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),       // 20 g/L → 16 g initial
      feed_media: glucoseFeedMedia(50),        // 500 g/L
      time_series: [
        // Feed at 5 mL/h from t=0 to t=24
        series('process_data', 'dm_spump2', null, [5, 5, 5], [0, 12, 24]),
        // Substrate measured: starts at 20, drops to 8 at t=12, 2 at t=24
        series('process_data', 'Glucose', 'substrate', [20, 8, 2], [0, 12, 24]),
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })

    assert.equal(result.mode, 'mass')
    assert.equal(result.missing.batchVolume, false)
    assert.equal(result.missing.batchCarbonConcentration, false)
    assert.equal(result.missing.feedRateSeries, false)
    assert.equal(result.missing.feedCarbonConcentration, false)

    // Initial carbon mass: 0.8 L × 20 g/L × 0.4 (glucose carbon fraction) ≈ 6.4
    assert.equal(result.scalars.initialCarbonG?.toFixed(2), '6.40')

    // Total fed glucose: ∫5 mL/h × 0.5 g/mL dt over 24h = 60g; carbon = 60 × 0.4 = 24
    assert.equal(result.scalars.fedCarbonFinalG?.toFixed(2), '24.00')

    // m_consumed should be monotonically non-decreasing
    const consumed = result.massConsumedG.valuesG
    for (let i = 1; i < consumed.length; i++) {
      assert.ok(consumed[i] >= consumed[i - 1] - 1e-9,
        `consumed not monotone at i=${i}: ${consumed[i]} < ${consumed[i - 1]}`)
    }
    assert.ok((result.scalars.massConsumedFinalG ?? 0) > 16,
      'expected > initial 16g consumed (because feed added more glucose that was also consumed)')
  })

  it('treats missing feed rate as F=0 (batch-only) but still mass mode', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      feed_media: null,
      time_series: [
        series('process_data', 'Glucose', 'substrate', [20, 5], [0, 24]),
        // no dm_spump2 process_data series
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })

    assert.equal(result.mode, 'mass')
    assert.equal(result.missing.feedRateSeries, true)
    assert.equal(result.scalars.fedCarbonFinalG, 0)
    // m_consumed_final ≈ V_batch × (S_0 − S_final) = 1.0 × 15 = 15g
    assert.equal(result.scalars.massConsumedFinalG?.toFixed(2), '15.00')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: FAIL — `computeMassBalance` not exported.

- [ ] **Step 3: Implement `computeMassBalance`**

Append to `frontend/src/lib/analysis/carbonMassBalance.ts`:

```ts
import { carbonFractionForCompound } from '../../components/dashboard/analysis/carbonConsumptionLogic'

function lastOrNull(values: number[]): number | null {
  return values.length === 0 ? null : values[values.length - 1]
}

function interpolateAtTime(
  timepoints: number[], values: number[], t: number,
): number {
  if (timepoints.length === 0) return 0
  if (t <= timepoints[0]) return values[0]
  if (t >= timepoints[timepoints.length - 1]) return values[values.length - 1]
  for (let i = 1; i < timepoints.length; i++) {
    if (t <= timepoints[i]) {
      const t0 = timepoints[i - 1]
      const t1 = timepoints[i]
      const v0 = values[i - 1]
      const v1 = values[i]
      const fraction = (t - t0) / (t1 - t0)
      return v0 + fraction * (v1 - v0)
    }
  }
  return values[values.length - 1]
}

function emptyMassSeries(): MassBalanceSeries {
  return { timepoints_h: [], valuesG: [] }
}

function emptyVolumeSeries(): VolumeSeries {
  return { timepoints_h: [], valuesML: [] }
}

function concentrationOnlyResult(missing: MassBalanceMissingInputs): MassBalanceResult {
  return {
    mode: 'concentration-only',
    missing,
    volumeML: emptyVolumeSeries(),
    massAddedG: emptyMassSeries(),
    massRemainingG: emptyMassSeries(),
    massConsumedG: emptyMassSeries(),
    carbonConsumedG: emptyMassSeries(),
    scalars: {
      massConsumedFinalG: null,
      carbonConsumedFinalG: null,
      initialCarbonG: null,
      fedCarbonFinalG: null,
    },
  }
}

export function computeMassBalance(
  { experiment, substrate }: MassBalanceInputs,
): MassBalanceResult {
  const feed = pickFeedRateSeries(experiment)
  const batchC = pickBatchCarbonConcentrationGperL(experiment.batch_media, substrate.name)
  const feedC = pickFeedCarbonConcentrationGperL(experiment.feed_media, substrate.name)
  const V_batch = experiment.batch_volume_ml ?? null

  const missing: MassBalanceMissingInputs = {
    feedRateSeries: feed == null,
    batchVolume: V_batch == null,
    batchCarbonConcentration: batchC == null,
    feedCarbonConcentration: feedC == null,
  }

  const canDoMass =
    V_batch != null && batchC != null && substrate.timepoints_h.length >= 2

  if (!canDoMass) {
    return concentrationOnlyResult(missing)
  }

  const V = computeVolumeOverTime(V_batch, feed)

  // Initial substrate mass in batch (g)
  const initialMassG = (V_batch / 1000) * batchC

  // Cumulative fed mass, evaluated on feed timepoints (grams)
  const fedCum: number[] =
    feed != null && feedC != null
      ? trapCumulative(feed.timepoints_h, feed.values.map((r) => r * (feedC / 1000)))
      : feed != null
        ? new Array(feed.timepoints_h.length).fill(0)
        : [0]

  const massAddedTimepoints = feed != null ? feed.timepoints_h : [0]
  const massAddedValues = fedCum.map((f) => initialMassG + f)
  const massAdded: MassBalanceSeries = {
    timepoints_h: massAddedTimepoints,
    valuesG: massAddedValues,
  }

  // mass remaining at substrate timepoints: V(t) * S(t) / 1000
  const massRemainingValues = substrate.timepoints_h.map((t, i) => {
    const V_t_ml = interpolateAtTime(V.timepoints_h, V.valuesML, t)
    return (V_t_ml / 1000) * substrate.values[i]
  })
  const massRemaining: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: massRemainingValues,
  }

  // mass consumed = added(t) − remaining(t), evaluated on substrate timepoints
  const massConsumedValues = substrate.timepoints_h.map((t, i) => {
    const added_t = interpolateAtTime(massAdded.timepoints_h, massAdded.valuesG, t)
    return Math.max(0, added_t - massRemainingValues[i])
  })
  const massConsumed: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: massConsumedValues,
  }

  const fC = carbonFractionForCompound(substrate.name) ?? null
  const carbonConsumed: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: fC != null ? massConsumedValues.map((m) => m * fC) : [],
  }

  return {
    mode: 'mass',
    missing,
    volumeML: V,
    massAddedG: massAdded,
    massRemainingG: massRemaining,
    massConsumedG: massConsumed,
    carbonConsumedG: carbonConsumed,
    scalars: {
      massConsumedFinalG: lastOrNull(massConsumedValues),
      carbonConsumedFinalG: fC != null ? (lastOrNull(massConsumedValues) ?? 0) * fC : null,
      initialCarbonG: initialMassG * (fC ?? 1),
      fedCarbonFinalG: fC != null ? (lastOrNull(fedCum) ?? 0) * fC : null,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: all happy-path tests pass (Tasks 1–4).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/analysis/carbonMassBalance.ts src/lib/analysis/carbonMassBalance.test.ts
git commit -m "feat(analysis): implement computeMassBalance happy path"
```

---

### Task 5: `computeMassBalance` fallbacks and numerical safety

**Files:**
- Modify: `frontend/src/lib/analysis/carbonMassBalance.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `frontend/src/lib/analysis/carbonMassBalance.test.ts`:

```ts
describe('computeMassBalance — fallbacks and safety', () => {
  it('falls back to concentration-only when batch_volume_ml is missing', () => {
    const exp = baseExperiment({
      batch_volume_ml: null,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      time_series: [series('process_data', 'Glucose', 'substrate', [20, 5], [0, 24])],
    })
    const substrate = exp.time_series[0]
    const result = computeMassBalance({ experiment: exp, substrate })
    assert.equal(result.mode, 'concentration-only')
    assert.equal(result.missing.batchVolume, true)
    assert.equal(result.scalars.massConsumedFinalG, null)
  })

  it('falls back to concentration-only when batch carbon concentration is missing', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      batch_media: glucoseBatchMedia(null),
      time_series: [series('process_data', 'Glucose', 'substrate', [20, 5], [0, 24])],
    })
    const result = computeMassBalance({ experiment: exp, substrate: exp.time_series[0] })
    assert.equal(result.mode, 'concentration-only')
    assert.equal(result.missing.batchCarbonConcentration, true)
  })

  it('stays in mass mode when only feed media carbon concentration is missing', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      feed_media: glucoseFeedMedia(null),
      time_series: [
        series('process_data', 'dm_spump2', null, [5, 5], [0, 24]),
        series('process_data', 'Glucose', 'substrate', [20, 5], [0, 24]),
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })
    assert.equal(result.mode, 'mass')
    assert.equal(result.missing.feedCarbonConcentration, true)
    assert.equal(result.scalars.fedCarbonFinalG, 0)
  })

  it('falls back to concentration-only when substrate has fewer than 2 timepoints', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      batch_media: glucoseBatchMedia(2),
      time_series: [series('process_data', 'Glucose', 'substrate', [20], [0])],
    })
    const result = computeMassBalance({ experiment: exp, substrate: exp.time_series[0] })
    assert.equal(result.mode, 'concentration-only')
  })

  it('clamps m_consumed to 0 when measurement noise makes m_remaining > m_added', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      feed_media: glucoseFeedMedia(50),
      time_series: [
        series('process_data', 'dm_spump2', null, [5, 5], [0, 24]),
        // Substrate spuriously rises above starting concentration at t=12
        series('process_data', 'Glucose', 'substrate', [20, 25, 5], [0, 12, 24]),
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })
    for (const v of result.massConsumedG.valuesG) {
      assert.ok(v >= 0, `expected non-negative m_consumed, got ${v}`)
      assert.ok(Number.isFinite(v), `expected finite m_consumed, got ${v}`)
    }
  })

  it('handles a negative feed-rate spike without producing NaN', () => {
    const exp = baseExperiment({
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      feed_media: glucoseFeedMedia(50),
      time_series: [
        series('process_data', 'dm_spump2', null, [5, -10, 5], [0, 12, 24]),
        series('process_data', 'Glucose', 'substrate', [20, 8, 2], [0, 12, 24]),
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })
    for (const v of result.volumeML.valuesML) assert.ok(Number.isFinite(v))
    for (const v of result.massConsumedG.valuesG) assert.ok(Number.isFinite(v))
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: all tests pass (no implementation changes needed — Task 4 already covers these branches; this task is verification).

- [ ] **Step 3: If any test fails, fix `computeMassBalance` and re-run**

If the safety tests reveal a bug in the implementation, fix it in `carbonMassBalance.ts` and re-run. Otherwise skip to commit.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/lib/analysis/carbonMassBalance.test.ts src/lib/analysis/carbonMassBalance.ts
git commit -m "test(analysis): cover mass balance fallbacks and numerical safety"
```

---

## Phase 2 — Carbon Consumption integration

### Task 6: `carbonConsumptionLogic.ts` — wire helper into `CarbonConsumptionRow`

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.ts`
- Modify: `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.test.ts`:

```ts
describe('buildCarbonConsumptionRows — mass mode', () => {
  it('produces mass-based fields when batch volume + media + feed are present', () => {
    const exp: ExperimentInPayload = {
      ...experiment(),
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: {
        id: 1, name: 'Batch A', type: 'batch',
        carbon_sources: [{ name: 'Glucose', concentration: 2, molecular_weight: 180.16 }],
        nitrogen_sources: [], complex_components: [], additional_components: [],
      },
      feed_media: {
        id: 2, name: 'Feed A', type: 'feed',
        carbon_sources: [{ name: 'Glucose', concentration: 50, molecular_weight: 180.16 }],
        nitrogen_sources: [], complex_components: [], additional_components: [],
      },
      time_series: [
        series('process_data', 'dm_spump2', null, [5, 5]),
        series('process_data', 'Glucose', 'substrate', [20, 5]),
        series('product', 'CBDa', null, [0, 2]),
        series('process_data', 'DCW', 'biomass', [0, 4]),
      ],
    }
    const [row] = buildCarbonConsumptionRows(payload([exp]), 'CBDa')
    assert.equal(row.massBalanceMode, 'mass')
    assert.ok((row.substrateConsumedG ?? 0) > 0,
      'expected substrateConsumedG > 0 in mass mode')
    assert.ok((row.carbonConsumedG ?? 0) > 0)
  })

  it('falls back to concentration-only when batch_volume_ml is null', () => {
    const exp: ExperimentInPayload = {
      ...experiment(),
      batch_volume_ml: null,
      batch_media: null,
      time_series: [
        series('process_data', 'Glucose', 'substrate', [20, 5]),
        series('product', 'CBDa', null, [0, 2]),
        series('process_data', 'DCW', 'biomass', [0, 4]),
      ],
    }
    const [row] = buildCarbonConsumptionRows(payload([exp]), 'CBDa')
    assert.equal(row.massBalanceMode, 'concentration-only')
    assert.equal(row.massBalanceMissing.batchVolume, true)
    // legacy g/L field still populated
    assert.equal(row.substrateConsumed, 15)
    assert.equal(row.substrateConsumedG, null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx tsx --test src/components/dashboard/analysis/carbonConsumptionLogic.test.ts`
Expected: FAIL with property `massBalanceMode` not on the row type.

- [ ] **Step 3: Extend the `CarbonConsumptionRow` interface and integrate the helper**

In `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.ts`, add the new imports near the top:

```ts
import {
  computeMassBalance,
  type MassBalanceMissingInputs,
  type MassBalanceMode,
} from '../../../lib/analysis/carbonMassBalance'
```

Update the `CarbonConsumptionRow` interface — add three fields:

```ts
export interface CarbonConsumptionRow {
  experimentId: number
  title: string
  strain: string | null
  batchMedia: string | null
  feedMedia: string | null
  substrateName: string | null
  substrateConsumed: number | null            // legacy g/L delta
  substrateConsumedG: number | null           // NEW: mass mode only
  elapsedHours: number | null
  uptakeRate: number | null
  targetProduct: string
  targetDelta: number | null
  targetFinalTiter: number | null
  targetProductivity: number | null
  apparentConversion: number | null
  carbonConversion: number | null
  carbonConsumed: number | null               // legacy
  carbonConsumedG: number | null              // NEW: mass mode only
  targetCarbon: number | null
  allocations: {
    apparent: CarbonAllocation
    carbon: CarbonAllocation
  }
  warnings: string[]
  massBalanceMode: MassBalanceMode            // NEW
  massBalanceMissing: MassBalanceMissingInputs // NEW
}
```

Inside `buildCarbonConsumptionRow`, after the `substrate` is selected and before the `return`, insert:

```ts
let massBalanceMode: MassBalanceMode = 'concentration-only'
let massBalanceMissing: MassBalanceMissingInputs = {
  feedRateSeries: true,
  batchVolume: exp.batch_volume_ml == null,
  batchCarbonConcentration: true,
  feedCarbonConcentration: true,
}
let substrateConsumedG: number | null = null
let carbonConsumedG: number | null = null

if (substrate) {
  const balance = computeMassBalance({ experiment: exp, substrate })
  massBalanceMode = balance.mode
  massBalanceMissing = balance.missing
  if (balance.mode === 'mass') {
    substrateConsumedG = balance.scalars.massConsumedFinalG
    carbonConsumedG = balance.scalars.carbonConsumedFinalG
    if (massBalanceMissing.feedRateSeries) {
      warnings.push('feed rate series missing; treated as batch-only')
    }
    if (massBalanceMissing.feedCarbonConcentration) {
      warnings.push('feed carbon concentration missing; fed carbon not counted')
    }
  } else {
    if (massBalanceMissing.batchVolume) {
      warnings.push('batch volume missing; falling back to concentration-only')
    }
    if (massBalanceMissing.batchCarbonConcentration) {
      warnings.push('batch carbon concentration missing; falling back to concentration-only')
    }
  }
}
```

Then in the `return { ... }` object, add the new fields:

```ts
return {
  // ...existing fields...
  substrateConsumedG,
  carbonConsumedG,
  massBalanceMode,
  massBalanceMissing,
  // ...rest of existing fields...
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/components/dashboard/analysis/carbonConsumptionLogic.test.ts`
Expected: all tests pass — both the new mass-mode tests and the existing 4.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/components/dashboard/analysis/carbonConsumptionLogic.ts src/components/dashboard/analysis/carbonConsumptionLogic.test.ts
git commit -m "feat(analysis): mass-mode fields on CarbonConsumptionRow"
```

---

### Task 7: `CarbonConsumption.tsx` — render warning chip and unit on substrate

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonConsumption.tsx`

- [ ] **Step 1: Read the existing component**

Read `frontend/src/components/dashboard/analysis/CarbonConsumption.tsx` to find the row-rendering JSX and the column header for "Substrate consumed". Note the line numbers before editing.

- [ ] **Step 2: Add the warning chip helper**

Near the top of the file (after the `allocationColors` constant), add this small component:

```tsx
function MassBalanceChip({
  mode,
  missing,
}: {
  mode: 'mass' | 'concentration-only'
  missing: { feedRateSeries: boolean; batchVolume: boolean
             batchCarbonConcentration: boolean; feedCarbonConcentration: boolean }
}) {
  if (mode === 'mass' && !missing.feedCarbonConcentration && !missing.feedRateSeries) {
    return null
  }
  const label = mode === 'concentration-only' ? 'concentration-only' : 'feed not counted'
  const tone = mode === 'concentration-only'
    ? 'bg-gray-100 text-gray-700'
    : 'bg-amber-50 text-amber-800'
  const reasons: string[] = []
  if (missing.batchVolume) reasons.push('batch volume')
  if (missing.batchCarbonConcentration) reasons.push('batch carbon concentration')
  if (missing.feedRateSeries) reasons.push('feed rate series')
  if (missing.feedCarbonConcentration) reasons.push('feed carbon concentration')
  return (
    <span
      className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}
      title={`Missing inputs: ${reasons.join(', ') || 'none'}`}
    >
      {label}
    </span>
  )
}
```

- [ ] **Step 3: Render the chip on each row's title cell**

Find the JSX that renders the experiment title cell in the rows table. Wrap the title with the chip:

```tsx
<td className="...existing classes...">
  {row.title}
  <MassBalanceChip mode={row.massBalanceMode} missing={row.massBalanceMissing} />
</td>
```

- [ ] **Step 4: Update the "Substrate consumed" header tooltip**

Find the `<th>` (or label) for the Substrate consumed column. Add a `title` attribute:

```tsx
<th
  className="...existing classes..."
  title="Mass (g) when batch volume and media concentration are known. Falls back to concentration delta (g/L) otherwise."
>
  Substrate consumed
</th>
```

- [ ] **Step 5: Render either g (mass mode) or g/L (fallback) per row**

Find the cell that today renders `row.substrateConsumed` (or `formatNumber(row.substrateConsumed)`). Replace with:

```tsx
<td className="...existing classes...">
  {row.massBalanceMode === 'mass' && row.substrateConsumedG != null
    ? `${row.substrateConsumedG.toFixed(2)} g`
    : row.substrateConsumed != null
      ? `${row.substrateConsumed.toFixed(2)} g/L`
      : '—'}
</td>
```

- [ ] **Step 6: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

Run: `cd frontend && npm run build`
Expected: build completes without errors.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/components/dashboard/analysis/CarbonConsumption.tsx
git commit -m "feat(analysis): mass-balance chip and unit on Carbon Consumption rows"
```

---

## Phase 3 — Carbon Flux integration

### Task 8: `carbonFluxLogic.ts` — mass-mode `yps`, `qsMax`, drilldown

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts`
- Modify: `frontend/src/components/dashboard/analysis/carbonFluxLogic.test.ts`

- [ ] **Step 1: Read existing file shape**

Read `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts` (already partly shown) to locate `CohortFluxPoint`, `deriveCohortFluxPoints`, and `deriveDrilldownSeries`.

- [ ] **Step 2: Append failing tests**

Append to `frontend/src/components/dashboard/analysis/carbonFluxLogic.test.ts`:

```ts
import type { CohortPayload, ExperimentInPayload, MediaInPayload, TimeSeriesEntry } from '../../../lib/analysis/types'
import { deriveCohortFluxPoints, deriveDrilldownSeries } from './carbonFluxLogic'

const seriesEntry = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'],
  values: number[],
  timepoints: number[] = [0, 12, 24],
): TimeSeriesEntry => ({
  category, name, role, unit: 'g/L', timepoints_h: timepoints, values,
})

const glucoseMedia = (id: number, type: string, pct: number | null): MediaInPayload => ({
  id, name: `M${id}`, type,
  carbon_sources: pct == null
    ? []
    : [{ name: 'Glucose', concentration: pct, molecular_weight: 180.16 }],
  nitrogen_sources: [], complex_components: [], additional_components: [],
})

const baseFluxExp = (overrides: Partial<ExperimentInPayload> = {}): ExperimentInPayload => ({
  id: 1, title: 'Ferm', date: null, project_id: 1,
  strain: { id: 1, name: 'S1', parent_strain: null, modifications: [] },
  batch_media: null, feed_media: null,
  batch_volume_ml: null, feed_pump_series: '', waste_pump_series: '',
  variables: [],
  outcomes: {
    final_titer: { CBDa: 2 }, max_titer: { CBDa: 2 }, productivity: { CBDa: 0.2 },
    yps: {}, ypx: {}, biomass: 4, mu_max: null, substrate_rate: null,
  },
  time_series: [],
  ...overrides,
})

describe('carbon flux — mass-mode integration', () => {
  it('marks cohort dot with massBalanceMode and uses mass-based yps when available', () => {
    const massExp = baseFluxExp({
      id: 10,
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseMedia(1, 'batch', 2),
      feed_media: glucoseMedia(2, 'feed', 50),
      time_series: [
        seriesEntry('process_data', 'dm_spump2', null, [5, 5, 5]),
        seriesEntry('process_data', 'Glucose', 'substrate', [20, 8, 2]),
        seriesEntry('product', 'CBDa', null, [0, 1, 2]),
        seriesEntry('process_data', 'DCW', 'biomass', [0, 2, 4]),
      ],
    })
    const concExp = baseFluxExp({
      id: 11,
      batch_volume_ml: null,
      feed_pump_series: '',
      batch_media: null, feed_media: null,
      time_series: [
        seriesEntry('process_data', 'Glucose', 'substrate', [20, 8, 2]),
        seriesEntry('product', 'CBDa', null, [0, 1, 2]),
        seriesEntry('process_data', 'DCW', 'biomass', [0, 2, 4]),
      ],
    })
    const payload: CohortPayload = {
      experiments: [massExp, concExp],
      products: ['CBDa'], role_map_version: 1, warnings: [],
    }
    const result = deriveCohortFluxPoints(payload, 'CBDa')
    const massPoint = result.points.find((p) => p.experimentId === massExp.id)
    const concPoint = result.points.find((p) => p.experimentId === concExp.id)
    assert.equal(massPoint?.massBalanceMode, 'mass')
    assert.equal(concPoint?.massBalanceMode, 'concentration-only')
  })

  it('drilldown substrate-consumed series uses cumulative grams in mass mode', () => {
    const massExp = baseFluxExp({
      id: 12,
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseMedia(1, 'batch', 2),
      feed_media: glucoseMedia(2, 'feed', 50),
      time_series: [
        seriesEntry('process_data', 'dm_spump2', null, [5, 5, 5]),
        seriesEntry('process_data', 'Glucose', 'substrate', [20, 8, 2]),
        seriesEntry('product', 'CBDa', null, [0, 1, 2]),
        seriesEntry('process_data', 'DCW', 'biomass', [0, 2, 4]),
      ],
    })
    const drilldown = deriveDrilldownSeries(massExp, 'CBDa')
    assert.ok(drilldown != null)
    assert.ok(drilldown!.substrateConsumed.cumulative.length > 0)
    const last = drilldown!.substrateConsumed.cumulative[
      drilldown!.substrateConsumed.cumulative.length - 1
    ]
    assert.ok(last > 0, `expected positive last cumulative grams, got ${last}`)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx tsx --test src/components/dashboard/analysis/carbonFluxLogic.test.ts`
Expected: FAIL with `massBalanceMode` not on `CohortFluxPoint`.

- [ ] **Step 4: Update the type and integrate the helper**

In `frontend/src/components/dashboard/analysis/carbonFluxLogic.ts`:

Add imports:

```ts
import {
  computeMassBalance,
  type MassBalanceMode,
} from '../../../lib/analysis/carbonMassBalance'
```

Extend `CohortFluxPoint`:

```ts
export interface CohortFluxPoint {
  experimentId: number
  title: string
  strainName: string
  batchMediaName: string | null
  yps: number
  qpMax: number | null
  qsMax: number | null
  massBalanceMode: MassBalanceMode    // NEW
}
```

Inside `deriveCohortFluxPoints`, after the `substrate`, `biomass`, and `product` are picked and basic exclusions applied, but before computing `yps`:

```ts
const balance = computeMassBalance({ experiment: exp, substrate })

let yps: number | null = null
let qsMaxValue: number | null = null

if (balance.mode === 'mass' && balance.scalars.massConsumedFinalG != null) {
  // V_final from the volume series
  const V_final_ml =
    balance.volumeML.valuesML[balance.volumeML.valuesML.length - 1]
    ?? exp.batch_volume_ml ?? 1000
  const productDelta =
    (product.values[product.values.length - 1] ?? 0) - (product.values[0] ?? 0)
  yps = (productDelta * (V_final_ml / 1000)) / balance.scalars.massConsumedFinalG

  // qS_max from the mass-consumed derivative divided by V(t) and X(t)
  qsMaxValue = computeQsMaxFromMassBalance(balance, biomass)   // helper added below
} else {
  yps = computeYpsOverall(product, substrate)
  const qS = computeQsMax(substrate, biomass)
  qsMaxValue = qS?.qsMax ?? null
}

if (yps === null) {
  excluded.push({ experimentId: exp.id, title: exp.title, reason: 'substrate did not decline' })
  continue
}
```

Then add a small helper near the top of the file:

```ts
function computeQsMaxFromMassBalance(
  balance: ReturnType<typeof computeMassBalance>,
  biomass: ReturnType<typeof findBiomassData>,
): number | null {
  if (balance.mode !== 'mass' || biomass == null) return null
  const t = balance.massConsumedG.timepoints_h
  const m = balance.massConsumedG.valuesG
  if (t.length < 2) return null
  let max = 0
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1]
    if (dt <= 0) continue
    const dm = m[i] - m[i - 1]
    const V_t_ml = balance.volumeML.valuesML[
      Math.min(i, balance.volumeML.valuesML.length - 1)
    ] ?? 1000
    const X_at_t = sampleAt(biomass.timepoints, biomass.values, t[i])
    if (X_at_t == null || X_at_t <= 0) continue
    const qs = (dm / dt) / (V_t_ml / 1000) / X_at_t
    if (qs > max) max = qs
  }
  return max > 0 ? max : null
}

function sampleAt(timepoints: number[], values: number[], t: number): number | null {
  if (timepoints.length === 0) return null
  if (t <= timepoints[0]) return values[0]
  if (t >= timepoints[timepoints.length - 1]) return values[values.length - 1]
  for (let i = 1; i < timepoints.length; i++) {
    if (t <= timepoints[i]) {
      const frac = (t - timepoints[i - 1]) / (timepoints[i] - timepoints[i - 1])
      return values[i - 1] + frac * (values[i] - values[i - 1])
    }
  }
  return values[values.length - 1]
}
```

In the existing `points.push({ ... })` call, add `massBalanceMode: balance.mode`.

In `deriveDrilldownSeries`, after picking biomass/substrate/product, compute the balance and override the `substrateConsumed` series when in mass mode:

```ts
const balance = computeMassBalance({ experiment: exp, substrate })

const substrateConsumed =
  balance.mode === 'mass'
    ? {
        timepoints: balance.massConsumedG.timepoints_h,
        cumulative: balance.massConsumedG.valuesG,
      }
    : computeCumulativeMassSeries(
        { timepoints: substrate.timepoints_h, values: substrate.values },
        'decrease',
      )
```

Replace the existing `substrateConsumed` field in the returned object with the new variable.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx tsx --test src/components/dashboard/analysis/carbonFluxLogic.test.ts`
Expected: all tests pass (existing + new).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/components/dashboard/analysis/carbonFluxLogic.ts src/components/dashboard/analysis/carbonFluxLogic.test.ts
git commit -m "feat(analysis): Carbon Flux uses mass-mode yps and qsMax when available"
```

---

### Task 9: `CarbonFlux.tsx` — counter strip + concentration-only halo

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`

- [ ] **Step 1: Read the component**

Read `frontend/src/components/dashboard/analysis/CarbonFlux.tsx`. Find:
- The counter line ("N of M experiments included · K excluded …").
- The d3 dot rendering inside `CohortFluxScatter` where each `CohortFluxPoint` becomes an SVG circle.

- [ ] **Step 2: Extend the counter strip with a concentration-only count**

Locate the counter rendering. Modify to compute and append the concentration-only count:

```tsx
const concOnlyCount = points.filter((p) => p.massBalanceMode === 'concentration-only').length
const massCount = points.length - concOnlyCount
return (
  <div className="text-xs text-gray-500 mt-2">
    {points.length} of {points.length + excluded.length} experiments included
    · {excluded.length} excluded
    {concOnlyCount > 0 && ` · ${concOnlyCount} shown with concentration-only fallback`}
  </div>
)
```

(Adapt to the existing JSX structure — the formatting of the counter line; do not invent a new component.)

- [ ] **Step 3: Add a halo to concentration-only dots in the scatter**

In the d3 dot rendering, after the existing `<circle>` for each point, conditionally append a halo ring with stripes:

```ts
selection
  .append('circle')
  .attr('cx', d => x(d.yps))
  .attr('cy', d => y(d.qpMax ?? 0))
  .attr('r', d => d.experimentId === selectedId ? 7 : 5)
  .attr('fill', d => color(d.strainName) as string)
  .attr('stroke', d => d.experimentId === selectedId ? '#000' : 'transparent')
  .attr('stroke-width', d => d.experimentId === selectedId ? 1.5 : 0)
  .attr('stroke-dasharray', d => d.massBalanceMode === 'concentration-only' ? '2,2' : null)
  .on('click', (_e, d) => onSelect(d.experimentId))
  .append('title')
  .text((d) =>
    `${d.title} (${d.strainName}) · qS_max=${d.qsMax?.toFixed(2) ?? '—'} · `
    + `qP_max=${d.qpMax?.toFixed(3) ?? '—'} · Y_p/s=${d.yps.toFixed(3)} · `
    + `${d.batchMediaName ?? '?'}`
    + (d.massBalanceMode === 'concentration-only' ? ' · [concentration-only]' : ''),
  )
```

> NOTE: keep the existing dot attributes — the only additions are `stroke-dasharray` and the appended note in the tooltip.

- [ ] **Step 4: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/dashboard/analysis/CarbonFlux.tsx
git commit -m "feat(analysis): mark Carbon Flux concentration-only dots and counter"
```

---

## Phase 4 — Carbon Balance integration

### Task 10: `CarbonBalance.tsx` — add a "Carbon balance" view mode with unaccounted slice

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CarbonBalance.tsx`

> Context: the current Carbon Balance tab has a `ViewMode` enum with `'stacked-final'` (active) and `'stacked-over-time'` (disabled placeholder). This task **adds a third mode** `'carbon-balance'` that renders carbon-mass slices and the unaccounted slice using `computeMassBalance`. The existing `'stacked-final'` mode is unchanged.

- [ ] **Step 1: Read the file**

Read `frontend/src/components/dashboard/analysis/CarbonBalance.tsx` (already partly shown; full file is short — ~120 lines).

- [ ] **Step 2: Extend `ViewMode` and the dropdown**

Replace the `type ViewMode` line:

```ts
type ViewMode = 'stacked-final' | 'carbon-balance' | 'stacked-over-time'
```

Inside the JSX, replace the `<select>` block to add the new option:

```tsx
<select value={mode} onChange={e => setMode(e.target.value as ViewMode)}
  className="h-8 px-2 border border-gray-200 rounded-md">
  <option value="stacked-final">Final mass (stacked)</option>
  <option value="carbon-balance">Carbon balance (with unaccounted)</option>
  <option value="stacked-over-time" disabled>Stacked over time (future)</option>
</select>
```

- [ ] **Step 3: Compute carbon-balance stacks via the helper**

At the top of the component file, add imports:

```ts
import { carbonFractionForCompound } from './carbonConsumptionLogic'
import {
  computeMassBalance,
  type MassBalanceMode,
} from '../../../lib/analysis/carbonMassBalance'
```

Inside the component, alongside the existing `finalStacks` `useMemo`, add a new memo:

```ts
type CarbonBalanceStack = {
  id: number
  title: string
  carbonProducts: Record<string, number>
  carbonByproducts: Record<string, number>
  carbonBiomass: number
  carbonConsumed: number | null    // total substrate-derived carbon
  unaccounted: number              // = carbonConsumed - sum(others), clamped to >= 0
  mode: MassBalanceMode
  warnings: string[]
}

const carbonStacks = useMemo<CarbonBalanceStack[]>(() => {
  return payload.experiments.map((e) => {
    const g = groupSeries(e)
    const substrate = e.time_series.find((s) => s.role === 'substrate') ?? null
    let carbonConsumed: number | null = null
    let mode: MassBalanceMode = 'concentration-only'
    const warnings: string[] = []
    if (substrate) {
      const balance = computeMassBalance({ experiment: e, substrate })
      mode = balance.mode
      carbonConsumed = balance.scalars.carbonConsumedFinalG
      if (mode === 'concentration-only') warnings.push('mass balance unavailable; carbon-consumed not computed')
    } else {
      warnings.push('missing substrate')
    }

    const carbonProducts: Record<string, number> = {}
    for (const s of g.products) {
      const final = finalValue(s)
      const f = carbonFractionForCompound(s.name)
      if (f != null) carbonProducts[s.name] = final * f
    }
    const carbonByproducts: Record<string, number> = {}
    for (const s of g.byproducts) {
      const final = finalValue(s)
      const f = carbonFractionForCompound(s.name)
      if (f != null) carbonByproducts[s.name] = final * f
    }
    const carbonBiomass = g.biomass.length
      ? finalValue(g.biomass[0]) * (carbonFractionForCompound('Biomass') ?? 0.48)
      : 0

    const accounted =
      Object.values(carbonProducts).reduce((a, b) => a + b, 0)
      + Object.values(carbonByproducts).reduce((a, b) => a + b, 0)
      + carbonBiomass

    const unaccounted = carbonConsumed != null
      ? Math.max(0, carbonConsumed - accounted)
      : 0

    return {
      id: e.id, title: e.title,
      carbonProducts, carbonByproducts, carbonBiomass,
      carbonConsumed, unaccounted, mode, warnings,
    }
  })
}, [payload])
```

- [ ] **Step 4: Render the new view mode**

Add a second `useEffect` parallel to the existing one, gated on `mode === 'carbon-balance'`. Reuse the same SVG rendering approach as the existing `stacked-final` path, substituting the carbon-mass values:

```tsx
useEffect(() => {
  if (!ref.current || mode !== 'carbon-balance') return
  const svg = d3.select(ref.current)
  svg.selectAll('*').remove()
  const W = ref.current.clientWidth
  const rowH = 30
  const H = carbonStacks.length * rowH + 40
  const m = { top: 20, right: 20, bottom: 20, left: 140 }
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom
  svg.attr('viewBox', `0 0 ${W} ${H}`)
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
  const y = d3.scaleBand().domain(carbonStacks.map(s => s.title)).range([0, ih]).padding(0.2)

  const totalsPer = carbonStacks.map(s =>
    Object.values(s.carbonProducts).reduce((a, b) => a + b, 0)
    + Object.values(s.carbonByproducts).reduce((a, b) => a + b, 0)
    + s.carbonBiomass + s.unaccounted)
  const maxTotal = d3.max(totalsPer) ?? 1
  const x = d3.scaleLinear().domain([0, maxTotal]).range([0, iw])

  g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
  g.append('g').call(d3.axisLeft(y))

  const productColor = d3.scaleOrdinal(d3.schemeTableau10)
  const byproductColor = d3.scaleOrdinal(d3.schemeSet2)
  const UNACCOUNTED_COLOR = '#d4d4d8'

  for (const s of carbonStacks) {
    let cursor = 0
    for (const [name, val] of Object.entries(s.carbonProducts)) {
      g.append('rect')
        .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
        .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
        .attr('fill', productColor(name) as string)
        .append('title').text(`${name} (product C): ${val.toFixed(2)} g`)
      cursor += val
    }
    for (const [name, val] of Object.entries(s.carbonByproducts)) {
      g.append('rect')
        .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
        .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
        .attr('fill', byproductColor(name) as string)
        .append('title').text(`${name} (byproduct C): ${val.toFixed(2)} g`)
      cursor += val
    }
    if (s.carbonBiomass > 0) {
      g.append('rect')
        .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
        .attr('width', x(cursor + s.carbonBiomass) - x(cursor)).attr('height', y.bandwidth())
        .attr('fill', '#9ca3af')
        .append('title').text(`biomass C: ${s.carbonBiomass.toFixed(2)} g`)
      cursor += s.carbonBiomass
    }
    if (s.unaccounted > 0) {
      g.append('rect')
        .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
        .attr('width', x(cursor + s.unaccounted) - x(cursor)).attr('height', y.bandwidth())
        .attr('fill', UNACCOUNTED_COLOR)
        .append('title').text(`unaccounted C (likely CO₂): ${s.unaccounted.toFixed(2)} g`)
    }
    if (s.mode === 'concentration-only') {
      g.append('text')
        .attr('x', x(cursor + s.unaccounted) + 8)
        .attr('y', (y(s.title) ?? 0) + y.bandwidth() / 2 + 4)
        .attr('fill', '#737373').attr('font-size', 10).text('chip: concentration-only')
        .append('title').text('Carbon balance unavailable for this experiment.')
    }
  }
}, [carbonStacks, mode])
```

- [ ] **Step 5: Update the legend strip**

Replace the existing `<div className="ml-auto text-xs text-gray-500">` legend so that it conditionally describes the active mode:

```tsx
<div className="ml-auto text-xs text-gray-500">
  {mode === 'carbon-balance'
    ? 'Carbon (g): Products · Byproducts · Biomass · Unaccounted (likely CO₂)'
    : 'Products · Byproducts · Biomass · Unaccounted carbon (CO₂) not tracked in schema'}
</div>
```

- [ ] **Step 6: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/components/dashboard/analysis/CarbonBalance.tsx
git commit -m "feat(analysis): add carbon-balance view mode with unaccounted slice"
```

---

## Phase 5 — Verification

### Task 11: Final integration smoke

- [ ] **Step 1: Run the helper test suite**

Run: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
Expected: all tests pass.

- [ ] **Step 2: Run the carbon logic test suites**

Run:
```bash
cd frontend
npx tsx --test src/components/dashboard/analysis/carbonConsumptionLogic.test.ts
npx tsx --test src/components/dashboard/analysis/carbonFluxLogic.test.ts
```
Expected: all tests pass.

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Smoke test against BioTest in dev**

Run: `cd frontend && npm run dev` (in one terminal) and `cd backend && python manage.py runserver` (in another).

Navigate to the analysis dashboard, sign in to the BioTest org, pick a project with at least 5 experiments, select 5 experiments. Then:

- **Carbon Consumption** → confirm rows show `g` (mass) instead of `g/L`, no `concentration-only` chip on rows whose batch_media has Glucose concentration set.
- **Carbon Flux** → confirm dots are solid (no dashed halo) for mass-mode rows; counter strip mentions "0 shown with concentration-only fallback".
- **Carbon Balance** → switch the dropdown to "Carbon balance (with unaccounted)"; confirm the new slice appears and unaccounted ≥ 0 for every bar.

If a BioTest experiment lacks a `dm_spump2` `process_data` series or its batch media doesn't have a Glucose entry, the corresponding row should show the `concentration-only` chip — that's correct fallback behavior, not a bug.

- [ ] **Step 5: Final commit if any tweaks were needed**

Only commit if smoke testing surfaced fixes.

---

## Verification checklist (run before declaring done)

- [ ] All helper tests pass: `cd frontend && npx tsx --test src/lib/analysis/carbonMassBalance.test.ts`
- [ ] All carbon-logic tests pass: `cd frontend && npx tsx --test src/components/dashboard/analysis/carbonConsumptionLogic.test.ts && npx tsx --test src/components/dashboard/analysis/carbonFluxLogic.test.ts`
- [ ] Typecheck clean: `cd frontend && npx tsc --noEmit`
- [ ] Build clean: `cd frontend && npm run build`
- [ ] Manual smoke test (Task 11 Step 4) all three tabs verified on a BioTest cohort
- [ ] Each commit staged only the files in the task's "Files" section — no unrelated work-in-progress pulled in
