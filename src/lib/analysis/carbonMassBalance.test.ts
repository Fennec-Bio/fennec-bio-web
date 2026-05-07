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
