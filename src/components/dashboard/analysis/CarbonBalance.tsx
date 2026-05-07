'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload, ExperimentInPayload } from '@/lib/analysis/types'
import {
  computeMassBalance,
  type MassBalanceMode,
} from '@/lib/analysis/carbonMassBalance'
import { carbonFractionForCompound } from './carbonConsumptionLogic'

type ViewMode = 'stacked-final' | 'carbon-balance' | 'stacked-over-time'

type CarbonBalanceStack = {
  id: number
  title: string
  carbonProducts: Record<string, number>
  carbonByproducts: Record<string, number>
  carbonBiomass: number
  carbonConsumed: number | null
  unaccounted: number
  mode: MassBalanceMode
  warnings: string[]
}

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

  const carbonStacks = useMemo<CarbonBalanceStack[]>(() => {
    return payload.experiments.map((e) => {
      const g = groupSeries(e)
      const substrate = e.time_series.find((s) => s.role === 'substrate') ?? null
      let carbonConsumed: number | null = null
      let mode: MassBalanceMode = 'concentration-only'
      const warnings: string[] = []

      if (substrate) {
        const balance = computeMassBalance({ experiment: e, substrate })
        mode = balance.mode
        carbonConsumed = balance.scalars.carbonConsumedFinalG
        if (mode === 'concentration-only') {
          warnings.push('mass balance unavailable; carbon consumed not computed')
        }
      } else {
        warnings.push('missing substrate')
      }

      const carbonProducts: Record<string, number> = {}
      for (const s of g.products) {
        const final = finalValue(s)
        const fraction = carbonFractionForCompound(s.name)
        if (fraction != null) carbonProducts[s.name] = final * fraction
      }

      const carbonByproducts: Record<string, number> = {}
      for (const s of g.byproducts) {
        const final = finalValue(s)
        const fraction = carbonFractionForCompound(s.name)
        if (fraction != null) carbonByproducts[s.name] = final * fraction
      }

      const carbonBiomass = g.biomass.length
        ? finalValue(g.biomass[0]) * (carbonFractionForCompound('Biomass') ?? 0.48)
        : 0
      const accounted =
        Object.values(carbonProducts).reduce((a, b) => a + b, 0)
        + Object.values(carbonByproducts).reduce((a, b) => a + b, 0)
        + carbonBiomass
      const unaccounted = carbonConsumed != null
        ? Math.max(0, carbonConsumed - accounted)
        : 0

      return {
        id: e.id,
        title: e.title,
        carbonProducts,
        carbonByproducts,
        carbonBiomass,
        carbonConsumed,
        unaccounted,
        mode,
        warnings,
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

  useEffect(() => {
    if (!ref.current || mode !== 'carbon-balance') return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth
    const rowH = 30
    const H = carbonStacks.length * rowH + 40
    const m = { top: 20, right: 20, bottom: 20, left: 140 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
    const y = d3.scaleBand().domain(carbonStacks.map(s => s.title)).range([0, ih]).padding(0.2)

    const totalsPer = carbonStacks.map(s =>
      Object.values(s.carbonProducts).reduce((a, b) => a + b, 0)
      + Object.values(s.carbonByproducts).reduce((a, b) => a + b, 0)
      + s.carbonBiomass + s.unaccounted)
    const maxTotal = d3.max(totalsPer) ?? 1
    const x = d3.scaleLinear().domain([0, maxTotal]).range([0, iw])

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y))

    const productColor = d3.scaleOrdinal(d3.schemeTableau10)
    const byproductColor = d3.scaleOrdinal(d3.schemeSet2)
    const unaccountedColor = '#d4d4d8'

    for (const s of carbonStacks) {
      let cursor = 0
      for (const [name, val] of Object.entries(s.carbonProducts)) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', productColor(name) as string)
          .append('title').text(`${name} (product C): ${val.toFixed(2)} g`)
        cursor += val
      }
      for (const [name, val] of Object.entries(s.carbonByproducts)) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + val) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', byproductColor(name) as string)
          .append('title').text(`${name} (byproduct C): ${val.toFixed(2)} g`)
        cursor += val
      }
      if (s.carbonBiomass > 0) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + s.carbonBiomass) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', '#9ca3af')
          .append('title').text(`biomass C: ${s.carbonBiomass.toFixed(2)} g`)
        cursor += s.carbonBiomass
      }
      if (s.unaccounted > 0) {
        g.append('rect')
          .attr('x', x(cursor)).attr('y', y(s.title) ?? 0)
          .attr('width', x(cursor + s.unaccounted) - x(cursor)).attr('height', y.bandwidth())
          .attr('fill', unaccountedColor)
          .append('title').text(`unaccounted C (likely CO2): ${s.unaccounted.toFixed(2)} g`)
        cursor += s.unaccounted
      }
      if (s.mode === 'concentration-only') {
        g.append('text')
          .attr('x', x(cursor) + 8)
          .attr('y', (y(s.title) ?? 0) + y.bandwidth() / 2 + 4)
          .attr('fill', '#737373').attr('font-size', 10).text('concentration-only')
          .append('title').text(s.warnings.join('; ') || 'Carbon balance unavailable for this experiment.')
      }
    }
  }, [carbonStacks, mode])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">View:</span>
        <select value={mode} onChange={e => setMode(e.target.value as ViewMode)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          <option value="stacked-final">Final mass (stacked)</option>
          <option value="carbon-balance">Carbon balance (with unaccounted)</option>
          <option value="stacked-over-time" disabled>Stacked over time (future)</option>
        </select>
        <div className="ml-auto text-xs text-gray-500">
          {mode === 'carbon-balance'
            ? 'Carbon (g): Products - Byproducts - Biomass - Unaccounted (likely CO2)'
            : 'Products - Byproducts - Biomass - Unaccounted carbon (CO2) not tracked in schema'}
          <span className="hidden">
          Products · Byproducts · Biomass · Unaccounted carbon (CO₂) not tracked in schema
          </span>
        </div>
      </div>
      <svg ref={ref} className="w-full" />
    </div>
  )
}
