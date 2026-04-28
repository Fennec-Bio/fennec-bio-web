'use client'

import { useMemo, useState } from 'react'
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
  // AUC: re-walk the original arrays so any non-finite point (null / NaN /
  // Infinity) at index i breaks the segment. Using `finitePairs` here would
  // silently bridge gaps, which the spec forbids. (The TimeSeriesEntry.values
  // type is `number[]` but the runtime payload may contain nulls — see the
  // `as number | null` cast in KineticOverlay.tsx.)
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

type ColorByCategory = MetricCategory | 'none'

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  const [plotCategory, setPlotCategory] = useState<MetricCategory>('product')
  const [plotName, setPlotName] = useState<string | null>(null)
  const [colorCategory, setColorCategory] = useState<ColorByCategory>('none')
  const [colorName, setColorName] = useState<string | null>(null)
  const [reduction, setReduction] = useState<ReductionKind>('final')

  const plotNames = useMemo(
    () => listMetricNames(payload, plotCategory),
    [payload, plotCategory],
  )
  const colorNames = useMemo(
    () => colorCategory === 'none' ? [] : listMetricNames(payload, colorCategory),
    [payload, colorCategory],
  )

  // Auto-pick a sensible default name when the category changes or when the
  // current name disappears from the available list.
  if (plotName === null && plotNames.length > 0) {
    setPlotName(plotNames[0])
  } else if (plotName !== null && !plotNames.includes(plotName)) {
    setPlotName(plotNames[0] ?? null)
  }
  if (colorCategory !== 'none' && colorName === null && colorNames.length > 0) {
    setColorName(colorNames[0])
  } else if (colorCategory !== 'none' && colorName !== null && !colorNames.includes(colorName)) {
    setColorName(colorNames[0] ?? null)
  } else if (colorCategory === 'none' && colorName !== null) {
    setColorName(null)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">Plot:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotCategory}
          onChange={e => setPlotCategory(e.target.value as MetricCategory)}
        >
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={plotName ?? ''}
          onChange={e => setPlotName(e.target.value || null)}
          disabled={plotNames.length === 0}
        >
          {plotNames.length === 0 && <option value="">— none available —</option>}
          {plotNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <span className="ml-6 text-gray-500">Color by:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={colorCategory}
          onChange={e => setColorCategory(e.target.value as ColorByCategory)}
        >
          <option value="none">(none)</option>
          <option value="product">product</option>
          <option value="secondary_product">secondary product</option>
          <option value="process_data">process data</option>
        </select>
        {colorCategory !== 'none' && (
          <>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={colorName ?? ''}
              onChange={e => setColorName(e.target.value || null)}
              disabled={colorNames.length === 0}
            >
              {colorNames.length === 0 && <option value="">— none available —</option>}
              {colorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select
              className="h-8 px-2 border border-gray-200 rounded-md text-sm"
              value={reduction}
              onChange={e => setReduction(e.target.value as ReductionKind)}
            >
              <option value="final">final value</option>
              <option value="max">max value</option>
              <option value="mean">mean</option>
              <option value="auc">area under curve</option>
            </select>
          </>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Plot: {plotCategory} / {plotName ?? '—'} · Color: {colorCategory === 'none' ? 'none' : `${colorCategory} / ${colorName ?? '—'} (${reduction})`}
      </div>
    </div>
  )
}
