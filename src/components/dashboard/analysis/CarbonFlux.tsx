'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload, ExperimentInPayload } from '@/lib/analysis/types'
import {
  deriveCohortFluxPoints,
  deriveDrilldownSeries,
  deriveSubstrateCandidates,
  type CohortFluxPoint,
  type DrilldownSeries,
  type SubstrateCandidate,
} from './carbonFluxLogic'

interface Props {
  payload: CohortPayload
  product: string | null
}

export function CarbonFlux({ payload, product }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedSubstrateKey, setSelectedSubstrateKey] = useState<string>('')
  const productName = product ?? ''
  const substrateCandidates = useMemo(
    () => productName ? deriveSubstrateCandidates(payload, productName) : [],
    [payload, productName],
  )
  const { points, excluded } = useMemo(
    () => productName
      ? deriveCohortFluxPoints(payload, productName, selectedSubstrateKey || null)
      : { points: [], excluded: [] },
    [payload, productName, selectedSubstrateKey],
  )

  useEffect(() => {
    if (
      selectedSubstrateKey
      && !substrateCandidates.find((candidate) => candidate.key === selectedSubstrateKey)
    ) {
      setSelectedSubstrateKey('')
    }
  }, [substrateCandidates, selectedSubstrateKey])

  useEffect(() => {
    if (selectedId !== null && !points.find((p) => p.experimentId === selectedId)) {
      setSelectedId(null)
    }
  }, [points, selectedId])

  if (!productName) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Pick a product above to begin.
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="space-y-4">
        <SubstrateSelector
          candidates={substrateCandidates}
          selectedKey={selectedSubstrateKey}
          onChange={setSelectedSubstrateKey}
        />
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No experiments include biomass, selected substrate, and product data for {productName}.
          ({excluded.length} excluded.)
        </div>
      </div>
    )
  }

  const selectedExperiment =
    selectedId === null ? null : payload.experiments.find((e) => e.id === selectedId) ?? null
  const concOnlyCount = points.filter((p) => p.massBalanceMode === 'concentration-only').length

  return (
    <div className="space-y-4">
      <SubstrateSelector
        candidates={substrateCandidates}
        selectedKey={selectedSubstrateKey}
        onChange={setSelectedSubstrateKey}
      />
      <CohortFluxScatter
        points={points}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="text-xs text-gray-500">
        {points.length} of {points.length + excluded.length} experiments included
        {excluded.length > 0 && ` - ${excluded.length} excluded`}
        {concOnlyCount > 0 && ` - ${concOnlyCount} shown with concentration-only fallback`}
        <span className="ml-2 text-gray-400">- color = strain</span>
      </div>
      {selectedExperiment ? (
        <ExperimentFluxDrilldown
          experiment={selectedExperiment}
          productName={productName}
          selectedSubstrateKey={selectedSubstrateKey || null}
        />
      ) : (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          Click a point above to inspect its substrate-vs-product trajectory.
        </div>
      )}
    </div>
  )
}

interface SubstrateSelectorProps {
  candidates: SubstrateCandidate[]
  selectedKey: string
  onChange: (key: string) => void
}

