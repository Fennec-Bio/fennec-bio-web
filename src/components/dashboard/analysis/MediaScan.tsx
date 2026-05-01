'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CohortPayload,
  ExperimentInPayload,
  OutcomeMetric,
} from '@/lib/analysis/types'

type ScanAxis =
  | { kind: 'carbon_identity' }
  | { kind: 'cn_ratio' }
  | {
      kind: 'component_concentration'
      componentName: string
      source: 'carbon' | 'nitrogen' | 'complex' | 'additional'
    }

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

function carbonIdentityOf(e: ExperimentInPayload): string {
  const m = e.batch_media
  if (!m || m.carbon_sources.length === 0) return '—'
  return m.carbon_sources.map(c => c.name).sort().join(', ')
}

function cnRatioOf(e: ExperimentInPayload): number | null {
  const m = e.batch_media
  if (!m) return null
  const c = m.carbon_sources.reduce((a, s) => a + (s.concentration ?? 0), 0)
  const n = m.nitrogen_sources.reduce((a, s) => a + (s.concentration ?? 0), 0)
  return n > 0 ? c / n : null
}

function componentConcOf(
  e: ExperimentInPayload,
  source: 'carbon' | 'nitrogen' | 'complex' | 'additional',
  name: string,
): number | null {
  const m = e.batch_media
  if (!m) return null
  const list = source === 'carbon' ? m.carbon_sources
    : source === 'nitrogen' ? m.nitrogen_sources
    : source === 'complex' ? m.complex_components
    : m.additional_components
  const c = list.find(x => x.name === name)
  return c ? (c.concentration ?? null) : null
}

