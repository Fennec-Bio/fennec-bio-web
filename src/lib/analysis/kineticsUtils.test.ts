import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TimeSeriesEntry } from './types'
import {
  computeCumulativeMassSeries,
  computeQsMax,
  computeYpsOverall,
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

const seriesEntry = (
  category: TimeSeriesEntry['category'],
  name: string,
  role: TimeSeriesEntry['role'],
  timepoints_h: number[],
  values: number[],
): TimeSeriesEntry => ({ category, name, role, unit: 'g/L', timepoints_h, values })

describe('computeYpsOverall', () => {
  it('returns delta P / delta S for monotone series', () => {
    const product = seriesEntry('product', 'CBDa', null, [0, 10], [0, 2])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    assert.equal(computeYpsOverall(product, substrate), 0.1)
  })

  it('returns null when substrate did not decline', () => {
    const product = seriesEntry('product', 'CBDa', null, [0, 10], [0, 2])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [30, 30])
    assert.equal(computeYpsOverall(product, substrate), null)
  })

  it('returns null when either series has fewer than 2 points', () => {
    const product = seriesEntry('product', 'CBDa', null, [0], [0])
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    assert.equal(computeYpsOverall(product, substrate), null)
  })
})

describe('computeQsMax', () => {
  it('computes specific uptake rate at peak interval', () => {
    const substrate = seriesEntry(
      'process_data', 'Glucose', 'substrate',
      [0, 5, 10, 15], [50, 40, 10, 5],
    )
    const biomass = { timepoints: [0, 5, 10, 15], values: [1, 2, 4, 5] }
    const out = computeQsMax(substrate, biomass)
    assert.notEqual(out, null)
    assert.equal(out!.qsMax.toFixed(3), '2.000')
    assert.equal(out!.qsMaxTime, 7.5)
  })

  it('returns null when biomass is non-positive at every interval', () => {
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0, 10], [50, 30])
    const biomass = { timepoints: [0, 10], values: [0, 0] }
    assert.equal(computeQsMax(substrate, biomass), null)
  })

  it('returns null when fewer than 2 substrate points', () => {
    const substrate = seriesEntry('process_data', 'Glucose', 'substrate', [0], [50])
    const biomass = { timepoints: [0, 10], values: [1, 2] }
    assert.equal(computeQsMax(substrate, biomass), null)
  })
})