function SubstrateSelector({ candidates, selectedKey, onChange }: SubstrateSelectorProps) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Substrate</span>
        <select
          value={selectedKey}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm text-gray-900"
        >
          <option value="">Auto: measured substrate</option>
          {candidates.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

interface ScatterProps {
  points: CohortFluxPoint[]
  selectedId: number | null
  onSelect: (id: number) => void
}

function CohortFluxScatter({ points, selectedId, onSelect }: ScatterProps) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const svg = d3.select(node)
    svg.selectAll('*').remove()

    const width = node.clientWidth || 720
    const height = 360
    const margin = { top: 24, right: 24, bottom: 44, left: 64 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const maxYps = d3.max(points, (p) => p.yps) ?? 1
    const maxQp = d3.max(points, (p) => p.qpMax ?? 0) ?? 1
    const x = d3.scaleLinear()
      .domain([0, maxYps || 1])
      .nice()
      .range([0, innerW])
    const y = d3.scaleLinear()
      .domain([0, maxQp || 1])
      .nice()
      .range([innerH, 0])

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 36)
      .attr('text-anchor', 'middle')
      .attr('fill', '#444')
      .attr('font-size', 12)
      .text('Y p/s (overall yield)')
    g.append('text')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#444')
      .attr('font-size', 12)
      .text('qP_max (g product / g biomass / hr)')

    const strains = Array.from(new Set(points.map((p) => p.strainName)))
    const tableau = d3.schemeTableau10
    let colorIndex = 0
    const colorRange = strains.map((strain) => {
      if (strain === 'Unknown') return '#9ca3af'
      const color = tableau[colorIndex % tableau.length]
      colorIndex += 1
      return color
    })
    const color = d3.scaleOrdinal<string, string>().domain(strains).range(colorRange)

    const dotGroups = g.selectAll('g.dot-point')
      .data(points)
      .enter()
      .append('g')
      .attr('class', 'dot-point')
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelect(d.experimentId))

    dotGroups
      .filter((d) => d.massBalanceMode === 'concentration-only')
      .append('circle')
      .attr('cx', (d) => x(d.yps))
      .attr('cy', (d) => y(d.qpMax ?? 0))
      .attr('r', (d) => d.experimentId === selectedId ? 11 : 9)
      .attr('fill', 'none')
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.8)

    dotGroups
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => x(d.yps))
      .attr('cy', (d) => y(d.qpMax ?? 0))
      .attr('r', (d) => d.experimentId === selectedId ? 8 : 6)
      .attr('fill', (d) => color(d.strainName))
      .attr('stroke', (d) => d.experimentId === selectedId ? '#111827' : 'white')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)
      .append('title')
      .text((d) => [
        d.title,
        `strain: ${d.strainName}`,
        d.batchMediaName ? `batch media: ${d.batchMediaName}` : null,
        `Y_p/s: ${d.yps.toFixed(3)}`,
        d.qpMax != null ? `qP_max: ${d.qpMax.toFixed(3)}` : null,
        d.qsMax != null ? `qS_max: ${d.qsMax.toFixed(3)}` : null,
        d.massBalanceMode === 'concentration-only' ? '[concentration-only]' : null,
      ].filter(Boolean).join('\n'))
  }, [points, selectedId, onSelect])

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <svg ref={ref} className="w-full" style={{ height: 360 }} />
    </div>
  )
}

interface DrilldownProps {
  experiment: ExperimentInPayload
  productName: string
  selectedSubstrateKey: string | null
}

