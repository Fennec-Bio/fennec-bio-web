'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchResponseSurface } from '@/lib/analysis/api'
import type {
  CohortPayload,
  OutcomeMetric,
  ResponseSurfaceResult,
} from '@/lib/analysis/types'

export function ResponseSurface({ payload, ids, outcome, product }: {
  payload: CohortPayload
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()

  const numericVars = useMemo(() => {
    const s = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) {
        if (!Number.isNaN(parseFloat(v.value))) s.add(v.name)
      }
    }
    return [...s].sort()
  }, [payload])

  const [varX, setVarX] = useState<string>(() => numericVars[0] ?? '')
  const [varY, setVarY] = useState<string>(() => numericVars[1] ?? '')
  const [data, setData] = useState<ResponseSurfaceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<SVGSVGElement | null>(null)
  const idsKey = ids.join(',')

  useEffect(() => {
    if (!varX || !varY || varX === varY) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchResponseSurface(token, {
          experiment_ids: ids, outcome, product, var_x: varX, var_y: varY,
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
  }, [idsKey, outcome, product, varX, varY, getToken])

  useEffect(() => {
    if (!ref.current || !data) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth, H = 480
    const m = { top: 20, right: 30, bottom: 40, left: 50 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const x = d3.scaleLinear().domain(data.x_range).range([0, iw])
    const y = d3.scaleLinear().domain(data.y_range).range([ih, 0])
    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    const flat = data.z_grid.flat()
    const contours = d3.contours()
      .size([data.x_grid.length, data.y_grid.length])
      .thresholds(15)(flat)

    const zMin = d3.min(flat) ?? 0
    const zMax = d3.max(flat) ?? 1
    const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([zMin, zMax])

    g.append('g').selectAll('path').data(contours).enter().append('path')
      .attr('d', d3.geoPath(d3.geoIdentity().scale(1)))
      .attr('transform', `scale(${iw / (data.x_grid.length - 1)},${-ih / (data.y_grid.length - 1)}) translate(0, ${-(data.y_grid.length - 1)})`)
      .attr('fill', d => colorScale(d.value) as string)
      .attr('opacity', 0.8)
      .attr('stroke', '#ffffff').attr('stroke-width', 0.3)

    g.selectAll('circle.obs').data(data.observed_points).enter().append('circle')
      .attr('class', 'obs')
      .attr('cx', d => x(d.x)).attr('cy', d => y(d.y))
      .attr('r', 4).attr('fill', '#eb5234').attr('stroke', '#fff').attr('stroke-width', 1)

    if (data.optimum) {
      g.append('circle')
        .attr('cx', x(data.optimum.x)).attr('cy', y(data.optimum.y))
        .attr('r', 8).attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 2)
      g.append('text')
        .attr('x', x(data.optimum.x) + 12).attr('y', y(data.optimum.y) + 4)
        .attr('fill', '#000').attr('font-size', 11)
        .text(`optimum (${data.optimum.x.toFixed(2)}, ${data.optimum.y.toFixed(2)}) → ${data.optimum.predicted_outcome.toFixed(2)}`)
    }
  }, [data])

  if (numericVars.length < 2) {
    return <div className="text-sm text-gray-500">Need at least 2 numeric variables in the cohort.</div>
  }
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">X:</span>
        <select value={varX} onChange={e => setVarX(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          {numericVars.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="text-gray-500">Y:</span>
        <select value={varY} onChange={e => setVarY(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          {numericVars.filter(v => v !== varX).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {data && (
          <span className="ml-auto text-gray-500">R² = {data.r_squared.toFixed(3)}</span>
        )}
      </div>
      {loading && <div className="text-sm text-gray-500">Fitting surface…</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>}
      <svg ref={ref} className="w-full" style={{ height: 480 }} />
    </div>
  )
}
