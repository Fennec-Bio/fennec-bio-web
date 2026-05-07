import type {
  CohortPayload,
  ExperimentInPayload,
  TimeSeriesEntry,
} from '../../../lib/analysis/types'
import {
  computeMassBalance,
  type MassBalanceMode,
} from '../../../lib/analysis/carbonMassBalance'
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

export type SubstrateCategory = TimeSeriesEntry['category']

export interface SubstrateCandidate {
  key: string
  category: SubstrateCategory
  name: string
  label: string
}

export interface CohortFluxPoint {
  experimentId: number
  title: string
  strainName: string
  batchMediaName: string | null
  yps: number
  qpMax: number | null
  qsMax: number | null
  massBalanceMode: MassBalanceMode
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
  productFormed: { timepoints: number[]; cumulative: number[] }
  phases: Phase[]
}

function findProductSeries(exp: ExperimentInPayload, productName: string): TimeSeriesEntry | null {
  return exp.time_series.find((s) => s.category === 'product' && s.name === productName) ?? null
}

function substrateKey(series: Pick<TimeSeriesEntry, 'category' | 'name'>): string {
  return `${series.category}:${encodeURIComponent(series.name)}`
}

function parseSubstrateKey(key: string): Pick<TimeSeriesEntry, 'category' | 'name'> | null {
  const separator = key.indexOf(':')
  if (separator < 0) return null
  const category = key.slice(0, separator) as SubstrateCategory
  const name = decodeURIComponent(key.slice(separator + 1))
  if (!['product', 'secondary_product', 'process_data'].includes(category)) return null
  return { category, name }
}

function substrateLabel(series: Pick<TimeSeriesEntry, 'category' | 'name' | 'role'>): string {
  if (series.role === 'substrate') return `${series.name} (measured substrate)`
  if (series.category === 'secondary_product') return `${series.name} (secondary product)`
  if (series.category === 'product') return `${series.name} (product)`
  return `${series.name} (process data)`
}

function isSubstrateCandidate(series: TimeSeriesEntry, productName: string): boolean {
  if (series.name === productName) return false
  if (series.role === 'substrate') return true
  return series.category === 'product' || series.category === 'secondary_product'
}

function findSelectedSubstrateSeries(
  exp: ExperimentInPayload,
  selectedSubstrateKey?: string | null,
): TimeSeriesEntry | null {
  if (!selectedSubstrateKey) return findSubstrateData(exp.time_series)
  const parsed = parseSubstrateKey(selectedSubstrateKey)
  if (!parsed) return null
  return exp.time_series.find((series) =>
    series.category === parsed.category && series.name === parsed.name
  ) ?? null
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

export function deriveSubstrateCandidates(
  payload: CohortPayload,
  productName: string,
): SubstrateCandidate[] {
  const byKey = new Map<string, SubstrateCandidate>()
  for (const exp of payload.experiments) {
    for (const series of exp.time_series) {
      if (!isSubstrateCandidate(series, productName)) continue
      const key = substrateKey(series)
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          category: series.category,
          name: series.name,
          label: substrateLabel(series),
        })
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function deriveCohortFluxPoints(
  payload: CohortPayload,
  productName: string,
  selectedSubstrateKey?: string | null,
): CohortFluxResult {
  const points: CohortFluxPoint[] = []
  const excluded: CohortFluxResult['excluded'] = []

  for (const exp of payload.experiments) {
    const biomass = findBiomassData(exp.time_series)
    const substrate = findSelectedSubstrateSeries(exp, selectedSubstrateKey)
    const product = findProductSeries(exp, productName)

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

    const balance = computeMassBalance({ experiment: exp, substrate })

    let yps: number | null = null
    let qsMaxValue: number | null = null

    if (balance.mode === 'mass' && balance.scalars.massConsumedFinalG != null) {
      const V_final_ml =
        balance.volumeML.valuesML[balance.volumeML.valuesML.length - 1]
        ?? exp.batch_volume_ml ?? 1000
      const productDelta =
        (product.values[product.values.length - 1] ?? 0) - (product.values[0] ?? 0)
      yps = (productDelta * (V_final_ml / 1000)) / balance.scalars.massConsumedFinalG
      qsMaxValue = computeQsMaxFromMassBalance(balance, biomass)
    } else {
      yps = computeYpsOverall(product, substrate)
      const qS = computeQsMax(substrate, biomass)
      qsMaxValue = qS?.qsMax ?? null
    }

    if (yps === null) {
      excluded.push({ experimentId: exp.id, title: exp.title, reason: 'substrate did not decline' })
      continue
    }

    const qP = calculateProductionRate(
      product.timepoints_h,
      product.values,
      biomass.timepoints,
      biomass.values,
    )

    points.push({
      experimentId: exp.id,
      title: exp.title,
      strainName: exp.strain?.name ?? 'Unknown',
      batchMediaName: exp.batch_media?.name ?? null,
      yps,
      qpMax: qP?.qpMax ?? null,
      qsMax: qsMaxValue,
      massBalanceMode: balance.mode,
    })
  }

  return { points, excluded }
}

export function deriveDrilldownSeries(
  exp: ExperimentInPayload,
  productName: string,
  selectedSubstrateKey?: string | null,
): DrilldownSeries | null {
  const biomass = findBiomassData(exp.time_series)
  const substrate = findSelectedSubstrateSeries(exp, selectedSubstrateKey)
  const product = findProductSeries(exp, productName)
  if (!biomass || !substrate || !product) return null
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

  return {
    substrateName: substrate.name,
    productName: product.name,
    biomassName: biomass.name,
    substrateConsumed,
    productFormed: computeCumulativeMassSeries(
      { timepoints: product.timepoints_h, values: product.values },
      'increase',
    ),
    phases: detectPhases(biomass.timepoints, biomass.values),
  }
}
