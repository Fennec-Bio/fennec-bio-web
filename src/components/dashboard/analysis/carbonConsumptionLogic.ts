import type {
  CohortPayload,
  ExperimentInPayload,
  TimeSeriesEntry,
} from '../../../lib/analysis/types'
import {
  computeMassBalance,
  type MassBalanceMissingInputs,
  type MassBalanceMode,
} from '../../../lib/analysis/carbonMassBalance'

export interface CompoundCarbonMetadata {
  canonicalName: string
  aliases: string[]
  carbonFraction: number
  molecularWeight?: number
  carbonCount?: number
}

export interface CarbonAllocation {
  target: number
  otherProducts: number
  byproducts: number
  biomass: number
  unaccounted: number
}

export interface CarbonConsumptionRow {
  experimentId: number
  title: string
  strain: string | null
  batchMedia: string | null
  feedMedia: string | null
  substrateName: string | null
  substrateConsumed: number | null
  substrateConsumedG: number | null
  elapsedHours: number | null
  uptakeRate: number | null
  targetProduct: string
  targetDelta: number | null
  targetFinalTiter: number | null
  targetProductivity: number | null
  apparentConversion: number | null
  carbonConversion: number | null
  carbonConsumed: number | null
  carbonConsumedG: number | null
  targetCarbon: number | null
  allocations: {
    apparent: CarbonAllocation
    carbon: CarbonAllocation
  }
  warnings: string[]
  massBalanceMode: MassBalanceMode
  massBalanceMissing: MassBalanceMissingInputs
}

const CARBON_ATOMIC_WEIGHT = 12.011
const BIOMASS_CARBON_FRACTION = 0.48

export const compoundCarbonMetadata: CompoundCarbonMetadata[] = [
  compound('Glucose', ['glucose', 'true glucose', 'd-glucose'], 180.156, 6),
  compound('Sucrose', ['sucrose'], 342.2965, 12),
  compound('Ethanol', ['ethanol', 'etoh'], 46.068, 2),
  compound('Acetate', ['acetate', 'acetic acid'], 59.044, 2),
  compound('Glycerol', ['glycerol'], 92.094, 3),
  compound('CBDa', ['cbda', 'cannabidiolic acid'], 358.478, 22),
  compound('CBGa', ['cbga', 'cannabigerolic acid'], 360.494, 22),
  compound('THCa', ['thca', 'tetrahydrocannabinolic acid'], 358.478, 22),
  compound('Olivetol', ['olivetol'], 180.247, 11),
  compound('Olivetolic acid', ['olivetolic acid', 'ola'], 224.256, 12),
  {
    canonicalName: 'Biomass',
    aliases: ['biomass', 'dcw', 'cell dry weight', 'dry cell weight', 'cells'],
    carbonFraction: BIOMASS_CARBON_FRACTION,
  },
]

