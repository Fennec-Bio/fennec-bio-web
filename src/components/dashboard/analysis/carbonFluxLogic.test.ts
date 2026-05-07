import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  CohortPayload,
  ExperimentInPayload,
  MediaInPayload,
  TimeSeriesEntry,
} from '../../../lib/analysis/types'
import {
  deriveCohortFluxPoints,
  deriveDrilldownSeries,
  deriveSubstrateCandidates,
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
  batch_volume_ml: null,
  feed_pump_series: '',
  waste_pump_series: '',
  variables: [],
  outcomes: {
    final_titer: {},
    max_titer: {},
    productivity: {},
    yps: {},
    ypx: {},
    biomass: null,
    mu_max: null,
    substrate_rate: null,
  },
  time_series: [
    series('product', 'CBDa', null, [0, 5, 10], [0, 1, 2]),
    series('process_data', 'Glucose', 'substrate', [0, 5, 10], [50, 30, 10]),
    series('process_data', 'DCW', 'biomass', [0, 5, 10], [1, 3, 5]),
  ],
  ...overrides,
})

const payload = (experiments: ExperimentInPayload[]): CohortPayload => ({
  experiments,
  products: ['CBDa'],
  role_map_version: 1,
  warnings: [],
})

const glucoseMedia = (id: number, type: string, pct: number | null): MediaInPayload => ({
  id,
  name: `M${id}`,
  type,
  carbon_sources: pct == null
    ? []
    : [{ name: 'Glucose', concentration: pct, molecular_weight: 180.16 }],
  nitrogen_sources: [],
  complex_components: [],
  additional_components: [],
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
    assert.equal(p.yps, 0.05)
    assert.ok(p.qsMax !== null && p.qsMax > 0)
    assert.ok(p.qpMax !== null && p.qpMax > 0)
  })

  it('excludes an experiment that is missing biomass', () => {
    const exp = baseExperiment({
      time_series: [
        series('product', 'CBDa', null, [0, 10], [0, 2]),
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
        series('product', 'CBDa', null, [0, 10], [0, 2]),
        series('process_data', 'Glucose', 'substrate', [0, 10], [30, 30]),
        series('process_data', 'DCW', 'biomass', [0, 10], [1, 3]),
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
        series('process_data', 'DCW', 'biomass', [0, 10], [1, 3]),
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

  it('uses a selected secondary product as the consumed substrate', () => {
    const exp = baseExperiment({
      time_series: [
        series('product', 'CBDa', null, [0, 10], [0, 2]),
        series('secondary_product', 'Olivetolic acid', null, [0, 10], [10, 2]),
        series('process_data', 'DCW', 'biomass', [0, 10], [1, 3]),
      ],
    })
    const candidates = deriveSubstrateCandidates(payload([exp]), 'CBDa')
    const ola = candidates.find((candidate) => candidate.name === 'Olivetolic acid')
    assert.notEqual(ola, undefined)

    const out = deriveCohortFluxPoints(payload([exp]), 'CBDa', ola!.key)

    assert.equal(out.points.length, 1)
    assert.equal(out.points[0].yps, 0.25)
  })

  it('offers non-target products as substrate candidates but not the selected target product', () => {
    const exp = baseExperiment({
      time_series: [
        series('product', 'CBDa', null, [0, 10], [0, 2]),
        series('product', 'CBGa', null, [0, 10], [6, 3]),
        series('secondary_product', 'Olivetolic acid', null, [0, 10], [10, 2]),
        series('process_data', 'DCW', 'biomass', [0, 10], [1, 3]),
      ],
    })

    const candidates = deriveSubstrateCandidates(payload([exp]), 'CBDa')

    assert.deepEqual(
      candidates.map((candidate) => `${candidate.category}:${candidate.name}`).sort(),
      ['product:CBGa', 'secondary_product:Olivetolic acid'],
    )
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
        series('product', 'CBDa', null, [0, 10], [0, 2]),
        series('process_data', 'Glucose', 'substrate', [0, 10], [50, 30]),
      ],
    })
    assert.equal(deriveDrilldownSeries(exp, 'CBDa'), null)
  })

  it('uses the selected secondary product in the drilldown substrate line', () => {
    const exp = baseExperiment({
      time_series: [
        series('product', 'CBDa', null, [0, 10], [0, 2]),
        series('secondary_product', 'Olivetolic acid', null, [0, 10], [10, 2]),
        series('process_data', 'DCW', 'biomass', [0, 10], [1, 3]),
      ],
    })
    const ola = deriveSubstrateCandidates(payload([exp]), 'CBDa')
      .find((candidate) => candidate.name === 'Olivetolic acid')

    const out = deriveDrilldownSeries(exp, 'CBDa', ola!.key)

    assert.notEqual(out, null)
    assert.equal(out!.substrateName, 'Olivetolic acid')
    assert.deepEqual(out!.substrateConsumed.cumulative, [0, 8])
  })
})

describe('carbon flux - mass-mode integration', () => {
  it('marks cohort dot with massBalanceMode and uses mass-based yps when available', () => {
    const massExp = baseExperiment({
      id: 10,
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseMedia(1, 'batch', 2),
      feed_media: glucoseMedia(2, 'feed', 50),
      time_series: [
        series('process_data', 'dm_spump2', null, [0, 12, 24], [5, 5, 5]),
        series('process_data', 'Glucose', 'substrate', [0, 12, 24], [20, 8, 2]),
        series('product', 'CBDa', null, [0, 12, 24], [0, 1, 2]),
        series('process_data', 'DCW', 'biomass', [0, 12, 24], [0, 2, 4]),
      ],
    })
    const concExp = baseExperiment({
      id: 11,
      batch_volume_ml: null,
      feed_pump_series: '',
      batch_media: null,
      feed_media: null,
      time_series: [
        series('process_data', 'Glucose', 'substrate', [0, 12, 24], [20, 8, 2]),
        series('product', 'CBDa', null, [0, 12, 24], [0, 1, 2]),
        series('process_data', 'DCW', 'biomass', [0, 12, 24], [0, 2, 4]),
      ],
    })
    const result = deriveCohortFluxPoints(payload([massExp, concExp]), 'CBDa')
    const massPoint = result.points.find((p) => p.experimentId === massExp.id)
    const concPoint = result.points.find((p) => p.experimentId === concExp.id)
    assert.equal(massPoint?.massBalanceMode, 'mass')
    assert.equal(concPoint?.massBalanceMode, 'concentration-only')
  })

  it('drilldown substrate-consumed series uses cumulative grams in mass mode', () => {
    const massExp = baseExperiment({
      id: 12,
      batch_volume_ml: 1000,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseMedia(1, 'batch', 2),
      feed_media: glucoseMedia(2, 'feed', 50),
      time_series: [
        series('process_data', 'dm_spump2', null, [0, 12, 24], [5, 5, 5]),
        series('process_data', 'Glucose', 'substrate', [0, 12, 24], [20, 8, 2]),
        series('product', 'CBDa', null, [0, 12, 24], [0, 1, 2]),
        series('process_data', 'DCW', 'biomass', [0, 12, 24], [0, 2, 4]),
      ],
    })
    const drilldown = deriveDrilldownSeries(massExp, 'CBDa')
    assert.ok(drilldown != null)
    assert.ok(drilldown!.substrateConsumed.cumulative.length > 0)
    const last = drilldown!.substrateConsumed.cumulative[
      drilldown!.substrateConsumed.cumulative.length - 1
    ]
    assert.equal(last.toFixed(2), '77.76')
  })
})
