'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CohortPayload,
  OutcomeMetric,
} from '@/lib/analysis/types'
import {
  buildMediaScanCatalog,
  buildMediaScanPointData,
  notebookUrlForExperimentTitle,
  sourceLabels,
  type MediaComponentSource,
  type ScanAxis,
} from './mediaScanLogic'

export function MediaScan({ payload, outcome, product }: {
  payload: CohortPayload
  outcome: OutcomeMetric
  product: string | null
}) {
  const catalog = useMemo(() => buildMediaScanCatalog(payload), [payload])
  const experimentTitlesById = useMemo(
    () => new Map(payload.experiments.map(e => [e.id, e.title])),
    [payload],
  )
  const [axis, setAxis] = useState<ScanAxis>({ kind: 'component_identity', source: 'carbon' })
  const ref = useRef<SVGSVGElement | null>(null)

  const pointData = useMemo(() => {
    return buildMediaScanPointData(payload, axis, outcome, product)
  }, [payload, axis, outcome, product])

  const axisValue = axis.kind === 'component_identity'
    ? `identity:${axis.source}`
    : axis.kind === 'component_concentration'
      ? `conc:${axis.source}:${axis.componentName}`
      : axis.kind

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
    const openNotebook = (id: number) => {
      const title = experimentTitlesById.get(id)
      if (!title) return
      window.open(notebookUrlForExperimentTitle(title, id), '_blank')
    }
    const notebookTitle = (id: number) => {
      const title = experimentTitlesById.get(id)
      return title ? `Open ${title} in Notebook` : 'Open experiment in Notebook'
    }

    const ys = pointData.map(p => p.y)
    const y = d3.scaleLinear().domain(d3.extent(ys) as [number, number]).nice().range([ih, 0])
    g.append('g').call(d3.axisLeft(y))

    if (pointData[0].isCategorical) {
      const cats = Array.from(new Set(pointData.map(p => p.x as string)))
      const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.25)
      g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x))
      for (const cat of cats) {
        const catPoints = pointData
          .filter(p => (p.x as string) === cat)
          .sort((a, b) => a.y - b.y)
        const vals = catPoints.map(p => p.y)
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
        for (const point of catPoints) {
          g.append('circle').attr('cx', cx + (Math.random() - 0.5) * bw * 0.3)
            .attr('cy', y(point.y)).attr('r', 3).attr('fill', '#eb5234')
            .attr('cursor', 'pointer')
            .on('click', event => {
              event.stopPropagation()
              openNotebook(point.id)
            })
            .append('title')
            .text(notebookTitle(point.id))
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
        .attr('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation()
          openNotebook(d.id)
        })
        .append('title')
        .text(d => notebookTitle(d.id))
      const ssRes = xs.reduce((a, xv, i) => {
        const yhat = slope * xv + intercept
        return a + (ys[i] - yhat) ** 2
      }, 0)
      const ssTot = ys.reduce((a, yv) => a + (yv - meanY) ** 2, 0)
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
      g.append('text').attr('x', iw - 8).attr('y', 12).attr('text-anchor', 'end')
        .attr('fill', '#1d4ed8').attr('font-size', 11)
        .text(`R^2 = ${r2.toFixed(2)}`)
    }
  }, [pointData, experimentTitlesById])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm flex-wrap">
        <span className="text-gray-500">Axis:</span>
        <select
          value={axisValue}
          onChange={e => {
            const v = e.target.value
            if (v.startsWith('identity:')) {
              const [, src] = v.split(':')
              setAxis({
                kind: 'component_identity',
                source: src as MediaComponentSource,
              })
            } else if (v === 'cn_ratio') {
              setAxis({ kind: 'cn_ratio' })
            } else if (v.startsWith('conc:')) {
              const [, src, ...nameParts] = v.split(':')
              setAxis({
                kind: 'component_concentration',
                source: src as MediaComponentSource,
                componentName: nameParts.join(':'),
              })
            }
          }}
          className="h-8 px-2 border border-gray-200 rounded-md">
          {(Object.keys(sourceLabels) as MediaComponentSource[]).map(source => (
            <option key={`identity:${source}`} value={`identity:${source}`}>
              {sourceLabels[source]} (identity)
            </option>
          ))}
          <option value="cn_ratio">C:N ratio</option>
          <optgroup label="Carbon source concentration">
            {catalog.concentration.carbon.map(n =>
              <option key={`carbon:${n}`} value={`conc:carbon:${n}`}>{n} (carbon)</option>
            )}
          </optgroup>
          <optgroup label="Nitrogen source concentration">
            {catalog.concentration.nitrogen.map(n =>
              <option key={`nitrogen:${n}`} value={`conc:nitrogen:${n}`}>{n} (nitrogen)</option>
            )}
          </optgroup>
          <optgroup label="Complex component concentration">
            {catalog.concentration.complex.map(n =>
              <option key={`complex:${n}`} value={`conc:complex:${n}`}>{n} (complex)</option>
            )}
          </optgroup>
          <optgroup label="Additional component concentration">
            {catalog.concentration.additional.map(n =>
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
