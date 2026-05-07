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
  batch_volume_ml: null,
  feed_pump_series: '',
  waste_pump_series: '',
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
    assert.equal(row.massBalanceMode, 'concentration-only')
    assert.ok(row.warnings.includes('batch volume missing; falling back to concentration-only'))
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

describe('buildCarbonConsumptionRows - mass mode', () => {
  it('produces mass-based fields when batch volume + media + feed are present', () => {
    const exp: ExperimentInPayload = {
      ...experiment(),
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: {
        id: 1,
        name: 'Batch A',
        type: 'batch',
        carbon_sources: [{ name: 'Glucose', concentration: 2, molecular_weight: 180.16 }],
        nitrogen_sources: [],
        complex_components: [],
        additional_components: [],
      },
      feed_media: {
        id: 2,
        name: 'Feed A',
        type: 'feed',
        carbon_sources: [{ name: 'Glucose', concentration: 50, molecular_weight: 180.16 }],
        nitrogen_sources: [],
        complex_components: [],
        additional_components: [],
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
    assert.equal(row.substrateConsumed, 15)
    assert.equal(row.substrateConsumedG, null)
  })
})
