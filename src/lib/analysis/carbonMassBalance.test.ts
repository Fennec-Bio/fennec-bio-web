import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ExperimentInPayload, MediaInPayload, TimeSeriesEntry } from './types'
import {
  computeMassBalance,
  computeVolumeOverTime,
  pickBatchCarbonConcentrationGperL,
  pickFeedCarbonConcentrationGperL,
  pickFeedRateSeries,
} from './carbonMassBalance'

const series = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'] = null,
  values: number[] = [0, 5],
  timepoints: number[] = [0, 10],
): TimeSeriesEntry => ({
  category,
  name,
  role,
  unit: 'mL/h',
  timepoints_h: timepoints,
  values,
})

const baseExperiment = (overrides: Partial<ExperimentInPayload> = {}): ExperimentInPayload => ({
  id: 1,
  title: 'Ferm 1',
  date: null,
  project_id: 1,
  strain: null,
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

const media = (overrides: Partial<MediaInPayload> = {}): MediaInPayload => ({
  id: 1,
  name: 'M',
  type: 'batch',
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

describe('computeVolumeOverTime', () => {
  it('returns [V_batch] at t=0 when feed is null', () => {
    const v = computeVolumeOverTime(800, null)
    assert.deepEqual(v.timepoints_h, [0])
    assert.deepEqual(v.valuesML, [800])
  })

  it('returns [V_batch] at t=0 when feed series is empty', () => {
    const v = computeVolumeOverTime(800, {
      category: 'process_data',
      name: 'dm_spump2',
      role: null,
      unit: 'mL/h',
      timepoints_h: [],
      values: [],
    })
    assert.deepEqual(v.timepoints_h, [0])
    assert.deepEqual(v.valuesML, [800])
  })

  it('integrates a constant 5 mL/h feed for 10h to V(10) = 850', () => {
    const v = computeVolumeOverTime(800, {
      category: 'process_data',
      name: 'dm_spump2',
      role: null,
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
      category: 'process_data',
      name: 'dm_spump2',
      role: null,
      unit: 'mL/h',
      timepoints_h: [0, 1, 2],
      values: [10, -5, 10],
    })
    assert.equal(v.valuesML[0], 800)
    assert.equal(v.valuesML[1], 802.5)
    assert.equal(v.valuesML[2], 805)
  })

  it('integrates non-uniform timepoints via trapezoid', () => {
    const v = computeVolumeOverTime(0, {
      category: 'process_data',
      name: 'dm_spump2',
      role: null,
      unit: 'mL/h',
      timepoints_h: [0, 2, 5],
      values: [0, 10, 10],
    })
    assert.deepEqual(v.valuesML, [0, 10, 40])
  })
})

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

describe('computeMassBalance - mass mode happy path', () => {
  it('integrates feed addition and substrate consumption into a real mass balance', () => {
    const exp = baseExperiment({
      batch_volume_ml: 800,
      feed_pump_series: 'dm_spump2',
      batch_media: glucoseBatchMedia(2),
      feed_media: glucoseFeedMedia(50),
      time_series: [
        series('process_data', 'dm_spump2', null, [5, 5, 5], [0, 12, 24]),
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

    assert.equal(result.scalars.initialCarbonG?.toFixed(2), '6.40')
    assert.equal(result.scalars.fedCarbonFinalG?.toFixed(2), '24.00')

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
      ],
    })
    const substrate = exp.time_series.find((s) => s.role === 'substrate')!
    const result = computeMassBalance({ experiment: exp, substrate })

    assert.equal(result.mode, 'mass')
    assert.equal(result.missing.feedRateSeries, true)
    assert.equal(result.scalars.fedCarbonFinalG, 0)
    assert.equal(result.scalars.massConsumedFinalG?.toFixed(2), '15.00')
  })
})

describe('computeMassBalance - fallbacks and safety', () => {
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
