import type { ExperimentInPayload, MediaInPayload, TimeSeriesEntry } from './types'
import { carbonFractionForCompound } from '../../components/dashboard/analysis/carbonConsumptionLogic'

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

const PCT_W_V_TO_G_PER_L = 10

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function pickConcentrationGperL(
  media: MediaInPayload | null,
  substrateName: string,
): number | null {
  if (!media) return null
  const target = normalize(substrateName)
  const entry = media.carbon_sources.find((cs) => normalize(cs.name) === target)
  if (!entry || entry.concentration == null) return null
  return entry.concentration * PCT_W_V_TO_G_PER_L
}

export function pickBatchCarbonConcentrationGperL(
  media: MediaInPayload | null,
  substrateName: string,
): number | null {
  return pickConcentrationGperL(media, substrateName)
}

export function pickFeedCarbonConcentrationGperL(
  media: MediaInPayload | null,
  substrateName: string,
): number | null {
  return pickConcentrationGperL(media, substrateName)
}

function trapCumulative(
  timepoints_h: number[],
  rates: number[],
): number[] {
  const out: number[] = new Array(timepoints_h.length).fill(0)
  for (let i = 1; i < timepoints_h.length; i++) {
    const dt = timepoints_h[i] - timepoints_h[i - 1]
    const avg = (rates[i] + rates[i - 1]) / 2
    out[i] = out[i - 1] + Math.max(0, avg * dt)
  }
  return out
}

export function computeVolumeOverTime(
  V_batch_ml: number,
  feed: TimeSeriesEntry | null,
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

function lastOrNull(values: number[]): number | null {
  return values.length === 0 ? null : values[values.length - 1]
}

function interpolateAtTime(
  timepoints: number[],
  values: number[],
  t: number,
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
  const initialMassG = (V_batch / 1000) * batchC
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

  const massRemainingValues = substrate.timepoints_h.map((t, i) => {
    const V_t_ml = interpolateAtTime(V.timepoints_h, V.valuesML, t)
    return (V_t_ml / 1000) * substrate.values[i]
  })
  const massRemaining: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: massRemainingValues,
  }

  const massConsumedValues = substrate.timepoints_h.map((t, i) => {
    const addedT = interpolateAtTime(massAdded.timepoints_h, massAdded.valuesG, t)
    return Math.max(0, addedT - massRemainingValues[i])
  })
  const massConsumed: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: massConsumedValues,
  }

  const carbonFraction = carbonFractionForCompound(substrate.name) ?? null
  const carbonConsumed: MassBalanceSeries = {
    timepoints_h: substrate.timepoints_h,
    valuesG: carbonFraction != null ? massConsumedValues.map((m) => m * carbonFraction) : [],
  }
  const massConsumedFinal = lastOrNull(massConsumedValues)

  return {
    mode: 'mass',
    missing,
    volumeML: V,
    massAddedG: massAdded,
    massRemainingG: massRemaining,
    massConsumedG: massConsumed,
    carbonConsumedG: carbonConsumed,
    scalars: {
      massConsumedFinalG: massConsumedFinal,
      carbonConsumedFinalG: carbonFraction != null ? (massConsumedFinal ?? 0) * carbonFraction : null,
      initialCarbonG: initialMassG * (carbonFraction ?? 1),
      fedCarbonFinalG: carbonFraction != null ? (lastOrNull(fedCum) ?? 0) * carbonFraction : null,
    },
  }
}
