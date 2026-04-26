'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchPCA } from '@/lib/analysis/api'
import type {
  CohortPayload,
  ExperimentInPayload,
  OutcomeMetric,
  PcaResult,
} from '@/lib/analysis/types'

function outcomeValue(
  e: ExperimentInPayload,
  outcome: OutcomeMetric,
  product: string | null,
): number | null {
  if (outcome === 'biomass') return e.outcomes.biomass
  if (outcome === 'mu_max') return e.outcomes.mu_max
  if (outcome === 'substrate_rate') return e.outcomes.substrate_rate
  const dict = (e.outcomes as unknown as Record<string, Record<string, number | null>>)[outcome]
  return dict && product ? (dict[product] ?? null) : null
}

export function PCABiplot({ payload, ids, outcome, product }: {
  payload: CohortPayload
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()

  const numericVars = useMemo(() => {
    const s = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) if (!Number.isNaN(parseFloat(v.value))) s.add(v.name)
    }
    return [...s].sort()
  }, [payload])

  const [selected, setSelected] = useState<string[]>(() => numericVars.slice(0, 6))
  const [includeOutcome, setIncludeOutcome] = useState(false)
  const [data, setData] = useState<PcaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<SVGSVGElement | null>(null)
  const idsKey = ids.join(',')
  const selKey = selected.join(',')

  useEffect(() => {
    if (selected.length < 2) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchPCA(token, {
          experiment_ids: ids,
          variables: selected,
          include_outcome: includeOutcome,
          outcome, product,
        })
        if (!cancelled) setData(r)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, selKey, includeOutcome, outcome, product, getToken])

  useEffect(() => {
    if (!ref.current || !data) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth, H = 480
    const m = { top: 20, right: 20, bottom: 46, left: 50 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const pc1s = data.scores.map(s => s.pc1)
    const pc2s = data.scores.map(s => s.pc2)
    const loadingsPc1 = data.loadings.map(l => l.pc1)
    const loadingsPc2 = data.loadings.map(l => l.pc2)
    const scoreMax = Math.max(...pc1s.map(Math.abs), ...pc2s.map(Math.abs), 1)
    const loadMax = Math.max(...loadingsPc1.map(Math.abs), ...loadingsPc2.map(Math.abs), 1e-12)
    const loadScale = scoreMax / loadMax * 0.9

    const x = d3.scaleLinear().domain([-scoreMax, scoreMax]).range([0, iw]).nice()
    const y = d3.scaleLinear().domain([-scoreMax, scoreMax]).range([ih, 0]).nice()
    g.append('g').attr('transform', `translate(0,${y(0)})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').attr('transform', `translate(${x(0)},0)`).call(d3.axisLeft(y).ticks(6))
    g.append('text').attr('x', iw / 2).attr('y', ih + 36)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280').attr('font-size', 11)
      .text(`PC1 (${(data.explained_variance[0] * 100).toFixed(1)}%)`)
    g.append('text').attr('transform', `translate(-36,${ih / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280').attr('font-size', 11)
      .text(`PC2 (${(data.explained_variance[1] * 100).toFixed(1)}%)`)

    const expMap = new Map(payload.experiments.map(e => [e.id, e]))
    const outVals = data.scores.map(s => {
      const exp = expMap.get(s.experiment_id)
      return exp ? outcomeValue(exp, outcome, product) : null
    })
    const finiteOut = outVals.filter(v => v !== null) as number[]
    const outDomain: [number, number] = finiteOut.length
      ? [Math.min(...finiteOut), Math.max(...finiteOut)]
      : [0, 1]
    const color = d3.scaleSequential(d3.interpolateViridis).domain(outDomain)

    g.selectAll('circle').data(data.scores).enter().append('circle')
      .attr('cx', d => x(d.pc1)).attr('cy', d => y(d.pc2))
      .attr('r', 5)
      .attr('fill', (_, i) => outVals[i] === null ? '#9ca3af' : (color(outVals[i] as number) as string))
      .attr('stroke', '#fff').attr('stroke-width', 1)
      .append('title').text(d => {
        const exp = expMap.get(d.experiment_id)
        return exp ? exp.title : `#${d.experiment_id}`
      })

    for (const l of data.loadings) {
      g.append('line')
        .attr('x1', x(0)).attr('y1', y(0))
        .attr('x2', x(l.pc1 * loadScale)).attr('y2', y(l.pc2 * loadScale))
        .attr('stroke', '#eb5234').attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrow)')
      g.append('text')
        .attr('x', x(l.pc1 * loadScale) + 4).attr('y', y(l.pc2 * loadScale))
        .attr('fill', '#eb5234').attr('font-size', 10)
        .text(l.variable)
    }

    svg.append('defs').append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 0 10 10')
      .attr('refX', 8).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#eb5234')
  }, [data, outcome, product, payload])

  if (numericVars.length < 2) {
    return <div className="text-sm text-gray-500">PCA needs at least 2 numeric variables.</div>
  }
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm flex-wrap">
        <span className="text-gray-500">Variables ({selected.length}):</span>
        <details className="relative">
          <summary className="h-8 px-3 border border-gray-200 rounded-md cursor-pointer">
            Edit
          </summary>
          <div className="absolute z-[9999] mt-1 w-[240px] max-h-60 overflow-y-auto bg-white
                          border border-gray-200 rounded-md shadow-lg">
            {numericVars.map(n => {
              const on = selected.includes(n)
              return (
                <div key={n}
                  onClick={() => setSelected(on ? selected.filter(x => x !== n) : [...selected, n])}
                  className="px-3 py-1.5 text-sm hover:bg-gray-100 cursor-pointer flex items-center gap-2">
                  <input type="checkbox" readOnly checked={on} /> {n}
                </div>
              )
            })}
          </div>
        </details>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={includeOutcome}
            onChange={e => setIncludeOutcome(e.target.checked)} />
          include outcome in PCA
        </label>
      </div>
      {loading && <div className="text-sm text-gray-500">Computing PCA…</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>}
      <svg ref={ref} className="w-full" style={{ height: 480 }} />
    </div>
  )
}
