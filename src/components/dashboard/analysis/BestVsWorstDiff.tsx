'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef } from 'react'
import type { CohortPayload, OutcomeMetric } from '@/lib/analysis/types'

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

export function BestVsWorstDiff({ payload, outcome, product }: {
  payload: CohortPayload
  outcome: OutcomeMetric
  product: string | null
}) {
  const ref = useRef<SVGSVGElement | null>(null)

  const result = useMemo(() => {
    const rows = payload.experiments
      .map(e => {
        const value = outcomeValue(e, outcome, product)
        const vars: Record<string, number> = {}
        for (const { name, value: raw } of e.variables) {
          const n = parseFloat(raw)
          if (!Number.isNaN(n)) vars[name] = n
        }
        return { value, vars }
      })
      .filter((r): r is { value: number; vars: Record<string, number> } =>
        r.value !== null && r.value !== undefined)

    if (rows.length < 4) return { bars: [], nTop: 0, nBot: 0 }

    rows.sort((a, b) => b.value - a.value)
    const k = Math.max(1, Math.floor(rows.length / 4))
    const top = rows.slice(0, k)
    const bot = rows.slice(-k)

    const vars = new Set<string>()
    for (const r of [...top, ...bot]) for (const n of Object.keys(r.vars)) vars.add(n)

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const variance = (xs: number[]) => {
      const m = mean(xs)
      return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
    }

    const bars: Array<{ name: string; d: number; top_mean: number; bot_mean: number }> = []
    for (const n of vars) {
      const tvals = top.map(r => r.vars[n]).filter((v): v is number => typeof v === 'number')
      const bvals = bot.map(r => r.vars[n]).filter((v): v is number => typeof v === 'number')
      if (tvals.length < 2 || bvals.length < 2) continue
      const tm = mean(tvals)
      const bm = mean(bvals)
      const pooled = Math.sqrt((variance(tvals) + variance(bvals)) / 2)
      const d = pooled > 0 ? (tm - bm) / pooled : 0
      bars.push({ name: n, d, top_mean: tm, bot_mean: bm })
    }
    bars.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    return { bars, nTop: top.length, nBot: bot.length }
  }, [payload, outcome, product])

  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    if (result.bars.length === 0) return

    const W = ref.current.clientWidth
    const rowH = 22
    const H = result.bars.length * rowH + 40
    const m = { top: 22, right: 50, bottom: 10, left: 200 }
    const iw = W - m.left - m.right
    const ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const absMax = d3.max(result.bars, b => Math.abs(b.d)) ?? 1
    const x = d3.scaleLinear().domain([-absMax, absMax]).range([0, iw]).nice()
    const y = d3.scaleBand()
      .domain(result.bars.map(b => b.name))
      .range([0, ih]).padding(0.15)

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5))
    g.append('line')
      .attr('x1', x(0)).attr('x2', x(0))
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', '#9ca3af')

    g.selectAll('rect').data(result.bars).enter().append('rect')
      .attr('x', d => x(Math.min(0, d.d)))
      .attr('y', d => y(d.name) ?? 0)
      .attr('width', d => Math.abs(x(d.d) - x(0)))
      .attr('height', y.bandwidth())
      .attr('fill', d => d.d >= 0 ? '#eb5234' : '#1d4ed8')

    g.selectAll('.name').data(result.bars).enter().append('text')
      .attr('x', -8).attr('y', d => (y(d.name) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em').attr('text-anchor', 'end')
      .attr('fill', '#374151').attr('font-size', 11)
      .text(d => d.name)

    g.selectAll('.value').data(result.bars).enter().append('text')
      .attr('x', d => x(d.d) + (d.d >= 0 ? 4 : -4))
      .attr('y', d => (y(d.name) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.d >= 0 ? 'start' : 'end')
      .attr('fill', '#6b7280').attr('font-size', 10)
      .text(d => d.d.toFixed(2))

    g.append('text')
      .attr('x', 0).attr('y', -6)
      .attr('fill', '#6b7280').attr('font-size', 10)
      .text('← higher in losers       higher in winners →')
  }, [result])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">
        Best ({result.nTop}) vs worst ({result.nBot}) — Cohen&apos;s d
      </h3>
      {result.bars.length === 0 ? (
        <div className="text-sm text-gray-500">
          Not enough numeric variables or rows to compute d.
        </div>
      ) : (
        <svg ref={ref} className="w-full" />
      )}
    </div>
  )
}
