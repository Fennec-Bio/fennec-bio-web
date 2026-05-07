import type { ExperimentInPayload, TimeSeriesEntry } from './types'

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
