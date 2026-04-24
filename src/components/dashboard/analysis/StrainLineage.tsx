'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef } from 'react'
import type { CohortPayload, OutcomeMetric } from '@/lib/analysis/types'

interface StrainBucket {
  name: string
  parentName: string | null
  modifications: string[]
  values: number[]
}

function outcomeValue(
  e: CohortPayload['experiments'][number],
  outcome: OutcomeMetric,
  product: string | null,
): number | null {
  if (outcome === 'biomass')        return e.outcomes.biomass
  if (outcome === 'mu_max')         return e.outcomes.mu_max
  if (outcome === 'substrate_rate') return e.outcomes.substrate_rate
  const dict = (e.outcomes as unknown as Record<string, Record<string, number | null>>)[outcome]
  return dict && product ? (dict[product] ?? null) : null
}

export function StrainLineage({ payload, product, outcome }: {
  payload: CohortPayload
  product: string | null
  outcome: OutcomeMetric
}) {
  const buckets = useMemo<StrainBucket[]>(() => {
    const map = new Map<string, StrainBucket>()
    for (const e of payload.experiments) {
      const strainName = e.strain?.name ?? '—'
      if (!map.has(strainName)) {
        map.set(strainName, {
          name: strainName,
          parentName: e.strain?.parent_strain?.name ?? null,
          modifications: (e.strain?.modifications ?? [])
            .map(m => `${m.modification_type}:${m.gene_name}`),
          values: [],
        })
      }
      const v = outcomeValue(e, outcome, product)
      if (v !== null) map.get(strainName)!.values.push(v)
    }
    return [...map.values()]
  }, [payload, product, outcome])

  const svgRef = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!svgRef.current || buckets.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth
    const rowH = 64
    const height = buckets.length * rowH + 40
    const m = { top: 10, right: 40, bottom: 30, left: 180 }
    const innerW = width - m.left - m.right
    const innerH = height - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const allVals = buckets.flatMap(b => b.values)
    if (allVals.length === 0) return
    const x = d3.scaleLinear()
      .domain(d3.extent(allVals) as [number, number])
      .nice().range([0, innerW])
    const y = d3.scaleBand()
      .domain(buckets.map(b => b.name))
      .range([0, innerH]).padding(0.35)
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5))
    g.append('g').call(d3.axisLeft(y))

    const parentMean = (parentName: string | null): number | null => {
      if (!parentName) return null
      const b = buckets.find(bb => bb.name === parentName)
      if (!b || b.values.length === 0) return null
      return b.values.reduce((a, c) => a + c, 0) / b.values.length
    }

    for (const b of buckets) {
      const yc = (y(b.name) ?? 0) + y.bandwidth() / 2
      const parentM = parentMean(b.parentName)
      if (parentM !== null) {
        g.append('line')
          .attr('x1', x(parentM)).attr('x2', x(parentM))
          .attr('y1', yc - 14).attr('y2', yc + 14)
          .attr('stroke', '#9ca3af').attr('stroke-dasharray', '3,3')
        g.append('text').attr('x', x(parentM)).attr('y', yc - 18)
          .attr('text-anchor', 'middle').attr('fill', '#6b7280').attr('font-size', 9)
          .text(`parent (${b.parentName})`)
      }
      const sorted = [...b.values].sort((a, c) => a - c)
      if (sorted.length) {
        const q1 = d3.quantile(sorted, 0.25) ?? sorted[0]
        const q3 = d3.quantile(sorted, 0.75) ?? sorted[0]
        const med = d3.quantile(sorted, 0.5) ?? sorted[0]
        g.append('rect')
          .attr('x', x(q1)).attr('y', yc - 8)
          .attr('width', Math.max(1, x(q3) - x(q1))).attr('height', 16)
          .attr('fill', '#eb523433').attr('stroke', '#eb5234')
        g.append('line')
          .attr('x1', x(med)).attr('x2', x(med))
          .attr('y1', yc - 8).attr('y2', yc + 8)
          .attr('stroke', '#eb5234').attr('stroke-width', 2)
        g.selectAll(null).data(b.values).enter().append('circle')
          .attr('cx', d => x(d))
          .attr('cy', () => yc + (Math.random() - 0.5) * 6)
          .attr('r', 2.5).attr('fill', '#1d4ed8')
      }
      if (b.modifications.length > 0) {
        g.append('text').attr('x', -8).attr('y', yc + 14)
          .attr('text-anchor', 'end').attr('fill', '#9ca3af').attr('font-size', 9)
          .text(b.modifications.join(', '))
      }
    }
  }, [buckets])

  if (buckets.length === 0) {
    return <div className="text-sm text-gray-500">No strains in cohort.</div>
  }
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">
        Strain lineage — {outcome}{product ? ` · ${product}` : ''}
      </h3>
      <svg ref={svgRef} className="w-full" />
      <div className="mt-2 text-xs text-gray-500">
        Grey dashed line = parent strain&apos;s mean outcome. Blue dots = individual runs.
      </div>
    </div>
  )
}
