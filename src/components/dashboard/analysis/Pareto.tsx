'use client'

import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchPareto } from '@/lib/analysis/api'
import type { OutcomeMetric, ParetoResult } from '@/lib/analysis/types'

export function Pareto({ ids, outcome, product }: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()
  const [data, setData] = useState<ParetoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const idsKey = ids.join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchPareto(token, ids, outcome, product)
        if (!cancelled) setData(r)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, outcome, product, getToken])

  useEffect(() => {
    if (!svgRef.current || !data) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (data.effects.length === 0) return

    const width = svgRef.current.clientWidth
    const rowH = 24
    const height = data.effects.length * rowH + 40
    const m = { top: 18, right: 40, bottom: 12, left: 200 }
    const innerW = width - m.left - m.right
    const innerH = height - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const absMax = d3.max(data.effects, e => Math.abs(e.standardized)) ?? 1
    const xMax = Math.max(absMax, data.cutoff) * 1.1
    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerW]).nice()
    const y = d3.scaleBand().domain(data.effects.map(e => e.name))
      .range([0, innerH]).padding(0.15)

    g.selectAll('rect').data(data.effects).enter().append('rect')
      .attr('x', 0)
      .attr('y', d => y(d.name) ?? 0)
      .attr('width', d => x(Math.abs(d.standardized)))
      .attr('height', y.bandwidth())
      .attr('fill', d => d.significant ? '#eb5234' : '#d1d5db')

    g.selectAll('.label').data(data.effects).enter().append('text')
      .attr('x', -8)
      .attr('y', d => (y(d.name) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', '#374151')
      .attr('font-size', 11)
      .text(d => d.name)

    g.selectAll('.value').data(data.effects).enter().append('text')
      .attr('x', d => x(Math.abs(d.standardized)) + 6)
      .attr('y', d => (y(d.name) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#6b7280')
      .attr('font-size', 10)
      .text(d => d.standardized.toFixed(2))

    g.append('line')
      .attr('x1', x(data.cutoff)).attr('x2', x(data.cutoff))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#000').attr('stroke-dasharray', '3,3')
    g.append('text')
      .attr('x', x(data.cutoff) + 4).attr('y', -6)
      .attr('fill', '#000').attr('font-size', 10)
      .text(`|t|≥${data.cutoff.toFixed(2)}`)
  }, [data])

  if (loading) return <div className="text-sm text-gray-500">Running Pareto…</div>
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>
  if (!data) return null
  if (data.effects.length === 0) {
    return <div className="text-sm text-gray-500">Not enough rows to fit the linear model.</div>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Pareto of standardized effects</h3>
      <svg ref={svgRef} className="w-full" />
      <div className="mt-2 text-xs text-gray-500">
        Bars past the dashed line meet the two-sided t-cutoff at α=0.05. n={data.n}.
      </div>
    </div>
  )
}
