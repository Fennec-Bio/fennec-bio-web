'use client'

import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import type { CohortPayload, TimeSeriesEntry } from '@/lib/analysis/types'

type MetricCategory = 'product' | 'process_data' | 'secondary_product'
type ColorMode = 'experiment' | 'strain' | 'batch_media'

interface Flat {
  expId: number
  expTitle: string
  strainName: string | null
  batchMediaName: string | null
  series: TimeSeriesEntry
}

function flatten(payload: CohortPayload, selectedCategories: Set<MetricCategory>): Flat[] {
  const out: Flat[] = []
  for (const exp of payload.experiments) {
    for (const s of exp.time_series) {
      if (selectedCategories.has(s.category as MetricCategory)) {
        out.push({
          expId: exp.id,
          expTitle: exp.title,
          strainName: exp.strain?.name ?? null,
          batchMediaName: exp.batch_media?.name ?? null,
          series: s,
        })
      }
    }
  }
  return out
}

function colorFor(f: Flat, mode: ColorMode, scale: d3.ScaleOrdinal<string, string>): string {
  const key = mode === 'experiment'
    ? String(f.expId)
    : mode === 'strain'
      ? (f.strainName ?? '—')
      : (f.batchMediaName ?? '—')
  return scale(key)
}

export function KineticOverlay({ payload }: { payload: CohortPayload }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [cats, setCats] = useState<Set<MetricCategory>>(new Set(['product', 'process_data']))
  const [mode, setMode] = useState<ColorMode>('experiment')
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth
    const height = 420
    const margin = { top: 20, right: 30, bottom: 40, left: 50 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const flat = flatten(payload, cats)
    const allTimes = flat.flatMap(f => f.series.timepoints_h)
    const allVals = flat.flatMap(f => f.series.values)
    if (flat.length === 0) {
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle').attr('fill', '#999')
        .text('No time-series match the selected metrics.')
      return
    }
    const x = d3.scaleLinear().domain([0, d3.max(allTimes) ?? 1]).nice().range([0, innerW])
    const y = d3.scaleLinear().domain([0, d3.max(allVals) ?? 1]).nice().range([innerH, 0])
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)

    const g = svg.attr('viewBox', `0 0 ${width} ${height}`)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
    g.append('g').call(d3.axisLeft(y))
    g.append('text').attr('x', innerW / 2).attr('y', innerH + 34).attr('text-anchor', 'middle')
      .attr('fill', '#666').attr('font-size', 12).text('time (h)')

    const line = d3.line<{ t: number; v: number | null }>()
      .defined(d => d.v !== null && Number.isFinite(d.v as number))
      .x(d => x(d.t))
      .y(d => y(d.v as number))

    for (const f of flat) {
      const pts = f.series.timepoints_h.map((t, i) => ({ t, v: f.series.values[i] as number | null }))
      const key = `${f.expId}:${f.series.category}:${f.series.name}`
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', colorFor(f, mode, colorScale))
        .attr('stroke-width', hovered === key ? 3 : 1.5)
        .attr('opacity', hovered && hovered !== key ? 0.25 : 1)
        .attr('d', line)
        .on('mouseenter', () => setHovered(key))
        .on('mouseleave', () => setHovered(null))
    }
  }, [payload, cats, mode, hovered])

  const toggleCat = (c: MetricCategory) => {
    setCats(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-3 items-center mb-3 text-sm flex-wrap">
        <span className="text-gray-500">Metrics:</span>
        {(['product', 'process_data', 'secondary_product'] as MetricCategory[]).map(c => (
          <label key={c} className="inline-flex gap-1 items-center cursor-pointer">
            <input type="checkbox" checked={cats.has(c)} onChange={() => toggleCat(c)} />
            <span>{c.replace('_', ' ')}</span>
          </label>
        ))}
        <span className="ml-6 text-gray-500">Color by:</span>
        <select
          className="h-8 px-2 border border-gray-200 rounded-md text-sm"
          value={mode}
          onChange={e => setMode(e.target.value as ColorMode)}
        >
          <option value="experiment">experiment</option>
          <option value="strain">strain</option>
          <option value="batch_media">batch media</option>
        </select>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: 420 }} />
      {hovered && <div className="text-xs text-gray-500 mt-2">{hovered}</div>}
    </div>
  )
}