export function MediaScan({ payload, outcome, product }: {
  payload: CohortPayload
  outcome: OutcomeMetric
  product: string | null
}) {
  const catalog = useMemo(() => {
    const out = {
      carbon: new Set<string>(), nitrogen: new Set<string>(),
      complex: new Set<string>(), additional: new Set<string>(),
    }
    for (const e of payload.experiments) {
      const m = e.batch_media
      if (!m) continue
      for (const c of m.carbon_sources) out.carbon.add(c.name)
      for (const c of m.nitrogen_sources) out.nitrogen.add(c.name)
      for (const c of m.complex_components) out.complex.add(c.name)
      for (const c of m.additional_components) out.additional.add(c.name)
    }
    return {
      carbon: [...out.carbon].sort(),
      nitrogen: [...out.nitrogen].sort(),
      complex: [...out.complex].sort(),
      additional: [...out.additional].sort(),
    }
  }, [payload])

  const [axis, setAxis] = useState<ScanAxis>({ kind: 'carbon_identity' })
  const ref = useRef<SVGSVGElement | null>(null)

  const pointData = useMemo(() => {
    return payload.experiments.map(e => {
      const v = outcomeValue(e, outcome, product)
      if (v === null) return null
      if (axis.kind === 'carbon_identity') {
        return { x: carbonIdentityOf(e), y: v, isCategorical: true as const, id: e.id }
      }
      if (axis.kind === 'cn_ratio') {
        const r = cnRatioOf(e)
        if (r === null) return null
        return { x: r, y: v, isCategorical: false as const, id: e.id }
      }
      const c = componentConcOf(e, axis.source, axis.componentName)
      if (c === null) return null
      return { x: c, y: v, isCategorical: false as const, id: e.id }
    }).filter(Boolean) as Array<
      | { x: string; y: number; isCategorical: true; id: number }
      | { x: number; y: number; isCategorical: false; id: number }
    >
  }, [payload, axis, outcome, product])

  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    if (pointData.length === 0) return
    const W = ref.current.clientWidth, H = 360
    const m = { top: 20, right: 20, bottom: 46, left: 50 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const ys = pointData.map(p => p.y)
    const y = d3.scaleLinear().domain(d3.extent(ys) as [number, number]).nice().range([ih, 0])
    g.append('g').call(d3.axisLeft(y))

    if (pointData[0].isCategorical) {
      const cats = Array.from(new Set(pointData.map(p => p.x as string)))
      const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.25)
      g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x))
      for (const cat of cats) {
        const vals = pointData.filter(p => (p.x as string) === cat).map(p => p.y).sort((a, b) => a - b)
        const q1 = d3.quantile(vals, 0.25) ?? vals[0]
        const med = d3.quantile(vals, 0.5) ?? vals[0]
        const q3 = d3.quantile(vals, 0.75) ?? vals[0]
        const cx = (x(cat) ?? 0) + x.bandwidth() / 2
        const bw = x.bandwidth() * 0.6
        g.append('rect').attr('x', cx - bw / 2).attr('y', y(q3))
          .attr('width', bw).attr('height', y(q1) - y(q3))
          .attr('fill', '#93c5fd').attr('stroke', '#1d4ed8')
        g.append('line').attr('x1', cx - bw / 2).attr('x2', cx + bw / 2)
          .attr('y1', y(med)).attr('y2', y(med))
          .attr('stroke', '#1d4ed8').attr('stroke-width', 2)
        for (const v of vals) {
          g.append('circle').attr('cx', cx + (Math.random() - 0.5) * bw * 0.3)
            .attr('cy', y(v)).attr('r', 3).attr('fill', '#eb5234')
        }
      }
    } else {
      const xs = pointData.map(p => p.x as number)
      const x = d3.scaleLinear().domain(d3.extent(xs) as [number, number]).nice().range([0, iw])
      g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x))
      const meanX = d3.mean(xs) ?? 0
      const meanY = d3.mean(ys) ?? 0
      let num = 0, den = 0
      xs.forEach((v, i) => { num += (v - meanX) * (ys[i] - meanY); den += (v - meanX) ** 2 })
      const slope = den !== 0 ? num / den : 0
      const intercept = meanY - slope * meanX
      const xD = x.domain()
      g.append('line')
        .attr('x1', x(xD[0])).attr('x2', x(xD[1]))
        .attr('y1', y(slope * xD[0] + intercept)).attr('y2', y(slope * xD[1] + intercept))
        .attr('stroke', '#1d4ed8').attr('stroke-dasharray', '3,3')
      g.selectAll('circle').data(pointData).enter().append('circle')
        .attr('cx', d => x(d.x as number)).attr('cy', d => y(d.y))
        .attr('r', 4).attr('fill', '#eb5234').attr('opacity', 0.8)
      const ssRes = xs.reduce((a, xv, i) => {
        const yhat = slope * xv + intercept
        return a + (ys[i] - yhat) ** 2
      }, 0)
      const ssTot = ys.reduce((a, yv) => a + (yv - meanY) ** 2, 0)
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
      g.append('text').attr('x', iw - 8).attr('y', 12).attr('text-anchor', 'end')
        .attr('fill', '#1d4ed8').attr('font-size', 11)
        .text(`R² = ${r2.toFixed(2)}`)
    }
  }, [pointData])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm flex-wrap">
        <span className="text-gray-500">Axis:</span>
        <select
          value={axis.kind === 'component_concentration' ? `conc:${axis.source}:${axis.componentName}` : axis.kind}
          onChange={e => {
            const v = e.target.value
            if (v === 'carbon_identity') setAxis({ kind: 'carbon_identity' })
            else if (v === 'cn_ratio') setAxis({ kind: 'cn_ratio' })
            else if (v.startsWith('conc:')) {
              const [, src, ...nameParts] = v.split(':')
              setAxis({ kind: 'component_concentration',
                source: src as 'carbon' | 'nitrogen' | 'complex' | 'additional',
                componentName: nameParts.join(':') })
            }
          }}
          className="h-8 px-2 border border-gray-200 rounded-md">
          <option value="carbon_identity">Carbon source (identity)</option>
          <option value="cn_ratio">C:N ratio</option>
          <optgroup label="Carbon source concentration">
            {catalog.carbon.map(n =>
              <option key={`carbon:${n}`} value={`conc:carbon:${n}`}>{n} (carbon)</option>
            )}
          </optgroup>
          <optgroup label="Nitrogen source concentration">
            {catalog.nitrogen.map(n =>
              <option key={`nitrogen:${n}`} value={`conc:nitrogen:${n}`}>{n} (nitrogen)</option>
            )}
          </optgroup>
          <optgroup label="Complex component concentration">
            {catalog.complex.map(n =>
              <option key={`complex:${n}`} value={`conc:complex:${n}`}>{n} (complex)</option>
            )}
          </optgroup>
          <optgroup label="Additional component concentration">
            {catalog.additional.map(n =>
              <option key={`additional:${n}`} value={`conc:additional:${n}`}>{n} (additional)</option>
            )}
          </optgroup>
        </select>
      </div>
      {pointData.length === 0
        ? <div className="text-sm text-gray-500">No data for the selected axis.</div>
        : <svg ref={ref} className="w-full" style={{ height: 360 }} />}
    </div>
  )
}
