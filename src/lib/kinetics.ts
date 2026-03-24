/**
 * Kinetic analysis utilities for fermentation experiments.
 * Calculates growth rates, production rates, yields, phase detection, etc.
 * All math is self-contained (no external stats library needed).
 */

export type PhaseName = 'lag' | 'exponential' | 'stationary'

export interface Phase {
  name: PhaseName
  startTime: number
  endTime: number
}

export interface KineticParams {
  experimentId: number
  title: string
  muMax: number | null
  qpMax: number | null
  yps: number | null
  productivity: number | null
  finalTiter: number | null
  phases: Phase[]
  biomassType?: string
}

// --- Inline simple linear regression ---

function linearRegression(pairs: [number, number][]): { m: number; b: number } {
  const n = pairs.length
  if (n < 2) return { m: 0, b: 0 }
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const [x, y] of pairs) {
    sx += x; sy += y; sxy += x * y; sxx += x * x
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return { m: 0, b: sy / n }
  const m = (n * sxy - sx * sy) / denom
  const b = (sy - m * sx) / n
  return { m, b }
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const sumSq = values.reduce((s, v) => s + (v - avg) ** 2, 0)
  return Math.sqrt(sumSq / (values.length - 1))
}

// --- Kinetic calculations ---

/** mu = d(ln(X))/dt — sliding-window linear regression on ln(biomass) */
export function calculateGrowthRate(
  timepoints: number[],
  values: number[]
): { muMax: number; muMaxTime: number } | null {
  if (timepoints.length < 3) return null

  const data = timepoints
    .map((t, i) => ({ t, v: values[i] }))
    .filter(d => d.v > 0)
    .sort((a, b) => a.t - b.t)

  if (data.length < 3) return null

  const lnV = data.map(d => Math.log(d.v))
  const times = data.map(d => d.t)
  const windowSize = Math.max(3, Math.floor(data.length / 4))

  let maxMu = 0
  let maxMuTime = 0

  for (let i = 0; i <= data.length - windowSize; i++) {
    const pairs: [number, number][] = []
    for (let j = i; j < i + windowSize; j++) pairs.push([times[j], lnV[j]])
    const { m } = linearRegression(pairs)
    if (m > maxMu) {
      maxMu = m
      maxMuTime = (times[i] + times[i + windowSize - 1]) / 2
    }
  }

  return { muMax: maxMu, muMaxTime: maxMuTime }
}

/** qP = (dP/dt) / X — max specific production rate */
export function calculateProductionRate(
  productTimepoints: number[],
  productValues: number[],
  biomassTimepoints: number[],
  biomassValues: number[]
): { qpMax: number; qpMaxTime: number } | null {
  if (productTimepoints.length < 3 || biomassTimepoints.length < 3) return null

  const productData = productTimepoints
    .map((t, i) => ({ t, v: productValues[i] }))
    .sort((a, b) => a.t - b.t)

  const biomassData = biomassTimepoints
    .map((t, i) => ({ t, v: biomassValues[i] }))
    .sort((a, b) => a.t - b.t)

  const interpolate = (time: number): number => {
    if (time <= biomassData[0].t) return biomassData[0].v
    if (time >= biomassData[biomassData.length - 1].t) return biomassData[biomassData.length - 1].v
    for (let i = 0; i < biomassData.length - 1; i++) {
      if (time >= biomassData[i].t && time <= biomassData[i + 1].t) {
        const ratio = (time - biomassData[i].t) / (biomassData[i + 1].t - biomassData[i].t)
        return biomassData[i].v + ratio * (biomassData[i + 1].v - biomassData[i].v)
      }
    }
    return biomassData[biomassData.length - 1].v
  }

  let maxQp = 0, maxQpTime = 0
  for (let i = 0; i < productData.length - 1; i++) {
    const dt = productData[i + 1].t - productData[i].t
    if (dt <= 0) continue
    const dP = productData[i + 1].v - productData[i].v
    const avgTime = (productData[i].t + productData[i + 1].t) / 2
    const avgX = interpolate(avgTime)
    if (avgX > 0) {
      const qp = (dP / dt) / avgX
      if (qp > maxQp) { maxQp = qp; maxQpTime = avgTime }
    }
  }

  return maxQp > 0 ? { qpMax: maxQp, qpMaxTime: maxQpTime } : null
}

