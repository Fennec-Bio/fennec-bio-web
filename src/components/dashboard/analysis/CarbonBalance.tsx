'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload, ExperimentInPayload } from '@/lib/analysis/types'

type ViewMode = 'stacked-final' | 'stacked-over-time'

function groupSeries(exp: ExperimentInPayload) {
  const products = exp.time_series.filter(s => s.category === 'product')
  const byproducts = exp.time_series.filter(s => s.category === 'secondary_product')
  const biomass = exp.time_series.filter(s => s.role === 'biomass')
  return { products, byproducts, biomass }
}

function finalValue(serie: { values: number[]; timepoints_h: number[] }): number {
  if (serie.values.length === 0) return 0
  const idx = serie.timepoints_h.indexOf(Math.max(...serie.timepoints_h))
  return serie.values[idx] ?? 0
}

export function CarbonBalance({ payload }: { payload: CohortPayload }) {
  const [mode, setMode] = useState<ViewMode>('stacked-final')
  const ref = useRef<SVGSVGElement | null>(null)

  const finalStacks = useMemo(() => {
    return payload.experiments.map(e => {
      const g = groupSeries(e)
      const productTotals: Record<string, number> = {}
      for (const s of g.products) productTotals[s.name] = finalValue(s)
      const byproductTotals: Record<string, number> = {}
      for (const s of g.byproducts) byproductTotals[s.name] = finalValue(s)
      const biomassVal = g.biomass.length ? finalValue(g.biomass[0]) : 0
      return {
        id: e.id, title: e.title,
        productTotals, byproductTotals, biomassVal,
        warnings: g.biomass.length === 0 ? ['missing biomass'] : [],
      }
    })
  }, [payload])

  useEffect(() => {
    if (!ref.current || mode !== 'stacked-final') return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth
    const rowH = 30
    const H = finalStacks.length * rowH + 40
    const m = { top: 20, right: 20, bottom: 20, left: 140 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
    const y = d3.scaleBand().domain(finalStacks.map(s => s.title)).range([0, ih]).padding(0.2)

    const totalsPer = finalStacks.map(s =>
      Object.values(s.productTotals).reduce((a, b) => a + b, 0)
      + Object.values(s.byproductTotals).reduce((a, b) => a + b, 0)
      + s.biomassVal)
    const maxTotal = d3.max(totalsPer) ?? 1
    const x = d3.scaleLinear().domain([0, maxTotal]).range([0, iw])

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y))

    const productColor = d3.scaleOrdinal(d3.schemeTableau10)
    const byproductColor = d3.scaleOrdinal(d3.schemeSet2)

    for (const s of finalStacks) {
      let cursor = 0
      for (const [name, val] of Object.entries(s.productTotals)) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', productColor(name) as string)
          .append('title').text(`${name} (product): ${val.toFixed(2)}`)
        cursor += val
      }
      for (const [name, val] of Object.entries(s.byproductTotals)) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', byproductColor(name) as string)
          .append('title').text(`${name} (byproduct): ${val.toFixed(2)}`)
        cursor += val
      }
      if (s.biomassVal > 0) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + s.biomassVal) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', '#9ca3af')
          .append('title').text(`biomass: ${s.biomassVal.toFixed(2)}`)
      }
      if (s.warnings.length) {
        g.append('text')
          .attr('x', x(cursor) + 8).attr('y', (y(s.title) ?? 0) + y.bandwidth() / 2 + 4)
          .attr('fill', '#b84400').attr('font-size', 10).text('⚠')
          .append('title').text(s.warnings.join('; '))
      }
    }
  }, [finalStacks, mode])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">View:</span>
        <select value={mode} onChange={e => setMode(e.target.value as ViewMode)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          <option value="stacked-final">Final mass (stacked)</option>
          <option value="stacked-over-time" disabled>
            Stacked over time (future)
          </option>
        </select>
        <div className="ml-auto text-xs text-gray-500">
          Products · Byproducts · Biomass · Unaccounted carbon (CO₂) not tracked in schema
        </div>
      </div>
      <svg ref={ref} className="w-full" />
    </div>
  )
}
