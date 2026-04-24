'use client'

import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchAnova } from '@/lib/analysis/api'
import type { AnovaImpact, AnovaResult, OutcomeMetric } from '@/lib/analysis/types'

function starsFor(p: number): string {
  if (p < 0.001) return '***'
  if (p < 0.01)  return '**'
  if (p < 0.05)  return '*'
  return ''
}

export function AnovaHeatmap({ ids, outcome, product }: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()
  const [result, setResult] = useState<AnovaResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AnovaImpact | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const boxSvgRef = useRef<SVGSVGElement | null>(null)
  const idsKey = ids.join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchAnova(token, ids, outcome, product)
        if (cancelled) return
        setResult(r)
        setSelected(null)
      } catch (e) {
        if (cancelled) return
        setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, outcome, product, getToken])

  useEffect(() => {
    if (!svgRef.current || !result) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const impacts = result.impacts
    if (impacts.length === 0) return

    const width = svgRef.current.clientWidth
    const rowH = 26
    const height = impacts.length * rowH + 30
    const margin = { top: 20, right: 120, bottom: 10, left: 160 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const y = d3.scaleBand().domain(impacts.map(i => i.variable)).range([0, innerH]).padding(0.15)
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW])
    const color = d3.scaleLinear<string>().domain([0, 0.3, 1]).range(['#ddd', '#93c5fd', '#1d4ed8'])

    g.selectAll('rect').data(impacts).enter().append('rect')
      .attr('x', 0)
      .attr('y', d => y(d.variable) ?? 0)
      .attr('width', d => x(d.eta_squared))
      .attr('height', y.bandwidth())
      .attr('fill', d => color(d.eta_squared))
      .attr('cursor', 'pointer')
      .on('click', (_, d) => setSelected(d))

    g.selectAll('.label').data(impacts).enter().append('text')
      .attr('x', -8).attr('y', d => (y(d.variable) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em').attr('text-anchor', 'end')
      .attr('fill', '#374151').attr('font-size', 12)
      .text(d => d.variable)

    g.selectAll('.value').data(impacts).enter().append('text')
      .attr('x', d => x(d.eta_squared) + 6)
      .attr('y', d => (y(d.variable) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em').attr('fill', '#6b7280').attr('font-size', 11)
      .text(d => `η²=${d.eta_squared.toFixed(2)} ${starsFor(d.p_value)} n=${d.n}`)
  }, [result])

  useEffect(() => {
    if (!boxSvgRef.current || !selected) return
    const svg = d3.select(boxSvgRef.current)
    svg.selectAll('*').remove()
    const width = boxSvgRef.current.clientWidth
    const height = 220
    const margin = { top: 20, right: 20, bottom: 40, left: 40 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg.attr('viewBox', `0 0 ${width} ${height}`)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3.scaleBand()
      .domain(selected.group_data.map(gd => gd.group))
      .range([0, innerW]).padding(0.3)
    const allVals = selected.group_data.flatMap(gd => gd.values)
    const yScale = d3.scaleLinear()
      .domain([d3.min(allVals) ?? 0, d3.max(allVals) ?? 1]).nice()
      .range([innerH, 0])

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(xScale))
    g.append('g').call(d3.axisLeft(yScale))

    for (const gd of selected.group_data) {
      const cx = (xScale(gd.group) ?? 0) + xScale.bandwidth() / 2
      const sorted = [...gd.values].sort((a, b) => a - b)
      const q1 = d3.quantile(sorted, 0.25) ?? 0
      const med = d3.quantile(sorted, 0.5) ?? 0
      const q3 = d3.quantile(sorted, 0.75) ?? 0
      const iqr = q3 - q1
      const lo = Math.max(sorted[0], q1 - 1.5 * iqr)
      const hi = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr)
      const w = xScale.bandwidth() * 0.6
      g.append('rect')
        .attr('x', cx - w / 2).attr('y', yScale(q3))
        .attr('width', w).attr('height', yScale(q1) - yScale(q3))
        .attr('fill', '#93c5fd').attr('stroke', '#1d4ed8')
      g.append('line')
        .attr('x1', cx - w / 2).attr('x2', cx + w / 2)
        .attr('y1', yScale(med)).attr('y2', yScale(med))
        .attr('stroke', '#1d4ed8').attr('stroke-width', 2)
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', yScale(q3)).attr('y2', yScale(hi))
        .attr('stroke', '#1d4ed8')
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', yScale(q1)).attr('y2', yScale(lo))
        .attr('stroke', '#1d4ed8')
      for (const v of gd.values) {
        g.append('circle')
          .attr('cx', cx + (Math.random() - 0.5) * w * 0.4)
          .attr('cy', yScale(v)).attr('r', 2.5)
          .attr('fill', '#eb5234')
      }
    }
  }, [selected])

  if (loading) return <div className="text-sm text-gray-500">Running ANOVA…</div>
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>
  if (!result) return null
  if (result.impacts.length === 0) {
    return <div className="text-sm text-gray-500">No variable contrasts in this cohort (need ≥3 experiments across ≥2 groups).</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Variable impact (η²)</h3>
        <svg ref={svgRef} className="w-full" />
      </div>
      {selected && (
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            {selected.variable} — distribution per group
          </h3>
          <svg ref={boxSvgRef} className="w-full" style={{ height: 220 }} />
        </div>
      )}
    </div>
  )
}
