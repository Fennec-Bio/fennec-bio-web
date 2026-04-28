'use client'

import type { CohortPayload, TimeSeriesEntry } from '@/lib/analysis/types'

export type MetricCategory = 'product' | 'secondary_product' | 'process_data'
export type ReductionKind = 'final' | 'max' | 'mean' | 'auc'

export function reduceSeries(series: TimeSeriesEntry, kind: ReductionKind): number | null {
  const ts = series.timepoints_h
  const vs = series.values
  const n = Math.min(ts.length, vs.length)

  const finitePairs: Array<{ t: number; v: number }> = []
  for (let i = 0; i < n; i++) {
    const v = vs[i]
    const t = ts[i]
    if (typeof v === 'number' && Number.isFinite(v) && typeof t === 'number' && Number.isFinite(t)) {
      finitePairs.push({ t, v })
    }
  }
  if (finitePairs.length === 0) return null

  if (kind === 'final') {
    return finitePairs[finitePairs.length - 1].v
  }
  if (kind === 'max') {
    let m = -Infinity
    for (const p of finitePairs) if (p.v > m) m = p.v
    return m
  }
  if (kind === 'mean') {
    let s = 0
    for (const p of finitePairs) s += p.v
    return s / finitePairs.length
  }
  // AUC: re-walk the original arrays so a null at index i breaks the segment.
  // Using `finitePairs` here would silently bridge gaps, which the spec forbids.
  let area = 0
  for (let i = 1; i < n; i++) {
    const v0 = vs[i - 1], v1 = vs[i]
    const t0 = ts[i - 1], t1 = ts[i]
    const v0Ok = typeof v0 === 'number' && Number.isFinite(v0)
    const v1Ok = typeof v1 === 'number' && Number.isFinite(v1)
    const t0Ok = typeof t0 === 'number' && Number.isFinite(t0)
    const t1Ok = typeof t1 === 'number' && Number.isFinite(t1)
    if (v0Ok && v1Ok && t0Ok && t1Ok) {
      area += ((v0 as number) + (v1 as number)) * 0.5 * ((t1 as number) - (t0 as number))
    }
  }
  return area
}

export function findSeries(
  experiment: CohortPayload['experiments'][number],
  category: MetricCategory,
  name: string,
): TimeSeriesEntry | null {
  return experiment.time_series.find(s => s.category === category && s.name === name) ?? null
}

export function listMetricNames(payload: CohortPayload, category: MetricCategory): string[] {
  const set = new Set<string>()
  for (const e of payload.experiments) {
    for (const s of e.time_series) {
      if (s.category === category) set.add(s.name)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export function commonUnit(payload: CohortPayload, category: MetricCategory, name: string): string {
  const counts = new Map<string, number>()
  for (const e of payload.experiments) {
    const s = findSeries(e, category, name)
    if (s) counts.set(s.unit, (counts.get(s.unit) ?? 0) + 1)
  }
  let best = ''
  let bestN = -1
  for (const [u, n] of counts) {
    if (n > bestN) { best = u; bestN = n }
  }
  return best
}

// Average-rank percentiles in [0, 1]. With n < 2, returns 0.5 for every input
// (caller should guard against this case to avoid the "all yellow" situation).
export function percentileRanks(values: number[]): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [0.5]
  const indexed = values.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(n)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++
    const avgRank = (i + j) / 2
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank
    i = j + 1
  }
  return ranks.map(r => r / (n - 1))
}

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">Percentile overlay</h3>
      <div className="text-sm text-gray-500">
        {payload.experiments.length} experiment(s) in cohort. Controls coming next.
      </div>
    </div>
  )
}