/** Yp/s = deltaP / deltaS */
export function calculateYield(
  productTimepoints: number[],
  productValues: number[],
  substrateTimepoints: number[],
  substrateValues: number[]
): number | null {
  if (productTimepoints.length < 2 || substrateTimepoints.length < 2) return null

  const pData = productTimepoints.map((t, i) => ({ t, v: productValues[i] })).sort((a, b) => a.t - b.t)
  const sData = substrateTimepoints.map((t, i) => ({ t, v: substrateValues[i] })).sort((a, b) => a.t - b.t)

  const deltaP = pData[pData.length - 1].v - pData[0].v
  const deltaS = sData[0].v - sData[sData.length - 1].v

  return deltaS > 0 ? deltaP / deltaS : null
}

/** Detect lag / exponential / stationary phases from biomass growth curve */
export function detectPhases(timepoints: number[], values: number[]): Phase[] {
  if (timepoints.length < 5) return []

  const data = timepoints
    .map((t, i) => ({ t, v: values[i] }))
    .filter(d => d.v > 0)
    .sort((a, b) => a.t - b.t)

  if (data.length < 5) return []

  const times = data.map(d => d.t)
  const lnV = data.map(d => Math.log(d.v))

  const growthRates: { time: number; rate: number }[] = []
  const ws = 3
  for (let i = 0; i <= data.length - ws; i++) {
    const pairs: [number, number][] = []
    for (let j = i; j < i + ws; j++) pairs.push([times[j], lnV[j]])
    const { m } = linearRegression(pairs)
    growthRates.push({ time: (times[i] + times[i + ws - 1]) / 2, rate: m })
  }

  if (growthRates.length === 0) return []

  const maxRate = Math.max(...growthRates.map(g => g.rate))
  const lagThresh = maxRate * 0.1
  const expThresh = maxRate * 0.5

  const phases: Phase[] = []
  const minTime = times[0]
  const maxTime = times[times.length - 1]

  let lagEnd = minTime
  for (const g of growthRates) {
    if (g.rate >= lagThresh) break
    lagEnd = g.time
  }
  if (lagEnd > minTime) phases.push({ name: 'lag', startTime: minTime, endTime: lagEnd })

  let expStart = lagEnd, expEnd = lagEnd, foundExp = false
  for (const g of growthRates) {
    if (g.time < lagEnd) continue
    if (g.rate >= expThresh) {
      if (!foundExp) { expStart = g.time; foundExp = true }
      expEnd = g.time
    } else if (foundExp) break
  }
  if (foundExp && expEnd > expStart) phases.push({ name: 'exponential', startTime: expStart, endTime: expEnd })

  const statStart = expEnd || lagEnd
  if (statStart < maxTime) phases.push({ name: 'stationary', startTime: statStart, endTime: maxTime })

  return phases
}

/** Volumetric productivity = (P_final - P_initial) / t_final */
export function calculateProductivity(timepoints: number[], values: number[]): number | null {
  if (timepoints.length < 2) return null
  const data = timepoints.map((t, i) => ({ t, v: values[i] })).sort((a, b) => a.t - b.t)
  const dt = data[data.length - 1].t
  return dt > 0 ? (data[data.length - 1].v - data[0].v) / dt : null
}

/** Last measured product concentration */
export function getFinalTiter(timepoints: number[], values: number[]): number | null {
  if (timepoints.length === 0) return null
  const data = timepoints.map((t, i) => ({ t, v: values[i] })).sort((a, b) => a.t - b.t)
  return data[data.length - 1].v
}
