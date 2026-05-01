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

function linearRegressionSlope(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n, my = sy / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    num += dx * (ys[i] - my)
    den += dx * dx
  }
  return den === 0 ? 0 : num / den
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  let s = 0
  for (const v of values) s += (v - m) ** 2
  return Math.sqrt(s / values.length)
}

export function calculateGrowthRate(
  timepoints: number[],
  odValues: number[],
): { muMax: number; muMaxTime: number } | null {
  if (timepoints.length < 3 || odValues.length < 3) return null

  const validData = timepoints
    .map((t, i) => ({ time: t, od: odValues[i] }))
    .filter((d) => d.od > 0)
    .sort((a, b) => a.time - b.time)

  if (validData.length < 3) return null

  const lnOD = validData.map((d) => Math.log(d.od))
  const times = validData.map((d) => d.time)

  let maxMu = 0
  let maxMuTime = 0
  const windowSize = Math.max(3, Math.floor(validData.length / 4))

  for (let i = 0; i <= validData.length - windowSize; i++) {
    const wt = times.slice(i, i + windowSize)
    const wy = lnOD.slice(i, i + windowSize)
    const mu = linearRegressionSlope(wt, wy)
    if (mu > maxMu) {
      maxMu = mu
      maxMuTime = (wt[0] + wt[wt.length - 1]) / 2
    }
  }

  return { muMax: maxMu, muMaxTime: maxMuTime }
}

export function calculateProductionRate(
  productTimepoints: number[],
  productValues: number[],
  odTimepoints: number[],
  odValues: number[],
): { qpMax: number; qpMaxTime: number } | null {
  if (productTimepoints.length < 3 || odTimepoints.length < 3) return null

  const productData = productTimepoints
    .map((t, i) => ({ time: t, value: productValues[i] }))
    .sort((a, b) => a.time - b.time)

  const odData = odTimepoints
    .map((t, i) => ({ time: t, value: odValues[i] }))
    .sort((a, b) => a.time - b.time)

  const interpolateOD = (time: number): number => {
    if (time <= odData[0].time) return odData[0].value
    if (time >= odData[odData.length - 1].time) return odData[odData.length - 1].value
    for (let i = 0; i < odData.length - 1; i++) {
      if (time >= odData[i].time && time <= odData[i + 1].time) {
        const ratio = (time - odData[i].time) / (odData[i + 1].time - odData[i].time)
        return odData[i].value + ratio * (odData[i + 1].value - odData[i].value)
      }
    }
    return odData[odData.length - 1].value
  }

  let maxQp = 0
  let maxQpTime = 0

  for (let i = 0; i < productData.length - 1; i++) {
    const dt = productData[i + 1].time - productData[i].time
    if (dt <= 0) continue
    const dP = productData[i + 1].value - productData[i].value
    const avgTime = (productData[i].time + productData[i + 1].time) / 2
    const avgOD = interpolateOD(avgTime)
    if (avgOD > 0) {
      const qp = (dP / dt) / avgOD
      if (qp > maxQp) {
        maxQp = qp
        maxQpTime = avgTime
      }
    }
  }

  return maxQp > 0 ? { qpMax: maxQp, qpMaxTime: maxQpTime } : null
}

export function calculateYield(
  productTimepoints: number[],
  productValues: number[],
  substrateTimepoints: number[],
  substrateValues: number[],
): number | null {
  if (productTimepoints.length < 2 || substrateTimepoints.length < 2) return null

  const productData = productTimepoints
    .map((t, i) => ({ time: t, value: productValues[i] }))
    .sort((a, b) => a.time - b.time)
  const substrateData = substrateTimepoints
    .map((t, i) => ({ time: t, value: substrateValues[i] }))
    .sort((a, b) => a.time - b.time)

  const deltaP = productData[productData.length - 1].value - productData[0].value
  const deltaS = substrateData[0].value - substrateData[substrateData.length - 1].value
  if (deltaS <= 0) return null
  return deltaP / deltaS
}

export function detectPhases(timepoints: number[], odValues: number[]): Phase[] {
  if (timepoints.length < 5 || odValues.length < 5) return []

  const data = timepoints
    .map((t, i) => ({ time: t, od: odValues[i] }))
    .filter((d) => d.od > 0)
    .sort((a, b) => a.time - b.time)
  if (data.length < 5) return []

  const times = data.map((d) => d.time)
  const lnOD = data.map((d) => Math.log(d.od))

  const growthRates: { time: number; rate: number }[] = []
  const windowSize = 3
  for (let i = 0; i <= data.length - windowSize; i++) {
    const wt = times.slice(i, i + windowSize)
    const wy = lnOD.slice(i, i + windowSize)
    const rate = linearRegressionSlope(wt, wy)
    growthRates.push({ time: (wt[0] + wt[wt.length - 1]) / 2, rate })
  }
  if (growthRates.length === 0) return []

  const maxRate = Math.max(...growthRates.map((gr) => gr.rate))
  const lagThreshold = maxRate * 0.1
  const expThreshold = maxRate * 0.5

  const phases: Phase[] = []
  const minTime = times[0]
  const maxTime = times[times.length - 1]

  let lagEnd = minTime
  for (const gr of growthRates) {
    if (gr.rate >= lagThreshold) break
    lagEnd = gr.time
  }
  if (lagEnd > minTime) phases.push({ name: 'lag', startTime: minTime, endTime: lagEnd })

  let expStart = lagEnd
  let expEnd = lagEnd
  let foundExp = false
  for (const gr of growthRates) {
    if (gr.time < lagEnd) continue
    if (gr.rate >= expThreshold) {
      if (!foundExp) { expStart = gr.time; foundExp = true }
      expEnd = gr.time
    } else if (foundExp) {
      break
    }
  }
  if (foundExp && expEnd > expStart) {
    phases.push({ name: 'exponential', startTime: expStart, endTime: expEnd })
  }

  const stationaryStart = expEnd || lagEnd
  if (stationaryStart < maxTime) {
    phases.push({ name: 'stationary', startTime: stationaryStart, endTime: maxTime })
  }
  return phases
}

export function calculateProductivity(
  timepoints: number[],
  productValues: number[],
): number | null {
  if (timepoints.length < 2 || productValues.length < 2) return null
  const data = timepoints
    .map((t, i) => ({ time: t, value: productValues[i] }))
    .sort((a, b) => a.time - b.time)
  const finalTime = data[data.length - 1].time
  const finalProduct = data[data.length - 1].value
  const initialProduct = data[0].value
  if (finalTime <= 0) return null
  return (finalProduct - initialProduct) / finalTime
}

export function getFinalTiter(timepoints: number[], values: number[]): number | null {
  if (timepoints.length === 0 || values.length === 0) return null
  const data = timepoints
    .map((t, i) => ({ time: t, value: values[i] }))
    .sort((a, b) => a.time - b.time)
  return data[data.length - 1].value
}