function compound(
  canonicalName: string,
  aliases: string[],
  molecularWeight: number,
  carbonCount: number,
): CompoundCarbonMetadata {
  return {
    canonicalName,
    aliases,
    molecularWeight,
    carbonCount,
    carbonFraction: (carbonCount * CARBON_ATOMIC_WEIGHT) / molecularWeight,
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function metadataForCompound(name: string | null | undefined): CompoundCarbonMetadata | null {
  if (!name) return null
  const normalized = normalizeName(name)
  return compoundCarbonMetadata.find(entry =>
    entry.aliases.some(alias => normalizeName(alias) === normalized)
    || normalizeName(entry.canonicalName) === normalized,
  ) ?? null
}

export function carbonFractionForCompound(name: string | null | undefined): number | null {
  return metadataForCompound(name)?.carbonFraction ?? null
}

function dataPoints(series: TimeSeriesEntry): Array<{ t: number; v: number }> {
  return series.timepoints_h
    .map((t, i) => ({ t, v: series.values[i] }))
    .filter(point => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t)
}

function finalValue(series: TimeSeriesEntry): number | null {
  const points = dataPoints(series)
  return points.length ? points[points.length - 1].v : null
}

function deltaValue(series: TimeSeriesEntry): number | null {
  const points = dataPoints(series)
  if (points.length === 0) return null
  if (points.length === 1) return Math.max(0, points[0].v)
  return Math.max(0, points[points.length - 1].v - points[0].v)
}

function timeSpan(series: TimeSeriesEntry): number | null {
  const points = dataPoints(series)
  if (points.length < 2) return null
  const span = points[points.length - 1].t - points[0].t
  return span > 0 ? span : null
}

function isCompatibleUnit(unit: string): boolean {
  const normalized = unit.trim().toLowerCase()
  return normalized === '' || normalized.includes('g/l') || normalized.includes('g per l')
}

function findSubstrateSeries(exp: ExperimentInPayload): {
  series: TimeSeriesEntry | null
  warnings: string[]
} {
  const warnings: string[] = []
  const substrates = exp.time_series.filter(series => series.role === 'substrate')
  if (substrates.length > 1) warnings.push('multiple substrates')
  return { series: substrates[0] ?? null, warnings }
}

function productSeries(exp: ExperimentInPayload, name: string): TimeSeriesEntry | null {
  return exp.time_series.find(series =>
    series.category === 'product' && series.name === name,
  ) ?? null
}

function positiveDelta(series: TimeSeriesEntry | null): number {
  if (!series) return 0
  return deltaValue(series) ?? 0
}

function addMetadataWarning(warnings: string[], name: string): void {
  const message = `missing metadata: ${name}`
  if (!warnings.includes(message)) warnings.push(message)
}

function carbonMass(
  amount: number,
  name: string,
  warnings: string[],
  metadataName = name,
): number | null {
  if (amount <= 0) return 0
  const fraction = carbonFractionForCompound(metadataName)
  if (fraction == null) {
    addMetadataWarning(warnings, name)
    return null
  }
  return amount * fraction
}

function emptyAllocation(): CarbonAllocation {
  return {
    target: 0,
    otherProducts: 0,
    byproducts: 0,
    biomass: 0,
    unaccounted: 0,
  }
}

export function buildCarbonConsumptionRows(
  payload: CohortPayload,
  targetProduct: string | null,
): CarbonConsumptionRow[] {
  const target = targetProduct ?? payload.products[0] ?? ''
  return payload.experiments.map(exp => buildCarbonConsumptionRow(exp, target))
}

function buildCarbonConsumptionRow(
  exp: ExperimentInPayload,
  targetProduct: string,
): CarbonConsumptionRow {
  const warnings: string[] = []
  const substratePick = findSubstrateSeries(exp)
  warnings.push(...substratePick.warnings)

  const substrate = substratePick.series
  const targetSeries = productSeries(exp, targetProduct)
  const allProducts = exp.time_series.filter(series => series.category === 'product')
  const otherProducts = allProducts.filter(series => series.name !== targetProduct)
  const byproducts = exp.time_series.filter(series => series.category === 'secondary_product')
  const biomassSeries = exp.time_series.find(series => series.role === 'biomass') ?? null

  let substrateConsumed: number | null = null
  let elapsedHours: number | null = null
  let uptakeRate: number | null = null
  let carbonConsumed: number | null = null

  if (!substrate) {
    warnings.push('missing substrate')
  } else {
    if (!isCompatibleUnit(substrate.unit)) warnings.push(`unit may be incompatible: ${substrate.unit}`)
    const points = dataPoints(substrate)
    if (points.length < 2) {
      warnings.push('substrate needs at least two points')
    } else {
      const initial = points[0].v
      const final = points[points.length - 1].v
      const consumed = initial - final
      elapsedHours = timeSpan(substrate)
      if (consumed <= 0) {
        warnings.push('substrate did not decline')
      } else if (elapsedHours == null) {
        warnings.push('invalid substrate time span')
      } else {
        substrateConsumed = consumed
        uptakeRate = consumed / elapsedHours
        carbonConsumed = carbonMass(consumed, substrate.name, warnings)
      }
    }
  }

  if (!targetSeries && targetProduct) warnings.push('missing selected product')

  const targetDelta = targetSeries ? deltaValue(targetSeries) : null
  const targetFinalTiter = targetSeries ? finalValue(targetSeries) : null
  const targetProductivity = targetProduct
    ? (exp.outcomes.productivity[targetProduct] ?? null)
    : null

  const apparentConversion = (
    targetDelta != null && substrateConsumed != null && substrateConsumed > 0
  )
    ? targetDelta / substrateConsumed
    : null

  const apparent = emptyAllocation()
  apparent.target = targetDelta ?? 0
  apparent.otherProducts = otherProducts.reduce((sum, series) => sum + positiveDelta(series), 0)
  apparent.byproducts = byproducts.reduce((sum, series) => sum + positiveDelta(series), 0)
  apparent.biomass = biomassSeries
    ? positiveDelta(biomassSeries)
    : Math.max(0, exp.outcomes.biomass ?? 0)
  if (substrateConsumed != null) {
    const accounted = apparent.target + apparent.otherProducts + apparent.byproducts + apparent.biomass
    apparent.unaccounted = Math.max(0, substrateConsumed - accounted)
  }

  const carbon = emptyAllocation()
  const targetCarbon = targetDelta == null
    ? null
    : carbonMass(targetDelta, targetProduct, warnings)
  carbon.target = targetCarbon ?? 0

  for (const series of otherProducts) {
    const mass = positiveDelta(series)
    const c = carbonMass(mass, series.name, warnings)
    if (c != null) carbon.otherProducts += c
  }
  for (const series of byproducts) {
    const mass = positiveDelta(series)
    const c = carbonMass(mass, series.name, warnings)
    if (c != null) carbon.byproducts += c
  }
  const biomassMass = apparent.biomass
  const biomassCarbon = carbonMass(
    biomassMass,
    biomassSeries?.name ?? 'Biomass',
    warnings,
    'Biomass',
  )
  if (biomassCarbon != null) carbon.biomass = biomassCarbon

  const accountedCarbon = carbon.target + carbon.otherProducts + carbon.byproducts + carbon.biomass
  if (carbonConsumed != null) {
    carbon.unaccounted = Math.max(0, carbonConsumed - accountedCarbon)
  }

  const carbonConversion = (
    targetCarbon != null && carbonConsumed != null && carbonConsumed > 0
  )
    ? targetCarbon / carbonConsumed
    : null

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

  return {
    experimentId: exp.id,
    title: exp.title,
    strain: exp.strain?.name ?? null,
    batchMedia: exp.batch_media?.name ?? null,
    feedMedia: exp.feed_media?.name ?? null,
    substrateName: substrate?.name ?? null,
    substrateConsumed,
    substrateConsumedG,
    elapsedHours,
    uptakeRate,
    targetProduct,
    targetDelta,
    targetFinalTiter,
    targetProductivity,
    apparentConversion,
    carbonConversion,
    carbonConsumed,
    carbonConsumedG,
    targetCarbon,
    allocations: { apparent, carbon },
    warnings,
    massBalanceMode,
    massBalanceMissing,
  }
}
