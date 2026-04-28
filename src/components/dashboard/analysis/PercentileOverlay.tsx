'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
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

interface PlottedRun {
  expId: number
  expTitle: string
  series: TimeSeriesEntry
  scalar: number | null   // null = run is missing the second metric
  percentile: number | null
  color: string
}

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  const [plotCategory, setPlotCategory] = useState<MetricCategory>('product')
  const [plotName, setPlotName] = useState<string | null>(null)
  const [colorCategory, setColorCategory] = useState<ColorByCategory>('none')
  const [colorName, setColorName] = useState<string | null>(null)
  const [reduction, setReduction] = useState<ReductionKind>('final')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const plotNames = useMemo(
    () => listMetricNames(payload, plotCategory),
    [payload, plotCategory],
  )
  const colorNames = useMemo(
    () => colorCategory === 'none' ? [] : listMetricNames(payload, colorCategory),
    [payload, colorCategory],
  )

  // Auto-pick / repair the selected name when the available list changes.
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

  const computed = useMemo(() => {
    if (!plotName) {
      return {
        runs: [] as PlottedRun[],
        scalarStats: null as null | { min: number; max: number; n: number },
        excludedFromRanking: 0,
        rankingMode: 'none' as 'none' | 'percentile' | 'experiment-fallback' | 'all-tied',
        unit: '',
      }
    }

    const expColor = d3.scaleOrdinal(d3.schemeTableau10)

    // Stage 1: pick out the runs that have the plot metric.
    const stage1 = payload.experiments
      .map(e => {
        const series = findSeries(e, plotCategory, plotName)
        return series ? { expId: e.id, expTitle: e.title, series } : null
      })
      .filter((r): r is { expId: number; expTitle: string; series: TimeSeriesEntry } => r !== null)

    if (colorCategory === 'none' || !colorName) {
      const runs: PlottedRun[] = stage1.map(r => ({
        ...r,
        scalar: null,
        percentile: null,
        color: expColor(String(r.expId)),
      }))
      return {
        runs,
        scalarStats: null,
        excludedFromRanking: 0,
        rankingMode: 'none' as const,
        unit: commonUnit(payload, plotCategory, plotName),
      }
    }

    // Stage 2: compute the second-metric scalar for each stage-1 run.
    const withScalars = stage1.map(r => {
      const exp = payload.experiments.find(e => e.id === r.expId)!
      const colorSeries = findSeries(exp, colorCategory, colorName)
      const scalar = colorSeries ? reduceSeries(colorSeries, reduction) : null
      return { ...r, scalar }
    })

    const ranked = withScalars.filter(r => r.scalar !== null) as Array<typeof withScalars[number] & { scalar: number }>
    const excluded = withScalars.length - ranked.length

    if (ranked.length < 2) {
      const runs: PlottedRun[] = withScalars.map(r => ({
        ...r,
        percentile: null,
        color: r.scalar === null ? '#d1d5db' : expColor(String(r.expId)),
      }))
      return {
        runs,
        scalarStats: null,
        excludedFromRanking: excluded,
        rankingMode: 'experiment-fallback' as const,
        unit: commonUnit(payload, plotCategory, plotName),
      }
    }

    const allTied = ranked.every(r => r.scalar === ranked[0].scalar)
    const rankedScalars = ranked.map(r => r.scalar)
    const ranks = percentileRanks(rankedScalars)
    const min = Math.min(...rankedScalars)
    const max = Math.max(...rankedScalars)

    const rankByExpId = new Map<number, number>()
    ranked.forEach((r, i) => rankByExpId.set(r.expId, ranks[i]))

    const runs: PlottedRun[] = withScalars.map(r => {
      if (r.scalar === null) {
        return { ...r, percentile: null, color: '#d1d5db' }
      }
      const p = rankByExpId.get(r.expId) ?? 0.5
      return { ...r, percentile: p, color: d3.interpolateRdYlGn(p) }
    })

    return {
      runs,
      scalarStats: { min, max, n: ranked.length },
      excludedFromRanking: excluded,
      rankingMode: allTied ? 'all-tied' as const : 'percentile' as const,
      unit: commonUnit(payload, plotCategory, plotName),
    }
  }, [payload, plotCategory, plotName, colorCategory, colorName, reduction])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (!plotName || computed.runs.length === 0) return

    const width = svgRef.current.clientWidth
    const height = 420
    const margin = { top: 20, right: 30, bottom: 40, left: 60 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const allTimes = computed.runs.flatMap(r => r.series.timepoints_h)
    const allVals = computed.runs.flatMap(r => r.series.values).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (allVals.length === 0) return

    const x = d3.scaleLinear().domain([0, d3.max(allTimes) ?? 1]).nice().range([0, innerW])
    const y = d3.scaleLinear().domain([0, d3.max(allVals) ?? 1]).nice().range([innerH, 0])

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y))
    g.append('text').attr('x', innerW / 2).attr('y', innerH + 34).attr('text-anchor', 'middle')
      .attr('fill', '#666').attr('font-size', 12).text('time (h)')
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -45)
      .attr('text-anchor', 'middle').attr('fill', '#666').attr('font-size', 12)
      .text(`${plotName}${computed.unit ? ` (${computed.unit})` : ''}`)

    const line = d3.line<{ t: number; v: number | null }>()
      .defined(d => d.v !== null && Number.isFinite(d.v as number))
      .x(d => x(d.t))
      .y(d => y(d.v as number))

    for (const r of computed.runs) {
      const pts = r.series.timepoints_h.map((t, i) => ({ t, v: r.series.values[i] ?? null }))
      const key = `${r.expId}`
      const isMissing = r.scalar === null && computed.rankingMode !== 'none'
      const baseOpacity = isMissing ? 0.5 : 1
      const finalOpacity = hoveredKey && hoveredKey !== key ? 0.25 : baseOpacity
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', r.color)
        .attr('stroke-width', hoveredKey === key ? 3 : 1.5)
        .attr('opacity', finalOpacity)
        .attr('d', line)
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHoveredKey(key))
        .on('mouseleave', () => setHoveredKey(null))
        .append('title')
        .text(() => {
          const parts = [r.expTitle]
          if (r.scalar !== null && colorName) {
            parts.push(`${colorName} (${reduction}): ${formatScalar(r.scalar)}`)
          }
          if (r.percentile !== null) {
            parts.push(`percentile: ${(r.percentile * 100).toFixed(0)}%`)
          } else if (computed.rankingMode === 'percentile' || computed.rankingMode === 'all-tied') {
            parts.push(`percentile: — (missing ${colorName})`)
          }
          return parts.join('\n')
        })
    }
  }, [computed, plotName, colorName, reduction, hoveredKey])

  const noPlotMetricChosen = !plotName
  const noPlotData = !!plotName && computed.runs.length === 0

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

      {noPlotMetricChosen && (
        <div className="text-sm text-gray-500">Pick a metric to plot.</div>
      )}
      {noPlotData && (
        <div className="text-sm text-gray-500">
          No selected runs have data for {plotName}.
        </div>
      )}
      {!noPlotMetricChosen && !noPlotData && (
        <>
          <svg ref={svgRef} className="w-full" style={{ height: 420 }} />

          {computed.rankingMode === 'percentile' && computed.scalarStats && colorName && (
            <PercentileLegend
              metricName={colorName}
              reduction={reduction}
              min={computed.scalarStats.min}
              max={computed.scalarStats.max}
            />
          )}
          {computed.rankingMode === 'experiment-fallback' && colorName && (
            <div className="mt-2 text-xs text-amber-700">
              Not enough runs with {colorName} data to rank — coloring by experiment instead.
            </div>
          )}
          {computed.rankingMode === 'all-tied' && colorName && (
            <div className="mt-2 text-xs text-amber-700">
              All runs tied on {colorName} — no percentile spread.
            </div>
          )}
          {computed.excludedFromRanking > 0 && (computed.rankingMode === 'percentile' || computed.rankingMode === 'all-tied') && (
            <div className="mt-1 text-xs text-gray-500">
              {computed.excludedFromRanking} selected run(s) excluded from ranking (missing {colorName}).
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatScalar(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000 || (n !== 0 && Math.abs(n) < 0.01)) return n.toExponential(2)
  return n.toFixed(2)
}

function PercentileLegend({ metricName, reduction, min, max }: {
  metricName: string
  reduction: ReductionKind
  min: number
  max: number
}) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth
    const H = 28
    const stops = 32
    const stepW = W / stops
    for (let i = 0; i < stops; i++) {
      svg.append('rect')
        .attr('x', i * stepW)
        .attr('y', 0)
        .attr('width', stepW + 0.5)
        .attr('height', H)
        .attr('fill', d3.interpolateRdYlGn(i / (stops - 1)))
    }
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)
  }, [])

  return (
    <div className="mt-3">
      <svg ref={ref} className="w-full block rounded" style={{ height: 28 }} />
      <div className="flex justify-between mt-1 text-[11px] text-gray-600">
        <span>{formatScalar(min)}</span>
        <span className="text-gray-500">{metricName} ({reduction})</span>
        <span>{formatScalar(max)}</span>
      </div>
    </div>
  )
}
