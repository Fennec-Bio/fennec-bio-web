# Carbon Consumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused Carbon consumption analysis sub-tab that compares measured substrate uptake with apparent and carbon-normalized product conversion.

**Architecture:** Implement the math in a pure frontend utility so it can be tested without React. Add a client component that renders controls, summary cards, a D3 scatter, a D3 allocation chart, and a sortable table from `CohortPayload`. Wire the new `carbon-consumption` slug into analysis types, constants, and page dispatch.

**Tech Stack:** Next.js 16, React 19, TypeScript, D3 v7, Tailwind CSS v4, Node built-in `node:test` style tests compiled by targeted TypeScript checks.

---

### Task 1: Add Carbon Consumption Logic Tests

**Files:**
- Create: `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.test.ts`

- [ ] **Step 1: Write the failing test**

Create a test file that imports `buildCarbonConsumptionRows`, `carbonFractionForCompound`, and `metadataForCompound` from `./carbonConsumptionLogic`. Include fixtures with one substrate series, selected product, another product, ethanol byproduct, and biomass.

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CohortPayload, ExperimentInPayload, TimeSeriesEntry } from '../../../lib/analysis/types'
import {
  buildCarbonConsumptionRows,
  carbonFractionForCompound,
  metadataForCompound,
} from './carbonConsumptionLogic'

const series = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'],
  values: number[],
): TimeSeriesEntry => ({
  category,
  name,
  role,
  unit: 'g/L',
  timepoints_h: [0, 10],
  values,
})

const experiment = (overrides: Partial<ExperimentInPayload> = {}): ExperimentInPayload => ({
  id: 1,
  title: 'Ferm 1',
  date: null,
  project_id: 1,
  strain: { id: 1, name: 'S1', parent_strain: null, modifications: [] },
  batch_media: null,
  feed_media: null,
  variables: [],
  outcomes: {
    final_titer: { CBDa: 2 },
    max_titer: { CBDa: 2 },
    productivity: { CBDa: 0.2 },
    yps: {},
    ypx: {},
    biomass: 4,
    mu_max: null,
    substrate_rate: null,
  },
  time_series: [
    series('process_data', 'Glucose', 'substrate', [10, 4]),
    series('product', 'CBDa', null, [0, 2]),
    series('product', 'CBGa', null, [0, 1]),
    series('secondary_product', 'Ethanol', null, [0, 1.5]),
    series('process_data', 'DCW', 'biomass', [0, 4]),
  ],
  ...overrides,
})

const payload = (experiments: ExperimentInPayload[]): CohortPayload => ({
  experiments,
  products: ['CBDa', 'CBGa'],
  role_map_version: 1,
  warnings: [],
})

describe('carbon metadata', () => {
  it('resolves compound aliases and derives carbon fractions', () => {
    assert.equal(metadataForCompound('OLA')?.canonicalName, 'Olivetolic acid')
    assert.equal(carbonFractionForCompound('glucose')?.toFixed(3), '0.400')
  })
})

describe('buildCarbonConsumptionRows', () => {
  it('computes substrate uptake, apparent conversion, and carbon conversion', () => {
    const [row] = buildCarbonConsumptionRows(payload([experiment()]), 'CBDa')
    assert.equal(row.substrateName, 'Glucose')
    assert.equal(row.substrateConsumed, 6)
    assert.equal(row.uptakeRate, 0.6)
    assert.equal(row.targetDelta, 2)
    assert.equal(row.apparentConversion?.toFixed(3), '0.333')
    assert.equal(row.carbonConversion == null, false)
    assert.equal(row.allocations.apparent.target, 2)
    assert.equal(row.allocations.apparent.otherProducts, 1)
    assert.equal(row.allocations.apparent.byproducts, 1.5)
    assert.equal(row.allocations.apparent.biomass, 4)
    assert.equal(row.warnings.length, 0)
  })

  it('keeps apparent metrics and warns when carbon metadata is missing', () => {
    const exp = experiment({
      time_series: [
        series('process_data', 'Mystery sugar', 'substrate', [10, 5]),
        series('product', 'CBDa', null, [0, 1]),
      ],
    })
    const [row] = buildCarbonConsumptionRows(payload([exp]), 'CBDa')
    assert.equal(row.apparentConversion, 0.2)
    assert.equal(row.carbonConversion, null)
    assert.ok(row.warnings.includes('missing metadata: Mystery sugar'))
  })

  it('marks nondeclining substrate as unavailable', () => {
    const exp = experiment({
      time_series: [
        series('process_data', 'Glucose', 'substrate', [4, 4]),
        series('product', 'CBDa', null, [0, 1]),
      ],
    })
    const [row] = buildCarbonConsumptionRows(payload([exp]), 'CBDa')
    assert.equal(row.uptakeRate, null)
    assert.equal(row.apparentConversion, null)
    assert.ok(row.warnings.includes('substrate did not decline'))
  })
})
```

- [ ] **Step 2: Run the targeted typecheck to verify it fails**

Run:

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --types node src/components/dashboard/analysis/carbonConsumptionLogic.test.ts
```

Expected: FAIL because `./carbonConsumptionLogic` does not exist.

### Task 2: Implement Pure Carbon Consumption Logic

**Files:**
- Create: `frontend/src/components/dashboard/analysis/carbonConsumptionLogic.ts`

- [ ] **Step 1: Implement metadata and row calculations**

Create the utility with exports for metadata lookup, carbon fraction lookup, final/delta helpers, and `buildCarbonConsumptionRows(payload, targetProduct)`.

- [ ] **Step 2: Run the targeted typecheck**

Run the same targeted `npx tsc` command from Task 1.

Expected: PASS.

### Task 3: Add CarbonConsumption UI Component

**Files:**
- Create: `frontend/src/components/dashboard/analysis/CarbonConsumption.tsx`

- [ ] **Step 1: Build the component**

Create a client component that calls `buildCarbonConsumptionRows`, renders the controls row, summary cards, scatter chart, allocation chart, and comparison table.

- [ ] **Step 2: Run a targeted component typecheck**

Run:

```bash
npx tsc --noEmit --pretty false --strict --module esnext --moduleResolution bundler --target ES2020 --lib esnext,dom --jsx react-jsx --types node src/components/dashboard/analysis/CarbonConsumption.tsx
```

Expected: PASS.

### Task 4: Wire the Analysis Tab

**Files:**
- Modify: `frontend/src/lib/analysis/types.ts`
- Modify: `frontend/src/lib/analysis/constants.ts`
- Modify: `frontend/src/app/dashboard/analysis/page.tsx`

- [ ] **Step 1: Add the slug**

Add `carbon-consumption` to `AnalysisSlug`.

- [ ] **Step 2: Add the sub-tab**

Add `{ slug: 'carbon-consumption', label: 'Carbon consumption', availableInP1: true }` to the Metabolic engineering analyses.

- [ ] **Step 3: Render the component**

Import `CarbonConsumption` in the analysis page and render it when `state.analysis === 'carbon-consumption'`.

### Task 5: Verify

**Files:**
- All files changed above.

- [ ] **Step 1: Run targeted checks**

Run the two targeted `npx tsc` commands from Tasks 2 and 3.

- [ ] **Step 2: Run project checks**

Run:

```bash
npx tsc --noEmit --pretty false
npm run build
```

If the full typecheck remains blocked by an unrelated pre-existing missing module, report that blocker with the exact error.
