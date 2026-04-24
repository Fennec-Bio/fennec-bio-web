'use client'

import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchMainEffects } from '@/lib/analysis/api'
import type {
  InteractionEntry,
  MainEffectFactor,
  MainEffectsResult,
  OutcomeMetric,
} from '@/lib/analysis/types'

export function MainEffects({ ids, outcome, product, factors }: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
  factors?: string[]
}) {
  const { getToken } = useAuth()
  const [data, setData] = useState<MainEffectsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idsKey = ids.join(',')
  const factorsKey = (factors ?? []).join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchMainEffects(token, ids, outcome, product, factors)
        if (!cancelled) setData(r)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, outcome, product, factorsKey, getToken])

  if (loading) return <div className="text-sm text-gray-500">Running main effects…</div>
  if (error)   return <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>
  if (!data)   return null

  const meCols = Math.min(data.main_effects.length || 1, 3)
  const interCols = Math.min(data.interactions.length || 1, 3)

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Main effects</h3>
        {data.main_effects.length === 0 ? (
          <div className="text-sm text-gray-500">No factor levels available in this cohort.</div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${meCols}, 1fr)` }}>
            {data.main_effects.map(f => <MainEffectPlot key={f.factor} factor={f} />)}
          </div>
        )}
      </div>
      {data.interactions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">2-way interactions</h3>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${interCols}, 1fr)` }}>
            {data.interactions.map((inter, i) => (
              <InteractionPlot key={`${inter.factor_a}-${inter.factor_b}-${i}`} inter={inter} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MainEffectPlot({ factor }: { factor: MainEffectFactor }) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current || factor.levels.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const width = ref.current.clientWidth || 280
    const height = 200
    const m = { top: 12, right: 12, bottom: 30, left: 42 }
    const innerW = width - m.left - m.right
    const innerH = height - m.top - m.bottom
    const g = svg.attr('viewBox', `0 0 ${width} ${height}`)
      .append('g').attr('transform', `translate(${m.left},${m.top})`)

    const x = d3.scalePoint<string>()
      .domain(factor.levels.map(l => l.level))
      .range([0, innerW])
      .padding(0.5)
    const yMin = d3.min(factor.levels, l => l.mean - l.stderr) ?? 0
    const yMax = d3.max(factor.levels, l => l.mean + l.stderr) ?? 1
    const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([innerH, 0])

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y).ticks(4))

    const line = d3.line<MainEffectFactor['levels'][number]>()
      .x(d => x(d.level) ?? 0)
      .y(d => y(d.mean))
    g.append('path')
      .datum(factor.levels)
      .attr('fill', 'none')
      .attr('stroke', '#eb5234')
      .attr('stroke-width', 2)
      .attr('d', line)

    g.selectAll('line.err').data(factor.levels).enter().append('line')
      .attr('x1', d => x(d.level) ?? 0)
      .attr('x2', d => x(d.level) ?? 0)
      .attr('y1', d => y(d.mean - d.stderr))
      .attr('y2', d => y(d.mean + d.stderr))
      .attr('stroke', '#eb5234')
      .attr('stroke-width', 1)

    g.selectAll('circle').data(factor.levels).enter().append('circle')
      .attr('cx', d => x(d.level) ?? 0)
      .attr('cy', d => y(d.mean))
      .attr('r', 4)
      .attr('fill', '#eb5234')
  }, [factor])

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{factor.factor}</div>
      <svg ref={ref} className="w-full" style={{ height: 200 }} />
    </div>
  )
}

function InteractionPlot({ inter }: { inter: InteractionEntry }) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current || inter.grid.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const width = ref.current.clientWidth || 280
    const height = 220
    const m = { top: 12, right: 12, bottom: 36, left: 42 }
    const innerW = width - m.left - m.right
    const innerH = height - m.top - m.bottom
    const g = svg.attr('viewBox', `0 0 ${width} ${height}`)
      .append('g').attr('transform', `translate(${m.left},${m.top})`)

    const levelsA = Array.from(new Set(inter.grid.map(c => c.level_a)))
    const levelsB = Array.from(new Set(inter.grid.map(c => c.level_b)))
    const x = d3.scalePoint<string>().domain(levelsA).range([0, innerW]).padding(0.5)
    const yExtent = d3.extent(inter.grid, d => d.mean) as [number, number]
    const y = d3.scaleLinear().domain(yExtent).nice().range([innerH, 0])
    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(levelsB)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y).ticks(4))

    for (const lb of levelsB) {
      const cells = inter.grid.filter(c => c.level_b === lb)
        .sort((a, b) => levelsA.indexOf(a.level_a) - levelsA.indexOf(b.level_a))
      const line = d3.line<InteractionEntry['grid'][number]>()
        .x(d => x(d.level_a) ?? 0)
        .y(d => y(d.mean))
      g.append('path').datum(cells)
        .attr('fill', 'none')
        .attr('stroke', color(lb) as string)
        .attr('stroke-width', 2)
        .attr('d', line)
      g.selectAll(null).data(cells).enter().append('circle')
        .attr('cx', d => x(d.level_a) ?? 0)
        .attr('cy', d => y(d.mean))
        .attr('r', 3)
        .attr('fill', color(lb) as string)
    }

    const legend = svg.append('g').attr('transform', `translate(${m.left},${height - 12})`)
    levelsB.forEach((lb, i) => {
      const entry = legend.append('g').attr('transform', `translate(${i * 90},0)`)
      entry.append('rect').attr('width', 10).attr('height', 10).attr('fill', color(lb) as string)
      entry.append('text').attr('x', 14).attr('y', 9)
        .attr('font-size', 10).attr('fill', '#4b5563').text(lb)
    })
  }, [inter])

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{inter.factor_a} × {inter.factor_b}</div>
      <svg ref={ref} className="w-full" style={{ height: 220 }} />
    </div>
  )
}