function ExperimentFluxDrilldown({ experiment, productName, selectedSubstrateKey }: DrilldownProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const data: DrilldownSeries | null = useMemo(
    () => deriveDrilldownSeries(experiment, productName, selectedSubstrateKey),
    [experiment, productName, selectedSubstrateKey],
  )

  useEffect(() => {
    const node = ref.current
    if (!node || !data) return
    const svg = d3.select(node)
    svg.selectAll('*').remove()

    const width = node.clientWidth || 720
    const height = 320
    const margin = { top: 24, right: 24, bottom: 44, left: 64 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const allTimes = [...data.substrateConsumed.timepoints, ...data.productFormed.timepoints]
    const allVals = [...data.substrateConsumed.cumulative, ...data.productFormed.cumulative]
    const x = d3.scaleLinear()
      .domain([Math.min(...allTimes, 0), Math.max(...allTimes, 1)])
      .nice()
      .range([0, innerW])
    const y = d3.scaleLinear()
      .domain([Math.min(0, ...allVals), Math.max(1, ...allVals)])
      .nice()
      .range([innerH, 0])

    const phaseColors: Record<string, string> = {
      lag: '#fef3c7',
      exponential: '#dcfce7',
      stationary: '#e0e7ff',
    }
    for (const phase of data.phases) {
      g.append('rect')
        .attr('x', x(phase.startTime))
        .attr('y', 0)
        .attr('width', Math.max(0, x(phase.endTime) - x(phase.startTime)))
        .attr('height', innerH)
        .attr('fill', phaseColors[phase.name] ?? '#eee')
        .attr('opacity', 0.45)
    }

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 36)
      .attr('text-anchor', 'middle')
      .attr('fill', '#444')
      .attr('font-size', 12)
      .text('time (h)')
    g.append('text')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#444')
      .attr('font-size', 12)
      .text('cumulative mass (g/L)')

    const lineGen = d3.line<{ t: number; v: number }>()
      .x((d) => x(d.t))
      .y((d) => y(d.v))

    const substratePoints = data.substrateConsumed.timepoints.map((t, i) => ({
      t,
      v: data.substrateConsumed.cumulative[i],
    }))
    const productPoints = data.productFormed.timepoints.map((t, i) => ({
      t,
      v: data.productFormed.cumulative[i],
    }))

    g.append('path')
      .attr('d', lineGen(substratePoints) ?? '')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
    g.append('path')
      .attr('d', lineGen(productPoints) ?? '')
      .attr('fill', 'none')
      .attr('stroke', '#eb5234')
      .attr('stroke-width', 2)

    g.append('text')
      .attr('x', 8)
      .attr('y', 16)
      .attr('font-size', 11)
      .attr('fill', '#3b82f6')
      .text(`substrate consumed (${data.substrateName})`)
    g.append('text')
      .attr('x', 8)
      .attr('y', 32)
      .attr('font-size', 11)
      .attr('fill', '#eb5234')
      .text(`product formed (${data.productName})`)

    const crosshair = g.append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#888')
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
    const tooltipBg = g.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', 'white')
      .attr('stroke', '#ccc')
      .attr('opacity', 0)
    const tooltipText = g.append('text')
      .attr('font-size', 11)
      .attr('fill', '#222')
      .attr('opacity', 0)

    const findNearest = (arr: Array<{ t: number; v: number }>, t: number) => {
      if (arr.length === 0) return null
      let best = arr[0]
      for (const point of arr) {
        if (Math.abs(point.t - t) < Math.abs(best.t - t)) best = point
      }
      return best
    }

    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .on('mousemove', function (this: SVGRectElement, event: MouseEvent) {
        const [mouseX] = d3.pointer(event, this)
        const t = x.invert(mouseX)
        const nearestSubstrate = findNearest(substratePoints, t)
        const nearestProduct = findNearest(productPoints, t)
        if (!nearestSubstrate || !nearestProduct) return
        const yps = nearestSubstrate.v > 0 ? nearestProduct.v / nearestSubstrate.v : null
        crosshair.attr('opacity', 1).attr('x1', mouseX).attr('x2', mouseX)
        const lines = [
          `t = ${t.toFixed(1)} h`,
          `S consumed: ${nearestSubstrate.v.toFixed(2)} g/L`,
          `P formed: ${nearestProduct.v.toFixed(2)} g/L`,
          yps != null ? `Y_p/s(0..t): ${yps.toFixed(3)}` : 'Y_p/s(0..t): n/a',
        ]
        tooltipText
          .attr('x', mouseX + 8)
          .attr('y', 16)
          .attr('opacity', 1)
          .selectAll('tspan')
          .remove()
        tooltipText.selectAll('tspan')
          .data(lines)
          .enter()
          .append('tspan')
          .attr('x', mouseX + 8)
          .attr('dy', (_, i) => i === 0 ? 0 : 14)
          .text((d) => d)
        const bbox = (tooltipText.node() as SVGTextElement).getBBox()
        tooltipBg
          .attr('x', bbox.x - 4)
          .attr('y', bbox.y - 2)
          .attr('width', bbox.width + 8)
          .attr('height', bbox.height + 4)
          .attr('opacity', 0.9)
      })
      .on('mouseleave', () => {
        crosshair.attr('opacity', 0)
        tooltipText.attr('opacity', 0)
        tooltipBg.attr('opacity', 0)
      })
  }, [data])

  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        This experiment is missing biomass, substrate, or product data for the selected product.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-2">
      <svg ref={ref} className="w-full" style={{ height: 320 }} />
    </div>
  )
}
